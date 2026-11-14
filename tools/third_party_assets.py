"""Checks web/assets/third_party against THIRD_PARTY_ASSETS.md: every file listed in a table row with a CC0 licence, no stale rows, size budgets.

Used by tools/validate_repo.py; tested by tools/test_third_party_assets.py.
"""
import re

PREFIX = "web/assets/third_party/"
MAX_FILE = 5 * 1024 * 1024
MAX_TOTAL = 40 * 1024 * 1024
ALLOWED_EXT = (".glb", ".jpg", ".png")
LICENCE = "CC0 1.0"


def listed(manifest):
    """Maps each backticked third_party path in a markdown table row to that row's licence cell (column 4: name, source, author, licence, files, use)."""
    out = {}
    for line in manifest.splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        for path in re.findall(r"`(" + re.escape(PREFIX) + r"[^`]+)`", line):
            out[path] = cells[3] if len(cells) >= 6 else ""
    return out


def check(files, size_of, manifest):
    """files: repo relative paths under PREFIX; size_of(path) -> bytes; manifest: THIRD_PARTY_ASSETS.md text. Returns error strings."""
    errors, entries, total = [], listed(manifest), 0
    for f in sorted(files):
        size = size_of(f)
        total += size
        if f not in entries:
            errors.append(f"third party file not listed in THIRD_PARTY_ASSETS.md: {f}")
        elif entries[f] != LICENCE:
            errors.append(f"third party file must be {LICENCE} in THIRD_PARTY_ASSETS.md (found '{entries[f]}'): {f}")
        if not f.lower().endswith(ALLOWED_EXT):
            errors.append(f"third party file must be GLB, JPEG or PNG: {f}")
        if size > MAX_FILE:
            errors.append(f"third party file over 5 MB ({size} bytes): {f}")
    if total > MAX_TOTAL:
        errors.append(f"web/assets/third_party is over 40 MB in total ({total} bytes)")
    for f in sorted(set(entries) - set(files)):
        errors.append(f"THIRD_PARTY_ASSETS.md lists a file that is not in the repository: {f}")
    return errors
