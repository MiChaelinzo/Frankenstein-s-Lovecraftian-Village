#!/usr/bin/env python3
"""The security headers must be identical across netlify.toml, vercel.json and web/_headers."""
import json, os, re, sys, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED = {"x-content-type-options", "referrer-policy", "permissions-policy", "content-security-policy"}


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def parse_netlify(text):
    """Headers of the first `for = "/*"` block."""
    block = text.split("[[headers]]")[1]
    return {k.lower(): v for k, v in re.findall(r'^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$', block, re.M) if k.lower() != "for"}


def parse_vercel(text):
    for rule in json.loads(text)["headers"]:
        if rule["source"] == "/(.*)":
            return {h["key"].lower(): h["value"] for h in rule["headers"]}
    raise AssertionError("no catch-all rule in vercel.json")


def parse_headers_file(text):
    out = {}
    for line in text.splitlines():
        if line.startswith("/") and out:
            break
        m = re.match(r"^\s+([A-Za-z-]+):\s*(.*)$", line)
        if m:
            out[m.group(1).lower()] = m.group(2).strip()
    return out


class HeaderParity(unittest.TestCase):
    def setUp(self):
        self.n = parse_netlify(read("netlify.toml"))
        self.v = parse_vercel(read("vercel.json"))
        self.h = parse_headers_file(read("web/_headers"))

    def test_required_present(self):
        for name, d in (("netlify", self.n), ("vercel", self.v), ("_headers", self.h)):
            self.assertTrue(REQUIRED <= set(d), f"{name} missing {REQUIRED - set(d)}")

    def test_identical(self):
        for k in sorted(REQUIRED):
            self.assertEqual(self.n[k], self.v[k], f"netlify vs vercel differ for {k}")
            self.assertEqual(self.n[k], self.h[k], f"netlify vs _headers differ for {k}")

    def test_parser_detects_drift(self):
        self.assertNotEqual(parse_headers_file("/*\n  A-B: 1\n")["a-b"], "2")


if __name__ == "__main__":
    unittest.main()
