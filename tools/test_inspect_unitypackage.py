import io, json, os, sys, tarfile, tempfile, unittest

sys.path.insert(0, os.path.dirname(__file__))
import inspect_unitypackage as ip


def make_pack(path, files):
    with tarfile.open(path, "w:gz") as tar:
        for guid, (pathname, payload) in files.items():
            for name, data in (("pathname", pathname.encode()), ("asset", payload), ("asset.meta", b"guid: " + guid.encode())):
                ti = tarfile.TarInfo(f"{guid}/{name}")
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


if __name__ == "__main__":
    unittest.main()
