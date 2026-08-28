export const config = { runtime: "nodejs" };

const regionCache = new Map();
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_REGIONS = 18;
const RADIUS_METERS = 16093;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function regionKey(lat, lon) {
  return lat.toFixed(1) + "," + lon.toFixed(1);
}

function normalizePoints(raw) {
  const seen = new Set();
  const points = [];
  for (const item of String(raw || "").split(";")) {
    const parts = item.split(",");
    const lat = toNumber(parts[0]);
    const lon = toNumber(parts[1]);
    if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const rounded = [Math.round(lat * 10) / 10, Math.round(lon * 10) / 10];
    const key = regionKey(rounded[0], rounded[1]);
    if (!seen.has(key)) {
      seen.add(key);
      points.push({ key, lat: rounded[0], lon: rounded[1] });
    }
    if (points.length >= MAX_REGIONS) break;
  }
  return points;
}

function distanceSquared(point, lat, lon) {
  const dy = point.lat - lat;
  const dx = (point.lon - lon) * Math.cos(lat * Math.PI / 180);
  return dy * dy + dx * dx;
}

function elementPosition(element) {
  if (typeof element.lat === "number" && typeof element.lon === "number") return [element.lat, element.lon];
  if (element.center && typeof element.center.lat === "number" && typeof element.center.lon === "number") return [element.center.lat, element.center.lon];
  return null;
}

function buildQuery(points) {
  const clauses = [];
  for (const point of points) {
    const around = "(around:" + RADIUS_METERS + "," + point.lat + "," + point.lon + ")";
    clauses.push('node' + around + '["public_transport"~"platform|stop_position|station"];');
    clauses.push('node' + around + '["highway"="bus_stop"];');
    clauses.push('node' + around + '["railway"~"station|halt|tram_stop|subway_entrance"];');
    clauses.push('relation' + around + '["type"="route"]["route"~"bus|trolleybus|train|subway|tram|light_rail|monorail|ferry"];');
  }
  return "[out:json][timeout:24];(" + clauses.join("") + ");out center tags 1600;";
}

async function fetchOverpass(points) {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "Ph4antonarchitect-local-transit/1.0"
    },
    body: "data=" + encodeURIComponent(buildQuery(points)),
    signal: AbortSignal.timeout(28000)
  });
  if (!response.ok) throw new Error("OpenStreetMap transit lookup returned " + response.status);
  return response.json();
}

function emptyRegion(point) {
  return {
    key: point.key,
    center: [point.lat, point.lon],
    radiusMiles: 10,
    fetchedAt: new Date().toISOString(),
    source: "OpenStreetMap Overpass",
    stops: [],
    routes: [],
    agencies: []
  };
}

function assignElements(points, elements) {
  const regions = new Map(points.map(point => [point.key, emptyRegion(point)]));
  for (const element of elements || []) {
    const pos = elementPosition(element);
    if (!pos) continue;
    const nearest = points.slice().sort((a, b) => distanceSquared(a, pos[0], pos[1]) - distanceSquared(b, pos[0], pos[1]))[0];
    if (!nearest) continue;
    const region = regions.get(nearest.key);
    const tags = element.tags || {};
    if (element.type === "relation" && tags.route) {
      region.routes.push({
        id: String(element.id),
        name: tags.name || tags.ref || (tags.route + " route"),
        ref: tags.ref || "",
        mode: tags.route,
        operator: tags.operator || tags.network || ""
      });
      if (tags.operator) region.agencies.push(tags.operator);
      if (tags.network) region.agencies.push(tags.network);
    } else {
      region.stops.push({
        id: element.type + "/" + element.id,
        name: tags.name || tags.local_ref || tags.ref || "Public transit stop",
        lat: pos[0],
        lon: pos[1],
        mode: tags.public_transport || tags.railway || (tags.highway === "bus_stop" ? "bus" : "transit"),
        operator: tags.operator || tags.network || ""
      });
      if (tags.operator) region.agencies.push(tags.operator);
      if (tags.network) region.agencies.push(tags.network);
    }
  }

  for (const region of regions.values()) {
    const stopSeen = new Set();
    region.stops = region.stops.filter(stop => {
      if (stopSeen.has(stop.id)) return false;
      stopSeen.add(stop.id);
      return true;
    }).slice(0, 220);

    const routeSeen = new Set();
    region.routes = region.routes.filter(route => {
      const key = route.mode + "|" + route.ref + "|" + route.name;
      if (routeSeen.has(key)) return false;
      routeSeen.add(key);
      return true;
    }).slice(0, 120);

    region.agencies = Array.from(new Set(region.agencies.filter(Boolean))).slice(0, 40);
  }
  return regions;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  try {
    const points = normalizePoints(req.query.points);
    if (!points.length) return res.status(400).json({ error: "Provide at least one valid coordinate." });

    const now = Date.now();
    const regions = {};
    const missing = [];
    for (const point of points) {
      const cached = regionCache.get(point.key);
      if (cached && now - cached.savedAt < TTL_MS) regions[point.key] = cached.data;
      else missing.push(point);
    }

    if (missing.length) {
      const payload = await fetchOverpass(missing);
      const discovered = assignElements(missing, payload.elements);
      for (const point of missing) {
        const data = discovered.get(point.key) || emptyRegion(point);
        regionCache.set(point.key, { savedAt: now, data });
        regions[point.key] = data;
      }
    }

    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      privacy: "Coordinates are rounded to city-area precision before lookup.",
      radiusMiles: 10,
      source: "OpenStreetMap Overpass",
      regions
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
