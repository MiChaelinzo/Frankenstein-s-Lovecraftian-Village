"""Original low-poly meshes, built from the shared shape data file Data/village_shapes.json (also read by web/src/shapes.js and the Unity builder).

Coordinates are Z-up metres (Blender convention). Every part is (name, verts, faces, rgba).
Deterministic: no randomness, same input gives byte-identical geometry. Original work, no pack data.
"""
import json
import math
import os

SHAPES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json")
SHAPE_KINDS = ("box", "wedge", "cylinder", "cone", "hull")


def load_shapes(path=SHAPES_PATH):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


_SHAPES = load_shapes()
PALETTE = {k: tuple(v) for k, v in _SHAPES["palette"].items()}
SPECS = {m["id"]: m for m in _SHAPES["meshes"]}
KINDS = tuple(m["id"] for m in _SHAPES["meshes"])
CATALOG_KINDS = tuple(m["id"] for m in _SHAPES["meshes"] if m["group"] == "catalog")
PROP_KINDS = tuple(m["id"] for m in _SHAPES["meshes"] if m["group"] == "prop")
VILLAGE_KINDS = tuple(m["id"] for m in _SHAPES["meshes"] if m["group"] == "village")


def box(cx, cy, z0, sx, sy, sz):
    """Axis aligned box with base at z0. Returns (verts, faces) with outward quads."""
    x0, x1, y0, y1, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, z0 + sz
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return v, f


def gable(cx, cy, z0, sx, sy, rise, overhang=0.15):
    """Gable roof: ridge runs along X, base footprint slightly larger than the walls."""
    x0, x1 = cx - sx / 2 - overhang, cx + sx / 2 + overhang
    y0, y1 = cy - sy / 2 - overhang, cy + sy / 2 + overhang
    zr = z0 + rise
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, cy, zr), (x1, cy, zr)]
    f = [(0, 3, 2, 1), (0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5)]
    return v, f


def cylinder(cx, cy, z0, r0, r1, h, n=8):
    """Frustum from radius r0 at z0 to r1 at z0+h. r1 == 0 gives a cone."""
    v, f = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        v.append((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z0))
    if r1 > 0:
        for i in range(n):
            a = 2 * math.pi * i / n
            v.append((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z0 + h))
        for i in range(n):
            j = (i + 1) % n
            f.append((i, j, n + j, n + i))
        f.append(tuple(reversed(range(n))))
        f.append(tuple(range(n, 2 * n)))
    else:
        v.append((cx, cy, z0 + h))
        for i in range(n):
            f.append((i, (i + 1) % n, n))
        f.append(tuple(reversed(range(n))))
    return v, f


def tilt(vf, dx, dz_ref, h):
    """Shear a part in X proportional to height above dz_ref (used to bend dead branches)."""
    v, f = vf
    return [(x + dx * max(0.0, (z - dz_ref)) / h, y, z) for x, y, z in v], f


def hull(length, width, depth, z0, bottom=0.55):
    """Open boat hull along X: pentagon rings (square stern, pointed bow); the bottom ring is narrower. Faces are the outer sides and the keel."""
    hl, hw = length / 2, width / 2
    ring = [(-hl, -1.0), (0.0, -1.0), (hl, 0.0), (0.0, 1.0), (-hl, 1.0)]
    v = [(x, y * hw * bottom, z0) for x, y in ring] + [(x, y * hw, z0 + depth) for x, y in ring]
    f = [(i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i) for i in range(5)]
    f.append((0, 4, 3, 2, 1))
    return v, f


def yaw_part(vf, degrees, cx, cy):
    """Turn a part about the vertical axis through (cx, cy)."""
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    v, f = vf
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, z) for x, y, z in v], f


def shape_geometry(spec):
    """Build (verts, faces) for one part spec from the shape data file."""
    kind, (cx, cy, z0) = spec["shape"], spec["at"]
    if kind == "box":
        vf = box(cx, cy, z0, *spec["size"])
    elif kind == "wedge":
        vf = gable(cx, cy, z0, *spec["size"], overhang=spec.get("overhang", 0.15))
    elif kind == "cylinder":
        vf = cylinder(cx, cy, z0, spec["radii"][0], spec["radii"][1], spec["height"], spec.get("sides", 8))
    elif kind == "cone":
        vf = cylinder(cx, cy, z0, spec["radius"], 0.0, spec["height"], spec.get("sides", 8))
    elif kind == "hull":
        vf = hull(*spec["size"], z0, spec.get("bottom", 0.55))
    else:
        raise KeyError("unknown shape: %s" % kind)
    if "shear" in spec:
        sh = spec["shear"]
        vf = tilt(vf, sh["dx"], sh["from"], sh["height"])
    if spec.get("yaw"):
        vf = yaw_part(vf, spec["yaw"], cx, cy)
    return vf


def build(kind):
    if kind not in SPECS:
        raise KeyError("unknown kind: %s" % kind)
    return [(p["name"], *shape_geometry(p), PALETTE[p["material"]]) for p in SPECS[kind]["parts"]]


def validate_shapes(data):
    """Problems in a shapes document: unknown shapes or materials, bad numbers, duplicate ids, wrong groups."""
    errs, seen = [], set()
    for m in data.get("meshes", []):
        if m["id"] in seen:
            errs.append("duplicate mesh id %s" % m["id"])
        seen.add(m["id"])
        if m.get("group") not in ("catalog", "prop", "village"):
            errs.append("%s: bad group" % m["id"])
        names = set()
        for p in m["parts"]:
            where = "%s/%s" % (m["id"], p.get("name"))
            if p.get("name") in names:
                errs.append("%s: duplicate part name" % where)
            names.add(p.get("name"))
            if p.get("shape") not in SHAPE_KINDS:
                errs.append("%s: unknown shape" % where)
            if p.get("material") not in data["palette"]:
                errs.append("%s: unknown material %s" % (where, p.get("material")))
            if p.get("sides", 8) < 3:
                errs.append("%s: fewer than 3 sides" % where)
    return errs


def validate(parts):
    """Return a list of problems: bad indices, degenerate faces, non finite coordinates."""
    errs = []
    for name, v, f, color in parts:
        for p in v:
            if not all(math.isfinite(c) for c in p):
                errs.append("%s: non finite vertex" % name)
        for face in f:
            if len(face) < 3 or len(set(face)) != len(face):
                errs.append("%s: degenerate face %r" % (name, face))
            if any(i < 0 or i >= len(v) for i in face):
                errs.append("%s: face index out of range" % name)
        if len(color) != 4:
            errs.append("%s: bad color" % name)
    return errs


def stats(parts):
    verts = sum(len(p[1]) for p in parts)
    tris = sum(len(face) - 2 for p in parts for face in p[2])
    return {"parts": len(parts), "verts": verts, "tris": tris}


def parse_args(argv):
    """Parse the args after the `--` separator Blender leaves for scripts."""
    argv = list(argv)
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    out, kinds, i = "pack-scratch/blender-out", list(KINDS), 0
    while i < len(argv):
        a = argv[i]
        if a == "--out" and i + 1 < len(argv):
            out = argv[i + 1]; i += 2
        elif a == "--kinds" and i + 1 < len(argv):
            kinds = [k for k in argv[i + 1].split(",") if k]; i += 2
        else:
            raise SystemExit("unknown argument: %s" % a)
    bad = [k for k in kinds if k not in SPECS]
    if bad:
        raise SystemExit("unknown kinds: %s" % ",".join(bad))
    return {"out": out, "kinds": kinds}


def pack_out_allowed(path, repo_root):
    """Pack-textured output may only go to git-ignored pack-scratch/ or web/local-pack/."""
    import os
    real = os.path.realpath(path)
    root = os.path.realpath(repo_root)
    return any(real == os.path.join(root, d) or real.startswith(os.path.join(root, d) + os.sep) for d in ("pack-scratch", os.path.join("web", "local-pack")))
