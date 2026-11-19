#!/usr/bin/env python3
"""Assemble the CC0 Quaternius Medieval Village MegaKit pieces into the village houses under web/assets/third_party/models/.

Source: https://quaternius.itch.io/medieval-village-megakit (Standard, free, CC0 1.0; License_Standard.txt inside the zip says so).
Reproducible on demand (needs network for --download, and Pillow); the validator and tests never run it:

    python3 tools/build_quaternius_models.py --download pack-scratch/q      # itch.io download flow, unpacks the glTF folder
    python3 tools/build_quaternius_models.py pack-scratch/q                 # writes house_a.glb, house_b.glb, cottage_tall.glb
    python3 tools/build_quaternius_models.py pack-scratch/q --preview out/  # also writes a flat shaded PNG of each house

Only the pieces used are kept. Each house is one GLB: walls, doors, windows, stoop stairs and balcony rails are the kit's own meshes, placed on the
same footprint, floor heights, door position and chimneys as the original Blender house of that kind (data/village_shapes.json); the roof, plinth,
jetty beam, chimneys and dormers are plain boxes and tiles textured from the kit, because the kit's roofs are 3800 triangles each.
The kit's trim textures are packed into one 3 x 3 JPEG mosaic (uv are moved into their cell, shifted by whole tiles so a triangle stays in 0..1).
Window glass is a flat emissive quad so the village's night window light still works.
"""
import io, json, math, os, struct, sys, urllib.parse, urllib.request

try:
    from PIL import Image, ImageDraw, ImageStat
except ImportError:
    raise SystemExit("needs Pillow: python3 -m pip install pillow")

ITCH = "https://quaternius.itch.io/medieval-village-megakit"
UPLOAD_ID = 12563480
ZIP_DIR = "Medieval Village MegaKit[Standard]"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "assets", "third_party", "models")

# trim texture -> cell of the 3 x 3 mosaic
CELLS = {"plaster": (0, 0, "T_Plaster_BaseColor.png"), "wood": (1, 0, "T_WoodTrim_BaseColor.png"), "tiles": (2, 0, "T_RoundTiles_BaseColor.png"),
         "brick": (0, 1, "T_UnevenBrick_BaseColor.png"), "rock": (1, 1, "T_RockTrim_BaseColor.png"), "redbrick": (2, 1, "T_Brick_BaseColor.png")}
MATERIAL_CELL = {"MI_Plaster": "plaster", "MI_WoodTrim": "wood", "MI_WoodTrim_Wear": "wood", "MI_MetalOrnaments": "wood", "MI_RoundTiles": "tiles",
                 "MI_UnevenBrick": "brick", "MI_RockTrim": "rock", "MI_Brick": "redbrick"}
MOSAIC, GRID = 510, 3
# mean brightness per cell: the scene shader multiplies by 1.6, so a plaster at 0.55 blows out and the timber must stay dark enough to read as a frame
TINT = {"plaster": (1.10, 1.0, 0.86)}  # the kit plaster is grey olive; a warm cast reads as limewash next to the stone
MEAN = {"plaster": 0.50, "wood": 0.24, "tiles": 0.36, "brick": 0.38, "rock": 0.36, "redbrick": 0.36}
GLOW = (1.0, 0.72, 0.38)


def pieces_dir(root):
    for cand in (root, os.path.join(root, ZIP_DIR, "glTF"), os.path.join(root, "glTF")):
        if os.path.isfile(os.path.join(cand, "Wall_Plaster_Straight.gltf")):
            return cand
    raise SystemExit(f"no glTF folder of the MegaKit under {root} (run with --download first)")


def download(dest):
    """The itch.io web flow: csrf token from the page, download_url, then the file URL (the page offers the CC0 Standard zip)."""
    import http.cookiejar, re, zipfile
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", "frankenstein-village-asset-fetch")]
    page = op.open(ITCH, timeout=60).read().decode()
    token = re.search(r'csrf_token" value="([^"]*)"', page).group(1)
    post = lambda url, tok: json.loads(op.open(urllib.request.Request(url, urllib.parse.urlencode({"csrf_token": tok}).encode()), timeout=60).read())
    dl = post(ITCH + "/download_url", token)["url"]
    dpage = op.open(dl, timeout=60).read().decode()
    token2 = re.search(r'csrf_token" value="([^"]*)"', dpage).group(1)
    url = post(f"{ITCH}/file/{UPLOAD_ID}", token2)["url"]
    os.makedirs(dest, exist_ok=True)
    data = urllib.request.urlopen(url, timeout=900).read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        lic = z.read(f"{ZIP_DIR}/License_Standard.txt").decode()
        if "CC0 1.0" not in lic:
            raise SystemExit("the downloaded pack does not state CC0 1.0; not using it")
        z.extractall(dest, [n for n in z.namelist() if "/glTF/" in n or n.endswith("License_Standard.txt")])
    print("unpacked the glTF folder and License_Standard.txt into", dest)


class Piece:
    """One kit glTF as [(material name, positions, uvs, indices)]."""
    cache = {}

    def __init__(self, folder, name):
        j = json.load(open(os.path.join(folder, name + ".gltf")))
        b = open(os.path.join(folder, name + ".bin"), "rb").read()

        def acc(i, n, fmt):
            a = j["accessors"][i]; v = j["bufferViews"][a["bufferView"]]; o = v.get("byteOffset", 0) + a.get("byteOffset", 0)
            sz = struct.calcsize(fmt); return [struct.unpack_from("<" + fmt * n, b, o + k * sz * n) for k in range(a["count"])]
        self.prims = []
        for m in j["meshes"]:
            for p in m["primitives"]:
                a = j["accessors"][p["indices"]]; ct = {5123: "H", 5125: "I"}[a["componentType"]]
                idx = [t[0] for t in acc(p["indices"], 1, ct)]
                self.prims.append((j["materials"][p["material"]]["name"], acc(p["attributes"]["POSITION"], 3, "f"), acc(p["attributes"]["TEXCOORD_0"], 2, "f"), idx))

    @classmethod
    def get(cls, folder, name):
        key = (folder, name)
        if key not in cls.cache:
            cls.cache[key] = Piece(folder, name)
        return cls.cache[key]


class Builder:
    def __init__(self, folder):
        self.folder, self.tex, self.glow = folder, [], []  # tex: (p0, p1, p2, uv0, uv1, uv2) in mosaic uv; glow: (p0, p1, p2)

    def _uv(self, cell, uvs):
        """Whole-tile shift so the triangle lies in 0..1 where possible, clamp the rest, inset half a texel, move into the cell."""
        cx, cy, _ = CELLS[cell]
        du, dv = math.floor(min(u for u, _ in uvs) + 1e-4), math.floor(min(v for _, v in uvs) + 1e-4)
        out = []
        for u, v in uvs:
            u, v = min(1, max(0, u - du)), min(1, max(0, v - dv))
            out.append(((cx + 0.015 + 0.97 * u) / GRID, (cy + 0.015 + 0.97 * v) / GRID))
        return out

    def piece(self, name, scale=(1, 1, 1), rot=0.0, at=(0, 0, 0), skip=()):
        c, s = math.cos(rot), math.sin(rot)
        def xf(p):
            x, y, z = p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]
            return (x * c + z * s + at[0], y + at[1], -x * s + z * c + at[2])
        for mat, pos, uv, idx in Piece.get(self.folder, name).prims:
            if mat in skip:
                continue
            for i in range(0, len(idx), 3):
                tri = [xf(pos[k]) for k in idx[i:i + 3]]
                if mat == "MI_WindowGlass":
                    self.glow.append(tuple(tri))
                else:
                    cell = MATERIAL_CELL.get(mat)
                    if cell is None:
                        raise SystemExit(f"{name}: material {mat} has no mosaic cell")
                    self.tex.append((*tri, *self._uv(cell, [uv[k] for k in idx[i:i + 3]])))

    def quad(self, p0, p1, p2, p3, cell, tile=None):
        """Counter clockwise seen from outside; p0 -> p1 runs along u, p0 -> p3 along v. tile = (metres per tile along u, along v)."""
        def lerp(a, b, t): return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))
        d = lambda a, b: math.dist(a, b)
        nu = max(1, round(d(p0, p1) / tile[0])) if tile else 1
        nv = max(1, round(d(p0, p3) / tile[1])) if tile else 1
        for i in range(nu):
            for j in range(nv):
                def at(a, b):
                    return lerp(lerp(p0, p1, (i + a) / nu), lerp(p3, p2, (i + a) / nu), (j + b) / nv)
                q = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)]
                u = [(0, 0), (1, 0), (1, 1), (0, 1)]
                for a, b, k in ((0, 1, 2), (0, 2, 3)):
                    self.tex.append((q[a], q[b], q[k], *self._uv(cell, [u[a], u[b], u[k]])))

    def glow_quad(self, p0, p1, p2, p3):
        self.glow.append((p0, p1, p2)); self.glow.append((p0, p2, p3))

    def tri(self, p0, p1, p2, cell, uv=((0, 0), (1, 0), (0.5, 1))):
        self.tex.append((p0, p1, p2, *self._uv(cell, list(uv))))

    def box(self, lo, hi, cells, tile=(1.2, 1.2), bottom=True):
        """Axis aligned box; cells = dict with 'side', optional 'top' and 'bottom'."""
        (x0, y0, z0), (x1, y1, z1) = lo, hi
        side, top, bot = cells["side"], cells.get("top", cells["side"]), cells.get("bottom", cells["side"])
        self.quad((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), side, tile)   # +z
        self.quad((x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), side, tile)   # -z
        self.quad((x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), side, tile)   # +x
        self.quad((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), side, tile)   # -x
        self.quad((x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0), top, (3.0, 3.0))    # +y
        if bottom:
            self.quad((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), bot, (3.0, 3.0))  # -y

    def gable_roof(self, cx, cz, wx, wz, y0, rise, ridge="x", tile=2.4, gable_cell="plaster"):
        """Tiled gable roof over a wx by wz rectangle, ridge along x or z, with an underside and two gable ends."""
        hx, hz, yr = wx / 2, wz / 2, y0 + rise
        if ridge == "x":
            self.quad((cx - hx, y0, cz + hz), (cx + hx, y0, cz + hz), (cx + hx, yr, cz), (cx - hx, yr, cz), "tiles", (tile, 4.0))   # front slope
            self.quad((cx + hx, y0, cz - hz), (cx - hx, y0, cz - hz), (cx - hx, yr, cz), (cx + hx, yr, cz), "tiles", (tile, 4.0))   # back slope
            self.tri((cx + hx, y0, cz + hz), (cx + hx, y0, cz - hz), (cx + hx, yr, cz), gable_cell)
            self.tri((cx - hx, y0, cz - hz), (cx - hx, y0, cz + hz), (cx - hx, yr, cz), gable_cell)
        else:
            self.quad((cx + hx, y0, cz + hz), (cx + hx, y0, cz - hz), (cx, yr, cz - hz), (cx, yr, cz + hz), "tiles", (tile, 4.0))   # +x slope
            self.quad((cx - hx, y0, cz - hz), (cx - hx, y0, cz + hz), (cx, yr, cz + hz), (cx, yr, cz - hz), "tiles", (tile, 4.0))   # -x slope
            self.tri((cx - hx, y0, cz + hz), (cx + hx, y0, cz + hz), (cx, yr, cz + hz), gable_cell)
            self.tri((cx + hx, y0, cz - hz), (cx - hx, y0, cz - hz), (cx, yr, cz - hz), gable_cell)
        self.quad((cx - hx, y0, cz - hz), (cx + hx, y0, cz - hz), (cx + hx, y0, cz + hz), (cx - hx, y0, cz + hz), "wood", (9, 9))   # underside

    def walls(self, w, d, y0, height, front, sides, back, door_x=None):
        """One floor of panels on a w by d rectangle centred on the origin. Each of front, sides and back is a list of (piece, width)."""
        sy = height / 3.12
        for rot, length, run, centre in ((0.0, w, front, d / 2), (math.pi / 2, d, sides, w / 2), (math.pi, w, back, d / 2), (-math.pi / 2, d, sides, w / 2)):
            x = -length / 2
            for name, width in run:
                local = x + width / 2
                x += width
                px = local * math.cos(rot) + centre * math.sin(rot) if False else None
                # local frame: panel x runs along the wall, +z is outward; rotating by rot about +y
                c, s = math.cos(rot), math.sin(rot)
                at = (local * c + centre * s, y0, -local * s + centre * c)
                if name.startswith("FLAT_"):
                    self.flat_panel(name[5:], width, height, rot, at)
                    continue
                self.piece(name, (width / 2, sy, 1), rot, at)
                if "Window" in name:
                    self.window_glow(width, rot, at, sy)
                if "Door" in name:
                    self.door_leaf(width, rot, at, sy)

    def flat_panel(self, kind, width, height, rot, at):
        """A cheap wall of the same material as the kit's panels: one brick or plaster quad, timber posts and rails as flat strips and framed glowing windows."""
        f = lambda x, y, z=0.0: self._frame(rot, at, (x, y, z))
        stone = kind.startswith("BRICK")
        self.quad(f(-width / 2, 0, 0.06), f(width / 2, 0, 0.06), f(width / 2, height, 0.06), f(-width / 2, height, 0.06), "brick" if stone else "plaster", (4.0, 4.0))
        n = round(width / 2.4) if kind.endswith("_W") else 0
        if not stone:
            for x in [-width / 2 + 0.09 + i * (width - 0.18) / max(1, n) for i in range(n + 1)] if n else [-width / 2 + 0.09, width / 2 - 0.09]:
                self.quad(f(x - 0.14, 0, 0.14), f(x + 0.14, 0, 0.14), f(x + 0.14, height, 0.14), f(x - 0.14, height, 0.14), "wood", (1.0, 4.0))
            for y in ((0.0, height - 0.28) if rot == 0.0 else (height - 0.28,)):
                self.quad(f(-width / 2, y, 0.14), f(width / 2, y, 0.14), f(width / 2, y + 0.28, 0.14), f(-width / 2, y + 0.28, 0.14), "wood", (4.0, 1.0))
        wy0, wy1 = (0.95, 2.45) if stone else (0.45, height - 0.5)
        for i in range(n):
            cx = -width / 2 + width * (i + 0.5) / n; h = 0.7
            if rot == 0.0:
                self.quad(f(cx - h - 0.1, wy0 - 0.1, 0.14), f(cx + h + 0.1, wy0 - 0.1, 0.14), f(cx + h + 0.1, wy1 + 0.1, 0.14), f(cx - h - 0.1, wy1 + 0.1, 0.14), "wood", (3.0, 3.0))
            self.glow_quad(f(cx - h, wy0, 0.2), f(cx + h, wy0, 0.2), f(cx + h, wy1, 0.2), f(cx - h, wy1, 0.2))

    def _frame(self, rot, at, local):
        c, s = math.cos(rot), math.sin(rot)
        return (local[0] * c + local[2] * s + at[0], local[1] + at[1], -local[0] * s + local[2] * c + at[2])

    def window_glow(self, width, rot, at, sy):
        """Emissive pane inside the opening (local x +-0.78 of a 2 m panel, y 0.96..2.5)."""
        k = width / 2
        pts = [self._frame(rot, at, (x * k, y * sy, -0.1)) for x, y in ((-0.78, 0.96), (0.78, 0.96), (0.78, 2.5), (-0.78, 2.5))]
        self.glow_quad(*pts)

    def door_leaf(self, width, rot, at, sy):
        k = width / 2
        pts = [self._frame(rot, at, (x * k, y * sy, -0.08)) for x, y in ((-0.52, 0.0), (0.52, 0.0), (0.52, 2.15), (-0.52, 2.15))]
        self.quad(*pts, "wood", (1.0, 1.0))

    def finish(self, lo, hi):
        """Per axis affine fit to the original mesh's bounding box, so footprint, collision and height stay the same."""
        pts = [p for t in self.tex for p in t[:3]] + [p for t in self.glow for p in t]
        mn = [min(p[k] for p in pts) for k in range(3)]; mx = [max(p[k] for p in pts) for k in range(3)]
        f = lambda p: tuple(lo[k] + (p[k] - mn[k]) * (hi[k] - lo[k]) / (mx[k] - mn[k]) for k in range(3))
        self.tex = [(f(t[0]), f(t[1]), f(t[2]), *t[3:]) for t in self.tex]
        self.glow = [tuple(f(p) for p in t) for t in self.glow]
        return [round((mx[k] - mn[k]), 2) for k in range(3)]


def mosaic():
    im = Image.new("RGB", (MOSAIC, MOSAIC)); cell = MOSAIC // GRID
    for name, (cx, cy, file) in CELLS.items():
        src = os.path.join(CELLS_DIR, file)
        t = Image.open(src).convert("RGB").resize((cell, cell), Image.LANCZOS)
        k = MEAN[name] / max(ImageStat.Stat(t.convert("L")).mean[0] / 255, 0.01)
        tint = TINT.get(name, (1, 1, 1))
        chans = [t.getchannel(i).point(lambda v, c=tint[i]: min(255, int(round(v * k * c)))) for i in range(3)]
        im.paste(Image.merge("RGB", chans), (cx * cell, cy * cell))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True)
    return buf.getvalue(), im


def pad4(b, fill=b"\0"):
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(builder, jpg):
    """Two primitives: the textured one (POSITION, TEXCOORD_0) and the emissive window glass. Vertices are per triangle (uv differ between triangles)."""
    blob = bytearray(); views, accessors = [], []

    def add(data, target=None):
        while len(blob) % 4: blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), **({"target": target} if target else {})}); blob.extend(data)
        return len(views) - 1

    def prim(tris, uv, material):
        pos = [p for t in tris for p in t[:3]]
        mn = [min(p[k] for p in pos) for k in range(3)]; mx = [max(p[k] for p in pos) for k in range(3)]
        accessors.append({"bufferView": add(struct.pack(f"<{len(pos) * 3}f", *[c for p in pos for c in p]), 34962), "componentType": 5126, "count": len(pos), "type": "VEC3", "min": mn, "max": mx})
        out = {"attributes": {"POSITION": len(accessors) - 1}, "material": material, "mode": 4}
        if uv:
            flat = [c for t in tris for uvp in t[3:6] for c in uvp]
            accessors.append({"bufferView": add(struct.pack(f"<{len(flat)}f", *flat), 34962), "componentType": 5126, "count": len(pos), "type": "VEC2"}); out["attributes"]["TEXCOORD_0"] = len(accessors) - 1
        accessors.append({"bufferView": add(struct.pack(f"<{len(pos)}H", *range(len(pos))), 34963), "componentType": 5123, "count": len(pos), "type": "SCALAR"}); out["indices"] = len(accessors) - 1
        return out
    prims = [prim(builder.tex, True, 0)]
    if builder.glow:
        prims.append(prim(builder.glow, False, 1))
    img = add(jpg)
    gltf = {"asset": {"version": "2.0", "generator": "tools/build_quaternius_models.py from the Quaternius Medieval Village MegaKit (CC0)"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}], "meshes": [{"primitives": prims}], "accessors": accessors, "bufferViews": views,
            "buffers": [{"byteLength": len(blob)}],
            "materials": [{"name": "village_kit", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1}},
                          {"name": "window_glow", "pbrMetallicRoughness": {"baseColorFactor": [*GLOW, 1], "metallicFactor": 0, "roughnessFactor": 1}, "emissiveFactor": list(GLOW)}],
            "textures": [{"source": 0}], "images": [{"bufferView": img, "mimeType": "image/jpeg"}]}
    js = pad4(json.dumps(gltf, separators=(",", ":")).encode(), b" "); blob = pad4(bytes(blob))
    total = 12 + 8 + len(js) + 8 + len(blob)
    return struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + blob


# ---- the houses: same footprint, floor heights, door and chimneys as the original Blender meshes (data/village_shapes.json) ----
W, WS, WR, WN = "Wall_Plaster_Window_Wide_Flat", "Wall_Plaster_Straight", "Wall_Plaster_Window_Wide_Round", "Wall_UnevenBrick_Straight"
GW, GD = "Wall_UnevenBrick_Window_Wide_Round", "Wall_UnevenBrick_Door_Round"


def stoop(b, z_front, width, height, depth):
    """A real kit stair scaled into a doorstep that stays inside the roof's bounding box."""
    b.piece("Stairs_Exterior_Platform", (width / 2, height / 1.0, depth / 2.0), 0, (0, 0.0, z_front + depth / 2))


def balcony(b, y, z, width):
    b.box((-width / 2, y - 0.06, z - 0.22), (width / 2, y + 0.04, z + 0.04), {"side": "wood"}, (1.0, 1.0))
    b.piece("Balcony_Cross_Straight", (width / 2, 1.0, 1.0), 0, (0, y + 0.04, z - 1.0 + 0.04))


def chimney(b, x, z, size, y0, y1):
    b.box((x - size / 2, y0, z - size / 2), (x + size / 2, y1, z + size / 2), {"side": "redbrick"}, (2.0, 2.0))
    b.box((x - size / 2 - 0.1, y1, z - size / 2 - 0.1), (x + size / 2 + 0.1, y1 + 0.15, z + size / 2 + 0.1), {"side": "wood"}, (0.8, 0.8))


def dormer(b, x, z, w, d, y0, y1, rise):
    b.box((x - w / 2, y0, z - d / 2), (x + w / 2, y1, z + d / 2), {"side": "plaster", "top": "plaster"}, (1.0, 1.0), bottom=False)
    b.gable_roof(x, z, w + 0.2, d + 0.4, y1, rise, ridge="z", tile=0.6)
    b.glow_quad((x - w * 0.3, y0 + (y1 - y0) * 0.25, z + d / 2 + 0.02), (x + w * 0.3, y0 + (y1 - y0) * 0.25, z + d / 2 + 0.02), (x + w * 0.3, y1 - 0.2, z + d / 2 + 0.02), (x - w * 0.3, y1 - 0.2, z + d / 2 + 0.02))


def house(folder, spec):
    b = Builder(folder)
    gw, gd, uw, ud = spec["ground"] + spec["upper"]
    b.box((-spec["plinth"][0] / 2, 0, -spec["plinth"][1] / 2), (spec["plinth"][0] / 2, spec["base_h"], spec["plinth"][1] / 2), {"side": "brick", "top": "brick"}, (4.0, 0.5))
    b.walls(gw, gd, spec["base_h"], spec["ground_h"], spec["g_front"], spec["g_side"], spec["g_back"])
    top = spec["base_h"] + spec["ground_h"]
    b.box((-uw / 2, top - 0.15, -ud / 2), (uw / 2, top + 0.1, ud / 2), {"side": "wood", "top": "wood", "bottom": "wood"}, (3.5, 0.5))   # the jetty beam
    b.walls(uw, ud, top + 0.1, spec["upper_h"] - 0.1, spec["u_front"], spec["u_side"], spec["u_back"])
    roof_y = top + spec["upper_h"]
    b.gable_roof(0, 0, uw + 2 * spec["eave"], ud + 2 * spec["eave"], roof_y, spec["rise"])
    if spec.get("stoop", True):
        stoop(b, gd / 2 + 0.09, 1.7, spec["base_h"], 0.4)
    for cx, cz, size, y1 in spec["chimneys"]:
        chimney(b, cx, cz, size, roof_y - 0.3, y1)
    for dx in spec.get("dormers", []):
        dormer(b, dx, ud / 2 - 1.0, 1.4, 0.8, roof_y + 0.3, roof_y + 1.9, 0.5)
    fit = b.finish(spec["lo"], spec["hi"])
    return b, fit


FB, FBW, FP, FPW = "FLAT_BRICK", "FLAT_BRICK_W", "FLAT_PLASTER", "FLAT_PLASTER_W"


def spec_a():
    return {"lo": (-3.6, 0, -3.3), "hi": (3.6, 9.55, 3.3), "ground": (6.2, 5.6), "upper": (6.6, 6.0), "plinth": (6.4, 5.8), "base_h": 0.4, "ground_h": 2.85, "upper_h": 2.85, "eave": 0.3, "rise": 2.8,
            "g_front": [(FBW, 2.07), (GD, 2.06), (FBW, 2.07)], "g_side": [(FBW, 5.6)], "g_back": [(FBW, 6.2)],
            "u_front": [(FPW, 6.6)], "u_side": [(FPW, 6.0)], "u_back": [(FPW, 6.6)],
            "chimneys": [(2.3, -0.4, 0.8, 9.4)]}


def spec_b():
    return {"lo": (-5, 0, -3.3), "hi": (5, 9.6, 3.3), "ground": (9.2, 5.6), "upper": (9.4, 6.0), "plinth": (9.4, 5.8), "base_h": 0.4, "ground_h": 2.85, "upper_h": 2.85, "eave": 0.3, "rise": 3.4,
            "g_front": [(FBW, 3.6), (GD, 2.0), (FBW, 3.6)], "g_side": [(FBW, 5.6)], "g_back": [(FBW, 9.2)],
            "u_front": [(FPW, 3.45), (WR, 2.5), (FPW, 3.45)], "u_side": [(FPW, 6.0)], "u_back": [(FPW, 9.4)],
            "chimneys": [(-3.0, -0.4, 0.8, 9.5), (3.0, -0.4, 0.8, 9.5)], "dormers": [-2.2, 2.2]}


def spec_cottage():
    return {"lo": (-1.9, 0, -1.65), "hi": (1.9, 6.9, 1.65), "ground": (3.38, 2.86), "upper": (3.4, 2.9), "plinth": (3.64, 3.08), "base_h": 0.3, "ground_h": 2.4, "upper_h": 1.8, "eave": 0.2, "rise": 2.0,
            "g_front": [(FB, 0.69), (GD, 2.0), (FB, 0.69)], "g_side": [(FBW, 2.86)], "g_back": [(FBW, 3.38)],
            "u_front": [(FPW, 3.4)], "u_side": [(FPW, 2.9)], "u_back": [(FPW, 3.4)],
            "chimneys": [(1.17, -0.55, 0.5, 6.8)], "stoop": False}


HOUSES = {"house_a": spec_a, "house_b": spec_b, "cottage_tall": spec_cottage}


def preview(builder, jpg_im, path, yaw=0.6, pitch=0.45, size=520):
    """Flat shaded painter's order preview coloured by the mean of each triangle's mosaic texels (a quick look, not the real renderer)."""
    cell = MOSAIC // GRID; px = jpg_im.load()
    cy, sy_, cp, sp = math.cos(yaw), math.sin(yaw), math.cos(pitch), math.sin(pitch)
    def proj(p):
        x, y, z = p[0] * cy - p[2] * sy_, p[1], p[0] * sy_ + p[2] * cy
        return x, y * cp + z * sp, z * cp - y * sp
    tris = [(t, False) for t in builder.tex] + [(t, True) for t in builder.glow]
    allp = [proj(p) for t, g in tris for p in t[:3]]
    mnx, mxx = min(p[0] for p in allp), max(p[0] for p in allp); mny, mxy = min(p[1] for p in allp), max(p[1] for p in allp)
    k = (size - 20) / max(mxx - mnx, mxy - mny)
    out = Image.new("RGB", (size, size), (40, 44, 52)); dr = ImageDraw.Draw(out)
    items = []
    for t, g in tris:
        q = [proj(p) for p in t[:3]]
        a = [q[1][i] - q[0][i] for i in range(3)]; b = [q[2][i] - q[0][i] for i in range(3)]
        nz = a[0] * b[1] - a[1] * b[0]
        if nz < 0:  # screen y is up and the view looks down +z, so facing triangles wind clockwise here
            items.append((sum(p[2] for p in q) / 3, t, g, q, nz))
    for _, t, g, q, nz in sorted(items, key=lambda i: -i[0]):
        if g:
            col = (255, 190, 90)
        else:
            u = sum(uv[0] for uv in t[3:6]) / 3; v = sum(uv[1] for uv in t[3:6]) / 3
            col = px[min(MOSAIC - 1, int(u * MOSAIC)), min(MOSAIC - 1, int(v * MOSAIC))]
        shade = 0.75 + 0.25 * min(1, abs(nz)/(k*k) if False else abs(nz) / (k * k))
        dr.polygon([(10 + (p[0] - mnx) * k, size - 10 - (p[1] - mny) * k) for p in q], fill=tuple(int(c * shade) for c in col))
    out.save(path)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    if "--download" in argv:
        download(args[0] if args else "pack-scratch/q"); return 0
    if not args:
        raise SystemExit(__doc__)
    folder = pieces_dir(args[0])
    global CELLS_DIR
    CELLS_DIR = os.path.join(folder, "..") if os.path.isfile(os.path.join(folder, "..", CELLS["plaster"][2])) else folder
    if not os.path.isfile(os.path.join(CELLS_DIR, CELLS["plaster"][2])):
        CELLS_DIR = folder
    jpg, im = mosaic()
    os.makedirs(OUT, exist_ok=True)
    prev = None
    if "--preview" in argv:
        prev = argv[argv.index("--preview") + 1]; os.makedirs(prev, exist_ok=True)
        args = [a for a in args if a != prev]
    for name, spec in HOUSES.items():
        b, fit = house(folder, spec())
        data = write_glb(b, jpg)
        open(os.path.join(OUT, name + ".glb"), "wb").write(data)
        print(f"{name}.glb: {len(b.tex) + len(b.glow)} triangles ({len(b.glow)} window glass), {len(data)} bytes, natural size {fit}")
        if prev:
            preview(b, im, os.path.join(prev, name + ".png"))
    return 0


CELLS_DIR = ""
if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
