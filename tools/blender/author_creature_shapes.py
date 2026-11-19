"""Author the ORIGINAL creature kinds (shore crawler, hollow watcher, deep one, cliff flyer) as parts in Data/village_shapes.json.

Plain primitives only (box, cylinder, cone) that mesh_defs.py, web/src/shapes.js and ShapeMeshBuilder.cs already understand, so no new shape kind is needed.
Everything is computed from the numbers below: no randomness, no pack data, nothing traced from any third party asset. Pale, wet and faceless on purpose: no gore.

Run from the repo root:  python3 tools/blender/author_creature_shapes.py --apply
It appends the entries to the Package data file and copies the result to web/data/, then rerun gen_meshes.py (see tools/blender/README.md).
Without --apply it prints the footprint (half x, half z, height) of each.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from author_landmark_shapes import box, cyl, entry_text, PACKAGE_DATA, WEB_DATA  # noqa: E402

PALETTE = {
    "creature_pale": [0.55, 0.56, 0.5, 1.0],
    "creature_wet": [0.1, 0.17, 0.17, 1.0],
    "creature_dark": [0.02, 0.025, 0.03, 1.0],
    "glow_creature_eye": [0.85, 0.8, 0.5, 1.0],
}
HEIGHTS = {"shore_crawler": [0.5, 1.1], "hollow_watcher": [2.2, 3.0], "deep_one": [1.6, 2.2], "cliff_flyer": [0.2, 0.8]}
IDS = tuple(HEIGHTS)


def shore_crawler():
    """A long low body dragged on four splayed limbs, a small blunt head and two dim eyes. Front is -y."""
    parts = [
        box("body", "creature_wet", (0, 0.1, 0.22), (0.6, 1.2, 0.34)),
        box("back", "creature_pale", (0, 0.2, 0.5), (0.4, 0.8, 0.1)),
        cyl("head", "creature_pale", (0, -0.75, 0.3), 0.2, 0.15, 0.3, 6),
        box("eye_l", "glow_creature_eye", (-0.08, -0.93, 0.5), (0.05, 0.03, 0.05)),
        box("eye_r", "glow_creature_eye", (0.08, -0.93, 0.5), (0.05, 0.03, 0.05)),
    ]
    for i, (x, y, yaw) in enumerate(((-0.55, -0.35, 35), (0.55, -0.35, -35), (-0.55, 0.5, -35), (0.55, 0.5, 35))):
        p = box("limb_%d" % i, "creature_pale", (x, y, 0.05), (0.8, 0.1, 0.12))
        p["yaw"] = yaw
        parts.append(p)
    return parts


def hollow_watcher():
    """A tall thin figure in a pale shroud with long arms hanging, and a face of two dark hollows."""
    return [
        cyl("shroud", "creature_pale", (0, 0, 0), 0.5, 0.18, 2.0, 8),
        cyl("neck", "creature_pale", (0, 0, 2.0), 0.1, 0.1, 0.2, 6),
        cyl("head", "creature_pale", (0, 0, 2.2), 0.17, 0.13, 0.4, 6),
        box("hollow_l", "creature_dark", (-0.07, -0.13, 2.38), (0.08, 0.05, 0.1)),
        box("hollow_r", "creature_dark", (0.07, -0.13, 2.38), (0.08, 0.05, 0.1)),
        box("arm_l", "creature_pale", (-0.34, 0, 0.5), (0.07, 0.07, 1.5)),
        box("arm_r", "creature_pale", (0.34, 0, 0.5), (0.07, 0.07, 1.5)),
    ]


def deep_one():
    """A hunched, wet, broad shouldered shape with a wide head, arms to the knees, a ridge of fins and two dim eyes."""
    parts = [
        box("leg_l", "creature_wet", (-0.2, 0, 0), (0.22, 0.28, 0.8)),
        box("leg_r", "creature_wet", (0.2, 0, 0), (0.22, 0.28, 0.8)),
        cyl("torso", "creature_wet", (0, 0.1, 0.75), 0.42, 0.3, 0.85, 8),
        cyl("head", "creature_pale", (0, -0.12, 1.6), 0.26, 0.2, 0.34, 6),
        box("eye_l", "glow_creature_eye", (-0.11, -0.36, 1.78), (0.05, 0.03, 0.05)),
        box("eye_r", "glow_creature_eye", (0.11, -0.36, 1.78), (0.05, 0.03, 0.05)),
        box("arm_l", "creature_pale", (-0.52, -0.05, 0.55), (0.12, 0.14, 1.05)),
        box("arm_r", "creature_pale", (0.52, -0.05, 0.55), (0.12, 0.14, 1.05)),
    ]
    for i, z in enumerate((1.0, 1.35)):
        parts.append({"name": "fin_%d" % i, "material": "creature_dark", "shape": "cone", "at": [0, 0.36, z], "radius": 0.14, "height": 0.3, "sides": 3})
    return parts


def cliff_flyer():
    """A thin dark body with two long swept wings and a pale tail, seen from below as a cut out shape. Authored flat; the view lifts it into the air."""
    wl = box("wing_l", "creature_dark", (-0.85, 0, 0.2), (1.7, 0.45, 0.04))
    wl["yaw"] = 18
    wr = box("wing_r", "creature_dark", (0.85, 0, 0.2), (1.7, 0.45, 0.04))
    wr["yaw"] = -18
    return [
        cyl("body", "creature_dark", (0, 0, 0.15), 0.12, 0.09, 0.5, 6),
        wl, wr,
        box("tail", "creature_pale", (0, 0.4, 0.25), (0.12, 0.5, 0.03)),
    ]


BUILDERS = {"shore_crawler": shore_crawler, "hollow_watcher": hollow_watcher, "deep_one": deep_one, "cliff_flyer": cliff_flyer}


def apply(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    data = json.loads(text)
    if any(m["id"] in IDS for m in data["meshes"]):
        raise SystemExit("creature kinds already present in %s; remove them first" % path)
    tail = '    "tomb_iron": [0.1, 0.1, 0.11, 1.0]\n'
    if tail not in text:
        raise SystemExit("palette tail not found")
    extra = "".join(',\n    "%s": %s' % (n, json.dumps(c)) for n, c in PALETTE.items())
    text = text.replace(tail, tail.rstrip("\n") + extra + "\n", 1)
    marker = '"catacomb_gate": [2.5, 4.0]}'
    if marker not in text:
        raise SystemExit("propHeights marker not found")
    text = text.replace(marker, '"catacomb_gate": [2.5, 4.0], ' + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in HEIGHTS.items()) + "}")
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
        mesh_defs.SPECS[k] = {"id": k, "group": "village", "parts": BUILDERS[k]()}
        mesh_defs.PALETTE.update({n: tuple(c) for n, c in PALETTE.items()})
        parts = mesh_defs.build(k)
        xs = [p[0] for _, v, _, _ in parts for p in v]
        ys = [p[1] for _, v, _, _ in parts for p in v]
        zs = [p[2] for _, v, _, _ in parts for p in v]
        print(k, "halfX %.3f halfZ %.3f height %.3f" % ((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, max(zs)), mesh_defs.stats(parts))


if __name__ == "__main__":
    if "--apply" in sys.argv:
        apply(PACKAGE_DATA)
        with open(PACKAGE_DATA, encoding="utf-8") as src, open(WEB_DATA, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print("applied to", PACKAGE_DATA, "and", WEB_DATA)
    report()
