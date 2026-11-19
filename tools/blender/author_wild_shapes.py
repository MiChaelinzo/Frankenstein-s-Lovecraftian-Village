"""Author the ORIGINAL wild-places kinds (standing stone, ritual circle, catacomb gate) as parts in Data/village_shapes.json.

Plain primitives only (box, cylinder) that mesh_defs.py, web/src/shapes.js and ShapeMeshBuilder.cs already understand, so no new shape kind is needed.
Everything is computed from the numbers below: no randomness, no pack data, nothing traced from any third party asset.

Run from the repo root:  python3 tools/blender/author_wild_shapes.py --apply
It appends the entries to the Package data file and copies the result to web/data/, then rerun gen_meshes.py (see tools/blender/README.md).
Without --apply it prints the entries and the footprint (half x, half z, height) of each, which is what VillageDressing.FootprintOf and web/src/dressing.js must hold.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from author_landmark_shapes import box, cyl, entry_text, PACKAGE_DATA, WEB_DATA  # noqa: E402

PALETTE = {
    "menhir": [0.3, 0.31, 0.3, 1.0],
    "lichen": [0.2, 0.27, 0.17, 1.0],
    "ritual_ash": [0.1, 0.07, 0.065, 1.0],
    "ritual_red": [0.36, 0.05, 0.05, 1.0],
    "tomb_black": [0.008, 0.008, 0.012, 1.0],
    "tomb_iron": [0.1, 0.1, 0.11, 1.0],
}
HEIGHTS = {"standing_stone": [2.5, 4.5], "ritual_circle": [0.0, 0.15], "catacomb_gate": [2.5, 4.0]}
IDS = tuple(HEIGHTS)


def standing_stone():
    """A leaning menhir on a mossy footing, five sided and tapering, with a lichen cap on its top."""
    return [
        box("footing", "lichen", (0, 0, 0), (1.3, 1.0, 0.3)),
        cyl("slab", "menhir", (0, 0, 0.3), 0.62, 0.36, 3.2, 5, shear=0.2),
        cyl("cap", "lichen", (0.2, 0, 3.4), 0.34, 0.2, 0.18, 5),
    ]


def ritual_circle():
    """A flat ring of dark stone with ash inside, three blood coloured bars crossing at sixty degrees and a red eye in the middle; laid flat on any ground."""
    parts = [
        cyl("ring", "menhir", (0, 0, 0), 3.2, 3.1, 0.05, 12),
        cyl("ash", "ritual_ash", (0, 0, 0.05), 2.9, 2.9, 0.03, 12),
    ]
    for i, yaw in enumerate((0, 60, 120)):
        p = box("bar_%d" % i, "ritual_red", (0, 0, 0.08), (5.0, 0.2, 0.02))
        if yaw:
            p["yaw"] = yaw
        parts.append(p)
    parts.append(cyl("eye", "ritual_red", (0, 0, 0.08), 0.55, 0.5, 0.03, 8))
    return parts


def catacomb_gate():
    """The mouth of the catacombs: a low stone facade with a black doorway, iron bars across it and a stair of worn treads leading down to it (front is -y in the part frame)."""
    parts = [
        box("wall", "menhir", (0, 0.3, 0), (4.8, 1.2, 2.6)),
        box("cap", "lichen", (0, 0.3, 2.6), (5.2, 1.6, 0.3)),
        box("pier_l", "menhir", (-1.15, -0.45, 0), (0.5, 0.5, 2.3)),
        box("pier_r", "menhir", (1.15, -0.45, 0), (0.5, 0.5, 2.3)),
        box("lintel", "menhir", (0, -0.45, 2.0), (2.8, 0.5, 0.45)),
        box("doorway", "tomb_black", (0, -0.2, 0), (1.8, 0.2, 2.0)),
    ]
    for i, x in enumerate((-0.6, 0.0, 0.6)):
        parts.append(box("bar_%d" % i, "tomb_iron", (x, -0.4, 0), (0.07, 0.07, 2.0)))
    for i, (y, w, z) in enumerate(((-0.95, 2.2, 0.0), (-1.3, 2.6, 0.0), (-1.65, 3.0, 0.0))):
        parts.append(box("tread_%d" % i, "tomb_black" if i == 0 else "ruin_stone", (0, y, z), (w, 0.35, 0.1)))
    parts.append(box("buttress", "lichen", (0, 1.65, 0), (3.0, 0.3, 0.7)))
    return parts


BUILDERS = {"standing_stone": standing_stone, "ritual_circle": ritual_circle, "catacomb_gate": catacomb_gate}


def apply(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    data = json.loads(text)
    if any(m["id"] in IDS for m in data["meshes"]):
        raise SystemExit("wild kinds already present in %s; remove them first" % path)
    tail = '    "path_stone": [0.42, 0.4, 0.36, 1.0]\n'
    if tail not in text:
        raise SystemExit("palette tail not found")
    extra = "".join(',\n    "%s": %s' % (n, json.dumps(c)) for n, c in PALETTE.items())
    text = text.replace(tail, tail.rstrip("\n") + extra + "\n", 1)
    marker = '"path_stone": [0.0, 0.12]}'
    if marker not in text:
        raise SystemExit("propHeights marker not found")
    text = text.replace(marker, '"path_stone": [0.0, 0.12], ' + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in HEIGHTS.items()) + "}")
    end = "    ]}\n  ]\n}"
    if end not in text:
        raise SystemExit("meshes array end not found")
    body = ",\n".join(entry_text(k, BUILDERS[k]()) for k in IDS)
    text = text.replace(end, "    ]},\n" + body + "\n  ]\n}")
    json.loads(text)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def report():
    import mesh_defs
    for k in IDS:
        spec = {"id": k, "group": "village", "parts": BUILDERS[k]()}
        mesh_defs.SPECS[k] = spec
        mesh_defs.PALETTE.update({n: tuple(c) for n, c in PALETTE.items()})
        parts = mesh_defs.build(k)
        xs = [p[0] for _, v, _, _ in parts for p in v]
        ys = [p[1] for _, v, _, _ in parts for p in v]
        zs = [p[2] for _, v, _, _ in parts for p in v]
        print(k, "halfX %.3f halfZ %.3f height %.3f" % ((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, max(zs)), "centre x %.2f y %.2f" % ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2), mesh_defs.stats(parts))


if __name__ == "__main__":
    if "--apply" in sys.argv:
        apply(PACKAGE_DATA)
        with open(PACKAGE_DATA, encoding="utf-8") as src, open(WEB_DATA, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print("applied to", PACKAGE_DATA, "and", WEB_DATA)
    report()
