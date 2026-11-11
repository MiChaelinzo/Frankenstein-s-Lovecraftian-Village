#!/usr/bin/env python3
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verification_labels as vl

TABLE = "### Verification status\n\n| Area | Status | Evidence |\n|---|---|---|\n| A | %s | e |\n"


class VerificationLabels(unittest.TestCase):
    def test_allowed_labels_pass(self):
        for label in vl.ALLOWED:
            self.assertEqual(vl.check(TABLE % label), [])

    def test_bad_label_fails(self):
        for bad in ("**Unverified**", "Code-complete", "Verified: tests", "verified"):
            self.assertEqual(len(vl.check(TABLE % bad)), 1, bad)

    def test_missing_section_and_columns_fail(self):
        self.assertTrue(vl.check("# README"))
        self.assertTrue(vl.check("### Verification status\n| Part | Status |\n|--|--|\n| a | Verified |\n"))

    def test_real_readme_passes(self):
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, "README.md"), encoding="utf-8") as f:
            self.assertEqual(vl.check(f.read()), [])


if __name__ == "__main__":
    unittest.main()
