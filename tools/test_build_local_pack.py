#!/usr/bin/env python3
"""Tests for the pure parts of tools/build_local_pack.py using synthetic data only."""
import io
import json
import os
import struct
import sys
import tarfile
import tempfile
import unittest
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_local_pack as b  # noqa: E402


def make_png(w, h, ctype, pixel, filters):
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    rows = [bytes(pixel(x, y, c) & 255 for x in range(w) for c in range(bpp)) for y in range(h)]
    raw = bytearray()
    prev = bytes(w * bpp)
    for y, row in enumerate(rows):
        ft = filters[y % len(filters)]
        raw.append(ft)
        for i in range(len(row)):
            a = row[i - bpp] if i >= bpp else 0
            up = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 0:
                pr = 0
            elif ft == 1:
                pr = a
            elif ft == 2:
                pr = up
            elif ft == 3:
                pr = (a + up) >> 1
            else:
                p = a + up - c
                pa, pb, pc = abs(p - a), abs(p - up), abs(p - c)
                pr = a if pa <= pb and pa <= pc else up if pb <= pc else c
            raw.append((row[i] - pr) & 255)
        prev = row

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ctype, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw))) + chunk(b"IEND", b"")
    return png, rows


class PngTests(unittest.TestCase):
    def test_decode_all_filters_rgba(self):
        px = lambda x, y, c: x * 7 + y * 13 + c * 29  # noqa: E731
        png, rows = make_png(8, 10, 6, px, [0, 1, 2, 3, 4])
        for ch in range(4):
            w, h, got = b.decode_png_channel(png, ch)
            self.assertEqual((w, h), (8, 10))
            self.assertEqual(got, [r[ch::4] for r in rows])

    def test_decode_gray(self):
        png, rows = make_png(6, 5, 0, lambda x, y, c: x * 40 + y, [4, 1])
        self.assertEqual(b.decode_png_channel(png, 0)[2], rows)

    def test_rejects_unsupported(self):
        with self.assertRaises(ValueError):
            b.decode_png_channel(b"nope", 0)

    def test_downscale_average(self):
        rows = [bytes([0, 100, 200, 100]), bytes([100, 0, 100, 200]), bytes([40] * 4), bytes([40] * 4)]
        w, h, out = b.downscale_gray(4, 4, rows, 2)
        self.assertEqual((w, h), (2, 2))
        self.assertEqual(out, [bytes([50, 150]), bytes([40, 40])])

    def test_encode_roundtrip(self):
        rows = [bytes([1, 2, 3]), bytes([4, 5, 6])]
        self.assertEqual(b.decode_png_channel(b.encode_gray_png(3, 2, rows), 0)[2], rows)


class MaterialTests(unittest.TestCase):
    def test_tint_prefers_basecolor(self):
        y = "  m_Colors:\n    - _BaseColorMap_MipInfo: {r: 0, g: 0, b: 0, a: 0}\n    - _Color: {r: 1, g: 0, b: 0, a: 1}\n    - _BaseColor: {r: 0.5, g: 1, b: 0, a: 1}\n"
        self.assertEqual(b.parse_tint(y), [128, 255, 0])

    def test_tint_falls_back_and_none(self):
        self.assertEqual(b.parse_tint("- _Color: {r: 0, g: 0.2, b: 1, a: 1}"), [0, 51, 255])
        self.assertIsNone(b.parse_tint("nothing here"))


class MaterialTests(unittest.TestCase):
    HDRP = ("  m_Floats:\n    - _Metallic: 0.25\n    - _Smoothness: 0.4\n  m_Colors:\n    - _BaseColor: {r: 1, g: 0.5, b: 0, a: 1}\n"
            "  m_TexEnvs:\n    - _MaskMap:\n        m_Texture: {fileID: 2800000, guid: 0123456789abcdef0123456789abcdef, type: 3}\n"
            "    - _NormalMap:\n        m_Texture: {fileID: 0}\n")
    URP = "  m_Floats:\n    - _Glossiness: 0.7\n  m_Colors:\n    - _Color: {r: 0, g: 1, b: 0, a: 1}\n"

    def test_hdrp_properties(self):
        m = b.parse_material(self.HDRP)
        self.assertEqual((m["tint"], m["smoothness"], m["metallic"], m["slots"]), ([255, 128, 0], 0.4, 0.25, ["_MaskMap"]))

    def test_urp_names_and_empty(self):
        m = b.parse_material(self.URP)
        self.assertEqual((m["tint"], m["smoothness"], m["metallic"]), ([0, 255, 0], 0.7, None))
        self.assertEqual(b.parse_material("nothing"), {"tint": None, "smoothness": None, "metallic": None, "slots": []})

    def test_scene_layout_from_synthetic_package(self):
        scene = ("%YAML 1.1\n--- !u!29 &1\nOcclusionCullingSettings:\n  m_ObjectHideFlags: 0\n" + "# pad\n" * 400 +
                 "--- !u!1001 &5\nPrefabInstance:\n  m_Modification:\n    m_TransformParent: {fileID: 0}\n    m_Modifications:\n"
                 "    - target: {fileID: 9, guid: " + "a" * 32 + ", type: 3}\n      propertyPath: m_LocalPosition.x\n      value: 3\n      objectReference: {fileID: 0}\n"
                 "    m_SourcePrefab: {fileID: 100100000, guid: " + "a" * 32 + ", type: 3}\n")
        with tempfile.TemporaryDirectory() as d:
            pkg = os.path.join(d, "t.unitypackage")
            with tarfile.open(pkg, "w:gz") as t:
                for guid, path, data in [("s1", "Assets/Scenes/Demo One.unity", scene.encode()), ("p1", "Assets/P/Church00.prefab", b"x")]:
                    for name, body in [("pathname", path.encode()), ("asset", data)]:
                        ti = tarfile.TarInfo(f"{guid}/{name}")
                        ti.size = len(body)
                        t.addfile(ti, io.BytesIO(body))
            lay = b.build_scene_layout(pkg)
            self.assertEqual(list(lay["scenes"]), ["demo-one"])
            self.assertEqual(lay["scenes"]["demo-one"]["total"], 1)
            self.assertEqual(lay["scenes"]["demo-one"]["objects"][0]["x"], 3.0)


class PackageTests(unittest.TestCase):
    def test_read_selected_and_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            pkg = os.path.join(d, "t.unitypackage")
            png, _ = make_png(4, 4, 6, lambda x, y, c: 50, [0])
            with tarfile.open(pkg, "w:gz") as t:
                for guid, path, data in [("g1", "a/tex.png", png), ("g2", "a/other.png", b"zzz")]:
                    for name, body in [("pathname", path.encode()), ("asset", data)]:
                        ti = tarfile.TarInfo(f"{guid}/{name}")
                        ti.size = len(body)
                        t.addfile(ti, io.BytesIO(body))
            got = b.read_selected(pkg, ["a/tex.png"])
            self.assertEqual(list(got), ["a/tex.png"])
            m = b.build_manifest("t.unitypackage", b.sha_prefix(pkg), {"roof": {"texture": "textures/roof.png", "tint": [1, 2, 3]}}, {"house_a": "X"}, {})
            self.assertEqual(sorted(m), ["prefabHints", "roles", "sceneStats", "source", "version"])
            self.assertEqual(len(m["source"]["sha256Prefix"]), 12)
            json.dumps(m)

    def test_refuses_unignored_output(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(b.is_git_ignored(d))
            with self.assertRaises(SystemExit):
                b.require_ignored(d)

    def test_default_output_is_ignored(self):
        self.assertTrue(b.is_git_ignored(b.DEFAULT_OUT))


if __name__ == "__main__":
    unittest.main()
