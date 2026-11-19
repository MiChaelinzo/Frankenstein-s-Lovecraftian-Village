"""Author the ORIGINAL corruption kinds (tentacle trees, fungi, organic spires) as parts in Data/village_shapes.json.

The parts are plain primitives (cylinders, cones, boxes) already understood by mesh_defs.py, web/src/shapes.js and ShapeMeshBuilder.cs, so no new shape kind is needed.
A tendril is a chain of sheared cylinders along a hand written 3D path. Everything is computed from the numbers below: no randomness, no pack data, nothing
sampled or traced from any third party asset (the mood only is borrowed: black drooping tendrils, odd caps, horn like spires).

Run from the repo root:  python3 tools/blender/author_corruption_shapes.py --apply
It replaces the corruption entries in the Package data file and copies the result to web/data/, then rerun gen_meshes.py (see tools/blender/README.md).
"""
import json
import math
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PACKAGE_DATA = os.path.join(ROOT, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json")
WEB_DATA = os.path.join(ROOT, "web", "data", "village_shapes.json")

PALETTE = {
    "tentacle": [0.03, 0.03, 0.04, 1.0],
    "tentacle_tip": [0.08, 0.09, 0.12, 1.0],
    "fungus_cap": [0.36, 0.17, 0.26, 1.0],
    "fungus_cap_pale": [0.55, 0.5, 0.42, 1.0],
    "fungus_stalk": [0.62, 0.58, 0.48, 1.0],
    "fungus_gill": [0.2, 0.1, 0.14, 1.0],
    "bone": [0.74, 0.7, 0.6, 1.0],
    "bone_mid": [0.45, 0.42, 0.37, 1.0],
    "bone_dark": [0.17, 0.15, 0.15, 1.0],
}
HEIGHTS = {
    "tentacle_tree": [4, 6.5], "tentacle_sapling": [1.6, 3], "fungus_tall": [1.5, 3], "fungus_cluster": [0.4, 1.2],
    "fungus_shelf": [0.6, 1.4], "spire_horn": [3, 6], "spire_ribbed": [4, 7],
}
IDS = tuple(HEIGHTS)


def r2(v):
    return round(v + 0.0, 3)


def cyl(name, mat, at, r0, r1, h, sides, yaw=None, shear=None):
    p = {"name": name, "material": mat, "shape": "cylinder", "at": [r2(at[0]), r2(at[1]), r2(at[2])], "radii": [r2(r0), r2(r1)], "height": r2(h), "sides": sides}
    if shear:
        p["shear"] = {"dx": r2(shear[0]), "from": r2(at[2]), "height": r2(h)}
    if yaw:
        p["yaw"] = r2(yaw)
    return p


def cone(name, mat, at, r, h, sides):
    return {"name": name, "material": mat, "shape": "cone", "at": [r2(at[0]), r2(at[1]), r2(at[2])], "radius": r2(r), "height": r2(h), "sides": sides}


def tendril(prefix, path, r_base, r_tip, sides, mat, tip_mat=None):
    """A tube along a path of (x, y, z) points: one sheared cylinder per leg, thick at the first point and thin at the last. Legs may descend."""
    parts, n = [], len(path) - 1
    for i in range(n):
        a, b = path[i], path[i + 1]
        ra, rb = r_base + (r_tip - r_base) * i / n, r_base + (r_tip - r_base) * (i + 1) / n
        if abs(b[2] - a[2]) < 0.05:
            b = (b[0], b[1], a[2] + 0.05)
        lo, hi, rlo, rhi = (a, b, ra, rb) if a[2] <= b[2] else (b, a, rb, ra)
        run = math.hypot(hi[0] - lo[0], hi[1] - lo[1])
        yaw = math.degrees(math.atan2(hi[1] - lo[1], hi[0] - lo[0]))
        material = tip_mat if tip_mat and i >= n - 2 else mat
        parts.append(cyl("%s_%d" % (prefix, i), material, lo, rlo, rhi, hi[2] - lo[2], sides, yaw=yaw, shear=(run, 0)))
    return parts


def arch_path(cx, cy, heading, z0, reach, peak, droop_to, wobble, phase, steps=6):
    """Rises from (cx, cy, z0) to a peak then droops to droop_to; the heading wanders by +-wobble degrees so the tendril writhes."""
    pts = [(cx, cy, z0)]
    x, y = cx, cy
    for i in range(1, steps + 1):
        t = i / steps
        z = z0 + (peak - z0) * math.sin(min(1.0, t * 1.5) * math.pi / 2) if t < 0.55 else peak + (droop_to - peak) * ((t - 0.55) / 0.45) ** 1.3
        h = math.radians(heading + wobble * math.sin(phase + t * 5.0))
        leg = reach / steps * (1.0 if t < 0.55 else 0.55)
        x, y = x + leg * math.cos(h), y + leg * math.sin(h)
        pts.append((x, y, z))
    return pts


def tentacle_tree():
    parts = [
        cyl("root", "tentacle", (0, 0, 0), 0.62, 0.42, 0.4, 6),
        cyl("trunk_a", "tentacle", (0, 0, 0.4), 0.42, 0.3, 1.3, 6, yaw=0, shear=(0.15, 0)),
        cyl("trunk_b", "tentacle", (0.15, 0, 1.7), 0.3, 0.24, 1.2, 6, yaw=20, shear=(-0.25, 0)),
        cyl("trunk_c", "tentacle", (-0.07, 0.05, 2.9), 0.24, 0.2, 0.8, 6, yaw=-30, shear=(0.2, 0)),
    ]
    cx, cy, cz = 0.0, 0.1, 3.7
    for k in range(6):
        heading = k * 60 + 15
        peak = 4.6 + 0.35 * ((k * 3) % 4) / 3
        path = arch_path(cx, cy, heading, cz, 2.0 + 0.25 * (k % 3), peak, 1.2 + 0.5 * (k % 2), 28, k * 1.7)
        parts += tendril("tendril_%d" % k, path, 0.13, 0.04, 4, "tentacle", "tentacle_tip")
    for k in range(3):
        heading = k * 120 + 50
        parts += tendril("root_tendril_%d" % k, arch_path(0, 0, heading, 0.5, 1.5, 0.9, 0.0, 20, k * 2.3, 3), 0.18, 0.06, 4, "tentacle")
    return parts


def tentacle_sapling():
    parts = [cyl("trunk_a", "tentacle", (0, 0, 0), 0.26, 0.18, 0.9, 5, yaw=0, shear=(0.1, 0)), cyl("trunk_b", "tentacle", (0.1, 0, 0.9), 0.18, 0.13, 0.7, 5, yaw=40, shear=(-0.12, 0))]
    for k in range(4):
        path = arch_path(0.0, 0.05, k * 90 + 30, 1.6, 1.0 + 0.2 * (k % 2), 2.2 + 0.1 * k, 0.5 + 0.2 * (k % 2), 25, k * 2.1, 5)
        parts += tendril("tendril_%d" % k, path, 0.08, 0.025, 4, "tentacle", "tentacle_tip")
    return parts


def cap(name, mat, at, r_stem, r_cap, rim, thick, sides=7):
    """A cap: a broad frustum with a pale gill ring under it, domed by a smaller frustum on top."""
    x, y, z = at
    return [
        cyl(name + "_gill", "fungus_gill", (x, y, z), r_cap * 0.92, r_cap, rim, sides),
        cyl(name + "_cap", mat, (x, y, z + rim), r_cap, r_cap * 0.55, thick, sides),
        cone(name + "_dome", mat, (x, y, z + rim + thick), r_cap * 0.55, thick * 0.7, sides),
    ]


def fungus_tall():
    parts = []
    for i, (x, y, h, rs, rc, yaw) in enumerate([(0, 0, 2.2, 0.1, 0.62, 0), (0.75, 0.35, 1.5, 0.08, 0.42, 25), (-0.55, 0.5, 1.8, 0.09, 0.5, -20)]):
        lean = 0.12 * (1 if i % 2 == 0 else -1)
        parts.append(cyl("stalk_%d" % i, "fungus_stalk", (x, y, 0), rs * 1.5, rs, h, 6, yaw=yaw, shear=(lean, 0)))
        parts += cap("cap_%d" % i, "fungus_cap", (x + lean * math.cos(math.radians(yaw)), y + lean * math.sin(math.radians(yaw)), h), rs, rc, 0.06, 0.16 + 0.1 * rc)
    return parts


def fungus_cluster():
    parts = []
    spots = [(0, 0, 0.55, 0.26), (0.38, 0.12, 0.38, 0.2), (-0.3, 0.25, 0.42, 0.22), (0.1, -0.35, 0.3, 0.17), (-0.2, -0.28, 0.22, 0.14), (0.5, -0.25, 0.26, 0.15)]
    for i, (x, y, h, r) in enumerate(spots):
        parts.append(cyl("bulb_%d" % i, "fungus_cap_pale" if i % 3 == 2 else "fungus_cap", (x, y, 0), r * 0.55, r, h * 0.7, 6))
        parts.append(cone("bulb_top_%d" % i, "fungus_cap_pale" if i % 3 == 2 else "fungus_cap", (x, y, h * 0.7), r, h * 0.35, 6))
    return parts


def fungus_shelf():
    parts = [cyl("stump", "tentacle", (0, 0, 0), 0.42, 0.34, 0.75, 6), cyl("stump_top", "tentacle", (0, 0, 0.75), 0.34, 0.28, 0.12, 6)]
    for i, (z, r, yaw, side) in enumerate([(0.2, 0.34, 0, 1), (0.42, 0.28, 140, 1), (0.6, 0.22, 250, 1), (0.32, 0.18, 70, 1)]):
        a = math.radians(yaw)
        x, y = math.cos(a) * 0.36, math.sin(a) * 0.36
        parts.append(cyl("shelf_%d" % i, "fungus_cap_pale" if i % 2 else "fungus_cap", (x, y, z), 0.05, r, 0.07, 6, yaw=yaw, shear=(r * 0.45, 0)))
        parts.append(cyl("shelf_gill_%d" % i, "fungus_gill", (x + math.cos(a) * r * 0.45, y + math.sin(a) * r * 0.45, z - 0.04), r * 0.8, r * 0.7, 0.04, 6))
    return parts


def spire(prefix, base_r, tiers, bend, ribs=0, rib_h=0.0, sides=6):
    """Stacked frustums, bone white at the foot darkening to the tip, leaning by `bend` metres in total; optional thin ribs up one side."""
    parts, z, x, r = [], 0.0, 0.0, base_r
    total_h = sum(t[0] for t in tiers)
    for i, (h, shrink) in enumerate(tiers):
        f = z / total_h
        mat = "bone" if f < 0.34 else "bone_mid" if f < 0.7 else "bone_dark"
        dx = bend * h / total_h
        nr = max(0.04, r * shrink)
        parts.append(cyl("%s_%d" % (prefix, i), mat, (x, 0, z), r, nr, h, sides, yaw=0, shear=(dx, 0)))
        x, z, r = x + dx, z + h, nr
    parts.append(cone(prefix + "_tip", "bone_dark", (x, 0, z), r, 0.55, sides))
    for k in range(ribs):
        zr = 0.35 + k * rib_h
        a = base_r * (1.0 - zr / (total_h + 0.5) * 0.8) + 0.05
        parts.append({"name": "%s_rib_%d" % (prefix, k), "material": "bone_mid" if zr < total_h * 0.6 else "bone_dark", "shape": "cylinder", "at": [r2(bend * zr / total_h), 0, r2(zr)], "radii": [r2(a + 0.14), r2(a + 0.1)], "height": 0.12, "sides": sides})
    return parts


def spire_horn():
    return spire("horn", 0.55, [(1.0, 0.8), (1.0, 0.72), (0.9, 0.7), (0.8, 0.62), (0.6, 0.55)], 1.4)


def spire_ribbed():
    return spire("ribbed", 0.65, [(1.2, 0.86), (1.2, 0.82), (1.1, 0.78), (1.0, 0.7), (0.9, 0.62)], -0.9, ribs=6, rib_h=0.8)


BUILDERS = {"tentacle_tree": tentacle_tree, "tentacle_sapling": tentacle_sapling, "fungus_tall": fungus_tall, "fungus_cluster": fungus_cluster,
            "fungus_shelf": fungus_shelf, "spire_horn": spire_horn, "spire_ribbed": spire_ribbed}


def entry_text(kind, parts):
    lines = ['    {"id": "%s", "group": "village", "parts": [' % kind]
    lines += ["      " + json.dumps(p, separators=(", ", ": ")) + ("," if i < len(parts) - 1 else "") for i, p in enumerate(parts)]
    lines.append("    ]}")
    return "\n".join(lines)


def apply(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    data = json.loads(text)
    keep = [m["id"] for m in data["meshes"] if m["id"] not in IDS]
    if len(keep) != len(data["meshes"]):
        raise SystemExit("corruption kinds already present in %s; remove them first" % path)
    tail = '    "soil": [0.035, 0.03, 0.025, 1.0]\n'
    if tail not in text:
        raise SystemExit("palette tail not found")
    extra = "".join(',\n    "%s": %s' % (n, json.dumps(c)) for n, c in PALETTE.items())
    text = text.replace(tail, tail.rstrip("\n") + extra + "\n", 1)
    # propHeights: append the new kinds before the closing brace of the propHeights object (single line in the file)
    marker = '"wheel_ruts": [0.0, 0.1]}'
    if marker not in text:
        raise SystemExit("propHeights marker not found")
    text = text.replace(marker, '"wheel_ruts": [0.0, 0.1], ' + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in HEIGHTS.items()) + "}")
    end = "    ]}\n  ]\n}"
    if end not in text:
        raise SystemExit("meshes array end not found")
    body = ",\n".join(entry_text(k, BUILDERS[k]()) for k in IDS)
    text = text.replace(end, "    ]},\n" + body + "\n  ]\n}")
    json.loads(text)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


if __name__ == "__main__":
    if "--apply" in sys.argv:
        apply(PACKAGE_DATA)
        with open(PACKAGE_DATA, encoding="utf-8") as src, open(WEB_DATA, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print("applied to", PACKAGE_DATA, "and", WEB_DATA)
    else:
        for k in IDS:
            print(entry_text(k, BUILDERS[k]()))
