"""Tests for the pure helpers in tools/blender (no Blender needed)."""
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "blender"))
import mesh_defs  # noqa: E402


class MeshDefs(unittest.TestCase):
    def test_all_kinds_valid_and_nontrivial(self):
        for k in mesh_defs.KINDS:
            parts = mesh_defs.build(k)
            self.assertEqual(mesh_defs.validate(parts), [], k)
            self.assertGreaterEqual(mesh_defs.stats(parts)["tris"], 30, k)

    def test_catalog_ids_covered(self):
        import json
        with open(os.path.join(ROOT, "Packages", "com.michaelinzo.frankenstein-village", "Data", "village_catalog.json")) as fh:
            cat = json.load(fh)
        for e in cat["entries"]:
            self.assertIn(e["id"], mesh_defs.KINDS)

    def test_round16_props(self):
        for k in ("boat", "dock", "fence", "cliff_rock", "lamp_tall", "lamp_double"):
            self.assertIn(k, mesh_defs.KINDS)
            self.assertIn(k, mesh_defs.PROP_KINDS)
            self.assertLess(mesh_defs.stats(mesh_defs.build(k))["tris"], 400, k)
        self.assertEqual(len(mesh_defs.KINDS), len(set(mesh_defs.KINDS)))
        self.assertEqual(mesh_defs.KINDS[:7], mesh_defs.CATALOG_KINDS)

    def test_shape_data_file(self):
        data = mesh_defs.load_shapes()
        self.assertEqual(mesh_defs.validate_shapes(data), [])
        self.assertEqual(len(mesh_defs.KINDS), 25)
        self.assertEqual(mesh_defs.KINDS, mesh_defs.CATALOG_KINDS + mesh_defs.PROP_KINDS + mesh_defs.VILLAGE_KINDS)
        for k in ("cottage_thatch", "cottage_tall", "inn", "chapel", "lighthouse", "market_stall", "crate_stack", "barrel",
                  "gravestone", "gravestone_cross", "fence_iron", "villager"):
            self.assertIn(k, mesh_defs.VILLAGE_KINDS)
            self.assertLess(mesh_defs.stats(mesh_defs.build(k))["tris"], 400, k)
        self.assertTrue(any(p["material"] == "glow" for p in mesh_defs.SPECS["villager"]["parts"]))
        with open(os.path.join(ROOT, "web", "data", "village_shapes.json"), "rb") as web, open(mesh_defs.SHAPES_PATH, "rb") as pkg:
            self.assertEqual(web.read(), pkg.read())

    def test_validate_shapes_reports_problems(self):
        bad = {"palette": {"a": [1, 1, 1, 1]}, "meshes": [
            {"id": "x", "group": "oops", "parts": [{"name": "p", "shape": "torus", "material": "gold", "at": [0, 0, 0]}, {"name": "p", "shape": "cone", "material": "a", "sides": 2}]},
            {"id": "x", "group": "prop", "parts": []}]}
        errs = "; ".join(mesh_defs.validate_shapes(bad))
        for needle in ("duplicate mesh id", "bad group", "unknown shape", "unknown material gold", "duplicate part name", "fewer than 3 sides"):
            self.assertIn(needle, errs)

    def test_yaw_and_shear_move_geometry(self):
        base = {"name": "b", "material": "wood", "shape": "box", "at": [0, 0, 0], "size": [2, 1, 1]}
        v0 = mesh_defs.shape_geometry(base)[0]
        v1 = mesh_defs.shape_geometry(dict(base, yaw=90))[0]
        self.assertNotEqual(v0, v1)
        self.assertAlmostEqual(max(x for x, _, _ in v1), 0.5, places=6)
        sheared = mesh_defs.shape_geometry(dict(base, shear={"dx": 1.0, "from": 0.0, "height": 1.0}))[0]
        self.assertAlmostEqual(max(x for x, _, _ in sheared), 2.0, places=6)

    def test_deterministic(self):
        for k in mesh_defs.KINDS:
            self.assertEqual(mesh_defs.build(k), mesh_defs.build(k))

    def test_unknown_kind(self):
        with self.assertRaises(KeyError):
            mesh_defs.build("nope")

    def test_parse_args(self):
        a = mesh_defs.parse_args(["blender", "-b", "--python", "x.py", "--", "--out", "o", "--kinds", "well,lamp"])
        self.assertEqual(a, {"out": "o", "kinds": ["well", "lamp"]})
        self.assertEqual(mesh_defs.parse_args(["x"])["kinds"], list(mesh_defs.KINDS))
        with self.assertRaises(SystemExit):
            mesh_defs.parse_args(["--", "--kinds", "bogus"])
        with self.assertRaises(SystemExit):
            mesh_defs.parse_args(["--", "--wat"])

    def test_pack_out_allowed(self):
        ok = mesh_defs.pack_out_allowed
        self.assertTrue(ok(os.path.join(ROOT, "pack-scratch", "x"), ROOT))
        self.assertTrue(ok(os.path.join(ROOT, "web", "local-pack", "m"), ROOT))
        self.assertFalse(ok(os.path.join(ROOT, "web", "assets"), ROOT))
        self.assertFalse(ok(os.path.join(ROOT, "pack-scratch", "..", "docs"), ROOT))
        self.assertFalse(ok("/tmp/x", ROOT))


if __name__ == "__main__":
    unittest.main()
