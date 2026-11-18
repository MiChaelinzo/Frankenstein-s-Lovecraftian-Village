#!/usr/bin/env python3
"""Build the local-only Alien Terrain Pack horror area for the web demo (?pack=1, author's machine only).

Reads GLBs you exported from your own Alien Terrain Pack, picks one object per corruption kind (tentacle trees, fungi, rock
pipe spires, column tower spires, organic rocks), decimates it to a browser friendly triangle count, downscales its textures,
drops height, cavity and similar maps that the pack's materials misuse as albedo, and writes one GLB per kind plus a manifest
into web/local-pack/alien/. That folder MUST be git-ignored; this tool checks with `git check-ignore` and refuses otherwise.
Nothing it writes is ever committed, pushed or deployed (Asset Store EULA 2.2.1).

The mesh work runs in headless Blender (the same script re-runs itself inside Blender with --worker); everything else is stdlib.

Usage: tools/build_alien_pack.py --src <folder of exported GLBs> --blender <blender binary> [--out web/local-pack/alien]
                                 [--budget 4000] [--texture-size 512]
"""
import argparse
import json
import os
import struct
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_local_pack import ROOT, require_ignored  # noqa: E402

DEFAULT_OUT = os.path.join(ROOT, "web", "local-pack", "alien")
DEFAULT_BUDGET = 4000
TEXTURE_SIZES = (512, 1024)
MANIFEST_VERSION = 1

# Never used, whatever the caller passes.
EXCLUDED_SOURCES = frozenset({"AMinerals", "CharIco"})

# corruption kind -> (exported GLB stem, index of the root object in that file's scene). Core CorruptionGrowth decides where
# and how large each kind stands; this table only says which pack object looks like it.
KIND_SOURCES = {
    "tentacle_tree": ("ATrees00", 0),
    "tentacle_sapling": ("ATrees00", 1),
    "fungus_tall": ("AMushrooms00", 0),
    "fungus_cluster": ("AMushrooms01", 4),
    "fungus_shelf": ("ATP_OrganicRocks00", 0),
    "spire_horn": ("ARockPipe", 0),
    "spire_ribbed": ("ColumnTowers", 0),
}

# Linear colour multiplied onto a kind's texture. The tree material carries no colour factor in the export, so its pale albedo would
# read as tan; the pack's own dark look (black bodies with pale veins) comes back with this tint.
KIND_TINT = {"tentacle_tree": [0.12, 0.12, 0.14], "tentacle_sapling": [0.12, 0.12, 0.14]}

NOT_ALBEDO_MARKERS = ("height", "cavity", "occlusion", "translucen", "normal", "nrm", "mask", "rough", "metal", "disp", "bump", "spec", "emiss")


def is_albedo_image(name):
    """False for image names that mark height, cavity, occlusion, normal and similar maps (the pack wires some of them as albedo)."""
    low = (name or "").lower()
    return not any(m in low for m in NOT_ALBEDO_MARKERS)


def decimate_ratio(triangles, budget):
    """Collapse ratio 0..1 that brings `triangles` to about `budget`; 1.0 when already within budget."""
    if budget < 1:
        raise ValueError("triangle budget must be at least 1")
    if triangles <= budget:
        return 1.0
    return round(budget / triangles, 6)


def texture_target_size(width, height, max_px):
    """Power of two size with the longest side at most max_px, aspect kept; never upscales."""
    if max_px not in TEXTURE_SIZES:
        raise ValueError(f"texture size must be one of {TEXTURE_SIZES}")
    if width < 1 or height < 1:
        raise ValueError("image size must be positive")
    scale = min(1.0, max_px / max(width, height))
    pow2 = lambda v: max(1, 1 << (max(1, int(v * scale)).bit_length() - 1))  # noqa: E731
    return pow2(width), pow2(height)


def check_source_allowed(stem):
    if stem in EXCLUDED_SOURCES:
        raise ValueError(f"{stem} is excluded and is never used")
    if stem not in {s for s, _ in KIND_SOURCES.values()}:
        raise ValueError(f"{stem} is not a source of any corruption kind")


# ---------- GLB reading (stdlib) ----------
def read_glb_json(path_or_bytes):
    data = path_or_bytes if isinstance(path_or_bytes, (bytes, bytearray)) else open(path_or_bytes, "rb").read()
    if len(data) < 20 or struct.unpack("<I", data[:4])[0] != 0x46546C67:
        raise ValueError("not a GLB")
    n, typ = struct.unpack("<II", data[12:20])
    if typ != 0x4E4F534A or 20 + n > len(data):
        raise ValueError("GLB has no JSON chunk")
    return json.loads(data[20:20 + n])


def tint_glb(data, factor):
    """Returns the GLB with `factor` (r, g, b) as baseColorFactor of every textured material that has none; other chunks are untouched."""
    gltf = read_glb_json(data)
    n = struct.unpack("<I", data[12:16])[0]
    for mat in gltf.get("materials", []):
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr and "baseColorFactor" not in pbr:
            pbr["baseColorFactor"] = [*factor, 1.0]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    rest = data[20 + n:]
    return struct.pack("<III", 0x46546C67, 2, 20 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest


def mesh_triangles(gltf, mesh_index):
    total = 0
    for prim in gltf["meshes"][mesh_index]["primitives"]:
        if "indices" in prim:
            total += gltf["accessors"][prim["indices"]]["count"] // 3
        else:
            total += gltf["accessors"][prim["attributes"]["POSITION"]]["count"] // 3
    return total


def _descendants(gltf, ni, depth=0):
    if depth > 32:
        raise ValueError("node tree too deep")
    out = [ni]
    for c in gltf["nodes"][ni].get("children", []):
        out += _descendants(gltf, c, depth + 1)
    return out


# Blender "Plane" primitives in the pack are alpha cut-out leaf cards. The web renderer has no alpha test, so they would draw as opaque sheets.
ALPHA_CARD_PREFIX = "Plane"


def _keep_ids(gltf, root_index):
    scene = gltf["scenes"][gltf.get("scene", 0)]["nodes"]
    if not 0 <= root_index < len(scene):
        raise ValueError(f"scene has {len(scene)} roots, no root {root_index}")
    root = scene[root_index]
    kids = gltf["nodes"][root].get("children", [])
    ids = [root] + _descendants(gltf, kids[0]) if kids and all(gltf["nodes"][k].get("children") for k in kids) else _descendants(gltf, root)
    return [i for i in ids if not (gltf["nodes"][i].get("mesh") is not None and gltf["nodes"][i].get("name", "").startswith(ALPHA_CARD_PREFIX))]


def select_nodes(gltf, root_index):
    """Names of the nodes to keep for the root at `root_index` of the default scene.

    A root whose children are themselves groups is a LOD set: only its first (highest detail) group is kept.
    """
    return [gltf["nodes"][i].get("name", f"node{i}") for i in _keep_ids(gltf, root_index)]


def selected_triangles(gltf, root_index):
    return sum(mesh_triangles(gltf, gltf["nodes"][i]["mesh"]) for i in _keep_ids(gltf, root_index) if "mesh" in gltf["nodes"][i])


def output_summary(path):
    """Triangle count, material count and whether a base colour texture survived, read back from a written GLB."""
    g = read_glb_json(path)
    tris = sum(mesh_triangles(g, i) for i in range(len(g.get("meshes", []))))
    textured = any("baseColorTexture" in m.get("pbrMetallicRoughness", {}) for m in g.get("materials", []))
    return {"triangles": tris, "materials": len(g.get("materials", [])), "textured": textured, "bytes": os.path.getsize(path)}


def build_manifest(models, budget, texture_size):
    """models: {kind: {file, triangles, textured, bytes}}. The manifest names kinds and generic files only, no pack names."""
    for kind, m in models.items():
        if kind not in KIND_SOURCES or not m["file"].endswith(".glb") or "/" in m["file"]:
            raise ValueError(f"bad model entry {kind}")
    return {"version": MANIFEST_VERSION, "budgetTriangles": budget, "textureSize": texture_size, "models": models}


# ---------- Blender worker ----------
def worker(argv):
    """Runs inside headless Blender: import, keep one object, decimate, shrink textures, drop misused albedo maps, export GLB."""
    import bpy  # only exists inside Blender

    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--keep", required=True, help="JSON list of node names")
    ap.add_argument("--out", required=True)
    ap.add_argument("--budget", type=int, required=True)
    ap.add_argument("--texture-size", type=int, required=True)
    a = ap.parse_args(argv)
    keep = set(json.loads(a.keep))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a.src)

    for o in list(bpy.data.objects):
        if o.name not in keep:  # the kept nodes already include every ancestor, so the hierarchy stays whole
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    ratio = decimate_ratio(tris, a.budget)
    if ratio < 1.0:
        for o in meshes:
            bpy.ops.object.select_all(action="DESELECT")
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new("alien_decimate", "DECIMATE")
            mod.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
    def albedo_nodes(nt):
        """Image Texture nodes upstream of Base Color, through any Mix node the importer put there for a colour factor."""
        found, todo, seen = [], [lk.from_node for lk in nt.links if lk.to_socket.name == "Base Color"], set()
        while todo:
            node = todo.pop()
            if node.name in seen:
                continue
            seen.add(node.name)
            if node.type == "TEX_IMAGE":
                found.append(node)
            todo += [lk.from_node for lk in nt.links if lk.to_node == node]  # == not `is`: bpy makes a new wrapper per access
        return found

    used = set()
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nt = mat.node_tree
        for node in albedo_nodes(nt):
            if node.image is not None and is_albedo_image(node.image.name):
                used.add(node.image)
            else:
                for lk in [lk for lk in nt.links if lk.from_node == node]:
                    nt.links.remove(lk)  # keeps the flat base colour instead of a grey height or cavity map
    for img in used:
        w, h = texture_target_size(img.size[0], img.size[1], a.texture_size)
        if (w, h) != tuple(img.size):
            img.scale(w, h)
    for img in list(bpy.data.images):
        if img not in used:
            bpy.data.images.remove(img)
    bpy.ops.export_scene.gltf(filepath=a.out, export_format="GLB", export_image_format="JPEG", export_apply=True)


# ---------- driver ----------
def run_blender(blender, src, keep, out, budget, texture_size):
    env = dict(os.environ)
    libs = os.path.join(os.path.dirname(os.path.abspath(blender)), "..", "libs", "usr", "lib64")
    if os.path.isdir(libs):
        env["LD_LIBRARY_PATH"] = os.path.abspath(libs) + os.pathsep + env.get("LD_LIBRARY_PATH", "")
    cmd = [blender, "-b", "--python", os.path.abspath(__file__), "--", "--worker", "--src", src, "--keep", json.dumps(keep),
           "--out", out, "--budget", str(budget), "--texture-size", str(texture_size)]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.isfile(out):
        raise RuntimeError(f"blender failed for {os.path.basename(src)}: {(r.stderr or r.stdout)[-400:]}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", required=True, help="folder with your exported GLBs")
    ap.add_argument("--blender", required=True, help="path to a headless Blender 4.x binary")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--budget", type=int, default=DEFAULT_BUDGET)
    ap.add_argument("--texture-size", type=int, default=512, choices=TEXTURE_SIZES)
    args = ap.parse_args(argv)
    out = os.path.abspath(args.out)
    require_ignored(out)
    os.makedirs(out, exist_ok=True)
    models = {}
    for kind, (stem, root_index) in KIND_SOURCES.items():
        check_source_allowed(stem)
        src = os.path.join(args.src, stem + ".glb")
        if not os.path.isfile(src):
            print(f"warning: {kind}: {stem}.glb not found in {args.src}, skipped", file=sys.stderr)
            continue
        gltf = read_glb_json(src)
        keep = select_nodes(gltf, root_index)
        dest = os.path.join(out, kind + ".glb")
        run_blender(args.blender, src, keep, dest, args.budget, args.texture_size)
        if kind in KIND_TINT:
            with open(dest, "rb") as f:
                tinted = tint_glb(f.read(), KIND_TINT[kind])
            with open(dest, "wb") as f:
                f.write(tinted)
        models[kind] = {"file": kind + ".glb", **{k: v for k, v in output_summary(dest).items() if k in ("triangles", "textured", "bytes")}}
        print(f"  {kind}: {selected_triangles(gltf, root_index)} -> {models[kind]['triangles']} triangles, textured={models[kind]['textured']}")
    if not models:
        print("no models written", file=sys.stderr)
        return 1
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(build_manifest(models, args.budget, args.texture_size), f, indent=2)
    print(f"wrote {out} ({len(models)} kinds). Keep it uncommitted.")
    return 0


if __name__ == "__main__":
    if "--worker" in sys.argv:
        worker(sys.argv[sys.argv.index("--worker") + 1:])
    else:
        sys.exit(main())
