#!/usr/bin/env python3
"""Repo guardrails: .kiro tracked and not ignored, no paid asset files committed, docs present."""
import subprocess, sys, os

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
os.chdir(root)
errors = []

for p in [".kiro/specs/requirements.md", ".kiro/specs/design.md", ".kiro/specs/tasks.md",
          ".kiro/steering/product.md", ".kiro/steering/tech.md", ".kiro/steering/structure.md",
          "web/index.html", "web/src/core.js", "web/src/app.js", "web/test/golden.json",
          ".github/workflows/pages.yml", ".github/workflows/ci.yml", "CONTRIBUTING.md", "CHANGELOG.md",
          "docs/media/calm.png", "docs/media/dread.png", "docs/media/abyss.png", "docs/media/mobile.png",
          "README.md", "LICENSE", "NOTICE", "docs/KIRO_USAGE.md", "docs/DEMO_SCRIPT.md",
          "docs/DEVPOST_SUBMISSION.md", "docs/BUILD_LOG.md", "web/selftest.html", "web/src/selftest.js", "web/src/golden-data.js", "docs/media/selftest.png", "docs/BLOG_POST.md", "Packages/manifest.json", "ProjectSettings/ProjectVersion.txt"]:
    if not os.path.isfile(p):
        errors.append(f"missing {p}")

hooks = [f for f in os.listdir(".kiro/hooks")] if os.path.isdir(".kiro/hooks") else []
if not any(f.endswith(".kiro.hook") for f in hooks):
    errors.append("no .kiro.hook files in .kiro/hooks")

ignored = subprocess.run(["git", "check-ignore", "-q", ".kiro/specs/requirements.md"]).returncode == 0
if ignored:
    errors.append(".kiro is gitignored")

tracked = subprocess.check_output(["git", "ls-files", "-co", "--exclude-standard"], text=True).splitlines()
banned = (".fbx", ".prefab", ".unity", ".png", ".tga", ".mat", ".blend", ".psd", ".wav", ".mp3", ".ogg", ".unitypackage")
for f in tracked:
    low = f.lower()
    if low.startswith("assets/lovecraftian village") or low.startswith("assets/essential terrain pack"):
        errors.append(f"paid pack file: {f}")
    if low.startswith("assets/thirdparty/") and not low.endswith("readme.md"):
        errors.append(f"third party file: {f}")
    if low.startswith("assets/") and low.endswith(banned) and "thirdparty" not in low:
        errors.append(f"binary asset needs review: {f}")

for f in tracked:
    if f.startswith("Assets/_DLNK") or f.startswith("web/local-pack/"):
        errors.append(f"pack-derived path must not be tracked: {f}")

for probe in ("Assets/ThirdParty/LovecraftianVillage/pack_inventory.json", "probe.unitypackage",
              "Assets/_DLNK/x.prefab", "Assets/_DLNK.meta", "web/local-pack/manifest.json"):
    if subprocess.run(["git", "check-ignore", "-q", probe]).returncode != 0:
        errors.append(f"{probe} must be gitignored")
for f in ("tools/inspect_unitypackage.py", "tools/test_inspect_unitypackage.py"):
    if not os.path.isfile(f):
        errors.append(f"missing {f}")

import filecmp
if os.path.isfile("web/data/village_catalog.json") and not filecmp.cmp("web/data/village_catalog.json", "Assets/Data/village_catalog.json", shallow=False):
    errors.append("web/data/village_catalog.json differs from Assets/Data/village_catalog.json")

if os.path.isfile(".gitattributes") and "filter=lfs" in open(".gitattributes").read():
    errors.append(".gitattributes routes files to Git LFS (filter=lfs); LFS is not used")

EM_DASH = "\u2014"
text_ext = (".md", ".js", ".cs", ".json", ".py", ".yml", ".html", ".css")
for f in tracked:
    if f.lower().endswith(text_ext) and os.path.isfile(f):
        try:
            if EM_DASH in open(f, encoding="utf-8").read():
                errors.append(f"em dash (U+2014) in {f}")
        except UnicodeDecodeError:
            pass

if errors:
    print("FAIL"); [print(" -", e) for e in errors]; sys.exit(1)
print("OK: repo validation passed")
