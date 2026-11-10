#!/usr/bin/env python3
"""Inspect a .unitypackage locally and suggest catalog id -> prefab matches.

A .unitypackage is a gzipped tar with one folder per asset GUID containing
`asset`, `asset.meta` and `pathname`. This tool only reads the tiny `pathname`
members. It never extracts or writes asset payloads. The JSON inventory is
written to a git-ignored path (default Assets/ThirdParty/LovecraftianVillage/pack_inventory.json).

Matching mirrors Assets/Scripts/Core/PrefabNameMatcher.cs (token and alias scoring).
Not yet run against the real Lovecraftian Village pack.

Usage: python3 tools/inspect_unitypackage.py PACK.unitypackage [--catalog PATH] [--out PATH]
"""
import argparse, collections, json, os, posixpath, sys, tarfile

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


def read_package(path):
    """Return list of (guid, pathname). Only `pathname` members are read."""
    out = []
    with tarfile.open(path, "r:gz") as tar:
        for m in tar:
            if not m.isfile() or posixpath.basename(m.name) != "pathname":
                continue
            guid = posixpath.dirname(m.name).lstrip("./")
            data = tar.extractfile(m).read(MAX_PATHNAME_BYTES)
            line = data.decode("utf-8", "replace").splitlines()
            if line and line[0].strip():
                out.append((guid, line[0].strip()))
    return sorted(out, key=lambda x: x[1])


def suggest(ids, prefabs, top=3):
    """prefabs: list of {name, guid, pathname}. Ties broken by ordinal name."""
    result = {}
    for i in ids:
        scored = [(score(i, p["name"]), p) for p in prefabs]
        scored = [s for s in scored if s[0] > 0]
        scored.sort(key=lambda s: (-s[0], s[1]["name"], s[1]["pathname"]))
        result[i] = [dict(p, score=s) for s, p in scored[:top]]
    return result


def build_inventory(entries, ids):
    ext = collections.Counter()
    prefabs = []
    for guid, p in entries:
        e = posixpath.splitext(p)[1].lower() or "(none)"
        ext[e] += 1
        if e == ".prefab":
            prefabs.append({"name": posixpath.splitext(posixpath.basename(p))[0], "guid": guid, "pathname": p})
    return {
        "assetCount": len(entries),
        "extensions": dict(sorted(ext.items())),
        "prefabs": prefabs,
        "suggestions": suggest(ids, prefabs),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("package")
    ap.add_argument("--catalog", default=DEFAULT_CATALOG)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args(argv)

    with open(args.catalog, encoding="utf-8") as f:
        ids = [e["id"] for e in json.load(f)["entries"]]
    inv = build_inventory(read_package(args.package), ids)

    print(f"{inv['assetCount']} assets")
    for e, n in inv["extensions"].items():
        print(f"  {e}: {n}")
    print(f"{len(inv['prefabs'])} prefabs")
    for p in inv["prefabs"]:
        print(f"  {p['guid']}  {p['pathname']}")
    print("suggested matches")
    for i, s in inv["suggestions"].items():
        print(f"  {i}: " + (", ".join(f"{x['name']} ({x['score']})" for x in s) or "no match"))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(inv, f, indent=2)
    print(f"wrote {args.out} (keep it uncommitted)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
