"""Extract a simplified outline of the UK and Ireland for the intro map.

Reads a world map (Natural Earth, via the 'world-atlas' package) and writes data/uk_map.json:
{"uk": [ring, ...], "ireland": [ring, ...]} where a ring is a list of [longitude, latitude] points.

Run:  python3 scripts/build_map.py /path/to/countries-10m.json
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append([x * sx + tx, y * sy + ty])
        arcs.append(pts)
    return arcs


def ring_from(arc_ids, arcs):
    pts = []
    for a in arc_ids:
        seg = arcs[a] if a >= 0 else arcs[~a][::-1]
        pts.extend(seg if not pts else seg[1:])
    return pts


def simplify(pts, tol):
    """Douglas-Peucker line simplification."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1) or 1e-12
        if num / den > dmax:
            dmax, idx = num / den, i
    if dmax > tol:
        return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)
    return [pts[0], pts[-1]]


def rings_for(topo, arcs, name, tol, min_points=4, bbox=None):
    geom = next(g for g in topo["objects"]["countries"]["geometries"] if g["properties"]["name"] == name)
    polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
    out = []
    for poly in polys:
        full = ring_from(poly[0], arcs)
        mid = len(full) // 2          # a closed ring starts and ends at the same point, so simplify each half separately
        ring = simplify(full[: mid + 1], tol)[:-1] + simplify(full[mid:], tol)
        lons = [p[0] for p in ring]; lats = [p[1] for p in ring]
        if bbox and not (bbox[0] <= sum(lons) / len(lons) <= bbox[1] and bbox[2] <= sum(lats) / len(lats) <= bbox[3]):
            continue                                            # drop far-away overseas territories
        if len(ring) >= min_points:
            out.append([[round(x, 3), round(y, 3)] for x, y in ring])
    return out


if __name__ == "__main__":
    topo = json.load(open(sys.argv[1]))
    arcs = decode_arcs(topo)
    box = (-11, 3, 49, 61)
    data = {"uk": rings_for(topo, arcs, "United Kingdom", 0.008, bbox=box),
            "ireland": rings_for(topo, arcs, "Ireland", 0.01, bbox=box)}
    (ROOT / "data" / "uk_map.json").write_text(json.dumps(data, separators=(",", ":")))
    print({k: (len(v), sum(len(r) for r in v)) for k, v in data.items()})
