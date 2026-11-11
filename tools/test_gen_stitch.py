#!/usr/bin/env python3
import json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_stitch


class StitchData(unittest.TestCase):
    def test_committed_file_is_current(self):
        cur = open(os.path.join(gen_stitch.ROOT, gen_stitch.OUT), encoding="utf-8").read()
        self.assertEqual(cur, gen_stitch.render(gen_stitch.build()))

    def test_real_facts(self):
        p = gen_stitch.build()["parts"]
        self.assertGreater(p["core"]["count"], 10)
        self.assertGreater(p["golden"]["vectors"], 100)
        self.assertGreater(p["js"]["count"], 20)
        self.assertGreater(p["pwa"]["count"], 20)
        self.assertGreaterEqual(p["kiro"]["tasksTotal"], p["kiro"]["tasksDone"])
        self.assertEqual(p["audio"]["count"], 1)

    def test_deterministic(self):
        self.assertEqual(gen_stitch.render(gen_stitch.build()), gen_stitch.render(gen_stitch.build()))

    def test_empty_repo_does_not_crash(self):
        with tempfile.TemporaryDirectory() as d:
            p = gen_stitch.build(d)["parts"]
            self.assertEqual(p["core"]["count"], 0)
            self.assertEqual(p["kiro"]["tasksTotal"], 0)
            json.loads(gen_stitch.render(gen_stitch.build(d)))


if __name__ == "__main__":
    unittest.main()
