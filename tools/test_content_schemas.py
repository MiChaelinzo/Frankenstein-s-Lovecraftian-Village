#!/usr/bin/env python3
"""Good and bad authored content files against tools/content_schemas.py."""
import copy, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content_schemas as cs

REFS = {"theories": {"missing.dead"}, "statements": {"s1"}, "omens": {"black_tide"}}
QUEST = {"id": "q_one", "theory": ["missing.dead"], "evidence": ["s1"],
         "conclusions": [{"theory": "missing.dead", "en": "a", "fr": "b"}]}
RUMOR = {"id": "r_one", "truth": False, "mutations": [{"en": "a", "fr": "b"}]}
EVENT = {"id": "e_one", "night": 25, "condition": "black_tide", "text": {"en": "a", "fr": "b"}, "effects": {"dread": 5}}


def run(**docs):
    doc = {"version": 1}
    doc.update(docs)
    return cs.check_file("t.json", doc, REFS, {})


class ContentSchemas(unittest.TestCase):
    def test_shipped_content_is_valid(self):
        self.assertEqual(cs.check_all(), [])

    def test_good_items_pass(self):
        self.assertEqual(run(quests=[QUEST], rumors=[RUMOR], events=[EVENT]), [])

    def expect(self, errs, *parts):
        self.assertTrue(any(all(p in e for p in parts) for e in errs), (parts, errs))

    def test_missing_id(self):
        e = copy.deepcopy(EVENT); del e["id"]
        self.expect(run(events=[e]), "t.json", "field 'id'")

    def test_duplicate_id(self):
        self.expect(run(rumors=[RUMOR, RUMOR]), "rumor 'r_one'", "duplicate id")

    def test_unknown_reference(self):
        q = copy.deepcopy(QUEST); q["evidence"] = ["nope"]
        self.expect(run(quests=[q]), "quest 'q_one'", "field 'evidence'", "'nope'")
        e = copy.deepcopy(EVENT); e["condition"] = "nope"
        self.expect(run(events=[e]), "event 'e_one'", "field 'condition'")

    def test_night_out_of_range(self):
        for n in (0, 100, "5", True):
            e = copy.deepcopy(EVENT); e["night"] = n
            self.expect(run(events=[e]), "field 'night'")

    def test_missing_fr_text(self):
        e = copy.deepcopy(EVENT); del e["text"]["fr"]
        self.expect(run(events=[e]), "field 'text.fr'")
        r = copy.deepcopy(RUMOR); r["mutations"][0]["fr"] = " "
        self.expect(run(rumors=[r]), "field 'mutations[0].fr'")

    def test_em_dash_in_text(self):
        e = copy.deepcopy(EVENT); e["text"]["en"] = "a \u2014 b"
        self.expect(run(events=[e]), "field 'text.en'", "em dash")

    def test_other_bad_shapes(self):
        r = copy.deepcopy(RUMOR); r["truth"] = "yes"
        self.expect(run(rumors=[r]), "field 'truth'")
        e = copy.deepcopy(EVENT); e["effects"] = {"gold": 1}
        self.expect(run(events=[e]), "field 'effects.gold'")
        q = copy.deepcopy(QUEST); q["conclusions"][0]["theory"] = "other"
        self.expect(run(quests=[q]), "field 'conclusions[0].theory'")


if __name__ == "__main__":
    unittest.main()
