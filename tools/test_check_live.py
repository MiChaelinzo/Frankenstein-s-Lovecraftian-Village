#!/usr/bin/env python3
"""Offline tests for tools/check_live.py using a fake fetcher (no network)."""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_live

HTML = {"content-type": "text/html; charset=utf-8"}
GOOD_ROOT = {**HTML, "content-security-policy": "default-src 'self'", "strict-transport-security": "max-age=63072000"}


def make_fetcher(overrides=None):
    table = {
        "/": (200, GOOD_ROOT),
        "/selftest.html": (200, HTML),
        "/meshes.html": (200, HTML),
        "/src/app.js": (200, {"content-type": "text/javascript"}),
        "/data/village_catalog.json": (200, {"content-type": "application/json"}),
        "/sw.js": (200, {"content-type": "application/javascript"}),
        "/assets/meshes/house_a.glb": (200, {"content-type": "model/gltf-binary"}),
        "/local-pack/manifest.json": (404, {}),
    }
    table.update(overrides or {})
    return lambda url: table[url.replace("https://example.test", "")]


class CheckLive(unittest.TestCase):
    def run_check(self, overrides=None):
        return check_live.check("https://example.test/", make_fetcher(overrides))

    def test_all_pass(self):
        results = self.run_check()
        self.assertEqual(len(results), 10)
        self.assertTrue(all(ok for ok, _ in results))

    def test_missing_page_fails(self):
        self.assertFalse(all(ok for ok, _ in self.run_check({"/meshes.html": (404, HTML)})))

    def test_wrong_content_type_fails(self):
        self.assertFalse(all(ok for ok, _ in self.run_check({"/sw.js": (200, {"content-type": "text/html"})})))

    def test_missing_csp_fails(self):
        no_csp = {k: v for k, v in GOOD_ROOT.items() if k != "content-security-policy"}
        self.assertFalse(all(ok for ok, _ in self.run_check({"/": (200, no_csp)})))

    def test_missing_hsts_fails(self):
        no_hsts = {k: v for k, v in GOOD_ROOT.items() if k != "strict-transport-security"}
        self.assertFalse(all(ok for ok, _ in self.run_check({"/": (200, no_hsts)})))

    def test_local_pack_must_be_404(self):
        self.assertFalse(all(ok for ok, _ in self.run_check({"/local-pack/manifest.json": (200, {})})))


if __name__ == "__main__":
    unittest.main()
