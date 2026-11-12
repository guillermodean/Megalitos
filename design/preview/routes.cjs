'use strict';
// Fixture routes for the design preview. Relation ids / refs / names are real (see docs/hiking-routes-research.md),
// the GEOMETRIES ARE INVENTED: simplified polylines wandering through the Aralar and Ulzama megalith areas.
const M = (la) => 111320, K = (la) => 111320 * Math.cos((la * Math.PI) / 180);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180));

module.exports = function build(geo) {
  const pos = {};
  geo.features.forEach((f) => { pos[f.properties.id] = [f.geometry.coordinates[1], f.geometry.coordinates[0]]; });
  // waypoint helper: a megalith position shifted by (north m, east m)
  const via = (id, n = 0, e = 0) => { const p = pos[id]; return [p[0] + n / 111320, p[1] + e / (111320 * Math.cos((p[0] * Math.PI) / 180))]; };
  const densify = (pts, step = 90, wob = 22) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(dist(a, b) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, w = Math.sin((i * 7 + k) * 1.3) * wob;
        out.push([a[0] + (b[0] - a[0]) * t + w / 111320, a[1] + (b[1] - a[1]) * t + (Math.cos((i * 5 + k) * 1.1) * wob) / 81000]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const len = (line) => line.reduce((s, p, i) => (i ? s + dist(line[i - 1], p) : s), 0);
  const defs = [
    { id: 4275896, ref: 'GR 282', nombre: 'Artzaintza naturbidea', red: 'nwn', operador: 'Federación Navarra de Deportes de Montaña y Escalada', desde: 'Lizarrusti', hasta: 'Ultzama', simbolo: 'red:white:red_bar', web: 'https://www.fedme.es/', segs: [[[42.9475, -2.0505], via(311, -250, -300), via(312, 180, 120), via(309, 90, -150), via(313, -60, 240), via(315, 120, -90), [42.9619, -1.9205], [42.9677, -1.8402], [42.9712, -1.7611], via(337, -210, 180), via(333, 140, -230), [42.9632, -1.5121]]] },
    { id: 6545762, ref: 'GR 20', nombre: 'Aralarko bira', red: 'nwn', operador: 'Federación Navarra de Deportes de Montaña y Escalada', desde: 'Lizarrusti', hasta: 'Lizarrusti', simbolo: 'red:white:red_bar', segs: [[[42.9475, -2.0505], via(310, 180, -220), via(311, 70, -80), via(312, -110, 130), via(309, 260, 100), via(308, 90, -140), via(322, -160, 90), [42.9331, -1.9306], [42.9202, -1.9908], [42.9187, -2.0524], [42.9475, -2.0505]]] },
    { id: 8657756, ref: 'PR-NA 82', nombre: 'Aralarko Done Mikel', red: 'rwn', operador: 'Gobierno de Navarra', desde: 'Lizarrusti', hasta: 'San Miguel de Aralar', simbolo: 'yellow:white:yellow_bar', segs: [[[42.9475, -2.0505], via(310, 300, -140), via(312, 90, 40), via(313, 240, 60), [42.9705, -1.9689]], [[42.9705, -1.9689], [42.9741, -1.9606], [42.9792, -1.9552]]] },
    { id: 19045968, ref: 'GR 322', nombre: 'Nafarroa Xtrem', red: 'nwn', operador: 'Federación Navarra de Deportes de Montaña y Escalada', desde: 'Pamplona', hasta: 'Pamplona', simbolo: 'red:white:red_bar', segs: [[[42.8168, -1.6459], [42.8556, -1.6902], via(333, -800, -400), via(334, 300, -200), [43.0102, -1.5001], via(338, 120, 250), [42.9201, -1.4688], [42.8802, -1.5502], [42.8168, -1.6459]]] },
    { id: 5112401, ref: 'SL-NA 53', nombre: 'Ruta de los dólmenes de Ulzama', red: 'lwn', operador: 'Ayuntamiento de Ultzama', desde: 'Larraintzar', hasta: 'Larraintzar', simbolo: 'green:white:green_bar', segs: [[[42.9482, -1.5301], via(333, -300, 200), via(333, 150, -120), [42.9805, -1.5604], [42.9601, -1.5183], [42.9482, -1.5301]]] },
    { id: 7720335, ref: 'PR-NA 120', nombre: 'Camino de Aguinaga a Elurmenta', red: 'rwn', operador: 'Gobierno de Navarra', desde: 'Arruazu', hasta: 'Elurmenta', simbolo: 'yellow:white:yellow_bar', segs: [[[42.9332, -2.0087], via(309, -40, 60), via(312, -30, 40)]] },
    { id: 3340192, ref: null, nombre: 'Sendero local de Zubarrieta', red: 'lwn', operador: null, desde: null, hasta: null, simbolo: null, segs: [[via(313, -300, -200), via(313, 20, 30), via(315, 130, 100)]] },
    { id: 9120078, ref: 'GR 11', nombre: 'Senda Pirenaica', red: 'iwn', operador: 'Federación Española de Deportes de Montaña y Escalada', desde: 'Cap de Creus', hasta: 'Cabo Higuer', simbolo: 'red:white:red_bar', segs: [[[43.0302, -1.3302], via(338, 420, -350), [43.0123, -1.4211], [42.9988, -1.4893], [43.0152, -1.5702]]] },
  ];
  const ids = geo.features.map((f) => f.properties.id);
  const byId = {};
  defs.forEach((d) => {
    const lines = d.segs.map((s) => densify(s));
    const lm = lines.reduce((s, l) => s + len(l), 0);
    const near = ids.map((id) => {
      let best = 1e9, acc = null;
      lines.forEach((l) => l.forEach((p) => { const k = dist(pos[id], p); if (k < best) { best = k; acc = p; } }));
      return { id, d: Math.round(best), acc };
    }).filter((x) => x.d <= 1500).sort((a, b) => a.d - b.d);
    byId[d.id] = { ...d, lines, km: (lm / 1000).toFixed(1).replace('.', ','), near };
  });
  const redNombre = { iwn: 'Internacional', nwn: 'Nacional (GR)', rwn: 'Regional', lwn: 'Local' };
  const toCoords = (lines) => ({ type: 'MultiLineString', coordinates: lines.map((l) => l.map((p) => [+p[1].toFixed(6), +p[0].toFixed(6)])) });
  const card = (r) => ({ id: r.id, ref: r.ref, nombre: r.nombre, red: r.red, redNombre: redNombre[r.red] || 'Sin clasificar', longitudKm: r.km, nMegalitos: r.near.filter((x) => x.d <= 500).length });
  return {
    byId, defs, redNombre,
    list(query = {}) {
      const q = (query.q || '').toLowerCase(), red = query.red || '';
      let items = defs.map((d) => byId[d.id]).filter((r) => (!q || `${r.ref || ''} ${r.nombre}`.toLowerCase().includes(q)) && (!red || r.red === red)).map(card);
      items.sort((a, b) => b.nMegalitos - a.nMegalitos || String(a.ref).localeCompare(String(b.ref)));
      if (query.empty) items = [];
      return { disponible: !query.empty, items, total: items.length, q: query.q || '', red, redes: Object.entries(redNombre).map(([value, nombre]) => ({ value, nombre, selected: value === red })), meta: { actualizado: '2026-11-09', nRutas: defs.length } };
    },
    ruta(id, cardOf) {
      const r = byId[id]; if (!r) return null;
      return { r: { ...card(r), operador: r.operador, desde: r.desde, hasta: r.hasta, web: r.web || null, simbolo: r.simbolo, actualizado: '2026-11-09' },
        megalitos: r.near.filter((x) => x.d <= 1000).map((x) => ({ ...cardOf(x.id), distM: x.d, lat: pos[x.id][0], lon: pos[x.id][1] })),
        gpxUrl: `/rutas/${id}.gpx`, osmUrl: `https://www.openstreetmap.org/relation/${id}`, waymarkedUrl: `https://hiking.waymarkedtrails.org/#route?id=${id}`, meta: { actualizado: '2026-11-09' } };
    },
    feature(id, lite) { const r = byId[id]; return r && { type: 'Feature', geometry: toCoords(r.lines), properties: { ...card(r), id: r.id, n_megalitos: card(r).nMegalitos } }; },
    all() { return { type: 'FeatureCollection', features: defs.map((d) => this.feature(d.id)).map((f) => ({ ...f, properties: { id: f.properties.id, ref: f.properties.ref, nombre: f.properties.nombre, red: f.properties.red, n_megalitos: f.properties.nMegalitos } })) }; },
    cercanas(mid) {
      return defs.map((d) => byId[d.id]).map((r) => ({ r, x: r.near.find((n) => n.id === mid && n.d <= 1500) })).filter((o) => o.x).sort((a, b) => a.x.d - b.x.d).slice(0, 8)
        .map(({ r, x }) => ({ id: r.id, ref: r.ref, nombre: r.nombre, red: r.red, redNombre: redNombre[r.red] || 'Sin clasificar', distM: x.d, longitudKm: r.km, accesoLat: x.acc[0], accesoLon: x.acc[1] }));
    },
  };
};
