#!/usr/bin/env python3
"""Offline tests for tools/build_alien_pack.py. Synthetic fixtures only: no pack data, no Blender."""
import json
import os
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_alien_pack as a  # noqa: E402


def make_glb(gltf):
    j = json.dumps(gltf).encode()
    j += b" " * (-len(j) % 4)
    return struct.pack("<III", 0x46546C67, 2, 20 + len(j)) + struct.pack("<II", len(j), 0x4E4F534A) + j


def synthetic_gltf():
    """Root 0 is a LOD set (two groups), root 1 is a plain object with two parts. Triangle counts: 30, 12, 6, 9, 3."""
    def mesh(tris):
        return {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1 + len(accessors)}]}
    accessors = [{"count": 4, "type": "VEC3"}]
    meshes = []
    for tris in (30, 12, 6, 9, 3):
        accessors.append({"count": tris * 3, "type": "SCALAR"})
        meshes.append({"primitives": [{"attributes": {"POSITION": 0}, "indices": len(accessors) - 1}]})
    nodes = [
        {"name": "lod0_a", "mesh": 0}, {"name": "lod1_a", "mesh": 1},       # 0, 1
        {"name": "set_lod0", "children": [0]}, {"name": "set_lod1", "children": [1]},  # 2, 3
        {"name": "setroot", "children": [2, 3]},                            # 4
        {"name": "part_a", "mesh": 2}, {"name": "part_b", "mesh": 3},       # 5, 6
        {"name": "plainroot", "children": [5, 6]},                          # 7
        {"name": "single", "mesh": 4},                                      # 8
    ]
    return {"asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [4, 7, 8]}], "nodes": nodes, "meshes": meshes, "accessors": accessors,
            "materials": [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}}]}


class AlienPackTests(unittest.TestCase):
    def test_height_cavity_and_other_maps_are_not_albedo(self):
        for name in ("X_heights", "X_cavity", "x_Occlusion", "t_normals", "Noise_nrm", "Skin_translucency", "r_MASK", "Rock_Height"):
            self.assertFalse(a.is_albedo_image(name), name)
        for name in ("X_color", "Alien_color01", "Bark", "", None):
            self.assertTrue(a.is_albedo_image(name), name)

    def test_decimate_ratio(self):
        self.assertEqual(a.decimate_ratio(3000, 4000), 1.0)
        self.assertEqual(a.decimate_ratio(8000, 4000), 0.5)
        self.assertLess(a.decimate_ratio(60000, 4000), 0.07)
        with self.assertRaises(ValueError):
            a.decimate_ratio(10, 0)

    def test_texture_target_size(self):
        self.assertEqual(a.texture_target_size(4096, 4096, 512), (512, 512))
        self.assertEqual(a.texture_target_size(4096, 2048, 1024), (1024, 512))
        self.assertEqual(a.texture_target_size(256, 256, 512), (256, 256))  # never upscales
        self.assertEqual(a.texture_target_size(3000, 3000, 1024), (1024, 1024))
        for bad in (256, 2048):
            with self.assertRaises(ValueError):
                a.texture_target_size(100, 100, bad)

    def test_excluded_and_unknown_sources_are_refused(self):
        for stem in ("AMinerals", "CharIco", "Terrain2"):
            with self.assertRaises(ValueError):
                a.check_source_allowed(stem)
        for stem, _ in a.KIND_SOURCES.values():
            a.check_source_allowed(stem)
        self.assertFalse(a.EXCLUDED_SOURCES & {s for s, _ in a.KIND_SOURCES.values()})

    def test_kinds_are_the_core_corruption_kinds(self):
        self.assertEqual(set(a.KIND_SOURCES), {"tentacle_tree", "tentacle_sapling", "fungus_tall", "fungus_cluster", "fungus_shelf", "spire_horn", "spire_ribbed"})

    def test_lod_set_keeps_only_first_group(self):
        g = synthetic_gltf()
        self.assertEqual(a.select_nodes(g, 0), ["setroot", "set_lod0", "lod0_a"])
        self.assertEqual(a.selected_triangles(g, 0), 30)

    def test_plain_root_keeps_every_part(self):
        g = synthetic_gltf()
        self.assertEqual(a.select_nodes(g, 1), ["plainroot", "part_a", "part_b"])
        self.assertEqual(a.selected_triangles(g, 1), 15)
        self.assertEqual(a.select_nodes(g, 2), ["single"])

    def test_alpha_cards_are_dropped(self):
        g = synthetic_gltf()
        g["nodes"][6]["name"] = "Plane004"
        self.assertEqual(a.select_nodes(g, 1), ["plainroot", "part_a"])
        self.assertEqual(a.selected_triangles(g, 1), 6)

    def test_missing_root_is_an_error(self):
        with self.assertRaises(ValueError):
            a.select_nodes(synthetic_gltf(), 3)

    def test_glb_reader_and_summary(self):
        data = make_glb(synthetic_gltf())
        self.assertEqual(a.read_glb_json(data)["scene"], 0)
        with self.assertRaises(ValueError):
            a.read_glb_json(b"not a glb at all, just text bytes")
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "m.glb")
            open(p, "wb").write(data)
            s = a.output_summary(p)
        self.assertEqual((s["triangles"], s["materials"], s["textured"]), (60, 1, True))

    def test_tint_sets_factor_only_on_textured_materials_without_one(self):
        g = synthetic_gltf()
        g["materials"] = [{"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}}},
                          {"pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "baseColorFactor": [1, 0, 0, 1]}},
                          {"pbrMetallicRoughness": {"baseColorFactor": [0, 1, 0, 1]}}]
        data = make_glb(g) + b""  # no BIN chunk needed: the rest after JSON is copied through
        out = a.tint_glb(data, [0.1, 0.2, 0.3])
        m = a.read_glb_json(out)["materials"]
        self.assertEqual(m[0]["pbrMetallicRoughness"]["baseColorFactor"], [0.1, 0.2, 0.3, 1.0])
        self.assertEqual(m[1]["pbrMetallicRoughness"]["baseColorFactor"], [1, 0, 0, 1])
        self.assertEqual(m[2]["pbrMetallicRoughness"]["baseColorFactor"], [0, 1, 0, 1])
        self.assertEqual(struct.unpack("<I", out[8:12])[0], len(out))
        self.assertEqual(len(out) % 4, 0)

    def test_manifest_has_only_kinds_and_generic_files(self):
        models = {"tentacle_tree": {"file": "tentacle_tree.glb", "triangles": 3200, "textured": True, "bytes": 90000}}
        m = a.build_manifest(models, 4000, 512)
        self.assertEqual(m["version"], 1)
        self.assertEqual(m["models"], models)
        with self.assertRaises(ValueError):
            a.build_manifest({"ATrees00": {"file": "x.glb"}}, 4000, 512)
        with self.assertRaises(ValueError):
            a.build_manifest({"spire_horn": {"file": "../x.glb"}}, 4000, 512)

    def test_refuses_output_that_is_not_git_ignored(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(SystemExit):
                a.main(["--src", d, "--blender", "none", "--out", d])
            self.assertEqual(os.listdir(d), [])  # nothing was written

    def test_default_output_is_git_ignored(self):
        self.assertTrue(a.require_ignored(a.DEFAULT_OUT) is None)


if __name__ == "__main__":
    unittest.main()
