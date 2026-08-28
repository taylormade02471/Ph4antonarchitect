(function registerLocalTransit(root) {
  const CACHE_PREFIX = "ph4_local_transit_region_v1_";
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const MAX_REGIONS = 18;
  let requestNumber = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function miles(a, b) {
    if (!a || !b) return 0;
    const toRad = function (n) { return n * Math.PI / 180; };
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const value = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function keyFor(point) {
    return (Math.round(point[0] * 10) / 10).toFixed(1) + "," +
      (Math.round(point[1] * 10) / 10).toFixed(1);
  }

  function roundedPoint(point) {
    return [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10];
  }

  function planLegs(data, planName) {
    const legs = [];
    for (const sectionKey of data.plans[planName] || []) {
      for (const leg of (data.sections[sectionKey] || {}).legs || []) legs.push(leg);
    }
    return legs;
  }

  function addUnique(list, seen, point) {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
    const rounded = roundedPoint(point);
    const key = keyFor(rounded);
    if (!seen.has(key) && list.length < MAX_REGIONS) {
      seen.add(key);
      list.push(rounded);
    }
  }

  function discoveryPoints(legs, origin) {
    const points = [];
    const seen = new Set();
    addUnique(points, seen, origin);

    for (const leg of legs) {
      addUnique(points, seen, [leg.board_stop.lat, leg.board_stop.lon]);
      addUnique(points, seen, [leg.alight_stop.lat, leg.alight_stop.lon]);
    }

    for (const leg of legs) {
      if (points.length >= MAX_REGIONS) break;
      const from = [leg.board_stop.lat, leg.board_stop.lon];
      const to = [leg.alight_stop.lat, leg.alight_stop.lon];
      const distance = miles(from, to);
      const slices = Math.min(4, Math.floor(distance / 80));
      for (let i = 1; i <= slices && points.length < MAX_REGIONS; i++) {
        const ratio = i / (slices + 1);
        addUnique(points, seen, [
          from[0] + (to[0] - from[0]) * ratio,
          from[1] + (to[1] - from[1]) * ratio
        ]);
      }
    }
    return points;
  }

  function readCached(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || "null");
      if (!saved || !saved.savedAt || Date.now() - saved.savedAt > CACHE_TTL) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return saved.data || null;
    } catch (error) {
      return null;
    }
  }

  function saveCached(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), data: data }));
    } catch (error) {}
  }

  function drivingUrl(leg, index) {
    const destination = leg.alight_stop.lat + "," + leg.alight_stop.lon;
    let url = "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(destination) + "&travelmode=driving&dir_action=navigate";
    if (index > 0) {
      const origin = leg.board_stop.lat + "," + leg.board_stop.lon;
      url += "&origin=" + encodeURIComponent(origin);
    }
    return url;
  }

  function render(regions, legs, layer) {
    const status = document.getElementById("regionalTransitStatus");
    const panel = document.getElementById("regionalTransit");
    if (!status || !panel) return;
    if (layer) layer.clearLayers();

    const regionList = Object.values(regions);
    const stopMap = new Map();
    const routeMap = new Map();
    const agencies = new Set();

    for (const region of regionList) {
      for (const agency of region.agencies || []) agencies.add(agency);
      for (const stop of region.stops || []) stopMap.set(stop.id, stop);
      for (const route of region.routes || []) {
        const key = (route.mode || "") + "|" + (route.ref || "") + "|" + (route.name || "");
        routeMap.set(key, route);
      }
    }

    const stops = Array.from(stopMap.values());
    const routes = Array.from(routeMap.values());
    if (layer && root.L) {
      for (const stop of stops.slice(0, 160)) {
        root.L.circleMarker([stop.lat, stop.lon], {
          radius: 5, color: "#073b6f", weight: 1, fillColor: "#28a9e0", fillOpacity: 0.78
        }).bindPopup("<b>LOCAL TRANSIT STOP</b><br>" + escapeHtml(stop.name) +
          "<br>" + escapeHtml(stop.mode) +
          (stop.operator ? "<br>" + escapeHtml(stop.operator) : "")).addTo(layer);
      }
    }

    const fallbackLegs = legs.filter(function (leg) {
      const region = regions[keyFor([leg.alight_stop.lat, leg.alight_stop.lon])];
      return !region || (((region.stops || []).length === 0) && ((region.routes || []).length === 0));
    });

    status.textContent = regionList.length + " route region(s) loaded · " +
      stops.length + " transit stops · " + routes.length +
      " public routes · 10-mile local coverage";

    const agencyHtml = Array.from(agencies).slice(0, 20).map(function (name) {
      return '<span class="badge" style="background:#0b5fa5">' + escapeHtml(name) + "</span>";
    }).join("");

    const routeHtml = routes.slice(0, 35).map(function (route) {
      const label = [route.mode, route.ref, route.name].filter(Boolean).join(" · ");
      return '<div class="bus"><b>' + escapeHtml(label) + "</b>" +
        (route.operator ? " — " + escapeHtml(route.operator) : "") + "</div>";
    }).join("");

    const fallbackHtml = fallbackLegs.map(function (leg, index) {
      return '<div class="alert"><b>No public transit found for this job area.</b><br>' +
        escapeHtml(leg.destination) + '<br><a target="_blank" rel="noopener" href="' +
        drivingUrl(leg, legs.indexOf(leg)) + '">Open best driving directions</a></div>';
    }).join("");

    panel.innerHTML =
      (agencyHtml ? '<p><b>Agencies and networks:</b><br>' + agencyHtml + "</p>" : "") +
      (routeHtml ? '<div><b>Public routes discovered:</b>' + routeHtml + "</div>" : "") +
      (fallbackHtml || (!routes.length && !stops.length ?
        '<div class="alert">No public transit was found in the loaded route regions. Driving navigation is available for each job leg.</div>' : ""));
  }

  async function load(data, planName, origin, layer) {
    const status = document.getElementById("regionalTransitStatus");
    if (!status || !origin || !Array.isArray(origin)) return;
    const thisRequest = ++requestNumber;
    const legs = planLegs(data, planName);
    const points = discoveryPoints(legs, origin);
    const regions = {};
    const missing = [];

    for (const point of points) {
      const key = keyFor(point);
      const cached = readCached(key);
      if (cached) regions[key] = cached;
      else missing.push(point);
    }

    if (!missing.length) {
      status.textContent = "Using saved public transit data for this loaded route.";
      render(regions, legs, layer);
      return;
    }

    status.textContent = "Discovering public transit within 10 miles of this route...";
    try {
      const query = missing.map(function (point) { return point[0] + "," + point[1]; }).join(";");
      const response = await fetch("/api/local-transit?points=" + encodeURIComponent(query), { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (thisRequest !== requestNumber) return;
      for (const key of Object.keys(payload.regions || {})) {
        regions[key] = payload.regions[key];
        saveCached(key, payload.regions[key]);
      }
      render(regions, legs, layer);
    } catch (error) {
      if (thisRequest !== requestNumber) return;
      status.textContent = "Local transit lookup is unavailable right now; driving fallbacks are ready.";
      render(regions, legs, layer);
    }
  }

  root.LocalTransit = { load: load, keyFor: keyFor };
})(window);
