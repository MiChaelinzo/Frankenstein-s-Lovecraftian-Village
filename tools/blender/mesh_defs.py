"""Original low-poly mesh definitions for the seven catalog kinds. Pure Python, no bpy.

Coordinates are Z-up metres (Blender convention). Every part is (name, verts, faces, rgba).
Deterministic: no randomness, same input gives byte-identical geometry. Original work, no pack data.
"""
import math

KINDS = ("house_a", "house_b", "church", "well", "altar", "dead_tree", "lamp")

PALETTE = {
    "stone": (0.30, 0.31, 0.34, 1.0),
    "wall_a": (0.42, 0.36, 0.30, 1.0),
    "wall_b": (0.33, 0.37, 0.36, 1.0),
    "roof": (0.20, 0.13, 0.12, 1.0),
    "wood": (0.25, 0.17, 0.11, 1.0),
    "bark": (0.16, 0.13, 0.11, 1.0),
    "iron": (0.12, 0.12, 0.14, 1.0),
    "glow": (0.95, 0.70, 0.30, 1.0),
    "rune": (0.35, 0.80, 0.55, 1.0),
}


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


def _part(name, vf, color):
    return (name, vf[0], vf[1], PALETTE[color])


def house_a():
    return [
        _part("base", box(0, 0, 0, 4.2, 3.4, 0.4), "stone"),
        _part("walls", box(0, 0, 0.4, 4.0, 3.2, 2.4), "wall_a"),
        _part("roof", gable(0, 0, 2.8, 4.0, 3.2, 1.6), "roof"),
        _part("door", box(0, -1.62, 0.4, 0.9, 0.1, 1.7), "wood"),
        _part("chimney", box(1.2, 0.4, 2.8, 0.5, 0.5, 1.9), "stone"),
        _part("window", box(1.2, -1.62, 1.3, 0.7, 0.08, 0.7), "glow"),
    ]


def house_b():
    return [
        _part("base", box(0, 0, 0, 3.4, 3.4, 0.3), "stone"),
        _part("lower", box(0, 0, 0.3, 3.2, 3.2, 2.2), "wall_b"),
        _part("upper", box(0, 0, 2.5, 2.6, 2.6, 1.9), "wall_a"),
        _part("roof", gable(0, 0, 4.4, 2.6, 2.6, 1.8), "roof"),
        _part("door", box(0, -1.62, 0.3, 0.8, 0.1, 1.6), "wood"),
        _part("window", box(0, -1.32, 3.1, 0.6, 0.08, 0.7), "glow"),
    ]


def church():
    return [
        _part("base", box(0, 0, 0, 6.4, 10.4, 0.4), "stone"),
        _part("nave", box(0, 0, 0.4, 6.0, 10.0, 4.0), "wall_b"),
        _part("nave_roof", gable(0, 0, 4.4, 10.0, 6.0, 2.6, 0.2), "roof"),
        _part("tower", box(0, -4.0, 0.4, 3.0, 3.0, 8.0), "stone"),
        _part("spire", cylinder(0, -4.0, 8.4, 2.0, 0.0, 4.2, 4), "roof"),
        _part("door", box(0, -5.52, 0.4, 1.2, 0.1, 2.2), "wood"),
        _part("window", box(0, -5.52, 5.2, 0.7, 0.1, 1.4), "glow"),
    ]


def well():
    return [
        _part("ring", cylinder(0, 0, 0, 1.0, 0.9, 0.9, 10), "stone"),
        _part("post_l", box(-0.9, 0, 0.9, 0.18, 0.18, 1.9), "wood"),
        _part("post_r", box(0.9, 0, 0.9, 0.18, 0.18, 1.9), "wood"),
        _part("beam", box(0, 0, 2.7, 2.1, 0.22, 0.2), "wood"),
        _part("roof", gable(0, 0, 2.9, 1.8, 1.4, 0.7, 0.15), "roof"),
        _part("water", cylinder(0, 0, 0.7, 0.75, 0.75, 0.05, 10), "rune"),
    ]


def altar():
    return [
        _part("step_1", box(0, 0, 0, 3.0, 2.0, 0.25), "stone"),
        _part("step_2", box(0, 0, 0.25, 2.4, 1.5, 0.25), "stone"),
        _part("slab", box(0, 0, 0.5, 1.8, 1.0, 0.8), "stone"),
        _part("top", box(0, 0, 1.3, 2.0, 1.2, 0.12), "iron"),
        _part("rune", cylinder(0, 0, 1.42, 0.3, 0.3, 0.04, 6), "rune"),
        _part("obelisk", cylinder(0, 0.85, 0.5, 0.18, 0.05, 1.8, 4), "iron"),
    ]


def dead_tree():
    trunk = cylinder(0, 0, 0, 0.35, 0.12, 4.2, 6)
    parts = [_part("trunk", trunk, "bark")]
    for i, (dx, z, h, r) in enumerate([(1.4, 2.2, 1.8, 0.1), (-1.5, 2.9, 1.6, 0.09), (0.9, 3.7, 1.3, 0.07)]):
        branch = tilt(cylinder(0, 0, z, r, 0.02, h, 4), dx, z, h)
        parts.append(_part("branch_%d" % i, branch, "bark"))
    parts.append(_part("root", cylinder(0, 0, 0, 0.6, 0.35, 0.3, 6), "bark"))
    return parts


def lamp():
    return [
        _part("base", cylinder(0, 0, 0, 0.3, 0.2, 0.3, 6), "iron"),
        _part("pole", cylinder(0, 0, 0.3, 0.07, 0.05, 3.0, 6), "iron"),
        _part("arm", box(0.25, 0, 3.15, 0.6, 0.06, 0.06), "iron"),
        _part("cage", cylinder(0.5, 0, 2.7, 0.18, 0.18, 0.45, 6), "glow"),
        _part("cap", cylinder(0.5, 0, 3.15, 0.25, 0.0, 0.3, 6), "iron"),
    ]


BUILDERS = {"house_a": house_a, "house_b": house_b, "church": church, "well": well, "altar": altar, "dead_tree": dead_tree, "lamp": lamp}


def build(kind):
    if kind not in BUILDERS:
        raise KeyError("unknown kind: %s" % kind)
    return BUILDERS[kind]()


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
    bad = [k for k in kinds if k not in BUILDERS]
    if bad:
        raise SystemExit("unknown kinds: %s" % ",".join(bad))
    return {"out": out, "kinds": kinds}


def pack_out_allowed(path, repo_root):
    """Pack-textured output may only go to git-ignored pack-scratch/ or web/local-pack/."""
    import os
    real = os.path.realpath(path)
    root = os.path.realpath(repo_root)
    return any(real == os.path.join(root, d) or real.startswith(os.path.join(root, d) + os.sep) for d in ("pack-scratch", os.path.join("web", "local-pack")))
