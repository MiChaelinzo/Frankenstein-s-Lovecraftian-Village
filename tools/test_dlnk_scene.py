#!/usr/bin/env python3
"""Tests for tools/dlnk_scene.py. Fixtures are synthetic YAML written for this test; no pack content."""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dlnk_scene as d  # noqa: E402

G1, G2 = "1" * 32, "2" * 32


def instance(fid, guid, parent, body):
    return (f"--- !u!1001 &{fid}\nPrefabInstance:\n  m_ObjectHideFlags: 0\n  m_Modification:\n    m_TransformParent: {{fileID: {parent}}}\n"
            f"    m_Modifications:\n{body}    m_RemovedComponents: []\n  m_SourcePrefab: {{fileID: 100100000, guid: {guid}, type: 3}}\n")


def prop_lines(fid, guid, items):
    return "".join(f"    - target: {{fileID: {fid}, guid: {guid}, type: 3}}\n      propertyPath: {k}\n      value: {v}\n      objectReference: {{fileID: 0}}\n" for k, v in items)


class SceneTests(unittest.TestCase):
    def test_modifications_parse(self):
        body = prop_lines(7, G1, [("m_Name", "BigHouse00 (3)"), ("m_LocalPosition.x", 4.5), ("m_LocalPosition.y", 1), ("m_LocalPosition.z", -2),
                                  ("m_LocalScale.x", 2), ("m_LocalRotation.y", 1), ("m_LocalRotation.w", 0)])
        objs = d.parse_scene(instance(10, G1, 0, body))
        self.assertEqual(len(objs), 1)
        o = objs[0]
        self.assertEqual(o["name"], "BigHouse00")
        self.assertEqual((o["x"], o["y"], o["z"], o["scale"]), (4.5, 1.0, -2.0, 2.0))
        self.assertAlmostEqual(o["rotY"], 180.0, 1)

    def test_missing_fields_default(self):
        body = prop_lines(7, G1, [("m_Name", "Well00")])
        o = d.parse_scene(instance(10, G1, 0, body))[0]
        self.assertEqual((o["x"], o["y"], o["z"], o["rotY"], o["scale"]), (0.0, 0.0, 0.0, 0.0, 1.0))

    def test_quaternion_to_yaw(self):
        s = math.sin(math.radians(45))
        self.assertAlmostEqual(d.yaw_degrees(0, s, 0, math.cos(math.radians(45))), 90.0, 1)
        self.assertEqual(d.yaw_degrees(0, 0, 0, 1), 0.0)
        self.assertEqual(d.yaw_degrees(0, 0, 0, 0), 0.0)

    def test_unknown_guid_and_name_from_table(self):
        text = instance(10, G1, 0, prop_lines(7, G1, [("m_LocalPosition.x", 1)])) + instance(11, G2, 0, prop_lines(8, G2, [("m_LocalPosition.x", 2)]))
        objs = d.parse_scene(text, {G2: "Church01"})
        self.assertEqual([o["name"] for o in objs], ["?", "Church01"])
        lay = d.build_layout(objs)
        self.assertEqual([o["kind"] for o in lay["objects"]], ["generic", "church"])
        self.assertEqual(lay["objects"][0]["name"], "Unknown")

    def test_parent_composition(self):
        parent = instance(10, G1, 0, prop_lines(7, G1, [("m_Name", "Parent"), ("m_LocalPosition.x", 10), ("m_LocalRotation.y", 1), ("m_LocalRotation.w", 0)]))
        stripped = "--- !u!4 &55 stripped\nTransform:\n  m_PrefabInstance: {fileID: 10}\n"
        child = instance(11, G2, 55, prop_lines(8, G2, [("m_Name", "Lamp00"), ("m_LocalPosition.x", 1)]))
        objs = {o["name"]: o for o in d.parse_scene(parent + stripped + child)}
        self.assertAlmostEqual(objs["Lamp00"]["x"], 9.0, 3)  # parent turned 180 degrees
        self.assertAlmostEqual(objs["Lamp00"]["rotY"], 180.0, 1)

    def test_regular_gameobject_with_renderer(self):
        text = ("--- !u!1 &100\nGameObject:\n  m_Name: Altar00\n"
                "--- !u!23 &101\nMeshRenderer:\n  m_GameObject: {fileID: 100}\n"
                "--- !u!4 &102\nTransform:\n  m_GameObject: {fileID: 100}\n  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}\n"
                "  m_LocalPosition: {x: 3, y: 0, z: 5}\n  m_LocalScale: {x: 1.5, y: 1.5, z: 1.5}\n  m_Father: {fileID: 0}\n"
                "--- !u!1 &200\nGameObject:\n  m_Name: Empty\n--- !u!4 &202\nTransform:\n  m_GameObject: {fileID: 200}\n  m_Father: {fileID: 0}\n")
        objs = d.parse_scene(text)
        self.assertEqual([o["name"] for o in objs], ["Altar00"])
        self.assertEqual((objs[0]["x"], objs[0]["z"], objs[0]["scale"]), (3.0, 5.0, 1.5))

    def test_classification(self):
        for name, kind in [("Church00", "church"), ("OldWell", "well"), ("Altar_Stone", "altar"), ("CandleHolder03", "lamp"), ("Lantern", "lamp"),
                           ("DeadTree02", "dead_tree"), ("ETP_Tree_3_01", "tree"), ("Boat00", "boat"), ("Rock_Small03b", "rock"),
                           ("FenceWood", "fence"), ("Barrel00", "generic"), ("_Sp_ETP_Plants_05b Variant", "plant"), ("Wall04_Window01c", "part")]:
            self.assertEqual(d.classify(name), kind, name)
        self.assertIn(d.classify("BigHouse00"), ("house_a", "house_b"))
        self.assertEqual(d.classify("BigHouse00"), d.classify("BigHouse00"))

    def test_bounds_cap_and_nonfinite(self):
        raw = [{"name": "Rock%d" % i, "x": float(i), "y": 0.0, "z": -float(i), "rotY": 0.0, "scale": 1.0} for i in range(50)]
        raw.append({"name": "Bad", "x": float("nan"), "y": 0, "z": 0, "rotY": 0, "scale": 1})
        lay = d.build_layout(raw, max_objects=10)
        self.assertEqual((lay["count"], lay["total"]), (10, 50))
        self.assertEqual(lay["bounds"]["minX"], 0.0)
        self.assertLessEqual(lay["bounds"]["maxX"], 49.0)
        self.assertEqual(d.build_layout([])["bounds"], {"minX": 0, "maxX": 0, "minZ": 0, "maxZ": 0})
        self.assertEqual(d.build_layout(raw, 10), d.build_layout(raw, 10))

    def test_slug(self):
        self.assertEqual(d.scene_slug("Assets/Scenes/Demo Scene_01.unity"), "demo-scene-01")


if __name__ == "__main__":
    unittest.main()
