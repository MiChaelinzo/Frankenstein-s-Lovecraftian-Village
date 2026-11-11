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
