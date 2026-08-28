(function registerJobPlanBuilder(root) {
  const CENTRAL = { name: 'ELIZABETH DUFF TRANSIT CENTER AT WEGO CENTRAL', id: 'WEGO_CENTRAL', lat: 36.1667, lon: -86.7817 };
  const points = {
    NEW01: [36.5639752, -87.3132271], NEW02: [36.5134992, -87.2932951], NEW03: [36.6234614, -87.317965],
    NEW04: [36.2266699, -86.8361689], NEW06: [36.2126493, -86.7991329], NEW07: [36.2275222, -86.75957],
    NEW08: [36.2266296, -86.7600523], NEW09: [36.261602, -86.7123], NEW11: [36.305, -86.695],
    NEW12: [36.1264343, -86.7114144], NEW13: [36.1943216, -86.6227157], NEW14: [36.2092289, -86.6101006],
    NEW15: [36.205, -86.565], NEW16: [36.005565, -86.6999791], NEW17: [36.1032882, -86.6665171],
    NEW18: [36.1719739, -86.7955332], NEW19: [36.0869276, -86.7300093], NEW20: [36.0776954, -86.732109],
  };
  function routeFor(job) {
    const text = (job.address || '').toLowerCase();
    if (text.includes('clarksville, tn')) return { route: '94', corridor: 'Clarksville' };
    if (text.includes('clarksville hwy')) return { route: '22', corridor: 'Northwest Nashville' };
    if (text.includes('whites creek')) return { route: '9', corridor: 'Whites Creek' };
    if (text.includes('dickerson')) return { route: '23', corridor: 'Dickerson Pike' };
    if (text.includes('gallatin') || text.includes('myatt')) return { route: '56', corridor: 'Madison / Gallatin' };
    if (text.includes('lebanon')) return { route: '6', corridor: 'Lebanon Pike / Hermitage' };
    if (text.includes('jefferson')) return { route: '29', corridor: 'Jefferson Street' };
    if (text.includes('nolensville') || text.includes('elysian') || text.includes('harding place')) return { route: '52', corridor: 'South Nashville' };
    if (text.includes('murfreesboro') || text.includes('thompson')) return { route: '55', corridor: 'Murfreesboro Pike' };
    return { route: 'walk', corridor: 'Nashville' };
  }
  function miles(a, b) {
    if (!a || !b) return 999;
    const rad = n => n * Math.PI / 180, dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 3958.8 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function dueTime(job) { const time = Date.parse(job.due || ''); return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER; }
  function section(id, job) {
    const point = points[id] || [CENTRAL.lat, CENTRAL.lon], route = routeFor(job);
    return {
      title: `${route.corridor} — ${job.location_name || job.address}`,
      legs: [{
        label: `Route ${route.route} toward ${job.location_name || job.address}`,
        route: route.route, board: CENTRAL.id, alight: `JOB_${id}`,
        destination: job.address, job: id,
        static: `Live-board job · ${job.due || 'check provider deadline'} · verify departure in live WeGo arrivals`,
        board_stop: CENTRAL,
        alight_stop: { name: job.location_name || job.address, id: `JOB_${id}`, lat: point[0], lon: point[1] },
        segment: [[CENTRAL.lat, CENTRAL.lon], point],
      }],
    };
  }
  function sectionIds(ids) { return ids.map(id => `board_${id}`); }
  function ranked(ids, jobs) {
    return ids.slice().sort((a, b) => {
      const urgentA = jobs[a].status === 'needs_completion' ? 0 : 1, urgentB = jobs[b].status === 'needs_completion' ? 0 : 1;
      return urgentA - urgentB || dueTime(jobs[a]) - dueTime(jobs[b]) || (jobs[b].pay_cents || 0) - (jobs[a].pay_cents || 0);
    });
  }
  function moneyPlan(ids, jobs) {
    return ids.filter(id => !(jobs[id].address || '').toLowerCase().includes('clarksville, tn'))
      .sort((a, b) => ((jobs[b].pay_cents || 0) / (jobs[b].minutes || 30)) - ((jobs[a].pay_cents || 0) / (jobs[a].minutes || 30)))
      .slice(0, 10);
  }
  function closestPlan(ids, origin) { return ids.slice().sort((a, b) => miles(origin, points[a]) - miles(origin, points[b])).slice(0, 8); }
  function apply(data, origin) {
    const jobs = data.jobs || {}, ids = Object.keys(jobs);
    data.sections = {};
    ids.forEach(id => { data.sections[`board_${id}`] = section(id, jobs[id]); });
    data.plans = {
      'Plan A — All refreshed board jobs': sectionIds(ids),
      'Plan B — Urgent deadlines first': sectionIds(ranked(ids, jobs).slice(0, 10)),
      'Plan C — Most money within Nashville bus day': sectionIds(moneyPlan(ids, jobs)),
      'Plan D — Closest to current location': sectionIds(closestPlan(ids, origin || [CENTRAL.lat, CENTRAL.lon])),
      'Selected jobs — Custom route': [],
    };
    return data;
  }
  function setSelected(data, ids) { data.plans['Selected jobs — Custom route'] = sectionIds(ids.filter(id => data.jobs[id])); }
  function updateClosest(data, origin) { data.plans['Plan D — Closest to current location'] = sectionIds(closestPlan(Object.keys(data.jobs || {}), origin)); }
  root.JobPlanBuilder = { apply, setSelected, updateClosest, miles };
})(window);
