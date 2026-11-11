#!/usr/bin/env python3
"""Checks that the README verification table uses only the three allowed Status labels."""
import re

ALLOWED = ("Verified", "Partially Verified", "Unverified")
HEADING = "### Verification status"


def check(readme_text):
    """Return a list of error strings for the README verification table."""
    if HEADING not in readme_text:
        return [f"README is missing the '{HEADING}' section"]
    section = readme_text.split(HEADING, 1)[1].split("\n#", 1)[0]
    rows = [ln for ln in section.splitlines() if ln.startswith("|")]
    if len(rows) < 3:
        return ["README verification table has no data rows"]
    header = [c.strip() for c in rows[0].strip().strip("|").split("|")]
    if header != ["Area", "Status", "Evidence"]:
        return [f"README verification table columns must be Area | Status | Evidence, got {header}"]
    errors = []
    for row in rows[2:]:
        cells = [c.strip() for c in re.split(r"(?<!\\)\|", row.strip().strip("|"))]
        if len(cells) != 3:
            errors.append(f"README verification row does not have 3 cells: {row[:60]}")
        elif cells[1] not in ALLOWED:
            errors.append(f"README verification status '{cells[1]}' must be one of {ALLOWED}: {cells[0][:50]}")
    return errors
