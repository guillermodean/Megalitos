#!/usr/bin/env python3
"""Build the hiking-routes dataset (phase 2) from a Geofabrik .osm.pbf.

Inputs : --pbf FILE, megalitos either --megalitos FILE.tsv (id<TAB>lat<TAB>lon) or --db
         (env DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME).
Outputs: --out rutas.sql  (deterministic; one transaction: DELETE + INSERT, so a failed
         load leaves the live tables untouched), optional --stats stats.json.
See db/ROUTES_REPORT.md for the decisions.
"""
import argparse, json, os, sys, datetime, time
import osmium
import numpy as np
import shapely
from shapely import STRtree, Point, LineString, MultiLineString
from shapely.ops import linemerge, nearest_points
from pyproj import Transformer

TO_M = Transformer.from_crs(4326, 25830, always_xy=True).transform
TO_LL = Transformer.from_crs(25830, 4326, always_xy=True).transform

MAX_PAIR_M = 1500
NEAR_M = 500
ACCESS_RADIUS_M = 3000
TOL_DETAIL, TOL_LITE = 5.0, 25.0
SKIP_ROLES = {"alternative", "excursion", "approach"}
NETWORKS = {"iwn", "nwn", "rwn", "lwn"}
ACCESS_HW = {"path", "track", "footway", "bridleway"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_megalitos(args):
    rows = []
    if args.megalitos:
        with open(args.megalitos, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) < 3 or not p[0].strip().isdigit() or p[1] in ("", "NULL") or p[2] in ("", "NULL"):
                    continue
                rows.append((int(p[0]), float(p[1]), float(p[2])))
    else:
        import pymysql
        c = pymysql.connect(host=os.environ.get("DB_HOST", "127.0.0.1"), port=int(os.environ.get("DB_PORT", "3306")),
                            user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
                            database=os.environ.get("DB_NAME", "megalitos"), charset="utf8mb4")
        with c.cursor() as cur:
            cur.execute("SELECT id,lat,lon FROM megalitos WHERE lat IS NOT NULL AND lon IS NOT NULL")
            rows = [(int(i), float(a), float(o)) for i, a, o in cur.fetchall()]
        c.close()
    rows.sort()
    return rows


def pass_relations(pbf):
    """Return (routes: id -> dict(tags, ways[(id, role)]), n_super)."""
    routes, n_super, n_rel_members = {}, 0, 0
    for o in osmium.FileProcessor(pbf, osmium.osm.RELATION):
        t = o.tags
        if t.get("type") not in ("route", "superroute"):
            continue
        if t.get("route") not in ("hiking", "foot") and t.get("type") != "superroute":
            continue
        if t.get("type") == "superroute" or t.get("route") not in ("hiking", "foot"):
            if t.get("route") in ("hiking", "foot") or t.get("type") == "superroute":
                n_super += 1
            continue
        ways = [(m.ref, m.role) for m in o.members if m.type == "w"]
        has_rel = any(m.type == "r" for m in o.members)
        if not ways:
            if has_rel:
                n_super += 1  # pure container of relations: children are kept individually
            continue
        routes[o.id] = {"tags": {k: v for k, v in t}, "ways": ways}
    return routes, n_super


def way_lines(w):
    """Split a way into lines at nodes with invalid locations (clipped extract)."""
    lines, cur = [], []
    for n in w.nodes:
        if n.location.valid():
            cur.append((n.lon, n.lat))
        else:
            if len(cur) > 1:
                lines.append(cur)
            cur = []
    if len(cur) > 1:
        lines.append(cur)
    return lines


def pass_ways(pbf, needed):
    geoms, access = {}, []
    fp = (osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)))
    for w in fp:
        wid = w.id
        hw = w.tags.get("highway")
        want = wid in needed
        acc = hw in ACCESS_HW
        if not (want or acc):
            continue
        try:
            lines = way_lines(w)
        except osmium.InvalidLocationError:
            continue
        if not lines:
            continue
        if want:
            geoms[wid] = lines
        if acc:
            for ln in lines:
                access.append((hw, w.tags.get("sac_scale"), ln))
    return geoms, access


def clean(v, n):
    if v is None:
        return None
    v = " ".join(v.split())
    return v[:n] if v else None


def sql_str(v):
    if v is None:
        return "NULL"
    s = str(v).replace("\\", "\\\\").replace("'", "''").replace("\0", "").replace("\n", "\\n").replace("\r", "\\r")
    return "'" + s + "'"


def sql_num(v):
    return "NULL" if v is None else str(v)


def geojson_of(geom_m, tol):
    g = geom_m.simplify(tol, preserve_topology=True) if tol else geom_m
    g = shapely.transform(g, lambda a: np.column_stack(TO_LL(a[:, 0], a[:, 1])))
    lines = [g] if g.geom_type == "LineString" else list(g.geoms)
    coords = [[[round(x, 6), round(y, 6)] for x, y in ln.coords] for ln in lines if not ln.is_empty and len(ln.coords) > 1]
    return json.dumps({"type": "MultiLineString", "coordinates": coords}, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--megalitos")
    ap.add_argument("--db", action="store_true")
    ap.add_argument("--out", required=True)
    ap.add_argument("--stats")
    args = ap.parse_args()
    if not args.megalitos and not args.db:
        ap.error("need --megalitos FILE or --db")
    t0 = time.time()

    reader = osmium.io.Reader(args.pbf, osmium.osm.osm_entity_bits.NOTHING)
    ts = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    if ts:
        osm_ts = datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    else:
        osm_ts = datetime.datetime.utcfromtimestamp(os.path.getmtime(args.pbf)).replace(microsecond=0)
    osm_ts_s = osm_ts.strftime("%Y-%m-%d %H:%M:%S")

    megs = load_megalitos(args)
    log(f"megalitos with coords: {len(megs)}")
    routes, n_super = pass_relations(args.pbf)
    log(f"route relations with way members: {len(routes)}; superroutes/containers discarded: {n_super}")
    needed = {wid for r in routes.values() for wid, role in r["ways"] if role not in SKIP_ROLES}
    geoms, access = pass_ways(args.pbf, needed)
    log(f"member ways found: {len(geoms)}/{len(needed)}; access ways: {len(access)}")

    # assemble route geometries (metric)
    rg = {}
    for rid in sorted(routes):
        lines = []
        for wid, role in routes[rid]["ways"]:
            if role in SKIP_ROLES:
                continue
            for ln in geoms.get(wid, ()):
                lines.append(LineString([TO_M(x, y) for x, y in ln]))
        if not lines:
            continue
        m = linemerge(MultiLineString(lines)) if len(lines) > 1 else lines[0]
        if m.is_empty or m.length < 1:
            continue
        rg[rid] = m
    total_found = len(rg)

    # megalito points + distances to routes
    mp = [Point(*TO_M(lon, lat)) for _, lat, lon in megs]
    rids = sorted(rg)
    tree = STRtree([rg[r] for r in rids])
    pairs = {}  # rid -> list of (mid, dist, (lat,lon))
    mpairs = {}
    qi = tree.query(mp, predicate="dwithin", distance=MAX_PAIR_M)
    for pi, ri in sorted(zip(qi[0].tolist(), qi[1].tolist())):
        rid = rids[ri]
        g = rg[rid]
        p = mp[pi]
        d = g.distance(p)
        if d > MAX_PAIR_M:
            continue
        np_ = nearest_points(g, p)[0]
        lon, lat = TO_LL(np_.x, np_.y)
        pairs.setdefault(rid, []).append((megs[pi][0], int(round(d)), round(lat, 6), round(lon, 6)))
        mpairs.setdefault(megs[pi][0], []).append((rid, int(round(d))))
    kept = sorted(pairs)
    log(f"routes kept: {len(kept)}/{total_found}")

    # access (path/track nearest)
    acc_res = {}
    if access:
        atree = STRtree([LineString([TO_M(x, y) for x, y in a[2]]) for a in access])
        ai, ad = atree.query_nearest(mp, max_distance=ACCESS_RADIUS_M, return_distance=True, all_matches=False)
        for pi, k, d in zip(ai[0].tolist(), ai[1].tolist(), ad.tolist()):
            acc_res[megs[pi][0]] = (int(round(d)), access[k][0], clean(access[k][1], 40))

    # SQL
    out = ["-- Generated by tools/routes/build_routes.py. Do not edit by hand.",
           "SET NAMES utf8mb4;", "USE `megalitos`;",
           "SET autocommit=0;", "START TRANSACTION;",
           "DELETE FROM `megalito_ruta`;", "DELETE FROM `megalito_acceso`;",
           "DELETE FROM `rutas`;", "DELETE FROM `rutas_meta`;"]
    size_geo = size_lite = 0
    by_net = {}
    info = []
    for rid in kept:
        t = routes[rid]["tags"]
        g = rg[rid]
        ref = clean(t.get("ref"), 40)
        nombre = clean(t.get("name") or t.get("name:es") or t.get("name:eu") or t.get("ref"), 255)
        net = t.get("network") if t.get("network") in NETWORKS else None
        web = t.get("website") or t.get("url")
        web = clean(web, 255) if web and web.lower().startswith(("http://", "https://")) else None
        gj, gl = geojson_of(g, TOL_DETAIL), geojson_of(g, TOL_LITE)
        size_geo += len(gj); size_lite += len(gl)
        minx, miny, maxx, maxy = g.bounds
        (lo1, la1), (lo2, la2) = TO_LL(minx, miny), TO_LL(maxx, maxy)
        n500 = sum(1 for p in pairs[rid] if p[1] <= NEAR_M)
        by_net[net] = by_net.get(net, 0) + 1
        info.append((n500, ref, nombre, rid))
        out.append(
            "INSERT INTO `rutas` (`id`,`ref`,`nombre`,`red`,`operador`,`desde`,`hasta`,`web`,`simbolo`,`longitud_m`,"
            "`min_lat`,`min_lon`,`max_lat`,`max_lon`,`geojson`,`geojson_lite`,`n_megalitos`,`actualizado`) VALUES ("
            f"{rid},{sql_str(ref)},{sql_str(nombre)},{sql_str(net)},{sql_str(clean(t.get('operator'),160))},"
            f"{sql_str(clean(t.get('from'),160))},{sql_str(clean(t.get('to'),160))},{sql_str(web)},"
            f"{sql_str(clean(t.get('osmc:symbol'),80))},{int(round(g.length))},"
            f"{la1:.6f},{lo1:.6f},{la2:.6f},{lo2:.6f},{sql_str(gj)},{sql_str(gl)},{n500},'{osm_ts_s}');")
    for rid in kept:
        for mid, d, lat, lon in sorted(pairs[rid]):
            out.append(f"INSERT INTO `megalito_ruta` (`megalito_id`,`ruta_id`,`dist_m`,`acceso_lat`,`acceso_lon`) "
                       f"VALUES ({mid},{rid},{d},{lat:.6f},{lon:.6f});")
    for mid, _, _ in megs:
        a = acc_res.get(mid)
        if a:
            out.append(f"INSERT INTO `megalito_acceso` VALUES ({mid},{a[0]},{sql_str(a[1])},{sql_str(a[2])},'{osm_ts_s}');")
        else:
            out.append(f"INSERT INTO `megalito_acceso` VALUES ({mid},NULL,NULL,NULL,'{osm_ts_s}');")
    for k, v in (("osm_timestamp", osm_ts_s), ("n_rutas", str(len(kept))),
                 ("fuente", "OpenStreetMap contributors (ODbL) via Geofabrik")):
        out.append(f"INSERT INTO `rutas_meta` VALUES ({sql_str(k)},{sql_str(v)});")
    out.append("INSERT INTO `rutas_meta` VALUES ('generado',NOW());")
    out.append("COMMIT;")
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")

    def cov(th):
        return sum(1 for mid, _, _ in megs if any(d <= th for _, d in mpairs.get(mid, ())))

    def acov(th):
        return sum(1 for a in acc_res.values() if a[0] <= th)

    stats = {"osm_timestamp": osm_ts_s, "megalitos": len(megs), "superroutes_discarded": n_super,
             "routes_found": total_found, "routes_kept": len(kept), "by_network": {str(k): v for k, v in by_net.items()},
             "cov_route": {str(t): cov(t) for t in (500, 1000, 1500)},
             "cov_access": {str(t): acov(t) for t in (100, 300)}, "access_none": len(megs) - len(acc_res),
             "pairs": sum(len(v) for v in pairs.values()),
             "geojson_bytes": size_geo, "geojson_lite_bytes": size_lite,
             "top": [{"id": i[3], "ref": i[1], "nombre": i[2], "n": i[0]} for i in sorted(info, key=lambda x: (-x[0], x[1] or "", x[3]))[:15]],
             "seconds": round(time.time() - t0, 1)}
    if args.stats:
        with open(args.stats, "w") as f:
            json.dump(stats, f, indent=1, ensure_ascii=False)
    log(f"done: kept={len(kept)} pairs={stats['pairs']} geojson={size_geo/1e6:.2f}MB lite={size_lite/1e6:.2f}MB in {stats['seconds']}s")


if __name__ == "__main__":
    main()
