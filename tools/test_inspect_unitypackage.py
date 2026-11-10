import io, json, os, sys, tarfile, tempfile, unittest

sys.path.insert(0, os.path.dirname(__file__))
import inspect_unitypackage as ip


def make_pack(path, files, prefix="", folders=()):
    with tarfile.open(path, "w:gz") as tar:
        for guid in folders:
            for name, data in (("pathname", b"Assets/Pack"), ("asset.meta", b"folderAsset: yes")):
                ti = tarfile.TarInfo(f"{prefix}{guid}/{name}")
                ti.size = len(data)
                tar.addfile(ti, io.BytesIO(data))
        for guid, (pathname, payload) in files.items():
            for name, data in (("asset", payload), ("asset.meta", b"guid: " + guid.encode()), ("pathname", pathname.encode())):
                ti = tarfile.TarInfo(f"{prefix}{guid}/{name}")
                ti.size = len(data)
                tar.addfile(ti, io.BytesIO(data))


class InspectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = os.path.join(self.tmp.name, "t.unitypackage")
        make_pack(self.pack, {
            "a" * 32: ("Assets/Pack/Prefabs/Cottage_01.prefab", b"X" * 10),
            "b" * 32: ("Assets/Pack/Prefabs/ChurchLarge.prefab", b"X"),
            "c" * 32: ("Assets/Pack/Prefabs/Well.prefab", b"X"),
            "d" * 32: ("Assets/Pack/Models/rock.fbx", b"X"),
        })

    def tearDown(self):
        self.tmp.cleanup()

    def test_tokenize_matches_csharp(self):
        self.assertEqual(ip.tokenize("DeadTree_02"), ["dead", "tree"])
        self.assertEqual(ip.tokenize("house_a"), ["house", "a"])

    def test_score(self):
        self.assertEqual(ip.score("well", "Well"), ip.EXACT_SCORE)
        self.assertEqual(ip.score("house_a", "Cottage_01"), ip.ALIAS_SCORE)
        self.assertEqual(ip.score("altar", "Well"), 0)

    def test_cli_writes_inventory_without_payloads(self):
        cat = os.path.join(self.tmp.name, "c.json")
        json.dump({"entries": [{"id": "church"}, {"id": "house_a"}, {"id": "altar"}]}, open(cat, "w"))
        out = os.path.join(self.tmp.name, "sub", "inv.json")
        self.assertEqual(ip.main([self.pack, "--catalog", cat, "--out", out]), 0)
        inv = json.load(open(out))
        self.assertEqual(inv["assetCount"], 4)
        self.assertEqual(inv["extensions"][".prefab"], 3)
        self.assertEqual(len(inv["prefabs"]), 3)
        self.assertEqual(inv["suggestions"]["church"][0]["name"], "ChurchLarge")
        self.assertEqual(inv["suggestions"]["house_a"][0]["guid"], "a" * 32)
        self.assertEqual(inv["suggestions"]["altar"], [])
        self.assertEqual(os.listdir(os.path.dirname(out)), ["inv.json"])


SCENE = b"""%YAML 1.1
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
--- !u!1001 &100
PrefabInstance:
  m_Modification:
    m_Modifications:
    - target: {fileID: 1, guid: 11111111111111111111111111111111, type: 3}
      propertyPath: m_Name
      value: BigHouse00 (3)
      objectReference: {fileID: 0}
  m_SourcePrefab: {fileID: 100100000, guid: 11111111111111111111111111111111, type: 3}
--- !u!1001 &200
PrefabInstance:
  m_Modification:
    m_Modifications:
    - target: {fileID: 1, guid: 22222222222222222222222222222222, type: 3}
      propertyPath: m_LocalPosition.x
      value: 1
      objectReference: {fileID: 0}
  m_SourcePrefab: {fileID: 100100000, guid: 22222222222222222222222222222222, type: 3}
--- !u!1001 &300
PrefabInstance:
  m_Modification:
    m_Modifications:
    - target: {fileID: 1, guid: 11111111111111111111111111111111, type: 3}
      propertyPath: m_Name
      value: BigHouse00 (4)
  m_SourcePrefab: {fileID: 100100000, guid: 11111111111111111111111111111111, type: 3}
"""


class SceneTests(unittest.TestCase):
    def test_scene_references_folders_and_no_meshes(self):
        with tempfile.TemporaryDirectory() as d:
            pack = os.path.join(d, "s.unitypackage")
            make_pack(pack, {
                "e" * 32: ("Assets/_DLNK/Village/Main.unity", SCENE),
                "f" * 32: ("Assets/_DLNK/Village/Lamp.prefab", b"X"),
                "9" * 32: ("Assets/_DLNK/Village/Notes", b"plain"),
            }, prefix="./", folders=["8" * 32])
            entries, scenes = ip.read_package(pack)
            self.assertEqual(sorted(g for g, _, _ in entries), sorted(["e" * 32, "f" * 32, "9" * 32, "8" * 32]))
            self.assertEqual([g for g, _, fo in entries if fo], ["8" * 32])
            cat = os.path.join(d, "c.json")
            json.dump({"entries": [{"id": "house_a"}]}, open(cat, "w"))
            out = os.path.join(d, "out", "inv.json")
            self.assertEqual(ip.main([pack, "--catalog", cat, "--out", out]), 0)
            inv = json.load(open(out))
            refs = {r["guid"]: r for r in inv["referencedPrefabs"]}
            self.assertEqual(len(refs), 2)
            big = refs["1" * 32]
            self.assertEqual((big["name"], big["count"], big["scenes"]), ("BigHouse00", 2, ["Main.unity"]))
            self.assertEqual(refs["2" * 32]["name"], "?")
            self.assertEqual(inv["extensions"]["(folder)"], 1)
            self.assertEqual(inv["extensions"]["(none)"], 1)
            self.assertFalse(inv["summary"]["hasMeshes"])
            self.assertEqual(inv["summary"]["topFolders"], {"Assets/_DLNK/Village": 3})
            top = inv["suggestions"]["house_a"][0]
            self.assertEqual((top["name"], top["source"]), ("BigHouse00", "scene-reference"))
            self.assertEqual(os.listdir(os.path.dirname(out)), ["inv.json"])
            self.assertEqual(sorted(os.listdir(d)), ["c.json", "out", "s.unitypackage"])

    def test_clean_name(self):
        self.assertEqual(ip.clean_name("BigHouse00 (3)"), "BigHouse00")
        self.assertEqual(ip.clean_name("Wall (12)"), "Wall")
        self.assertEqual(ip.clean_name("Tree"), "Tree")


class MatcherPortTests(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import inspect_unitypackage as ip
        self.ip = ip

    def test_single_letter_tokens_do_not_match(self):
        self.assertEqual(self.ip.score("house_b", "CandleHolderWall00b Variant"), 0)
        self.assertEqual(self.ip.score("house_b", "Barrel00b Variant"), 0)
        self.assertEqual(self.ip.score("_Sp_TrunkDead00", "_Sp_TrunkDead00"), self.ip.EXACT_SCORE)
        self.assertGreater(self.ip.score("dead_tree", "_Sp_TrunkDead00"), 0)

    def test_resolve_and_hint_report(self):
        names = ["BigHouse00", "CoastalHouse00", "Barrel00b Variant"]
        self.assertEqual(self.ip.resolve("house_b", "CoastalHouse00", names), "CoastalHouse00")
        self.assertEqual(self.ip.resolve("house_b", "", names), "BigHouse00")
        self.assertIsNone(self.ip.resolve("altar", "Missing", names))
        refs = [{"name": "CoastalHouse00"}]
        rep = self.ip.hint_report({"house_b": "CoastalHouse00", "x": "Nope", "y": ""}, [], refs)
        self.assertEqual(rep["house_b"]["found"], "scene-reference")
        self.assertEqual(rep["x"]["found"], "missing")
        self.assertEqual(rep["y"]["found"], "missing")


class FetchHelperTests(unittest.TestCase):
    def test_share_id_and_verify(self):
        import fetch_pack as fp
        sid = fp.share_id("https://1drv.ms/u/c/x?e=1")
        self.assertTrue(sid.startswith("u!") and "=" not in sid and "+" not in sid and "/" not in sid)
        self.assertEqual(fp.share_id("a"), "u!YQ")
        readme = open(os.path.join(os.path.dirname(__file__), "..", "README.md"), encoding="utf-8").read()
        for url, _ in fp.SHARES.values():
            self.assertIn(url, readme)
        with tempfile.TemporaryDirectory() as d:
            good = os.path.join(d, "g")
            import gzip
            with gzip.open(good, "wb") as f:
                f.write(b"x")
            self.assertEqual(len(fp.verify(good, os.path.getsize(good))), 64)
            with self.assertRaises(ValueError):
                fp.verify(good, 1)
            bad = os.path.join(d, "b")
            open(bad, "wb").write(b"<html>")
            with self.assertRaises(ValueError):
                fp.verify(bad)


if __name__ == "__main__":
    unittest.main()
