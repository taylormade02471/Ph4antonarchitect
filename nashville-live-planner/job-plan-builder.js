(function registerJobPlanBuilder(root) {
  const FALLBACK = { name: "ELIZABETH DUFF TRANSIT CENTER AT WEGO CENTRAL", lat: 36.1667, lon: -86.7817 };
  const points = {
    NEW01: [36.5639752, -87.3132271], NEW02: [36.5134992, -87.2932951],
    NEW03: [36.6234614, -87.317965], NEW04: [36.2266699, -86.8361689],
    NEW06: [36.2126493, -86.7991329], NEW07: [36.2275222, -86.75957],
    NEW08: [36.2266296, -86.7600523], NEW09: [36.261602, -86.7123],
    NEW11: [36.305, -86.695], NEW12: [36.1264343, -86.7114144],
    NEW13: [36.1943216, -86.6227157], NEW14: [36.2092289, -86.6101006],
    NEW15: [36.205, -86.565], NEW16: [36.005565, -86.6999791],
    NEW17: [36.1032882, -86.6665171], NEW18: [36.1719739, -86.7955332],
    NEW19: [36.0869276, -86.7300093], NEW20: [36.0776954, -86.732109]
  };
  const FREQUENT = new Set(["50", "52", "55", "56"]);
  const EXPRESS = new Set(["84", "86", "87", "88", "89", "94", "95"]);
  const SHUTTLE = new Set(["64", "93"]);
  const RAIL = new Set(["90"]);
  const WALK_MINS_PER_MILE = 20;
  const MAX_WALK_MILES = 1.25;
  const TRANSFER_WALK_MILES = 0.18;
  let selectedIds = [];
  let graphCache = null;
  let contextCache = null;

  function miles(a, b) {
    if (!a || !b) return 999;
    const rad = function (n) { return n * Math.PI / 180; };
    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);
    const value = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function due(job) {
    const value = Date.parse(job.due || "");
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  }

  function waitMinutes(route) {
    if (FREQUENT.has(route)) return 8;
    if (SHUTTLE.has(route)) return 10;
    if (RAIL.has(route)) return 18;
    if (EXPRESS.has(route)) return 20;
    return 13;
  }

  function speedMph(route) {
    if (RAIL.has(route)) return 36;
    if (EXPRESS.has(route)) return 31;
    if (FREQUENT.has(route)) return 18;
    if (SHUTTLE.has(route)) return 15;
    return 15;
  }

  function serviceType(route) {
    if (RAIL.has(route)) return "WeGo Star";
    if (EXPRESS.has(route)) return "regional express";
    if (FREQUENT.has(route)) return "frequent service";
    if (SHUTTLE.has(route)) return "connector shuttle";
    return "local / crosstown";
  }

  function heapPush(heap, item) {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (heap[parent][0] <= item[0]) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = item;
  }

  function heapPop(heap) {
    if (!heap.length) return null;
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
        if (heap[child][0] >= last[0]) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  }

  function buildGraph(data) {
    if (graphCache && graphCache.source === data.wegoRoutes) return graphCache;
    const nodes = new Map();
    const adjacency = new Map();
    const stopGroups = new Map();
    const buckets = new Map();

    function addEdge(from, to, weight, type) {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push({ to: to, weight: weight, type: type });
    }

    for (const route of Object.keys(data.wegoRoutes || {})) {
      const routeData = data.wegoRoutes[route];
      const stops = routeData.stops || [];
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const id = route + "@" + i;
        const node = {
          id: id, route: route, routeName: routeData.name || route,
          color: routeData.color || "#333", index: i, stop: stop,
          point: [stop.lat, stop.lon]
        };
        nodes.set(id, node);
        adjacency.set(id, []);
        if (!stopGroups.has(stop.id)) stopGroups.set(stop.id, []);
        stopGroups.get(stop.id).push(id);
        const bucketKey = Math.floor(stop.lat * 100) + "," + Math.floor(stop.lon * 100);
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey).push(id);
      }

      for (let i = 0; i < stops.length - 1; i++) {
        const from = route + "@" + i;
        const to = route + "@" + (i + 1);
        const distance = miles([stops[i].lat, stops[i].lon], [stops[i + 1].lat, stops[i + 1].lon]);
        const weight = Math.max(0.7, distance / speedMph(route) * 60 + 0.35);
        addEdge(from, to, weight, "ride");
        addEdge(to, from, weight, "ride");
      }
    }

    for (const ids of stopGroups.values()) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids.length; j++) {
          if (i === j) continue;
          const from = nodes.get(ids[i]);
          const to = nodes.get(ids[j]);
          if (from.route === to.route) continue;
          addEdge(from.id, to.id, waitMinutes(to.route) + 2, "transfer");
        }
      }
    }

    const compared = new Set();
    for (const node of nodes.values()) {
      const latCell = Math.floor(node.stop.lat * 100);
      const lonCell = Math.floor(node.stop.lon * 100);
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const ids = buckets.get((latCell + y) + "," + (lonCell + x)) || [];
          for (const otherId of ids) {
            if (otherId === node.id) continue;
            const pairKey = node.id < otherId ? node.id + "|" + otherId : otherId + "|" + node.id;
            if (compared.has(pairKey)) continue;
            compared.add(pairKey);
            const other = nodes.get(otherId);
            if (node.route === other.route || node.stop.id === other.stop.id) continue;
            const distance = miles(node.point, other.point);
            if (distance <= TRANSFER_WALK_MILES) {
              addEdge(node.id, other.id, distance * WALK_MINS_PER_MILE + waitMinutes(other.route) + 2, "transfer");
              addEdge(other.id, node.id, distance * WALK_MINS_PER_MILE + waitMinutes(node.route) + 2, "transfer");
            }
          }
        }
      }
    }

    graphCache = {
      source: data.wegoRoutes, nodes: nodes, adjacency: adjacency,
      routeCount: Object.keys(data.wegoRoutes || {}).length
    };
    return graphCache;
  }

  function closestNodes(graph, point) {
    const result = [];
    for (const node of graph.nodes.values()) {
      const distance = miles(point, node.point);
      if (distance <= MAX_WALK_MILES) result.push({ id: node.id, distance: distance });
    }
    result.sort(function (a, b) { return a.distance - b.distance; });
    return result.slice(0, 36);
  }

  function runSearch(graph, point) {
    const distance = new Map();
    const previous = new Map();
    const heap = [];
    const starts = closestNodes(graph, point);

    for (const start of starts) {
      const node = graph.nodes.get(start.id);
      const cost = start.distance * WALK_MINS_PER_MILE + waitMinutes(node.route);
      if (!distance.has(start.id) || cost < distance.get(start.id)) {
        distance.set(start.id, cost);
        previous.set(start.id, null);
        heapPush(heap, [cost, start.id]);
      }
    }

    while (heap.length) {
      const item = heapPop(heap);
      const cost = item[0];
      const nodeId = item[1];
      if (cost !== distance.get(nodeId)) continue;
      for (const edge of graph.adjacency.get(nodeId) || []) {
        const next = cost + edge.weight;
        if (!distance.has(edge.to) || next < distance.get(edge.to)) {
          distance.set(edge.to, next);
          previous.set(edge.to, { node: nodeId, edge: edge });
          heapPush(heap, [next, edge.to]);
        }
      }
    }
    return { point: point, distance: distance, previous: previous, starts: starts };
  }

  function contextFor(data, origin) {
    const originKey = origin.map(function (n) { return n.toFixed(3); }).join(",");
    const jobsKey = Object.keys(data.jobs || {}).join(",");
    const key = originKey + "|" + jobsKey;
    if (contextCache && contextCache.key === key && contextCache.source === data.wegoRoutes) return contextCache;

    const graph = buildGraph(data);
    const searches = new Map();
    const connectorCache = new Map();
    const locations = { origin: origin };
    for (const id of Object.keys(data.jobs || {})) locations[id] = points[id] || origin;

    function connectors(point) {
      const keyValue = point[0].toFixed(4) + "," + point[1].toFixed(4);
      if (!connectorCache.has(keyValue)) connectorCache.set(keyValue, closestNodes(graph, point));
      return connectorCache.get(keyValue);
    }

    function search(keyValue) {
      if (!searches.has(keyValue)) searches.set(keyValue, runSearch(graph, locations[keyValue]));
      return searches.get(keyValue);
    }

    function result(fromKey, toKey) {
      const fromPoint = locations[fromKey];
      const toPoint = locations[toKey];
      const source = search(fromKey);
      const destinations = connectors(toPoint);
      let best = null;

      for (const destination of destinations) {
        const networkCost = source.distance.get(destination.id);
        if (networkCost == null) continue;
        const total = networkCost + destination.distance * WALK_MINS_PER_MILE;
        if (!best || total < best.total) best = { total: total, end: destination.id, finalWalk: destination.distance };
      }

      if (!best) {
        return {
          total: 10000 + miles(fromPoint, toPoint) * 5,
          available: false, fromPoint: fromPoint, toPoint: toPoint,
          path: [], edges: []
        };
      }

      const path = [];
      const edges = [];
      let at = best.end;
      path.push(at);
      while (source.previous.get(at)) {
        const step = source.previous.get(at);
        edges.push(step.edge);
        at = step.node;
        path.push(at);
      }
      path.reverse();
      edges.reverse();
      return {
        total: best.total, available: true, fromPoint: fromPoint, toPoint: toPoint,
        path: path, edges: edges, finalWalk: best.finalWalk
      };
    }

    contextCache = {
      key: key, source: data.wegoRoutes, graph: graph, locations: locations,
      searches: searches, connectors: connectors, result: result
    };
    return contextCache;
  }

  function totalCost(ids, context) {
    let total = 0;
    let from = "origin";
    for (const id of ids) {
      total += context.result(from, id).total;
      from = id;
    }
    return total;
  }

  function optimize(ids, context) {
    const left = ids.slice();
    const ordered = [];
    let from = "origin";

    while (left.length) {
      left.sort(function (a, b) {
        const costA = context.result(from, a).total;
        const costB = context.result(from, b).total;
        return costA - costB || miles(context.locations[from], context.locations[a]) - miles(context.locations[from], context.locations[b]);
      });
      const next = left.shift();
      ordered.push(next);
      from = next;
    }

    let improved = true;
    let passes = 0;
    while (improved && passes < 3) {
      improved = false;
      passes++;
      const base = totalCost(ordered, context);
      for (let i = 0; i < ordered.length - 1; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const candidate = ordered.slice(0, i).concat(ordered.slice(i, j + 1).reverse(), ordered.slice(j + 1));
          if (totalCost(candidate, context) + 0.5 < base) {
            ordered.splice(0, ordered.length);
            Array.prototype.push.apply(ordered, candidate);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
    return ordered;
  }

  function urgent(ids, jobs, context) {
    const picked = ids.slice().sort(function (a, b) {
      return (jobs[a].status === "needs_completion" ? 0 : 1) -
        (jobs[b].status === "needs_completion" ? 0 : 1) ||
        due(jobs[a]) - due(jobs[b]);
    }).slice(0, 10);
    return optimize(picked, context);
  }

  function money(ids, jobs, context) {
    const picked = ids.filter(function (id) {
      return !(jobs[id].address || "").toLowerCase().includes("clarksville, tn");
    }).sort(function (a, b) {
      return ((jobs[b].pay_cents || 0) / (jobs[b].minutes || 30)) -
        ((jobs[a].pay_cents || 0) / (jobs[a].minutes || 30));
    }).slice(0, 10);
    return optimize(picked, context);
  }

  function stopObject(node, fallbackName) {
    return {
      name: node ? node.stop.name : fallbackName,
      id: node ? node.stop.id : fallbackName,
      lat: node ? node.stop.lat : 0,
      lon: node ? node.stop.lon : 0
    };
  }

  function addWalkLeg(legs, fromPoint, toPoint, fromName, toName, label, jobId) {
    const distance = miles(fromPoint, toPoint);
    if (distance < 0.025) return;
    legs.push({
      label: label + " (" + distance.toFixed(2) + " mi)",
      route: "walk", board: "WALK_START", alight: "WALK_END",
      destination: toName, job: jobId,
      static: "Estimated walk " + Math.max(1, Math.round(distance * WALK_MINS_PER_MILE)) + " min",
      board_stop: { name: fromName, id: "WALK_START", lat: fromPoint[0], lon: fromPoint[1] },
      alight_stop: { name: toName, id: "WALK_END", lat: toPoint[0], lon: toPoint[1] },
      segment: [fromPoint, toPoint]
    });
  }

  function routeLegs(context, result, fromName, job, jobId) {
    const legs = [];
    if (!result.available || !result.path.length) {
      legs.push({
        label: "No WeGo connection found within " + MAX_WALK_MILES + " mi — use driving fallback",
        route: "drive", board: "DRIVE_START", alight: "JOB_" + jobId,
        destination: job.address, job: jobId,
        static: "Driving fallback · open best driving directions in the regional transit panel",
        board_stop: { name: fromName, id: "DRIVE_START", lat: result.fromPoint[0], lon: result.fromPoint[1] },
        alight_stop: { name: job.location_name || job.address, id: "JOB_" + jobId, lat: result.toPoint[0], lon: result.toPoint[1] },
        segment: [result.fromPoint, result.toPoint]
      });
      return legs;
    }

    const graph = context.graph;
    const firstNode = graph.nodes.get(result.path[0]);
    addWalkLeg(legs, result.fromPoint, firstNode.point, fromName, firstNode.stop.name, "Walk to WeGo", jobId);

    let i = 0;
    while (i < result.edges.length) {
      const edge = result.edges[i];
      if (edge.type === "transfer") {
        const fromNode = graph.nodes.get(result.path[i]);
        const toNode = graph.nodes.get(result.path[i + 1]);
        const distance = miles(fromNode.point, toNode.point);
        legs.push({
          label: "Transfer to Route " + toNode.route + " " + toNode.routeName,
          route: "walk", board: fromNode.stop.id, alight: toNode.stop.id,
          destination: toNode.stop.name, job: jobId,
          static: "Transfer connection · estimated wait " + waitMinutes(toNode.route) + " min",
          board_stop: stopObject(fromNode, fromNode.stop.name),
          alight_stop: stopObject(toNode, toNode.stop.name),
          segment: distance > 0.01 ? [fromNode.point, toNode.point] : [fromNode.point]
        });
        i++;
        continue;
      }

      const route = graph.nodes.get(result.path[i]).route;
      const start = i;
      while (i < result.edges.length && result.edges[i].type === "ride" &&
        graph.nodes.get(result.path[i]).route === route &&
        graph.nodes.get(result.path[i + 1]).route === route) i++;
      const boardNode = graph.nodes.get(result.path[start]);
      const alightNode = graph.nodes.get(result.path[i]);
      const segment = result.path.slice(start, i + 1).map(function (id) {
        return graph.nodes.get(id).point;
      });
      legs.push({
        label: "Route " + route + " " + boardNode.routeName + " — " + serviceType(route),
        route: route, board: boardNode.stop.id, alight: alightNode.stop.id,
        destination: alightNode.stop.name, job: jobId,
        static: "Network-optimized WeGo connection · verify exact departure in live arrivals",
        board_stop: stopObject(boardNode, boardNode.stop.name),
        alight_stop: stopObject(alightNode, alightNode.stop.name),
        segment: segment
      });
    }

    const lastNode = graph.nodes.get(result.path[result.path.length - 1]);
    addWalkLeg(legs, lastNode.point, result.toPoint, lastNode.stop.name,
      job.location_name || job.address, "Walk from WeGo to job", jobId);
    return legs;
  }

  function makePlan(data, prefix, ids, origin, context) {
    const keys = [];
    let fromKey = "origin";
    let fromName = "YOUR CURRENT PHONE LOCATION";

    ids.forEach(function (id, index) {
      const job = data.jobs[id];
      const result = context.result(fromKey, id);
      const key = prefix + "_" + id;
      data.sections[key] = {
        title: (index + 1) + ". Optimized WeGo — " + (job.location_name || job.address),
        legs: routeLegs(context, result, fromName, job, id)
      };
      keys.push(key);
      fromKey = id;
      fromName = job.location_name || job.address;
    });
    return keys;
  }

  function apply(data, originValue) {
    const jobs = data.jobs || {};
    const ids = Object.keys(jobs);
    const origin = Array.isArray(originValue) ? originValue : [FALLBACK.lat, FALLBACK.lon];
    const context = contextFor(data, origin);
    data.sections = {};

    const all = optimize(ids, context);
    const urgentIds = urgent(ids, jobs, context);
    const moneyIds = money(ids, jobs, context);
    const closestIds = ids.slice().sort(function (a, b) {
      return context.result("origin", a).total - context.result("origin", b).total;
    }).slice(0, 8);
    const selected = optimize(selectedIds.filter(function (id) { return jobs[id]; }), context);

    data.plans = {
      "Plan A — All jobs, most efficient WeGo order": makePlan(data, "planA", all, origin, context),
      "Plan B — Urgent jobs, optimized WeGo order": makePlan(data, "planB", urgentIds, origin, context),
      "Plan C — Most money, optimized WeGo order": makePlan(data, "planC", moneyIds, origin, context),
      "Plan D — Fastest from current location by WeGo": makePlan(data, "planD", closestIds, origin, context),
      "Selected jobs — Optimized WeGo route": makePlan(data, "selected", selected, origin, context)
    };
    data.networkSummary = {
      routeCount: context.graph.routeCount,
      routeStopCount: context.graph.nodes.size,
      selectedOrder: selected.slice()
    };
    return data;
  }

  function setSelected(data, ids, origin) {
    selectedIds = ids.slice();
    apply(data, origin);
  }

  function updateOrigin(data, origin) {
    apply(data, origin);
  }

  root.JobPlanBuilder = { apply: apply, setSelected: setSelected, updateOrigin: updateOrigin, miles: miles };
})(window);
