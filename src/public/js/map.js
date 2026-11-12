/* Mapas con Leaflet (autoalojado en /vendor/leaflet). Mapa general y mapa de situación de la ficha. */
(() => {
  'use strict';
  if (typeof L === 'undefined') return;

  const OSM = { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', o: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">Colaboradores de OpenStreetMap</a>' } };
  const TOPO = { url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png', o: { maxZoom: 17, attribution: 'Datos &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · Estilo &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' } };
  const IGN = { url: 'https://www.ign.es/wmts/mapa-raster?layer=MTN&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}', o: { maxZoom: 19, attribution: 'MTN &copy; <a href="https://www.ign.es/">Instituto Geográfico Nacional de España</a> (CC BY 4.0)' } };
  const layer = (d) => L.tileLayer(d.url, d.o);
  const css = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
  const accent = () => css(document.documentElement, '--acc') || '#3d6b35';

  const ROOT = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAP_OPTS = reduceMotion ? { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false } : {};
  const FIT = { animate: false };

  const GROUPS = [
    { key: 'dolmen', name: 'Dólmenes', re: /dolmen/ },
    { key: 'cromlech', name: 'Crómlech', re: /cromlech|cromlec/ },
    { key: 'tumulo', name: 'Túmulos', re: /tumulo/ },
    { key: 'menhir', name: 'Menhires y monolitos', re: /menhir|monolito/ },
    { key: 'otro', name: 'Otros', re: /./ }
  ];
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const groupOf = (t) => GROUPS.find((g) => g.re.test(norm(t))) || GROUPS[GROUPS.length - 1];
  // Marker colours come from the legend dots in the stylesheet (light/dark aware).
  const groupColor = (key) => {
    const d = document.createElement('span');
    d.className = 'dot dot--' + key; d.style.position = 'absolute'; d.style.visibility = 'hidden';
    document.body.append(d);
    const c = css(d, 'background-color') || '#8a3f1c';
    d.remove();
    return c;
  };

  /* ---------- Rutas: líneas con halo, bajo los puntos ---------- */
  const palette = () => ({
    iwn: css(ROOT, '--rt-iwn'), nwn: css(ROOT, '--rt-nwn'), rwn: css(ROOT, '--rt-rwn'), lwn: css(ROOT, '--rt-lwn'),
    none: css(ROOT, '--rt-none'), halo: css(ROOT, '--rt-halo')
  });
  const drawn = []; // every route drawn on the page, repainted if the colour scheme flips
  const paint = (e) => {
    const p = palette(), w = e.hot ? e.w + 1.5 : e.w;
    e.line.setStyle({ color: p[e.red] || p.none, weight: w });
    e.halo.setStyle({ color: p.halo, weight: w + e.pad });
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawn.forEach(paint));
  const ensurePane = (map) => {
    if (!map.getPane('rutas')) {
      map.createPane('rutas').style.zIndex = 390; // above tiles, below the megalith points (overlayPane 400)
      map.__rutasRenderer = L.svg({ pane: 'rutas', padding: 0.3 });
    }
    return map.__rutasRenderer;
  };
  // Returns {halo, line, ...}; the halo (wider, interactive) and the line are separate GeoJSON layers
  // so a group of routes can be stacked as "all halos, then all lines".
  const makeRoute = (map, geometry, red, o = {}) => {
    const base = { pane: 'rutas', renderer: ensurePane(map), lineCap: 'round', lineJoin: 'round', opacity: 1 };
    const pad = o.pad || 4;
    const e = { red, w: o.weight || 3.5, pad, hot: false };
    e.halo = L.geoJSON(geometry, { ...base, interactive: !!o.interactive, opacity: 0.9, weight: e.w + pad });
    e.line = L.geoJSON(geometry, { ...base, interactive: false, weight: e.w });
    paint(e); drawn.push(e);
    return e;
  };
  const hot = (e, on) => { e.hot = on; paint(e); };

  const rutaPopup = (p) => {
    const d = document.createElement('div');
    const no = document.createElement('span'); no.className = 'pop__no'; no.textContent = p.ref || 'Ruta';
    const nm = document.createElement('strong'); nm.className = 'pop__name'; nm.textContent = p.nombre || 'Sin nombre';
    const me = document.createElement('span'); me.className = 'pop__meta';
    const n = Number(p.n_megalitos) || 0;
    me.textContent = `${n} megalito${n === 1 ? '' : 's'}`;
    const a = document.createElement('a'); a.className = 'pop__go'; a.href = `/rutas/${encodeURIComponent(p.id)}`; a.textContent = 'Ver ruta';
    d.append(no, nm, me, a);
    return d;
  };
  const fetchJson = (url) => fetch(url, { headers: { Accept: 'application/json' } }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  /* ---------- Megalitos: marcador, popup y etiqueta ---------- */
  const megPopup = (p) => () => {
    const d = document.createElement('div');
    const no = document.createElement('span'); no.className = 'pop__no'; no.textContent = `Nº ${p.id}`;
    const nm = document.createElement('strong'); nm.className = 'pop__name'; nm.textContent = p.nombre;
    const me = document.createElement('span'); me.className = 'pop__meta';
    me.textContent = [p.tipologia, p.municipio, p.altitud ? p.altitud + ' m' : ''].filter(Boolean).join(' · ');
    const a = document.createElement('a'); a.className = 'pop__go'; a.href = `/megalitos/${p.id}`; a.textContent = 'Abrir ficha';
    d.append(no, nm, me, a);
    return d;
  };
  const makeMegalito = (ll, p, color) => {
    const mk = L.circleMarker(ll, { radius: 6.5, weight: 2, color: '#fff', fillColor: color, fillOpacity: 1, className: 'mk' });
    mk.bindPopup(megPopup(p), { minWidth: 160 });
    // Name label under the point (DOM node + textContent: names come from the DB, never as HTML).
    const lbl = document.createElement('span'); lbl.textContent = p.nombre;
    mk.bindTooltip(lbl, { permanent: true, direction: 'bottom', offset: [0, 7], className: 'mk-label', opacity: 1 });
    mk.on('mouseover', () => mk.setStyle({ radius: 8 }));
    mk.on('mouseout', () => mk.setStyle({ radius: 6.5 }));
    return mk;
  };
  // Labels only when zoomed in enough to read them (CSS hides them otherwise), with a greedy collision pass.
  const labelsFor = (map, minZoom) => {
    const declutter = () => {
      const placed = [];
      map.getContainer().querySelectorAll('.mk-label').forEach((t) => {
        t.classList.remove('mk-label--hide');
        const r = t.getBoundingClientRect();
        if (!r.width) return;
        const hit = placed.some((q) => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
        if (hit) t.classList.add('mk-label--hide'); else placed.push(r);
      });
    };
    const sync = () => {
      const on = map.getZoom() >= minZoom;
      map.getContainer().classList.toggle('labels-on', on);
      if (on) declutter();
    };
    map.on('zoomend moveend overlayadd overlayremove', sync);
    return sync;
  };
  const baseLayers = () => ({ 'OpenStreetMap': layer(OSM), 'OpenTopoMap': layer(TOPO), 'IGN España (MTN)': layer(IGN) });

  /* Mapa de situación (ficha) */
  const loc = document.getElementById('locator');
  if (loc) {
    const lat = parseFloat(loc.dataset.lat), lon = parseFloat(loc.dataset.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const m = L.map(loc, { scrollWheelZoom: false, attributionControl: true, ...MAP_OPTS }).setView([lat, lon], 13);
      layer(TOPO).addTo(m);
      L.circleMarker([lat, lon], { radius: 14, weight: 1, color: accent(), fill: false }).addTo(m);
      L.circleMarker([lat, lon], { radius: 7, weight: 2.5, color: '#fff', fillColor: accent(), fillOpacity: 1, className: 'mk' }).addTo(m);
      // Nearby routes: the first three listed in "Rutas cercanas" (already ordered by distance).
      const ids = Array.from(document.querySelectorAll('[data-ruta-id]')).slice(0, 3);
      ids.forEach((li) => {
        const id = parseInt(li.dataset.rutaId, 10);
        if (!Number.isFinite(id)) return;
        fetchJson(`/api/rutas/${id}.geojson`).then((f) => {
          if (!f || !f.geometry) return;
          const e = makeRoute(m, f.geometry, (f.properties && f.properties.red) || li.dataset.rutaRed, { weight: 3, pad: 3 });
          e.halo.addTo(m); e.line.addTo(m);
        }).catch(() => {});
      });
    }
  }

  /* Mapa de una ruta */
  const rm = document.getElementById('rutamap');
  if (rm) {
    const map = L.map(rm, { scrollWheelZoom: false, ...MAP_OPTS }).setView([42.7, -1.65], 9);
    const bases = baseLayers();
    bases['OpenTopoMap'].addTo(map);
    L.control.layers(bases, null, { collapsed: true }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    // The page scrolls: the wheel only zooms once the map has been clicked.
    rm.addEventListener('click', () => map.scrollWheelZoom.enable());
    rm.addEventListener('mouseleave', () => map.scrollWheelZoom.disable());

    const status = document.getElementById('rutamap-status');
    const pts = [];
    const colors = {};
    document.querySelectorAll('[data-megalito]').forEach((li) => {
      const ll = [parseFloat(li.dataset.lat), parseFloat(li.dataset.lon)];
      if (!Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
      const g = groupOf(li.dataset.tipo);
      const c = colors[g.key] || (colors[g.key] = groupColor(g.key));
      const p = { id: li.dataset.megalito, nombre: li.dataset.nombre, tipologia: li.dataset.tipo, municipio: li.dataset.municipio, altitud: li.dataset.altitud };
      const mk = makeMegalito(ll, p, c).addTo(map);
      pts.push(ll);
      // list row <-> marker highlight
      const on = () => mk.setStyle({ radius: 9 }), off = () => mk.setStyle({ radius: 6.5 });
      li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off);
      li.addEventListener('focusin', on); li.addEventListener('focusout', off);
    });
    const sync = labelsFor(map, 12);
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { ...FIT, maxZoom: 14 });

    fetchJson(rm.dataset.geojson).then((f) => {
      if (!f || !f.geometry) throw new Error('no geometry');
      const e = makeRoute(map, f.geometry, rm.dataset.red || (f.properties && f.properties.red), { weight: 4.5, pad: 5 });
      e.halo.addTo(map); e.line.addTo(map);
      const b = e.line.getBounds();
      if (b.isValid()) map.fitBounds(pts.length ? b.extend(L.latLngBounds(pts)) : b, { ...FIT, padding: [24, 24] });
      sync();
      if (status) status.hidden = true;
    }).catch(() => { if (status) { status.hidden = false; status.textContent = 'No se pudo cargar el trazado de la ruta.'; } });
    sync();
  }

  /* Mapa general */
  const el = document.getElementById('map');
  if (!el) return;

  const map = L.map(el, { zoomControl: true, ...MAP_OPTS }).setView([42.7, -1.65], 8); // SVG renderer: markers get CSS shadow
  // Shareable view in the URL hash: #zoom/lat/lon
  const parseHash = () => {
    const m = /^#(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(location.hash);
    if (!m) return null;
    const z = +m[1], la = +m[2], lo = +m[3];
    return (z >= 5 && z <= 19 && Math.abs(la) <= 90 && Math.abs(lo) <= 180) ? { z, la, lo } : null;
  };
  const fromHash = parseHash();
  if (fromHash) map.setView([fromHash.la, fromHash.lo], fromHash.z);
  map.on('moveend', () => {
    const c = map.getCenter();
    history.replaceState(null, '', `#${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`);
  });
  const bases = baseLayers();
  bases['OpenStreetMap'].addTo(map);
  L.control.layers(bases, null, { collapsed: true }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);

  const legend = document.getElementById('mapa-legend');
  const countEl = document.getElementById('mapa-count');

  /* Capa de rutas de senderismo: apagada por defecto, se pide una sola vez al encenderla. */
  const tog = document.getElementById('mapa-rutas');
  if (tog) {
    const key = document.getElementById('mapa-rutas-key');
    const stat = document.getElementById('mapa-rutas-status');
    let group = null, pending = false;
    const say = (t) => { if (stat) { stat.textContent = t; stat.hidden = !t; } };
    const show = (on) => { if (key) key.hidden = !on; };
    const load = () => {
      pending = true; say('Cargando rutas…');
      fetchJson(el.dataset.rutas || '/api/rutas.geojson').then((fc) => {
        const halos = L.layerGroup(), lines = L.layerGroup();
        let n = 0;
        (fc.features || []).forEach((f) => {
          if (!f.geometry) return;
          const p = f.properties || {};
          const e = makeRoute(map, f.geometry, p.red, { weight: 3, pad: 4, interactive: true });
          e.halo.on('mouseover', () => hot(e, true)).on('mouseout', () => hot(e, false));
          e.halo.on('click', (ev) => { L.DomEvent.stopPropagation(ev); L.popup({ minWidth: 160 }).setLatLng(ev.latlng).setContent(rutaPopup(p)).openOn(map); });
          halos.addLayer(e.halo); lines.addLayer(e.line); n++;
        });
        group = L.layerGroup([halos, lines]);
        say(`${n} ruta${n === 1 ? '' : 's'}`);
        pending = false;
        if (tog.checked) group.addTo(map);
      }).catch(() => { pending = false; say('No se pudieron cargar las rutas.'); tog.checked = false; show(false); });
    };
    const apply = () => {
      show(tog.checked);
      if (tog.checked) { if (group) { group.addTo(map); say(stat.textContent); } else if (!pending) load(); }
      else { if (group) map.removeLayer(group); }
    };
    tog.addEventListener('change', apply);
    if (tog.checked) apply(); // form state restored by the browser
  }

  fetchJson(el.dataset.geojson)
    .then((fc) => {
      const layers = {}, counts = {}, all = [];
      GROUPS.forEach((g) => { layers[g.key] = L.layerGroup().addTo(map); counts[g.key] = 0; });
      fc.features.forEach((f) => {
        const [lon, lat] = f.geometry.coordinates;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const g = groupOf(f.properties.tipologia);
        counts[g.key]++; all.push([lat, lon]);
        f.__g = g; f.__ll = [lat, lon];
      });

      /* leyenda: se construye primero para leer los colores de los puntos desde el CSS */
      const colors = {};
      GROUPS.forEach((g) => {
        if (!counts[g.key]) return;
        const lab = document.createElement('label');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
        const dot = document.createElement('span'); dot.className = 'dot dot--' + g.key; dot.setAttribute('aria-hidden', 'true');
        lab.append(cb, dot, document.createTextNode(` ${g.name} · ${counts[g.key]}`));
        legend.append(lab);
        colors[g.key] = css(dot, 'background-color') || '#8a3f1c';
        cb.addEventListener('change', () => { if (cb.checked) layers[g.key].addTo(map); else map.removeLayer(layers[g.key]); });
      });

      fc.features.forEach((f) => {
        if (!f.__g) return;
        makeMegalito(f.__ll, f.properties, colors[f.__g.key]).addTo(layers[f.__g.key]);
      });

      const sync = labelsFor(map, 12);
      legend.addEventListener('change', () => setTimeout(sync, 0));
      sync();

      countEl.textContent = `${all.length.toLocaleString('es-ES')} megalitos con coordenadas`;
      if (all.length && !fromHash) map.fitBounds(L.latLngBounds(all).pad(0.06), FIT);
    })
    .catch(() => { countEl.textContent = 'No se pudieron cargar los puntos del mapa.'; });
})();
