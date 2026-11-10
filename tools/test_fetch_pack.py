#!/usr/bin/env python3
"""Offline tests for the fetch_pack hash comparison."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_pack as fp

H = "a" * 64


class CheckHash(unittest.TestCase):
    def test_match_and_case(self):
        self.assertIsNone(fp.check_hash(H, H))
        self.assertIsNone(fp.check_hash(H, H.upper()))

    def test_no_expectation(self):
        self.assertIsNone(fp.check_hash(H, None))
        self.assertIsNone(fp.check_hash(H, ""))

    def test_mismatch_message(self):
        msg = fp.check_hash(H, "b" * 64)
        self.assertIn("mismatch", msg)
        self.assertIn("b" * 64, msg)
        self.assertIn(H, msg)

    def test_malformed(self):
        self.assertIn("64 hex", fp.check_hash(H, "xyz"))

    def test_pins_are_valid(self):
        self.assertEqual(set(fp.PINNED_SHA256), set(fp.SHARES))
        for v in fp.PINNED_SHA256.values():
            self.assertIsNone(fp.check_hash(v, v))


if __name__ == "__main__":
    unittest.main()
