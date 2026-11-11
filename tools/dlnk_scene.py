#!/usr/bin/env python3
"""Parse Unity scene YAML into a flat 2D placement layout (stdlib only).

Reads PrefabInstance m_Modifications (m_LocalPosition, m_LocalRotation, m_LocalScale, m_Name) and
regular GameObject/Transform documents that carry a MeshRenderer. Parent transforms are composed
in the ground plane (x, z, yaw, uniform scale). Prefab names come from m_Name overrides or the
package pathname table; names are classified to the web catalog kinds with the same token and
alias scoring as tools/inspect_unitypackage.py.

The functions are pure (text in, dicts out). Output of the build step lives in git-ignored web/local-pack/.
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from inspect_unitypackage import score, clean_name, _SRC_GUID  # noqa: E402

MAX_OBJECTS = 3000
KIND_UNCLASSIFIED = "generic"  # honest bucket: names no rule matched. The web demo draws it as an outlined marker and counts it.
# Named keyword lists. Order in KIND_KEYWORDS is the tie break: on equal score the earlier kind wins.
CHURCH_WORDS = ["church", "chapel", "cathedral", "temple"]
WELL_WORDS = ["well", "fountain"]
ALTAR_WORDS = ["altar", "shrine", "tomb", "grave"]
LAMP_WORDS = ["lamp", "lantern", "candle", "torch", "streetlight"]
DEAD_TREE_WORDS = ["dead", "stump", "trunk", "log"]
TREE_WORDS = ["tree", "pine", "palm", "pinus"]
PLANT_WORDS = ["plant", "plants", "branch", "grass", "fern", "flower", "bush", "weed", "reed", "mushroom"]
BOAT_WORDS = ["boat", "ship", "canoe", "rowing"]
ROCK_WORDS = ["rock", "stone", "boulder", "cliff", "pinnacle"]
FENCE_WORDS = ["fence", "gate", "railing"]
# Non-physical scene furniture: decals, cobwebs, fog and dust sprites, shadow cards, trigger volumes.
EFFECT_WORDS = ["decal", "web", "fog", "cloud", "dust", "pollen", "shadow", "trigger"]
# Small loose objects found inside and around buildings.
PROP_WORDS = ["barrel", "jar", "sack", "bottle", "book", "drawers", "cup", "tea", "dish", "broom", "jug", "shovel", "bucket",
              "tools", "chain", "picture", "curtins", "bollard", "hook", "fish", "postcard", "handwritting"]
PART_WORDS = ["wall", "window", "door", "roof", "wood", "plank", "nail", "beam", "pillar", "stairs", "chimney", "floor"]
HOUSE_WORDS = ["house", "home", "cottage", "hut", "cabin", "barn", "mill", "shed", "tower"]
KIND_KEYWORDS = [
    ("church", CHURCH_WORDS),
    ("well", WELL_WORDS),
    ("altar", ALTAR_WORDS),
    ("lamp", LAMP_WORDS),
    ("dead_tree", DEAD_TREE_WORDS),
    ("tree", TREE_WORDS),
    ("plant", PLANT_WORDS),
    ("boat", BOAT_WORDS),
    ("rock", ROCK_WORDS),
    ("fence", FENCE_WORDS),
    ("effect", EFFECT_WORDS),
    ("prop", PROP_WORDS),
    ("part", PART_WORDS),
    ("house", HOUSE_WORDS),
]
# Every kind classify() can return; tools/test_dlnk_scene.py checks this equals LAYOUT_KINDS in web/src/dlnk-layout.js.
KINDS = ["house_a", "house_b"] + [k for k, _ in KIND_KEYWORDS if k != "house"] + [KIND_UNCLASSIFIED]
_DOC = re.compile(r"^--- !u!(\d+) &(-?\d+)( stripped)?[ \t]*\r?$", re.M)
_NUM = r"(-?[0-9.]+(?:[eE][-+]?\d+)?|-?nan|-?inf)"
_FID = re.compile(r"\{fileID:\s*(-?\d+)")


def _f(s, default=0.0):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return default
    return v if math.isfinite(v) else default


def yaw_degrees(x, y, z, w):
    """Heading about the Y axis in degrees (0..360) of a Unity quaternion."""
    r02 = 2 * (x * z + w * y)
    r22 = 1 - 2 * (x * x + y * y)
    if abs(r02) < 1e-9 and abs(r22) < 1e-9:
        return 0.0
    return round(math.degrees(math.atan2(r02, r22)) % 360.0, 2)


def classify(name):
    """Catalog kind for a prefab name. Houses alternate house_a / house_b deterministically; unmatched names stay 'generic' (unclassified)."""
    best, best_score = KIND_UNCLASSIFIED, 0
    for kind, words in KIND_KEYWORDS:
        s = max(score(name, w) for w in words)
        if s > best_score:
            best, best_score = kind, s
    if best == "house":
        return "house_b" if sum(map(ord, name)) % 2 else "house_a"
    return best


def _blocks(text):
    ms = list(_DOC.finditer(text))
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        yield int(m.group(1)), m.group(2), bool(m.group(3)), text[m.end():end]


def _mod_groups(block):
    """{target fileID: {propertyPath: value}} plus the first m_Name value, from a PrefabInstance block."""
    groups, name = {}, None
    for m in re.finditer(r"-\s*target:\s*\{fileID:\s*(-?\d+)[^}]*\}\s*\r?\n\s*propertyPath:\s*([^\r\n]+?)\s*\r?\n\s*value:[ \t]*([^\r\n]*)", block):
        fid, path, val = m.groups()
        if path == "m_Name":
            if name is None:
                name = clean_name(val)
            continue
        groups.setdefault(fid, {})[path] = val.strip()
    return groups, name


def _local(props):
    pos = [_f(props.get("m_LocalPosition." + a)) for a in "xyz"]
    q = [_f(props.get("m_LocalRotation." + a), 1.0 if a == "w" else 0.0) for a in "xyzw"]
    sc = [_f(props.get("m_LocalScale." + a), 1.0) for a in "xyz"]
    return pos, q, sc


def _transform_props(block):
    props = {}
    for key in ("m_LocalPosition", "m_LocalRotation", "m_LocalScale"):
        m = re.search(key + r":\s*\{([^}]*)\}", block)
        if m:
            for a, v in re.findall(r"([xyzw]):\s*" + _NUM, m.group(1)):
                props[f"{key}.{a}"] = v
    return props


def parse_scene(text, guid_names=None):
    """Return a list of raw objects {name, guid, pos, q, scale, parent} resolved to world x/z/y/rotY/scale.

    guid_names maps prefab guid -> name for instances without an m_Name override. Unknown guids are named '?'.
    """
    guid_names = guid_names or {}
    nodes = {}      # transform key -> {pos,q,scale,parent,name,guid,mesh}
    stripped = {}   # stripped transform fileID -> prefab instance fileID
    go_name, go_mesh, tr_of_go = {}, set(), {}
    for cls, fid, is_stripped, block in _blocks(text):
        if cls == 1001:
            g = _SRC_GUID.search(block)
            groups, name = _mod_groups(block)
            tp = re.search(r"m_TransformParent:\s*\{fileID:\s*(-?\d+)", block)
            best = None
            for props in groups.values():
                if any(k.startswith("m_LocalPosition") for k in props):
                    best = props
                    break
            if best is None:
                best = {}
                for props in groups.values():
                    if any(k.startswith(("m_LocalRotation", "m_LocalScale")) for k in props):
                        best = props
                        break
            pos, q, sc = _local(best)
            guid = g.group(1).lower() if g else ""
            nodes["P" + fid] = {"pos": pos, "q": q, "scale": sc, "parent": tp.group(1) if tp else "0",
                                "name": name or guid_names.get(guid) or "?", "guid": guid, "mesh": True}
        elif cls == 4 and is_stripped:
            m = re.search(r"m_PrefabInstance:\s*\{fileID:\s*(-?\d+)", block)
            if m:
                stripped[fid] = m.group(1)
        elif cls == 4:
            pos, q, sc = _local(_transform_props(block))
            go = re.search(r"m_GameObject:\s*\{fileID:\s*(-?\d+)", block)
            fa = re.search(r"m_Father:\s*\{fileID:\s*(-?\d+)", block)
            nodes["T" + fid] = {"pos": pos, "q": q, "scale": sc, "parent": fa.group(1) if fa else "0",
                                "name": "", "guid": "", "mesh": False, "go": go.group(1) if go else "0"}
            if go:
                tr_of_go[go.group(1)] = fid
        elif cls == 1:
            m = re.search(r"m_Name:[ \t]*([^\r\n]*)", block)
            go_name[fid] = clean_name(m.group(1)) if m else ""
        elif cls == 23:
            m = re.search(r"m_GameObject:\s*\{fileID:\s*(-?\d+)", block)
            if m:
                go_mesh.add(m.group(1))
    for key, n in nodes.items():
        if key.startswith("T"):
            n["name"] = go_name.get(n.get("go", ""), "")
            n["mesh"] = n.get("go", "") in go_mesh

    def lookup(ref):
        ref = stripped.get(ref, ref)
        return nodes.get("T" + ref) or nodes.get("P" + ref)

    def world(n):
        x, y, z, yaw, s = n["pos"][0], n["pos"][1], n["pos"][2], yaw_degrees(*n["q"]), n["scale"][0]
        cur, depth = lookup(n["parent"]), 0
        while cur is not None and depth < 12:
            ps, pyaw = cur["scale"][0], yaw_degrees(*cur["q"])
            x, y, z = x * ps, y * cur["scale"][1], z * ps
            c, sn = math.cos(math.radians(pyaw)), math.sin(math.radians(pyaw))
            x, z = x * c + z * sn, -x * sn + z * c
            x, y, z = x + cur["pos"][0], y + cur["pos"][1], z + cur["pos"][2]
            yaw, s = (yaw + pyaw) % 360.0, s * ps
            cur, depth = lookup(cur["parent"]), depth + 1
        return x, y, z, yaw, s

    out = []
    for key in sorted(nodes):
        n = nodes[key]
        if not n["mesh"] or not n["name"]:
            continue
        x, y, z, yaw, s = world(n)
        out.append({"name": n["name"], "guid": n["guid"], "x": x, "y": y, "z": z, "rotY": yaw, "scale": s})
    return out


def build_layout(raw, max_objects=MAX_OBJECTS):
    """Classify, round, cap (deterministic stride downsample) and bound a raw object list."""
    objs = []
    for o in raw:
        if not all(math.isfinite(o[k]) for k in ("x", "y", "z", "rotY", "scale")):
            continue
        name = o["name"] if o["name"] != "?" else "Unknown"
        objs.append({"name": name, "kind": classify(name) if o["name"] != "?" else KIND_UNCLASSIFIED,
                     "x": round(o["x"], 3), "z": round(o["z"], 3), "y": round(o["y"], 3),
                     "rotY": round(o["rotY"], 2), "scale": round(max(0.01, min(100.0, o["scale"])), 3)})
    total = len(objs)
    if total > max_objects:
        objs = [objs[(i * total) // max_objects] for i in range(max_objects)]
    if objs:
        xs, zs = [o["x"] for o in objs], [o["z"] for o in objs]
        bounds = {"minX": min(xs), "maxX": max(xs), "minZ": min(zs), "maxZ": max(zs)}
    else:
        bounds = {"minX": 0, "maxX": 0, "minZ": 0, "maxZ": 0}
    return {"bounds": bounds, "count": len(objs), "total": total, "objects": objs}


def scene_slug(pathname):
    base = os.path.splitext(os.path.basename(pathname))[0].lower()
    return re.sub(r"[^a-z0-9]+", "-", base).strip("-") or "scene"
