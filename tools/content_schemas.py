#!/usr/bin/env python3
"""Validates authored JSON content (quests, rumors, events) under Data/content/.

Errors name the file, the item id and the field: "quests.json: quest 'x': field 'theory': ...".
Used by tools/validate_repo.py; the schemas are documented in docs/CONTENT_SCHEMAS.md.
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "Packages", "com.michaelinzo.frankenstein-village", "Data")
CONTENT = os.path.join(DATA, "content")
ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
EM_DASH = "\u2014"
MIN_NIGHT, MAX_NIGHT = 1, 99
EFFECT_KEYS = ("dread", "sanity")
EFFECT_LIMIT = 100
KINDS = (("quests", "quest"), ("rumors", "rumor"), ("events", "event"))


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def references():
    """Ids that content may point at, read from the real game data."""
    theories = {t["id"] + "." + o["id"] for t in load("theories.json")["templates"] for o in t["options"]}
    return {"theories": theories, "statements": {s["id"] for s in load("statements.json")["statements"]},
            "omens": {o["id"] for o in load("mythos.json")["omens"]}}


def _text(errs, prefix, obj, field):
    """Both languages are required, non empty and free of em dashes."""
    t = obj.get(field) if isinstance(obj, dict) else None
    if not isinstance(t, dict):
        errs.append(f"{prefix}: field '{field}': must be an object with en and fr")
        return
    for lang in ("en", "fr"):
        v = t.get(lang)
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{prefix}: field '{field}.{lang}': missing or empty")
        elif EM_DASH in v:
            errs.append(f"{prefix}: field '{field}.{lang}': contains an em dash")


def _flat_text(errs, prefix, obj, where):
    for lang in ("en", "fr"):
        v = obj.get(lang) if isinstance(obj, dict) else None
        if not isinstance(v, str) or not v.strip():
            errs.append(f"{prefix}: field '{where}.{lang}': missing or empty")
        elif EM_DASH in v:
            errs.append(f"{prefix}: field '{where}.{lang}': contains an em dash")


def _id_list(errs, prefix, item, field, known, required):
    v = item.get(field)
    if not isinstance(v, list) or (required and not v):
        errs.append(f"{prefix}: field '{field}': must be a non empty list of ids")
        return []
    for x in v:
        if x not in known:
            errs.append(f"{prefix}: field '{field}': unknown reference '{x}'")
    return v


def _quest(errs, p, q, refs):
    theory = _id_list(errs, p, q, "theory", refs["theories"], True)
    _id_list(errs, p, q, "evidence", refs["statements"], True)
    concl = q.get("conclusions")
    if not isinstance(concl, list) or not concl:
        errs.append(f"{p}: field 'conclusions': must be a non empty list")
        return
    for i, c in enumerate(concl):
        cp = f"conclusions[{i}]"
        if not isinstance(c, dict) or c.get("theory") not in theory:
            errs.append(f"{p}: field '{cp}.theory': must be one of this quest's theory ids")
        _flat_text(errs, p, c, cp)


def _rumor(errs, p, r, refs):
    if not isinstance(r.get("truth"), bool):
        errs.append(f"{p}: field 'truth': must be true or false")
    m = r.get("mutations")
    if not isinstance(m, list) or not m:
        errs.append(f"{p}: field 'mutations': must be a non empty list")
        return
    for i, x in enumerate(m):
        _flat_text(errs, p, x, f"mutations[{i}]")


def _event(errs, p, e, refs):
    n = e.get("night")
    if not isinstance(n, int) or isinstance(n, bool) or not MIN_NIGHT <= n <= MAX_NIGHT:
        errs.append(f"{p}: field 'night': must be an integer {MIN_NIGHT}..{MAX_NIGHT}")
    if e.get("condition") not in refs["omens"]:
        errs.append(f"{p}: field 'condition': unknown omen '{e.get('condition')}'")
    _text(errs, p, e, "text")
    fx = e.get("effects", {})
    if not isinstance(fx, dict):
        errs.append(f"{p}: field 'effects': must be an object")
        return
    for k, v in fx.items():
        if k not in EFFECT_KEYS:
            errs.append(f"{p}: field 'effects.{k}': unknown effect (allowed: {', '.join(EFFECT_KEYS)})")
        elif not isinstance(v, int) or isinstance(v, bool) or abs(v) > EFFECT_LIMIT:
            errs.append(f"{p}: field 'effects.{k}': must be an integer within +-{EFFECT_LIMIT}")


CHECKS = {"quest": _quest, "rumor": _rumor, "event": _event}


def check_file(name, doc, refs, seen):
    """Returns error strings for one parsed file. `seen` maps kind to ids already used (duplicates are errors)."""
    errs = []
    for key, kind in KINDS:
        if key not in doc:
            continue
        items = doc[key]
        if not isinstance(items, list):
            errs.append(f"{name}: field '{key}': must be a list")
            continue
        for i, item in enumerate(items):
            iid = item.get("id") if isinstance(item, dict) else None
            p = f"{name}: {kind} '{iid}'" if iid else f"{name}: {kind} #{i}"
            if not isinstance(item, dict):
                errs.append(f"{p}: must be an object")
                continue
            if not isinstance(iid, str) or not ID_RE.match(iid):
                errs.append(f"{p}: field 'id': missing or not lowercase snake_case")
            elif iid in seen.setdefault(kind, set()):
                errs.append(f"{p}: field 'id': duplicate id")
            else:
                seen[kind].add(iid)
            CHECKS[kind](errs, p, item, refs)
    return errs


def check_all(content_dir=CONTENT, refs=None):
    if not os.path.isdir(content_dir):
        return []
    refs = refs or references()
    errs, seen = [], {}
    for name in sorted(os.listdir(content_dir)):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(content_dir, name), encoding="utf-8") as f:
                doc = json.load(f)
        except ValueError as ex:
            errs.append(f"{name}: not valid JSON ({ex})")
            continue
        if not isinstance(doc, dict) or doc.get("version") != 1:
            errs.append(f"{name}: field 'version': must be 1")
            continue
        errs.extend(check_file(name, doc, refs, seen))
    return errs


if __name__ == "__main__":
    out = check_all()
    print("\n".join(out) if out else "OK: content schemas")
    raise SystemExit(1 if out else 0)
