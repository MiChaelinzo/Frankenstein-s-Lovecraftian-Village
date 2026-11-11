#!/usr/bin/env python3
"""Build the local-only web 'pack mode' folder from a Lovecraftian Village .unitypackage.

Reads a handful of PNGs and .mat files from the package (stdlib only), downsamples one
channel of each PNG to a small grayscale texture, parses the material tint, and writes
web/local-pack/ with a manifest. The output folder MUST be git-ignored; this tool checks
with `git check-ignore` and refuses otherwise. Nothing here is ever committed.

Usage: tools/build_local_pack.py [package] [--out web/local-pack] [--size 256]
"""
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import tarfile
import time
import zlib
from itertools import accumulate

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dlnk_scene  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DL = os.path.join(ROOT, "Assets", "ThirdParty", "LovecraftianVillage", "downloads")
DEFAULT_PACKAGES = [os.path.join(DL, "Lovecraftian1.3_HDRP_Unity6.unitypackage"), os.path.join(DL, "Lovecraftian1.3_URP_Unity6.unitypackage")]
DEFAULT_OUT = os.path.join(ROOT, "web", "local-pack")
DEFAULT_CATALOG = os.path.join(ROOT, "Assets", "Data", "village_catalog.json")
MAT = "Assets/_DLNK/Lovecraftian Village/Source/Materials/"
ETP = "Assets/_DLNK/Essential Terrain Pack/Source/Materials/"

# role -> texture pathname, channel index in RGBA (DetailMap R is desaturated albedo, MaskMap G is ambient occlusion), material
ROLES = {
    "wall_wood": (MAT + "Wood/WoodPlanks00_DetailMap.png", 0, MAT + "Wood/WoodPlanks00.mat"),
    "wall_brick": (MAT + "Brick/BrickWall01_DetailMap.png", 0, MAT + "Brick/BrickWall01.mat"),
    "wall_plaster": (MAT + "Plaster/Plaster01_DetailMap.png", 0, MAT + "Plaster/Plaster01.mat"),
    "wall_stone": (MAT + "Stones/RockWall03_MaskMap.png", 1, MAT + "Stones/RockWall03.mat"),
    "roof": (MAT + "Wood/WoodRoofOld00_MaskMap.png", 1, MAT + "Wood/WoodRoofOld00.mat"),
    "trunk": (ETP + "Detail Small/TreeTrunks/TreeTrunk00_DetailMap.png", 0, ETP + "Detail Small/TreeTrunks/TreeTrunk00.mat"),
    "ground": (MAT + "Ground/GroundDirt00_MaskMap.png", 1, MAT + "Ground/GroundDirt00.mat"),
    "ground_stones": (MAT + "Ground/GroundStones00_MaskMap.png", 1, MAT + "Ground/GroundStones00.mat"),
}


# ---------- PNG (8 bit, non interlaced) ----------
def _chunks(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    i = 8
    while i + 8 <= len(data):
        n, typ = struct.unpack(">I4s", data[i:i + 8])
        yield typ, data[i + 8:i + 8 + n]
        i += 12 + n


def unfilter_rows(raw, w, h, bpp):
    """Yield each unfiltered scanline as bytes."""
    stride = w * bpp
    prev = bytes(stride)
    pos = 0
    for _ in range(h):
        ft = raw[pos]
        row = raw[pos + 1:pos + 1 + stride]
        pos += 1 + stride
        if len(row) != stride:
            raise ValueError("truncated image data")
        if ft == 0:
            cur = row
        elif ft == 1:
            out = bytearray(stride)
            for c in range(bpp):
                out[c::bpp] = bytes(x & 255 for x in accumulate(row[c::bpp]))
            cur = bytes(out)
        elif ft == 2:
            cur = bytes((a + b) & 255 for a, b in zip(row, prev))
        elif ft == 3:
            out = bytearray(row)
            for i in range(stride):
                left = out[i - bpp] if i >= bpp else 0
                out[i] = (row[i] + ((left + prev[i]) >> 1)) & 255
            cur = bytes(out)
        elif ft == 4:
            out = bytearray(row)
            for i in range(stride):
                a = out[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                out[i] = (row[i] + pr) & 255
            cur = bytes(out)
        else:
            raise ValueError(f"bad filter type {ft}")
        yield cur
        prev = cur


def decode_png_channel(data, channel):
    """Return (w, h, rows) where rows is a list of bytes, one per scanline, holding only `channel`."""
    w = h = depth = ctype = None
    idat = []
    for typ, body in _chunks(data):
        if typ == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or interlace != 0 or ctype not in (0, 2, 4, 6):
                raise ValueError(f"unsupported PNG variant (depth {depth}, type {ctype}, interlace {interlace})")
        elif typ == b"IDAT":
            idat.append(body)
        elif typ == b"IEND":
            break
    if w is None:
        raise ValueError("no IHDR")
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    if channel >= bpp or (ctype in (0, 4) and channel > 0):
        channel = 0
    raw = zlib.decompress(b"".join(idat))
    return w, h, [r[channel::bpp] for r in unfilter_rows(raw, w, h, bpp)]


def downscale_gray(w, h, rows, size):
    """Box average to at most size x size (keeps aspect by using a square tile of the shorter axis scale)."""
    fx, fy = max(1, w // size), max(1, h // size)
    ow, oh = w // fx, h // fy
    out = []
    for oy in range(oh):
        block = rows[oy * fy:(oy + 1) * fy]
        acc = [0] * ow
        for r in block:
            for k in range(fx):
                col = r[k:ow * fx:fx]
                acc = [a + c for a, c in zip(acc, col)]
        n = fx * fy
        out.append(bytes((a + n // 2) // n for a in acc))
    return ow, oh, out


def encode_gray_png(w, h, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(t, b):
        return struct.pack(">I", len(b)) + t + b + struct.pack(">I", zlib.crc32(t + b) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


# ---------- material tint ----------
def parse_tint(yaml_text):
    """Return [r, g, b] 0..255 from _BaseColor, else _Color, else None. Unity stores linear 0..1 floats."""
    found = {}
    for m in re.finditer(r"-\s*(_BaseColor|_Color):\s*\{r:\s*([-\d.eE]+),\s*g:\s*([-\d.eE]+),\s*b:\s*([-\d.eE]+)", yaml_text):
        found.setdefault(m.group(1), m.groups()[1:])
    pick = found.get("_BaseColor") or found.get("_Color")
    if not pick:
        return None
    return [max(0, min(255, round(float(v) * 255))) for v in pick]


def parse_material(yaml_text):
    """Return {tint, smoothness, metallic, slots} from a Unity .mat (HDRP and URP property names).

    tint: _BaseColor else _Color as [r,g,b] 0..255 or None. smoothness: _Smoothness else _Glossiness else
    _GlossMapScale else None. metallic: _Metallic or None. slots: sorted texture slot names that have a texture set.
    """
    def num(name):
        m = re.search(r"-\s*%s:\s*(-?[0-9.]+(?:[eE][-+]?\d+)?)\s*$" % re.escape(name), yaml_text, re.M)
        return max(0.0, min(1.0, round(float(m.group(1)), 3))) if m else None

    smooth = next((v for v in (num("_Smoothness"), num("_Glossiness"), num("_GlossMapScale")) if v is not None), None)
    slots = []
    for m in re.finditer(r"-\s*(_[A-Za-z0-9]+(?:Map|Tex)):\s*\r?\n\s*m_Texture:\s*\{([^}]*)\}", yaml_text):
        g = re.search(r"guid:\s*([0-9a-fA-F]{32})", m.group(2))
        if g and g.group(1).strip("0"):
            slots.append(m.group(1))
    return {"tint": parse_tint(yaml_text), "smoothness": smooth, "metallic": num("_Metallic"), "slots": sorted(set(slots))}


# ---------- safety ----------
def is_git_ignored(path, repo=ROOT):
    probe = os.path.join(path, ".probe")
    r = subprocess.run(["git", "-C", repo, "check-ignore", "-q", probe], capture_output=True)
    return r.returncode == 0


def require_ignored(path, repo=ROOT):
    if not is_git_ignored(path, repo):
        raise SystemExit(f"refusing: {path} is not git-ignored. Pack content must never be committed.")


# ---------- package reading ----------
def read_selected(package, wanted):
    """Two streaming passes: map guid -> pathname, then read only the wanted assets. Returns {pathname: bytes}."""
    wanted = set(wanted)
    paths = {}
    with tarfile.open(package, "r|gz") as tar:
        for m in tar:
            if m.isfile() and m.name.endswith("/pathname"):
                line = tar.extractfile(m).read(2048).decode("utf-8", "replace").splitlines()
                if line and line[0].strip() in wanted:
                    paths[m.name.split("/")[0]] = line[0].strip()
            tar.members = []
    got = {}
    with tarfile.open(package, "r|gz") as tar:
        for m in tar:
            if m.isfile() and m.name.endswith("/asset") and m.name.split("/")[0] in paths:
                got[paths[m.name.split("/")[0]]] = tar.extractfile(m).read()
            tar.members = []
    return got


def sha_prefix(path, n=12):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()[:n]


def build_manifest(package_name, sha, roles, hints, scene_stats):
    return {"version": 1, "source": {"package": package_name, "sha256Prefix": sha}, "roles": roles, "prefabHints": hints, "sceneStats": scene_stats}


def catalog_hints(path=DEFAULT_CATALOG):
    with open(path, encoding="utf-8") as f:
        return {e["id"]: e["prefabHint"] for e in json.load(f)["entries"] if e.get("prefabHint")}


def scene_stats_from_inventory(package):
    inv = os.path.join(os.path.dirname(os.path.dirname(package)), "pack_inventory_%s.json" % ("hdrp" if "HDRP" in package else "urp"))
    try:
        with open(inv, encoding="utf-8") as f:
            s = json.load(f)["summary"]
        return {"files": s["files"], "meshCount": s["meshCount"], "scenes": len(s["scenes"]), "referencedPrefabs": s["referencedPrefabCount"]}
    except (OSError, KeyError, ValueError):
        return {}


def read_scene_texts(package):
    """One streaming pass: ({guid: pathname}, {scene pathname: text}). Scenes are parsed in memory only."""
    paths, scenes = {}, {}
    with tarfile.open(package, "r|gz") as tar:
        for m in tar:
            parts = m.name.split("/")
            if m.isfile() and parts[-1] == "pathname":
                line = tar.extractfile(m).read(4096).decode("utf-8", "replace").splitlines()
                if line and line[0].strip():
                    paths[parts[0]] = line[0].strip()
            elif m.isfile() and parts[-1] == "asset" and 2000 < m.size <= 64 * 1024 * 1024:
                data = tar.extractfile(m).read()
                if data.startswith(b"%YAML") and b"OcclusionCullingSettings" in data[:2048]:
                    scenes[parts[0]] = data
            tar.members = []
    return paths, {paths[g]: d.decode("utf-8", "replace") for g, d in scenes.items() if paths.get(g, "").lower().endswith(".unity")}


def build_scene_layout(package):
    paths, texts = read_scene_texts(package)
    names = {g: os.path.splitext(os.path.basename(p))[0] for g, p in paths.items() if p.lower().endswith(".prefab")}
    scenes = {}
    for pathname, text in sorted(texts.items()):
        lay = dlnk_scene.build_layout(dlnk_scene.parse_scene(text, names))
        lay["title"] = os.path.splitext(os.path.basename(pathname))[0]
        scenes[dlnk_scene.scene_slug(pathname)] = lay
    return {"version": 1, "source": {"package": os.path.basename(package)}, "scenes": scenes}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("package", nargs="?")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--size", type=int, default=256)
    args = ap.parse_args(argv)
    package = args.package or next((p for p in DEFAULT_PACKAGES if os.path.exists(p)), None)
    if not package or not os.path.exists(package):
        print("no package found; pass a .unitypackage path", file=sys.stderr)
        return 1
    out = os.path.abspath(args.out)
    require_ignored(out)
    wanted = []
    for tex, _, mat in ROLES.values():
        wanted += [tex, mat]
    t0 = time.time()
    print(f"reading {os.path.basename(package)} ...")
    assets = read_selected(package, wanted)
    os.makedirs(os.path.join(out, "textures"), exist_ok=True)
    roles = {}
    for role, (tex, ch, mat) in ROLES.items():
        if tex not in assets:
            print(f"warning: {role}: {tex} not in this package, skipped", file=sys.stderr)
            continue
        try:
            w, h, rows = decode_png_channel(assets[tex], ch)
            ow, oh, small = downscale_gray(w, h, rows, args.size)
        except (ValueError, zlib.error) as e:
            print(f"warning: {role}: cannot decode {tex} ({e}), skipped", file=sys.stderr)
            continue
        rel = f"textures/{role}.png"
        with open(os.path.join(out, rel), "wb") as f:
            f.write(encode_gray_png(ow, oh, small))
        mp = parse_material(assets[mat].decode("utf-8", "replace")) if mat in assets else {}
        roles[role] = {"texture": rel, "tint": mp.get("tint") or [255, 255, 255], "sourcePathname": tex, "channel": "RGBA"[ch], "size": [ow, oh]}
        for key in ("smoothness", "metallic"):
            if mp.get(key) is not None:
                roles[role][key] = mp[key]
        if mp.get("slots"):
            roles[role]["slots"] = mp["slots"]
        print(f"  {role}: {w}x{h} -> {ow}x{oh} tint {roles[role]['tint']}")
    if not roles:
        print("no textures extracted", file=sys.stderr)
        return 1
    layout = build_scene_layout(package)
    if layout["scenes"]:
        with open(os.path.join(out, "scene_layout.json"), "w", encoding="utf-8") as f:
            json.dump(layout, f, separators=(",", ":"))
        for slug, sc in layout["scenes"].items():
            print(f"  scene {slug}: {sc['count']} of {sc['total']} objects")
    manifest = build_manifest(os.path.basename(package), sha_prefix(package), roles, catalog_hints(), scene_stats_from_inventory(package))
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"wrote {out} ({len(roles)} roles, {time.time() - t0:.0f}s). Keep it uncommitted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
