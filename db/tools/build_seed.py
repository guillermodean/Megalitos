#!/usr/bin/env python3
"""Transform the legacy `fichas` / `clasificacion` tables into app/db/init/02-seed.sql
and app/db/DATA_REPORT.md.

Do not run directly: use build_seed.sh, which loads the legacy dump into a throwaway
MariaDB container, exports TSV files and runs this script in python:3.12-slim (needs pyproj).

Inputs (all paths via CLI): fichas.tsv, clasificacion.tsv (mariadb --batch output),
the GPX file, the legacy image directory. Output is deterministic.
"""
import argparse, collections, datetime as dt, math, os, re, statistics as st, unicodedata
import pyproj
from pyproj import Transformer

ap = argparse.ArgumentParser()
ap.add_argument('--fichas', required=True)
ap.add_argument('--clasificacion', required=True)
ap.add_argument('--gpx', required=True)
ap.add_argument('--images', required=True)
ap.add_argument('--out-sql', required=True)
ap.add_argument('--out-report', required=True)
args = ap.parse_args()

# ---------------------------------------------------------------- helpers
def unesc(s):
    if s == 'NULL':
        return None
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t', '0': '\0', 'r': '\r', '\\': '\\'}.get(m.group(1), m.group(1)), s)

def read_tsv(path):
    with open(path, encoding='utf8') as f:
        hdr = f.readline().rstrip('\n').split('\t')
        return [dict(zip(hdr, [unesc(x) for x in l.rstrip('\n').split('\t')])) for l in f]

def ascii_fold(s):
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if not unicodedata.combining(c))

def slugify(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', ascii_fold(s).lower())).strip('-')

def norm_name(s):
    s = ascii_fold(s.replace(',', 'N').upper())   # GPX writes 'ñ' as ','
    return re.sub(r'[^A-Z0-9]', '', s)

def clean(v):
    if v is None:
        return None
    v = v.replace('\r\n', '\n').strip()
    return v or None

def hav(lat1, lon1, lat2, lon2):
    p = math.radians
    a = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))

def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return '1' if v else '0'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dt.date,)):
        return "'%s'" % v.isoformat()
    s = str(v).replace('\\', '\\\\').replace("'", "''").replace('\0', '\\0').replace('\n', '\\n').replace('\r', '\\r').replace('\x1a', '\\Z')
    return "'" + s + "'"

def stats(l):
    l = sorted(l)
    return dict(n=len(l), median=st.median(l), p90=l[int(len(l) * .9)], max=l[-1])

rep = []          # report lines
def R(s=''): rep.append(s)

rows = read_tsv(args.fichas)
clas = read_tsv(args.clasificacion)
text_fixes = collections.Counter()

# ---------------------------------------------------------------- tipologias
tipologias = []
for c in clas:
    nombre = clean(c['Descripcion'])
    if nombre:
        tipologias.append((int(c['ID_clas']), nombre, slugify(nombre)))
tip_ids = {t[0] for t in tipologias}
assert len({t[2] for t in tipologias}) == len(tipologias)

# ---------------------------------------------------------------- GPX
gpx_txt = open(args.gpx, encoding='iso-8859-1').read()
gpx = collections.defaultdict(list)
for m in re.finditer(r'<wpt lat="([^"]+)" lon="([^"]+)">(.*?)</wpt>', gpx_txt, re.S):
    nm = re.search(r'<name>(.*?)</name>', m.group(3)).group(1)
    gpx[norm_name(nm)].append((float(m.group(1)), float(m.group(2))))
n_gpx = sum(len(v) for v in gpx.values())

# ---------------------------------------------------------------- UTM
X_MIN, X_MAX, Y_MIN, Y_MAX = 540000, 720000, 4640000, 4800000
def utm_fix(x, y):
    """Return (x, y, swapped, valid)."""
    if x is None or y is None:
        return None, None, False, False
    swapped = False
    if not (X_MIN <= x <= X_MAX) and (X_MIN <= y <= X_MAX) and (Y_MIN <= x <= Y_MAX):
        x, y, swapped = y, x, True
    return x, y, swapped, (X_MIN <= x <= X_MAX and Y_MIN <= y <= Y_MAX)

TR = {'ED50': Transformer.from_crs(23030, 4326, always_xy=True),
      'ETRS89': Transformer.from_crs(25830, 4326, always_xy=True)}

def orig_coords(r):
    v = r['Coordenadas']
    if not v:
        return None
    try:
        la, lo = (float(p) for p in v.split(','))
    except ValueError:
        return None
    return (la, lo) if (41.9 <= la <= 43.35 and -2.5 <= lo <= -0.7) else None

# Northing typo "46xxxxx" for "47xxxxx": a cluster in Baztan / Quinto Real lands ~100 km south in the
# Bardenas, yet with altitudes > 700 m (impossible there). Confirmed by 5 GPX matches off by exactly ~100 km.
NORTHING_TYPO_Y_MAX, NORTHING_TYPO_MIN_ALT = 4700000, 700
# Manual single-digit fixes (orchestrator review 2026-11-11): id -> (utm_x, utm_y)
MANUAL_UTM = {125: (627565, 4748000)}  # OIARZABAL HEGO: X 687565 is 60 km east of its twin 124 (627500)
northing_fixed = []

recs = []
for r in rows:
    x, y, sw, ok = utm_fix(int(r['UTM_X']) if r['UTM_X'] else None, int(r['UTM_Y']) if r['UTM_Y'] else None)
    rid = int(r['Id'])
    if rid in MANUAL_UTM:
        x, y = MANUAL_UTM[rid]; ok = True
    elif ok and y < NORTHING_TYPO_Y_MAX and r['UTM_Z'] and int(r['UTM_Z']) > NORTHING_TYPO_MIN_ALT:
        y += 100000; northing_fixed.append(rid)
    recs.append(dict(r=r, id=int(r['Id']), x=x, y=y, swapped=sw, utm_ok=ok, raw=(r['UTM_X'], r['UTM_Y']),
                     gpx=gpx.get(norm_name(r['Nombre'] or '')), orig=orig_coords(r)))

# datum comparison
dat = {k: dict(gpx=[], orig=[], dn=[], de=[]) for k in TR}
for c in recs:
    if not c['utm_ok']:
        continue
    for k, tr in TR.items():
        lon, lat = tr.transform(c['x'], c['y'])
        if c['gpx']:
            best = min(c['gpx'], key=lambda g: hav(lat, lon, g[0], g[1]))
            d = hav(lat, lon, best[0], best[1])
            dat[k]['gpx'].append(d)
            if d < 1500:
                dat[k]['dn'].append((lat - best[0]) * 111200)
                dat[k]['de'].append((lon - best[1]) * 111200 * math.cos(math.radians(lat)))
        if c['orig']:
            dat[k]['orig'].append(hav(lat, lon, *c['orig']))
gpx_med = {k: st.median(v['gpx']) for k, v in dat.items()}
TG = pyproj.transformer.TransformerGroup(23030, 4326, always_xy=True)
DATUM = min(gpx_med, key=gpx_med.get)   # decision rule: smaller median error vs the independent GPX
tr = TR[DATUM]

# ---------------------------------------------------------------- coordinates
GROSS_M = 10000
gross = []
n_src = collections.Counter(); outliers = []; no_coord = []; bad_utm = []; swapped_ids = []
for c in recs:
    if c['swapped']:
        swapped_ids.append(c['id'])
    if c['raw'][0] and not c['utm_ok']:
        bad_utm.append((c['id'], c['raw']))
    lat = lon = src = None
    if c['utm_ok']:
        lon, lat = tr.transform(c['x'], c['y']); src = 'utm'
        if c['gpx']:
            d = min(hav(lat, lon, g[0], g[1]) for g in c['gpx'])
            if d > GROSS_M:
                # position kilometres away from an independent GPS waypoint of the same name: UTM digit typo.
                # Use the GPX point and drop the unreliable UTM (listed in the report).
                gross.append((c['id'], c['r']['Nombre'], round(d), c['raw']))
                lat, lon = min(c['gpx'], key=lambda g: hav(lat, lon, g[0], g[1])); src = 'gpx'
                c['x'] = c['y'] = None; c['utm_ok'] = False
            elif d > 500:
                outliers.append((c['id'], c['r']['Nombre'], round(d)))
    elif c['gpx']:
        lat, lon = c['gpx'][0]; src = 'gpx'
    elif c['orig']:
        lat, lon = c['orig']; src = 'original'
    c['lat'] = round(lat, 6) if lat is not None else None
    c['lon'] = round(lon, 6) if lon is not None else None
    c['src'] = src
    n_src[src] += 1
    if src is None:
        no_coord.append(c['id'])
    if not c['utm_ok']:
        c['x'] = c['y'] = None   # never store unvalidated UTM
orig_not_utm = [c['id'] for c in recs if c['src'] == 'original']

# ---------------------------------------------------------------- dates
MES = {m: i + 1 for i, m in enumerate('enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split())}
DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
unparse = []; date_stats = collections.Counter(); susp_years = collections.Counter(); weekday_bad = []
for c in recs:
    t = clean(c['r']['Localizado_fecha'])
    c['ftxt'] = t; c['fecha'] = None
    if not t:
        date_stats['empty'] += 1; continue
    m = re.fullmatch(r'(\w+), (\w+) (\d{1,2}), (\d{4})', t)
    if not m or m.group(2).lower() not in MES:
        date_stats['unparseable'] += 1; unparse.append((c['id'], t)); continue
    wd, mes, d, y = m.group(1).lower(), MES[m.group(2).lower()], int(m.group(3)), int(m.group(4))
    try:
        date = dt.date(y, mes, d)
    except ValueError:
        date_stats['invalid_date'] += 1; continue
    if DIA[date.weekday()] != wd:
        weekday_bad.append(c['id'])
    if y < 1900 or y > 2015 or y == 1905:
        susp_years[y] += 1; date_stats['suspicious_year_null'] += 1; continue
    c['fecha'] = date; date_stats['parsed'] += 1

# ---------------------------------------------------------------- text
DEG_PATTERNS = [
    (re.compile(r'(\d)\?(?=\s*\d+\s*[´\'′])'), r'\1º'),                    # 43? 03´  (coordinates)
    (re.compile(r'(?i)(orientad[ao]s? a (?:aprox\.? )?\d+)\?'), r'\1º'),   # orientada a 15?
]
def fix_text(v, field):
    v = clean(v)
    if v is None:
        return None
    for pat, rep_ in DEG_PATTERNS:
        v, n = pat.subn(rep_, v)
        if n:
            text_fixes[field] += n
    return v

HOJA = re.compile(r'Hoja\s+cartogr[aá]fica\s*(?:N[ºo°]\.?)?\s*:?\s*(\d{2,3}(?:-\d{1,2})?)(?:\s*/?\s*([A-D](?:/[A-D])?))?(?![\d?-])', re.I)
def hoja(t):
    if not t:
        return None
    m = HOJA.search(t)
    if not m:
        return None
    return m.group(1) + (('/' if '/' in t[m.start(2) - 1:m.start(2)] else ' ') + m.group(2).upper() if m.group(2) else '')

# ---------------------------------------------------------------- megalitos
meg = []
tip_null = collections.Counter()
for c in recs:
    r = c['r']
    tid = int(r['ID_clas']) if r['ID_clas'] else None
    if tid not in tip_ids:
        if tid is not None:
            tip_null['id_clas_15_empty' if tid == 15 else 'id_clas_unknown'] += 1
        else:
            tip_null['id_clas_null'] += 1
        tid = None
    m = dict(
        id=c['id'], nombre=fix_text(r['Nombre'], 'nombre'), tipologia_id=tid,
        tipologia_texto=fix_text(r['Des_clas'], 'tipologia_texto'), municipio=fix_text(r['Municipio'], 'municipio'),
        ubicacion=fix_text(r['Ubicacion'], 'ubicacion'), itinerario_texto=fix_text(r['Itinerario_texto'], 'itinerario_texto'),
        utm_x=c['x'], utm_y=c['y'], altitud=int(r['UTM_Z']) if r['UTM_Z'] else None,
        lat=c['lat'], lon=c['lon'], coord_fuente=c['src'],
        localizado_fecha=c['fecha'], localizado_fecha_texto=c['ftxt'], localizado_autor=fix_text(r['Localizado_autor'], 'localizado_autor'),
        descripcion=fix_text(r['Descripcion'], 'descripcion'), excavacion=fix_text(r['Excavacion'], 'excavacion'),
        observaciones=fix_text(r['Observaciones'], 'observaciones'), caracteristicas=fix_text(r['Características'], 'caracteristicas'),
        otros_aspectos=fix_text(r['Otros_aspectos'], 'otros_aspectos'))
    m['hoja_cartografica'] = hoja(m['itinerario_texto'])
    assert m['nombre'], c['id']
    for k, lim in (('nombre', 80), ('tipologia_texto', 60), ('municipio', 120), ('ubicacion', 255), ('localizado_autor', 120),
                   ('caracteristicas', 255), ('otros_aspectos', 120), ('hoja_cartografica', 40), ('localizado_fecha_texto', 40)):
        assert m[k] is None or len(m[k]) <= lim, (c['id'], k, len(m[k]))
    meg.append(m)
meg.sort(key=lambda m: m['id'])
ids = {m['id'] for m in meg}
assert len(ids) == len(meg)
hojas = sum(1 for m in meg if m['hoja_cartografica'])
hoja_sin = [m['id'] for m in meg if m['itinerario_texto'] and re.search('hoja cartogr', m['itinerario_texto'], re.I) and not m['hoja_cartografica']]

# ---------------------------------------------------------------- anexos
FN = re.compile(r'^(\d{4})_(DIB|FOT|MAP|TEX)_(\d+)_(\d+)\.jpg$')
disk = sorted(os.listdir(args.images))
disk_set = set(disk)
anexos = []; seen = {}; bad_names = []; dup_other = []; anexo_prefix_mismatch = []
for c in sorted(recs, key=lambda c: c['id']):
    r = c['r']
    names = [clean(r['Anexo_Foto'])] + [clean(r['Anexo_path_%d' % i]) for i in range(1, 54)]
    pos = 0; own = set()
    for n in names:
        if not n or n in own:
            continue
        own.add(n)
        mm = FN.match(n)
        if not mm:
            bad_names.append((c['id'], n)); continue
        if int(mm.group(1)) != c['id']:
            anexo_prefix_mismatch.append((c['id'], n))
        if n in seen:
            dup_other.append((c['id'], n, seen[n]))
        seen[n] = c['id']
        pos += 1
        anexos.append(dict(megalito_id=c['id'], tipo=mm.group(2), archivo=n, orden=pos, existe=n in disk_set))
n_ref = len(anexos)
referenced = {a['archivo'] for a in anexos}
orphans = [f for f in disk if f not in referenced]
orph_added = []; orph_noid = []; orph_badname = []
per_meg_pos = collections.Counter(a['megalito_id'] for a in anexos)
def okey(f):
    m = FN.match(f); return (int(m.group(1)), int(m.group(4)), int(m.group(3)), f) if m else (0, 0, 0, f)
for f in sorted(orphans, key=okey):
    m = FN.match(f)
    if not m:
        orph_badname.append(f); continue
    mid = int(m.group(1))
    if mid not in ids:
        orph_noid.append(f); continue
    per_meg_pos[mid] += 1
    assert per_meg_pos[mid] <= 255
    anexos.append(dict(megalito_id=mid, tipo=m.group(2), archivo=f, orden=per_meg_pos[mid], existe=True))
    orph_added.append(f)
anexos.sort(key=lambda a: (a['megalito_id'], a['orden']))
missing = [a for a in anexos if not a['existe']]

# ---------------------------------------------------------------- SQL
out = ['-- Generated by app/db/tools/build_seed.py from Docs/1-Mysql/megalitos.sql. Do not edit by hand.',
       'SET NAMES utf8mb4;', 'USE `megalitos`;', '', 'SET FOREIGN_KEY_CHECKS=0;', '']
out.append('INSERT INTO `tipologias` (`id`,`nombre`,`slug`) VALUES')
out.append(',\n'.join('(%d,%s,%s)' % (i, q(n), q(s)) for i, n, s in tipologias) + ';\n')
cols = ['id', 'nombre', 'tipologia_id', 'tipologia_texto', 'municipio', 'ubicacion', 'itinerario_texto', 'hoja_cartografica',
        'utm_x', 'utm_y', 'altitud', 'lat', 'lon', 'coord_fuente', 'localizado_fecha', 'localizado_fecha_texto',
        'localizado_autor', 'descripcion', 'excavacion', 'observaciones', 'caracteristicas', 'otros_aspectos']
def dec(v):
    return None if v is None else '%.6f' % v
for i in range(0, len(meg), 50):
    chunk = meg[i:i + 50]
    out.append('INSERT INTO `megalitos` (%s) VALUES' % ','.join('`%s`' % k for k in cols))
    vals = []
    for m in chunk:
        row = dict(m); row['lat'] = dec(m['lat']); row['lon'] = dec(m['lon'])
        vals.append('(' + ','.join(('%s' % row[k]) if k in ('lat', 'lon') and row[k] is not None else q(row[k]) for k in cols) + ')')
    out.append(',\n'.join(vals) + ';\n')
acols = ['megalito_id', 'tipo', 'archivo', 'orden', 'existe']
for i in range(0, len(anexos), 200):
    out.append('INSERT INTO `anexos` (`megalito_id`,`tipo`,`archivo`,`orden`,`existe`) VALUES')
    out.append(',\n'.join('(' + ','.join(q(a[k]) for k in acols) + ')' for a in anexos[i:i + 200]) + ';\n')
out.append('SET FOREIGN_KEY_CHECKS=1;\n')
with open(args.out_sql, 'w', encoding='utf8', newline='\n') as f:
    f.write('\n'.join(out))

# ---------------------------------------------------------------- report
def fmt(s): return 'n=%d, median %.0f m, p90 %.0f m, max %.0f m' % (s['n'], s['median'], s['p90'], s['max'])
def ids_s(l): return ', '.join(str(i) for i in l) if l else '-'
R('# Data report (generated by `db/tools/build_seed.py`)'); R()
R('## Source row counts')
R('- `fichas` in the dump: **%d rows** (ids %d..%d), not 491: the "491" figure counted the 15 `clasificacion` rows too. No rows excluded.' % (len(rows), meg[0]['id'], meg[-1]['id']))
R('- `clasificacion`: %d rows; the empty one (ID_clas 15) is dropped, leaving %d `tipologias`.' % (len(clas), len(tipologias)))
R('- Rows with `tipologia_id` NULL: %d (%s). `tipologia_texto` is kept from `Des_clas`.' % (sum(tip_null.values()), dict(tip_null)))
R(); R('## Coordinates / datum')
R('GPX waypoints: %d (matched by normalised name, "," read as ñ); %d megalitos have a GPX name match.' % (n_gpx, sum(1 for c in recs if c['gpx'])))
R(); R('UTM (zone 30N) converted with each candidate datum; distance to the independent GPX waypoint (nearest same-name candidate) and to the legacy `Coordenadas`:'); R()
R('| datum | vs GPX | vs legacy Coordenadas |'); R('|---|---|---|')
for k in TR:
    R('| %s | %s | %s |' % (k, fmt(stats(dat[k]['gpx'])), 'n=%d, median %.2f m, max %.2f m' % (len(dat[k]['orig']), st.median(dat[k]['orig']), max(dat[k]['orig']))))
R()
for k in TR:
    if dat[k]['dn']:
        R('- %s signed offset vs GPX (matches < 1.5 km, n=%d): median dN %+.0f m, dE %+.0f m.' % (k, len(dat[k]['dn']), st.median(dat[k]['dn']), st.median(dat[k]['de'])))
R(); R('**Decision: %s** (smaller median error against the GPX: %.0f m vs %.0f m).' % (DATUM, gpx_med[DATUM], max(gpx_med.values())))
R('Caveat: the legacy `Coordenadas` agree with ETRS89 to centimetres, i.e. they were computed from the same UTM values assuming ETRS89/WGS84. They are derived data, not independent evidence, and are ~%.0f m away from the ED50 results; the GPX (independent GPS survey, 2009) supports ED50. Transformer: `%s` (accuracy %s m; pyproj %s, PROJ %s; grid-based variants unavailable: %s).' % (st.median(dat['ED50']['orig']), TG.transformers[0].name, TG.transformers[0].accuracy, pyproj.__version__, pyproj.proj_version_str, bool(TG.unavailable_operations)))
R(); R('Resulting `coord_fuente`: ' + ', '.join('%s=%d' % (k or 'NULL', v) for k, v in sorted(n_src.items(), key=lambda kv: str(kv[0]))) + '.')
R('- Swapped UTM X/Y fixed: **%d** (ids %s).' % (len(swapped_ids), ids_s(swapped_ids)))
R('- Northing typo fixed (+100 000 m: UTM_Y < %d with altitude > %d m): **%d** (ids %s).' % (NORTHING_TYPO_Y_MAX, NORTHING_TYPO_MIN_ALT, len(northing_fixed), ids_s(northing_fixed)))
R('- Manual UTM overrides: %s.' % ', '.join('%d -> %s' % kv for kv in MANUAL_UTM.items()))
R('- UTM present but outside Navarra bounds even after swap (utm_x/utm_y stored NULL, fallback used): %s.' % (', '.join('%d %s' % b for b in bad_utm) or 'none'))
R('- `original` source used for ids (no valid UTM, no GPX match; note these are ETRS89-assumed values, ~%.0f m off ED50): %s.' % (st.median(dat['ED50']['orig']), ids_s(orig_not_utm)))
R('- No coordinates at all (lat/lon NULL, %d): %s.' % (len(no_coord), ids_s(no_coord)))
R('- Gross outliers (> %d m from the GPX waypoint, treated as UTM typos: GPX used with coord_fuente=gpx, utm_x/utm_y set NULL; %d; id name metres raw UTM_X/UTM_Y): %s.' % (GROSS_M, len(gross), '; '.join('%d %s %d (%s/%s)' % (g[0], g[1], g[2], g[3][0], g[3][1]) for g in sorted(gross)) or 'none'))
R('- Outliers, UTM-derived position more than 500 m from the GPX waypoint between 500 m and %d m (UTM kept, **not** replaced; %d, id name metres): ' % (GROSS_M, len(outliers)))
R(); R('  ' + ('; '.join('%d %s %d' % o for o in sorted(outliers)) or 'none'))
R(); R('## Dates')
R('- Parsed to DATE: **%(parsed)d**; empty: %(empty)d; year considered an artefact (DATE NULL, text kept): %(suspicious_year_null)d; unparseable: %(unparseable)d; invalid: %(invalid_date)d.' % collections.defaultdict(int, date_stats))
R('- Years nulled: %s. 1905 is treated as an artefact on purpose: that many rows share it, only months Mar-Jun, while the weekday still matches (spreadsheet auto-completed a 2-digit year); other years < 1900 or > 2015 (2426-2443) are spreadsheet serial leftovers.' % ', '.join('%d (x%d)' % kv for kv in sorted(susp_years.items())))
R('- Unparseable date text (DATE NULL, text kept): %s.' % ('; '.join('%d %r' % u for u in unparse) or 'none'))
R('- Weekday in text inconsistent with the date: %d rows (%s).' % (len(weekday_bad), ids_s(weekday_bad)))
R(); R('## Anexos')
R('- Referenced by `fichas` (Anexo_Foto + Anexo_path_1..53, de-duplicated): **%d**; missing on disk (`existe`=0): **%d**%s.' % (n_ref, len(missing), (' (' + ', '.join(a['archivo'] for a in missing[:30]) + ')') if missing else ''))
R('- Names not matching `NNNN_TYPE_X_Y.jpg` (skipped): %s.' % (', '.join('%d %s' % b for b in bad_names) or 'none'))
R('- Referenced name whose NNNN prefix differs from the row id: %s.' % ('%d files in %d rows, e.g. %s (legacy numbering offset; the row reference is kept) - rows: %s' % (len(anexo_prefix_mismatch), len({a for a, _ in anexo_prefix_mismatch}), ', '.join('%d %s' % b for b in anexo_prefix_mismatch[:3]), ids_s(sorted({a for a, _ in anexo_prefix_mismatch}))) if anexo_prefix_mismatch else 'none'))
R('- Same file referenced by two rows: %s.' % (', '.join('%d %s (also %d)' % d for d in dup_other) or 'none'))
R('- Files on disk: %d; not referenced: %d. Added as anexos (prefix id exists): **%d** (%s); prefix id not in megalitos: %d (%s); non-conforming names: %d.' % (len(disk), len(orphans), len(orph_added), ', '.join(orph_added), len(orph_noid), ', '.join(orph_noid[:20]), len(orph_badname)))
R('- Total `anexos` rows: **%d**; megalitos with at least one anexo: %d; by type: %s.' % (len(anexos), len({a['megalito_id'] for a in anexos}), dict(collections.Counter(a['tipo'] for a in anexos))))
R('- `orden` = position within the megalito (Anexo_Foto first, then Anexo_path_N; orphans appended ordered by trailing index).')
R('- Column `Itinerario` (e.g. `Ulzama#0001_TEX_25.pdf#`, PDF route links) is not part of the schema and is not imported.')
R(); R('## Text')
R('- All text trimmed, empty strings -> NULL, CRLF -> LF. No UTF-8 mojibake found (the dump is clean utf8mb4).')
R('- Replaced `?` by `º` only in two unambiguous patterns (digit+`?` before minutes `´`, and `orientada a N?`): %s.' % (dict(text_fixes) or 'none'))
R('- Remaining `?` left untouched (genuine uncertainty marks such as "Dolmen?", or ambiguous lost symbols such as diameter "15m ?").')
R('- `hoja_cartografica` extracted for %d rows. "Hoja cartográfica" present but not extractable (ambiguous/multiple, left NULL): %s.' % (hojas, ids_s(hoja_sin)))
with open(args.out_report, 'w', encoding='utf8') as f:
    f.write('\n'.join(rep) + '\n')
print('megalitos=%d anexos=%d tipologias=%d datum=%s' % (len(meg), len(anexos), len(tipologias), DATUM))
