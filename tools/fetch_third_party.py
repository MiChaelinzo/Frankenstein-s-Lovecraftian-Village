#!/usr/bin/env python3
"""Fetch the CC0 Poly Haven assets listed in THIRD_PARTY_ASSETS.md into web/assets/third_party/ and downsize them.

Reproducible on demand (needs network and Pillow: pip install pillow); the validator and tests never run it.
Textures: the 1K diffuse JPEG, resized to 512 px and scaled to a mean brightness of 0.6 so the 3D shader's x1.6 keeps
colours steady (the same convention as web/src/proc-textures.js). Models: the 1K glTF, repacked as one GLB with only
POSITION, NORMAL, TEXCOORD_0, indices and the base colour texture (512 px JPEG); normal and ARM maps are dropped.
Poly Haven publishes every asset under CC0 (https://polyhaven.com/license); the info API is queried per asset so the
recorded authors match the source. The Quaternius kit houses are built by tools/build_quaternius_models.py instead.
"""
import io, json, os, struct, subprocess, sys, urllib.request

try:
    from PIL import Image, ImageStat
except ImportError:
    raise SystemExit("needs Pillow: python3 -m pip install pillow")

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
OUT = os.path.join(root, "web", "assets", "third_party")
API = "https://api.polyhaven.com"
TEXTURES = {"stone": "old_stone_wall", "roof": "roof_slates_02", "cobble": "cobblestone_floor_04", "ground": "brown_mud_leaves_01"}
MODELS = {"barrel": "barrel_03", "bench": "painted_wooden_bench"}  # props stay under about 1500 triangles: wooden_crate_02 (5176) broke the 3D triangle budget
SIZE, MEAN = 512, 0.6


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "frankenstein-village-asset-fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def info(asset):
    return json.loads(get(f"{API}/info/{asset}"))


def jpeg(data, normalise):
    im = Image.open(io.BytesIO(data)).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    if normalise:
        mean = ImageStat.Stat(im.convert("L")).mean[0] / 255
        k = MEAN / max(mean, 0.01)
        im = im.point(lambda v: min(255, int(round(v * k))))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82, optimize=True)
    return buf.getvalue()


def pad4(b, fill=b"\0"):
    return b + fill * ((4 - len(b) % 4) % 4)


def pack_glb(gltf, bin_data, diffuse_jpg):
    """Keeps meshes, nodes and accessors; the only material keeps its base colour texture, embedded as the last bufferView."""
    blob = pad4(bin_data)
    views = gltf["bufferViews"] + [{"buffer": 0, "byteOffset": len(blob), "byteLength": len(diffuse_jpg)}]
    blob = pad4(blob + diffuse_jpg)
    mats = []
    for m in gltf.get("materials", []):
        pbr = {k: v for k, v in m.get("pbrMetallicRoughness", {}).items() if k in ("baseColorFactor", "metallicFactor", "roughnessFactor")}
        pbr["baseColorTexture"] = {"index": 0}
        mats.append({"name": m.get("name", "material"), "doubleSided": m.get("doubleSided", False), "pbrMetallicRoughness": pbr})
    for mesh in gltf["meshes"]:
        for p in mesh["primitives"]:
            p["attributes"] = {k: v for k, v in p["attributes"].items() if k in ("POSITION", "NORMAL", "TEXCOORD_0")}
    out = {
        "asset": {"version": "2.0", "generator": "tools/fetch_third_party.py from Poly Haven (CC0)"},
        "scene": gltf.get("scene", 0), "scenes": gltf["scenes"], "nodes": gltf["nodes"], "meshes": gltf["meshes"],
        "accessors": gltf["accessors"], "bufferViews": views, "buffers": [{"byteLength": len(blob)}], "materials": mats,
        "textures": [{"source": 0}], "images": [{"bufferView": len(views) - 1, "mimeType": "image/jpeg"}],
    }
    js = pad4(json.dumps(out, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(js) + 8 + len(blob)
    return struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + blob


def main():
    os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "models"), exist_ok=True)
    for name, asset in TEXTURES.items():
        meta, files = info(asset), json.loads(get(f"{API}/files/{asset}"))
        data = jpeg(get(files["Diffuse"]["1k"]["jpg"]["url"]), True)
        open(os.path.join(OUT, "textures", name + ".jpg"), "wb").write(data)
        print(f"texture {name}.jpg <- {asset} by {', '.join(meta['authors'])} ({len(data)} bytes)")
    for name, asset in MODELS.items():
        meta, files = info(asset), json.loads(get(f"{API}/files/{asset}"))
        g = files["gltf"]["1k"]["gltf"]
        include = {k: v["url"] for k, v in g["include"].items()}
        gltf = json.loads(get(g["url"]))
        if len(gltf["buffers"]) != 1:
            raise SystemExit(f"{asset}: expected one buffer")
        bin_data = get(include[gltf["buffers"][0]["uri"]])
        mat = gltf["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
        diffuse = jpeg(get(include[gltf["images"][gltf["textures"][mat]["source"]]["uri"]]), False)
        data = pack_glb(gltf, bin_data, diffuse)
        open(os.path.join(OUT, "models", name + ".glb"), "wb").write(data)
        print(f"model {name}.glb <- {asset} by {', '.join(meta['authors'])} ({len(data)} bytes)")


if __name__ == "__main__":
    sys.exit(main())
