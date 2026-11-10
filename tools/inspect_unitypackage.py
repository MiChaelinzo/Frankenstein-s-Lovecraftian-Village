#!/usr/bin/env python3
"""Inspect a .unitypackage locally and suggest catalog id -> prefab matches.

A .unitypackage is a gzipped tar with one folder per asset GUID containing
`asset`, `asset.meta` and `pathname`. This tool only reads the tiny `pathname`
members. It never extracts or writes asset payloads. The JSON inventory is
written to a git-ignored path (default Assets/ThirdParty/LovecraftianVillage/pack_inventory.json).

Matching mirrors Assets/Scripts/Core/PrefabNameMatcher.cs (token and alias scoring).
Also scans text .unity scenes for PrefabInstance blocks and reports the prefabs they
reference (m_SourcePrefab guid and m_Name override), because the real building prefabs
are only referenced by the scenes, not packaged. Scene YAML is parsed in memory only.

Usage: python3 tools/inspect_unitypackage.py PACK.unitypackage [--catalog PATH] [--out PATH]
"""
import argparse, collections, json, os, posixpath, re, sys, tarfile

ALIAS_GROUPS = [
    ["house", "home", "cottage", "hut", "cabin"],
    ["church", "chapel", "cathedral", "temple"],
    ["well", "fountain"],
    ["tree", "dead", "trunk"],
    ["altar", "shrine"],
]
EXACT_SCORE, TOKEN_SCORE, ALIAS_SCORE = 1000, 10, 3
MAX_PATHNAME_BYTES = 4096
DEFAULT_OUT = "Assets/ThirdParty/LovecraftianVillage/pack_inventory.json"
DEFAULT_CATALOG = "Assets/Data/village_catalog.json"


def tokenize(name):
    tokens, cur, prev = [], [], " "

    def flush():
        if cur:
            t = "".join(cur)
            cur.clear()
            if any(not ch.isdigit() for ch in t):
                tokens.append(t)

    for c in name or "":
        if not c.isalnum():
            flush()
            prev = " "
            continue
        if c.isupper() and prev.islower():
            flush()
        elif prev != " " and c.isdigit() != prev.isdigit():
            flush()
        cur.append(c.lower())
        prev = c
    flush()
    return tokens


def _same_group(x, y):
    return any(x in g and y in g for g in ALIAS_GROUPS)


def score(ident, candidate):
    a, b = tokenize(ident), tokenize(candidate)
    if not a or not b:
        return 0
    if a == b:
        return EXACT_SCORE
    total, seen = 0, set()
    for t in a:
        if t in seen:
            continue
        seen.add(t)
        if t in b:
            total += TOKEN_SCORE
        elif any(_same_group(t, u) for u in b):
            total += ALIAS_SCORE
    return total


SCENE_MAX_BYTES = 64 * 1024 * 1024
MESH_EXTS = {".fbx", ".obj", ".blend", ".dae", ".3ds", ".mesh"}
_DOC_SPLIT = re.compile(r"^--- !u!(\d+) &", re.M)
_SRC_GUID = re.compile(r"m_SourcePrefab:\s*\{[^}]*guid:\s*([0-9a-fA-F]{32})")
_NAME_OVERRIDE = re.compile(r"propertyPath:\s*m_Name\s*\r?\n\s*value:[ \t]*([^\r\n]*)")
_SUFFIX = re.compile(r"\s*\(\d+\)$")


def clean_name(value):
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
        v = v[1:-1]
    return _SUFFIX.sub("", v).strip()


def scan_scene(text):
    """Return [(guid, name_or_None)] for each PrefabInstance block in scene YAML text."""
    found = []
    parts = _DOC_SPLIT.split(text)  # [preamble, classId, body, classId, body, ...]
    for class_id, block in zip(parts[1::2], parts[2::2]):
        if class_id != "1001":
            continue
        g = _SRC_GUID.search(block)
        if not g:
            continue
        n = _NAME_OVERRIDE.search(block)
        name = clean_name(n.group(1)) if n else ""
        found.append((g.group(1).lower(), name or None))
    return found


def entry_guid(member_name):
    """Folder guid of a tar member name, with or without a leading './'."""
    n = member_name
    while n.startswith("./"):
        n = n[2:]
    return n.split("/", 1)[0]


def read_package(path):
    """Return (entries, scene_instances).

    entries: sorted list of (guid, pathname, is_folder). Folder assets have no `asset` member.
    scene_instances: {scene pathname: [(guid, name_or_None)]}.
    Only `pathname` members and scene YAML are read, in memory. Nothing is written to disk.
    """
    paths, has_asset, pending, scenes = {}, set(), {}, {}
    with tarfile.open(path, "r:gz") as tar:
        for m in tar:
            tar.members = []  # do not keep the whole member list for 2 GB packages
            if not m.isfile():
                continue
            parts = m.name.split("/")
            kind = parts[-1]
            guid = entry_guid(m.name)
            if len(parts) < 2 or not guid:
                continue
            if kind == "asset":
                has_asset.add(guid)
                if m.size <= SCENE_MAX_BYTES:
                    f = tar.extractfile(m)
                    head = f.read(2048)
                    if head.startswith(b"%YAML") and b"OcclusionCullingSettings" in head:
                        pending[guid] = head + f.read()
            elif kind == "pathname":
                line = tar.extractfile(m).read(MAX_PATHNAME_BYTES).decode("utf-8", "replace").splitlines()
                if line and line[0].strip():
                    paths[guid] = line[0].strip()
    for guid, data in pending.items():
        p = paths.get(guid, "")
        if p.lower().endswith(".unity"):
            scenes[p] = scan_scene(data.decode("utf-8", "replace"))
    entries = [(g, p, g not in has_asset) for g, p in paths.items()]
    return sorted(entries, key=lambda x: x[1]), scenes


def referenced_prefabs(scene_instances):
    """Aggregate to [{guid, name, count, scenes}]; name is the most common override or '?'."""
    agg = {}
    for scene, items in scene_instances.items():
        for guid, name in items:
            d = agg.setdefault(guid, {"names": collections.Counter(), "count": 0, "scenes": set()})
            d["count"] += 1
            d["scenes"].add(posixpath.basename(scene))
            if name:
                d["names"][name] += 1
    out = []
    for guid, d in agg.items():
        name = sorted(d["names"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0] if d["names"] else "?"
        out.append({"guid": guid, "name": name, "count": d["count"], "scenes": sorted(d["scenes"])})
    return sorted(out, key=lambda r: (-r["count"], r["name"], r["guid"]))


def suggest(ids, candidates, top=3):
    """candidates: list of {name, guid, pathname, source}. Ties broken by ordinal name."""
    result = {}
    for i in ids:
        scored = [(score(i, p["name"]), p) for p in candidates]
        scored = [s for s in scored if s[0] > 0]
        scored.sort(key=lambda s: (-s[0], s[1]["name"], s[1]["pathname"], s[1]["guid"]))
        result[i] = [dict(p, score=s) for s, p in scored[:top]]
    return result


def top_folder(p):
    return "/".join(p.split("/")[:3])


def build_inventory(entries, ids, scene_instances=None):
    ext = collections.Counter()
    folders = collections.Counter()
    prefabs, files = [], 0
    for guid, p, is_folder in entries:
        if is_folder:
            ext["(folder)"] += 1
            continue
        files += 1
        e = posixpath.splitext(p)[1].lower() or "(none)"
        ext[e] += 1
        folders[top_folder(p)] += 1
        if e == ".prefab":
            prefabs.append({"name": posixpath.splitext(posixpath.basename(p))[0], "guid": guid, "pathname": p})
    refs = referenced_prefabs(scene_instances or {})
    packaged = {p["guid"] for p in prefabs}
    candidates = [dict(p, source="package") for p in prefabs]
    best = {}
    for r in refs:
        if r["name"] != "?" and r["guid"] not in packaged and r["name"] not in best:
            best[r["name"]] = {"name": r["name"], "guid": r["guid"], "pathname": "", "source": "scene-reference"}
    candidates += best.values()
    meshes = sum(n for e, n in ext.items() if e in MESH_EXTS)
    return {
        "assetCount": len(entries),
        "extensions": dict(sorted(ext.items())),
        "summary": {
            "files": files,
            "folderEntries": ext.get("(folder)", 0),
            "topFolders": dict(sorted(folders.items())),
            "meshCount": meshes,
            "hasMeshes": meshes > 0,
            "scenes": sorted(scene_instances or {}),
            "referencedPrefabCount": len(refs),
        },
        "prefabs": prefabs,
        "referencedPrefabs": refs,
        "suggestions": suggest(ids, candidates),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("package")
    ap.add_argument("--catalog", default=DEFAULT_CATALOG)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args(argv)

    with open(args.catalog, encoding="utf-8") as f:
        ids = [e["id"] for e in json.load(f)["entries"]]
    entries, scenes = read_package(args.package)
    inv = build_inventory(entries, ids, scenes)

    print(f"{inv['assetCount']} assets")
    for e, n in inv["extensions"].items():
        print(f"  {e}: {n}")
    for k, n in inv["summary"]["topFolders"].items():
        print(f"  folder {k}: {n}")
    print("contains meshes: " + ("yes" if inv["summary"]["hasMeshes"] else f"no (0 of {inv['summary']['files']} files are fbx/obj/blend)"))
    print(f"{inv['summary']['referencedPrefabCount']} prefab GUIDs referenced by {len(scenes)} scenes")
    print(f"{len(inv['prefabs'])} prefabs")
    for p in inv["prefabs"]:
        print(f"  {p['guid']}  {p['pathname']}")
    print("suggested matches")
    for i, s in inv["suggestions"].items():
        print(f"  {i}: " + (", ".join(f"{x['name']} ({x['score']}, {x['source']})" for x in s) or "no match"))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(inv, f, indent=2)
    print(f"wrote {args.out} (keep it uncommitted)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
