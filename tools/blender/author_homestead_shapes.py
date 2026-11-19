"""Author the ORIGINAL homestead kinds (soil mound, crops, fence, trough, scarecrow, coop, animals and pets) as parts in Data/village_shapes.json.

Plain primitives only (box, cylinder, cone) that mesh_defs.py, web/src/shapes.js and ShapeMeshBuilder.cs already understand, so no new shape kind is needed.
Everything is computed from the numbers below: no randomness, no pack data, nothing traced from any third party asset. Soft and a little wrong, never gory.
Names are hs_<crop>, hs_<structure>, hs_<animal id> so web/src/homestead-ui.js can place them by id.

Run from the repo root:  python3 tools/blender/author_homestead_shapes.py --apply
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
    "hs_soil": [0.1, 0.075, 0.055, 1.0],
    "hs_leaf": [0.16, 0.3, 0.14, 1.0],
    "hs_turnip": [0.62, 0.5, 0.62, 1.0],
    "hs_cabbage": [0.25, 0.42, 0.2, 1.0],
    "glow_hs_cap": [0.4, 0.85, 0.55, 1.0],
    "hs_stalk": [0.7, 0.72, 0.62, 1.0],
    "hs_kelp": [0.08, 0.2, 0.19, 1.0],
    "hs_root": [0.55, 0.45, 0.3, 1.0],
    "hs_eye": [0.04, 0.03, 0.03, 1.0],
    "hs_wood": [0.27, 0.2, 0.14, 1.0],
    "hs_wood_dark": [0.13, 0.095, 0.07, 1.0],
    "hs_water": [0.05, 0.12, 0.15, 1.0],
    "hs_cloth": [0.22, 0.2, 0.17, 1.0],
    "hs_straw": [0.5, 0.42, 0.22, 1.0],
    "hs_hen": [0.52, 0.32, 0.18, 1.0],
    "hs_comb": [0.5, 0.12, 0.1, 1.0],
    "hs_goat": [0.62, 0.6, 0.55, 1.0],
    "hs_cat": [0.2, 0.2, 0.22, 1.0],
    "hs_hound": [0.18, 0.26, 0.28, 1.0],
    "hs_jar": [0.5, 0.66, 0.66, 1.0],
    "hs_tentacle": [0.4, 0.18, 0.3, 1.0],
    "glow_hs_moth": [0.95, 0.8, 0.5, 1.0],
    "hs_moth_wing": [0.7, 0.66, 0.58, 1.0],
}
HEIGHTS = {
    "hs_mound": [0.05, 0.3], "hs_sprout": [0.1, 0.4], "hs_turnip": [0.2, 0.5], "hs_cabbage": [0.15, 0.5], "hs_glowcap": [0.15, 0.5], "hs_kelp": [0.4, 1.0], "hs_eyeroot": [0.2, 0.6],
    "hs_fence": [0.6, 1.2], "hs_trough": [0.25, 0.6], "hs_scarecrow": [1.4, 2.2], "hs_coop": [0.9, 1.6],
    "hs_chicken": [0.25, 0.6], "hs_goat": [0.7, 1.1], "hs_cat": [0.2, 0.45], "hs_lantern_moth": [0.4, 0.9], "hs_tide_hound": [0.5, 0.9], "hs_jar_tentacle": [0.3, 0.7],
}
IDS = tuple(HEIGHTS)


def hs_mound():
    return [cyl("mound", "hs_soil", (0, 0, 0), 0.5, 0.36, 0.14, 8)]


def hs_sprout():
    parts = [box("stem", "hs_leaf", (0, 0, 0.1), (0.04, 0.04, 0.2))]
    for i, (x, yaw) in enumerate(((-0.07, 30), (0.07, -30), (0.0, 90))):
        p = box("leaf_%d" % i, "hs_leaf", (x, 0, 0.22), (0.16, 0.05, 0.03))
        p["yaw"] = yaw
        parts.append(p)
    return parts


def hs_turnip():
    parts = [cyl("bulb", "hs_turnip", (0, 0, 0.1), 0.1, 0.12, 0.13, 8), cyl("root", "hs_turnip", (0, 0, 0.0), 0.03, 0.1, 0.1, 6)]
    for i, yaw in enumerate((0, 60, 120)):
        p = box("leaf_%d" % i, "hs_leaf", (0, 0, 0.23), (0.03, 0.22, 0.2))
        p["yaw"] = yaw
        parts.append(p)
    return parts


def hs_cabbage():
    return [cyl("heart", "hs_cabbage", (0, 0, 0.0), 0.2, 0.17, 0.28, 8), cyl("outer", "hs_leaf", (0, 0, 0.0), 0.3, 0.2, 0.16, 8), cyl("crown", "hs_cabbage", (0, 0, 0.26), 0.12, 0.05, 0.06, 6)]


def hs_glowcap():
    parts = []
    for i, (x, y, h, r) in enumerate(((0, 0, 0.22, 0.17), (-0.2, 0.1, 0.14, 0.1), (0.18, -0.08, 0.17, 0.12))):
        parts.append(cyl("stalk_%d" % i, "hs_stalk", (x, y, 0), 0.04, 0.035, h, 5))
        parts.append(cyl("cap_%d" % i, "glow_hs_cap", (x, y, h - 0.02), r, 0.02, 0.1, 7))
    return parts


def hs_kelp():
    parts = []
    for i, (x, y, h) in enumerate(((0, 0, 0.8), (-0.12, 0.08, 0.6), (0.13, -0.06, 0.7))):
        parts.append(cyl("frond_%d" % i, "hs_kelp", (x, y, 0), 0.035, 0.02, h, 5))
        tip = box("tip_%d" % i, "hs_kelp", (x + 0.05, y, h - 0.05), (0.1, 0.02, 0.04))
        tip["yaw"] = i * 40
        parts.append(tip)
    return parts


def hs_eyeroot():
    parts = [cyl("knob", "hs_root", (0, 0, 0.0), 0.16, 0.13, 0.2, 7), cyl("tip", "hs_root", (0, 0, 0.18), 0.1, 0.03, 0.12, 6)]
    parts.append(box("eye_white", "hs_stalk", (0, -0.14, 0.08), (0.1, 0.03, 0.07)))
    parts.append(box("eye_pupil", "hs_eye", (0, -0.16, 0.09), (0.04, 0.02, 0.04)))
    for i, yaw in enumerate((20, 100, 160)):
        p = box("leaf_%d" % i, "hs_leaf", (0, 0, 0.3), (0.03, 0.2, 0.14))
        p["yaw"] = yaw
        parts.append(p)
    return parts


def hs_fence():
    parts = []
    for i, x in enumerate((-1.2, 0.0, 1.2)):
        parts.append(box("post_%d" % i, "hs_wood_dark", (x, 0, 0), (0.1, 0.1, 0.95)))
    for i, z in enumerate((0.3, 0.65)):
        parts.append(box("rail_%d" % i, "hs_wood", (0, 0, z), (2.5, 0.05, 0.07)))
    return parts


def hs_trough():
    return [box("log", "hs_wood", (0, 0, 0.0), (1.2, 0.42, 0.34)), box("water", "hs_water", (0, 0, 0.3), (1.0, 0.28, 0.04)),
            box("leg_l", "hs_wood_dark", (-0.5, 0, 0.0), (0.1, 0.5, 0.1)), box("leg_r", "hs_wood_dark", (0.5, 0, 0.0), (0.1, 0.5, 0.1))]


def hs_scarecrow():
    arms = box("arms", "hs_wood", (0, 0, 1.3), (1.2, 0.05, 0.05))
    return [box("pole", "hs_wood_dark", (0, 0, 0), (0.07, 0.07, 1.7)), arms, box("coat", "hs_cloth", (0, 0, 0.75), (0.5, 0.18, 0.7)),
            cyl("head", "hs_straw", (0, 0, 1.5), 0.13, 0.12, 0.26, 7), box("eye_l", "hs_eye", (-0.05, -0.12, 1.65), (0.04, 0.02, 0.04)), box("eye_r", "hs_eye", (0.05, -0.12, 1.65), (0.04, 0.02, 0.04)),
            {"name": "hat", "material": "hs_wood_dark", "shape": "cone", "at": [0, 0, 1.74], "radius": 0.26, "height": 0.2, "sides": 8}]


def hs_coop():
    parts = [box("body", "hs_wood", (0, 0, 0.35), (1.2, 0.9, 0.6)), {"name": "roof", "material": "hs_wood_dark", "shape": "cone", "at": [0, 0, 0.95], "radius": 0.95, "height": 0.4, "sides": 4},
             box("door", "hs_wood_dark", (0, -0.46, 0.4), (0.3, 0.04, 0.35)), box("ramp", "hs_wood", (0, -0.75, 0.0), (0.3, 0.5, 0.04))]
    for i, (x, y) in enumerate(((-0.5, -0.35), (0.5, -0.35), (-0.5, 0.35), (0.5, 0.35))):
        parts.append(box("leg_%d" % i, "hs_wood_dark", (x, y, 0), (0.08, 0.08, 0.35)))
    return parts


def hs_chicken():
    return [box("body", "hs_hen", (0, 0, 0.14), (0.24, 0.34, 0.22)), box("head", "hs_hen", (0, -0.17, 0.3), (0.1, 0.1, 0.14)), box("comb", "hs_comb", (0, -0.17, 0.43), (0.03, 0.06, 0.05)),
            box("beak", "hs_straw", (0, -0.24, 0.34), (0.04, 0.05, 0.03)), box("tail", "hs_hen", (0, 0.2, 0.26), (0.06, 0.12, 0.18)), box("legs", "hs_straw", (0, 0, 0.0), (0.12, 0.04, 0.14))]


def hs_goat():
    parts = [box("body", "hs_goat", (0, 0, 0.4), (0.38, 0.85, 0.4)), box("neck", "hs_goat", (0, -0.45, 0.62), (0.16, 0.2, 0.36)), box("head", "hs_goat", (0, -0.56, 0.68), (0.14, 0.26, 0.2)),
             box("tail", "hs_goat", (0, 0.45, 0.62), (0.05, 0.06, 0.16)), box("beard", "hs_cloth", (0, -0.66, 0.6), (0.04, 0.05, 0.12))]
    for i, (x, y) in enumerate(((-0.14, -0.3), (0.14, -0.3), (-0.14, 0.3), (0.14, 0.3))):
        parts.append(box("leg_%d" % i, "hs_goat", (x, y, 0), (0.07, 0.07, 0.42)))
    for i, x in enumerate((-0.05, 0.05)):
        parts.append({"name": "horn_%d" % i, "material": "hs_stalk", "shape": "cone", "at": [x, -0.52, 0.88], "radius": 0.03, "height": 0.16, "sides": 4})
    return parts


def hs_cat():
    return [box("body", "hs_cat", (0, 0, 0.1), (0.16, 0.42, 0.16)), box("head", "hs_cat", (0, -0.26, 0.2), (0.14, 0.12, 0.13)),
            {"name": "ear_l", "material": "hs_cat", "shape": "cone", "at": [-0.04, -0.26, 0.32], "radius": 0.03, "height": 0.06, "sides": 3},
            {"name": "ear_r", "material": "hs_cat", "shape": "cone", "at": [0.04, -0.26, 0.32], "radius": 0.03, "height": 0.06, "sides": 3},
            box("eye_l", "glow_hs_moth", (-0.035, -0.325, 0.25), (0.025, 0.01, 0.025)), box("eye_r", "glow_hs_moth", (0.035, -0.325, 0.25), (0.025, 0.01, 0.025)),
            box("tail", "hs_cat", (0, 0.3, 0.2), (0.04, 0.04, 0.22))]


def hs_lantern_moth():
    parts = [cyl("lantern", "glow_hs_moth", (0, 0, 0.45), 0.07, 0.06, 0.16, 6), cyl("cap", "hs_wood_dark", (0, 0, 0.6), 0.05, 0.02, 0.05, 6), box("feeler_l", "hs_moth_wing", (-0.04, -0.05, 0.64), (0.01, 0.1, 0.01)), box("feeler_r", "hs_moth_wing", (0.04, -0.05, 0.64), (0.01, 0.1, 0.01))]
    for side in (-1, 1):
        w = box("wing_%d" % side, "hs_moth_wing", (side * 0.2, 0, 0.5), (0.34, 0.2, 0.02))
        w["yaw"] = side * 18
        parts.append(w)
    return parts


def hs_tide_hound():
    parts = [box("body", "hs_hound", (0, 0, 0.33), (0.26, 0.8, 0.3)), box("chest", "hs_hound", (0, -0.28, 0.35), (0.3, 0.3, 0.36)), box("head", "hs_hound", (0, -0.55, 0.55), (0.16, 0.3, 0.17)),
             box("eye_l", "glow_hs_moth", (-0.05, -0.69, 0.6), (0.03, 0.01, 0.03)), box("eye_r", "glow_hs_moth", (0.05, -0.69, 0.6), (0.03, 0.01, 0.03)), box("tail", "hs_hound", (0, 0.46, 0.4), (0.05, 0.3, 0.05))]
    for i, (x, y) in enumerate(((-0.1, -0.28), (0.1, -0.28), (-0.1, 0.28), (0.1, 0.28))):
        parts.append(box("leg_%d" % i, "hs_hound", (x, y, 0), (0.07, 0.07, 0.36)))
    return parts


def hs_jar_tentacle():
    parts = [cyl("jar", "hs_jar", (0, 0, 0.0), 0.16, 0.16, 0.34, 8), cyl("lid", "hs_wood_dark", (0, 0, 0.34), 0.12, 0.12, 0.05, 8), cyl("brine", "hs_water", (0, 0, 0.02), 0.13, 0.13, 0.22, 8)]
    for i, (x, y, h) in enumerate(((0, 0, 0.3), (-0.05, 0.04, 0.22), (0.05, -0.03, 0.16))):
        parts.append(cyl("tentacle_%d" % i, "hs_tentacle", (x, y, 0.04), 0.035, 0.02, h, 5))
    parts.append(box("eye", "glow_hs_moth", (0, -0.14, 0.2), (0.04, 0.01, 0.04)))
    return parts


BUILDERS = {k: globals()[k] for k in IDS}


def apply(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    data = json.loads(text)
    if any(m["id"] in IDS for m in data["meshes"]):
        raise SystemExit("homestead kinds already present in %s; remove them first" % path)
    tail = '    "glow_creature_eye": [0.85, 0.8, 0.5, 1.0]\n'
    if tail not in text:
        raise SystemExit("palette tail not found")
    extra = "".join(',\n    "%s": %s' % (n, json.dumps(c)) for n, c in PALETTE.items())
    text = text.replace(tail, tail.rstrip("\n") + extra + "\n", 1)
    marker = '"cliff_flyer": [0.2, 0.8]}'
    if marker not in text:
        raise SystemExit("propHeights marker not found")
    text = text.replace(marker, '"cliff_flyer": [0.2, 0.8], ' + ", ".join('"%s": %s' % (k, json.dumps(v)) for k, v in HEIGHTS.items()) + "}")
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
