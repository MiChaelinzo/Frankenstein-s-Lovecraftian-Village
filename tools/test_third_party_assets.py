#!/usr/bin/env python3
"""Third party asset rules: an unlisted, non-CC0, oversized or wrongly typed file fails; stale rows fail; the committed set passes."""
import os, subprocess, sys

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
sys.path.insert(0, os.path.join(root, "tools"))
import third_party_assets as tpa

ROW = "| Barrel 03 | https://polyhaven.com/a/barrel_03 | Serhii Khromov | {lic} | `web/assets/third_party/models/barrel.glb` | barrels |"
manifest = "# T\n\n| Name | Source | Author | Licence | Files | Used for |\n|---|---|---|---|---|---|\n" + ROW.format(lic="CC0 1.0") + "\n"
small = lambda f: 1000

assert tpa.check(["web/assets/third_party/models/barrel.glb"], small, manifest) == []

errs = tpa.check(["web/assets/third_party/models/barrel.glb", "web/assets/third_party/models/extra.glb"], small, manifest)
assert errs == ["third party file not listed in THIRD_PARTY_ASSETS.md: web/assets/third_party/models/extra.glb"], errs

errs = tpa.check(["web/assets/third_party/models/barrel.glb"], small, manifest.replace("CC0 1.0", "CC BY-NC 4.0"))
assert len(errs) == 1 and "must be CC0 1.0" in errs[0], errs

errs = tpa.check(["web/assets/third_party/models/barrel.glb"], lambda f: 6 * 1024 * 1024, manifest)
assert len(errs) == 1 and "over 5 MB" in errs[0], errs

many = [f"web/assets/third_party/textures/t{i}.jpg" for i in range(10)]
big = manifest + "".join(f"| T | u | a | CC0 1.0 | `{f}` | x |\n" for f in many)
errs = tpa.check(["web/assets/third_party/models/barrel.glb"] + many, lambda f: 4_500_000, big)
assert errs == ["web/assets/third_party is over 40 MB in total (49500000 bytes)"], errs

errs = tpa.check(["web/assets/third_party/models/barrel.zip"], small, manifest.replace("barrel.glb", "barrel.zip"))
assert len(errs) == 1 and "GLB, JPEG or PNG" in errs[0], errs

errs = tpa.check([], small, manifest)
assert errs == ["THIRD_PARTY_ASSETS.md lists a file that is not in the repository: web/assets/third_party/models/barrel.glb"], errs

# the committed files and manifest pass
os.chdir(root)
files = [os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/") for d, _, fs in os.walk(tpa.PREFIX) for f in fs]
assert files, "no committed third party files"
errs = tpa.check(files, os.path.getsize, open("THIRD_PARTY_ASSETS.md", encoding="utf-8").read())
assert errs == [], errs
print("OK")
