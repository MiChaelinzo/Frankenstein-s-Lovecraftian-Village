"""Author the ORIGINAL landmark kinds (shipwreck, abbey ruins, marsh pool, path stone) as parts in Data/village_shapes.json.

Plain primitives only (box, cylinder, cone, hull) that mesh_defs.py, web/src/shapes.js and ShapeMeshBuilder.cs already understand, so no new shape kind
is needed. Everything is computed from the numbers below: no randomness, no pack data, nothing traced from any third party asset.

Run from the repo root:  python3 tools/blender/author_landmark_shapes.py --apply
It appends the landmark entries to the Package data file and copies the result to web/data/, then rerun gen_meshes.py (see tools/blender/README.md).
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PACKAGE_DATA = os.path.join(ROOT, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_shapes.json")
WEB_DATA = os.path.join(ROOT, "web", "data", "village_shapes.json")

PALETTE = {
    "wreck_wood": [0.2, 0.15, 0.11, 1.0],
    "wreck_dark": [0.09, 0.07, 0.06, 1.0],
    "ruin_stone": [0.36, 0.35, 0.33, 1.0],
    "ruin_moss": [0.14, 0.2, 0.13, 1.0],
    "mud": [0.07, 0.06, 0.045, 1.0],
    "water_dark": [0.015, 0.03, 0.035, 1.0],
    "path_stone": [0.42, 0.4, 0.36, 1.0],
}
HEIGHTS = {"shipwreck": [3, 6], "abbey_arch": [4, 6.5], "abbey_wall": [2.5, 4.5], "abbey_pillar": [1.5, 4], "marsh_pool": [0.0, 0.1], "path_stone": [0.0, 0.12]}
IDS = tuple(HEIGHTS)


def r2(v):
    return round(v + 0.0, 3)


def box(name, mat, at, size):
    return {"name": name, "material": mat, "shape": "box", "at": [r2(at[0]), r2(at[1]), r2(at[2])], "size": [r2(size[0]), r2(size[1]), r2(size[2])]}


def cyl(name, mat, at, r0, r1, h, sides, yaw=None, shear=None):
    p = {"name": name, "material": mat, "shape": "cylinder", "at": [r2(at[0]), r2(at[1]), r2(at[2])], "radii": [r2(r0), r2(r1)], "height": r2(h), "sides": sides}
    if shear:
        p["shear"] = {"dx": r2(shear), "from": r2(at[2]), "height": r2(h)}
    if yaw:
        p["yaw"] = r2(yaw)
    return p


def hull(name, mat, at, size, bottom):
    return {"name": name, "material": mat, "shape": "hull", "at": [r2(at[0]), r2(at[1]), r2(at[2])], "size": [r2(size[0]), r2(size[1]), r2(size[2])], "bottom": bottom}


def shipwreck():
    """A fishing ketch run aground: a broken stern hull and a lower bow section with ribs standing bare between them, a leaning mast and a split deck house."""
    parts = [
        hull("stern", "wreck_wood", (-2.4, 0, 0.0), (4.6, 3.2, 2.0), 0.5),
        hull("bow", "wreck_dark", (2.6, 0.2, -0.2), (4.2, 2.8, 1.5), 0.45),
        box("keel", "wreck_dark", (0.2, 0, -0.1), (2.4, 0.3, 0.3)),
        box("deck", "wreck_wood", (-2.3, 0, 1.7), (3.6, 2.6, 0.12)),
        box("house_back", "wreck_dark", (-3.2, 0, 1.8), (0.12, 2.2, 1.5)),
        box("house_side", "wreck_wood", (-2.2, 1.1, 1.8), (2.0, 0.12, 1.2)),
    ]
    for i, x in enumerate((-0.2, 0.55, 1.3)):
        for side in (-1, 1):
            parts.append(box("rib_%d_%d" % (i, side), "wreck_dark", (x, side * (1.15 + 0.08 * i), 0.1), (0.14, 0.14, 1.5 - 0.15 * i)))
    parts.append(cyl("mast", "wreck_dark", (-1.2, 0.1, 1.7), 0.17, 0.1, 3.8, 6, yaw=20, shear=0.9))
    parts.append(cyl("boom", "wreck_wood", (-0.9, 0.35, 3.0), 0.07, 0.06, 2.4, 5, yaw=-60, shear=0.3))
    parts.append(cyl("bowsprit", "wreck_wood", (4.3, 0.2, 0.9), 0.1, 0.06, 1.8, 5, yaw=0, shear=1.8))
    return parts


def abbey_wall():
    """A ruined wall run 5 m long: a pointed window gap with broken piers on either side, a stub of the next bay."""
    heights = [3.6, 2.4, 3.1, 1.3, 2.0]
    parts = [box("foot", "ruin_stone", (0, 0, 0), (5.2, 0.9, 0.5))]
    for i, h in enumerate(heights):
        mat = "ruin_moss" if i == 3 else "ruin_stone"
        if i == 2:
            parts.append(box("sill", mat, (-2.0 + i * 1.0, 0, 0.5), (1.0, 0.62, 1.1)))
            parts.append(box("lintel_stub", "ruin_stone", (-2.0 + i * 1.0 - 0.3, 0, 2.4), (0.4, 0.62, h - 2.4)))
            continue
        parts.append(box("pier_%d" % i, mat, (-2.0 + i * 1.0, 0, 0.5), (1.0, 0.62, h - 0.5)))
    parts.append(cyl("rubble", "ruin_moss", (1.9, 0.55, 0.0), 0.5, 0.3, 0.4, 6))
    return parts


def abbey_arch():
    """A free standing pointed arch: two clustered piers and two ribs that lean toward each other and stop short of the apex."""
    parts = []
    for side in (-1, 1):
        x = side * 1.5
        parts.append(box("base_%d" % side, "ruin_stone", (x, 0, 0), (0.95, 0.95, 0.4)))
        parts.append(cyl("pier_%d" % side, "ruin_stone", (x, 0, 0.4), 0.38, 0.34, 3.7, 8))
        parts.append(cyl("rib_%d" % side, "ruin_stone", (x, 0, 4.1), 0.3, 0.22, 1.5, 6, yaw=0 if side < 0 else 180, shear=1.0))
    parts.append(cyl("fallen_drum", "ruin_moss", (2.6, 1.3, 0.0), 0.4, 0.4, 0.8, 8))
    return parts


def abbey_pillar():
    """A single column: stepped base, a shaft broken off at an angle and a stub of the capital lying beside it."""
    return [
        box("plinth", "ruin_stone", (0, 0, 0), (1.3, 1.3, 0.35)),
        cyl("shaft", "ruin_stone", (0, 0, 0.35), 0.5, 0.42, 2.6, 8),
        cyl("break", "ruin_moss", (0, 0, 2.95), 0.42, 0.3, 0.3, 6),
        cyl("capital", "ruin_stone", (0.9, 0.5, 0.0), 0.5, 0.35, 0.5, 8),
    ]


def marsh_pool():
    """Black standing water in a mud rim, flat so it can be laid on any ground."""
    return [
        cyl("mud", "mud", (0, 0, 0), 3.0, 2.8, 0.03, 10),
        cyl("water", "water_dark", (0.1, 0, 0.03), 2.5, 2.4, 0.03, 10),
        cyl("islet", "mud", (-1.0, 0.7, 0.03), 0.5, 0.4, 0.06, 6),
    ]


def path_stone():
    """A flat slab: two overlapping boxes so a line of them reads as a worn path, not a tile grid."""
    return [box("slab", "path_stone", (0, 0, 0), (0.95, 0.72, 0.06)), box("chip", "ruin_stone", (0.28, 0.2, 0), (0.42, 0.3, 0.09))]


BUILDERS = {"shipwreck": shipwreck, "abbey_arch": abbey_arch, "abbey_wall": abbey_wall, "abbey_pillar": abbey_pillar, "marsh_pool": marsh_pool, "path_stone": path_stone}


def entry_text(kind, parts):
    lines = ['    {"id": "%s", "group": "village", "parts": [' % kind]
    lines += ["      " + json.dumps(p, separators=(", ", ": ")) + ("," if i < len(parts) - 1 else "") for i, p in enumerate(parts)]
    lines.append("    ]}")
    return "\n".join(lines)


def apply(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    data = json.loads(text)
    if any(m["id"] in IDS for m in data["meshes"]):
        raise SystemExit("landmark kinds already present in %s; remove them first" % path)
    tail = '    "bone_dark": [0.17, 0.15, 0.15, 1.0]\n'
    if tail not in text:
        raise SystemExit("palette tail not found")
    extra = "".join(',\n    "%s": %s' % (n, json.dumps(c)) for n, c in PALETTE.items())
    text = text.replace(tail, tail.rstrip("\n") + extra + "\n", 1)
    marker = '"spire_ribbed": [4, 7]}'
    if marker not in text:
        raise SystemExit("propHeights marker not found")
    text = text.replace(marker, '"spire_ribbed": [4, 7], ' + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in HEIGHTS.items()) + "}")
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
