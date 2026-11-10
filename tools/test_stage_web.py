#!/usr/bin/env python3
import os, subprocess, sys, tempfile, shutil

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
sys.path.insert(0, os.path.join(root, "tools"))
import stage_web

pack = os.path.join(root, "web", "local-pack")
had_pack = os.path.isdir(pack)
os.makedirs(pack, exist_ok=True)
probe = os.path.join(pack, "zz_probe.txt")
open(probe, "w").write("x")
out = os.path.join(root, "dist-test-stage")
try:
    files = stage_web.stage(os.path.join(root, "web"), out)
    assert os.path.isfile(os.path.join(out, "index.html"))
    assert os.path.isfile(os.path.join(out, "_headers"))
    for need in ("sw.js", "manifest.webmanifest", "icon.svg", "src/session.js", "src/minimap.js", "src/casefile.js", "src/i18n.js", "src/perf.js"):
        assert need in files, f"{need} not staged"
    sw = open(os.path.join(out, "sw.js"), encoding="utf-8").read()
    assert "local-pack" in sw and "PRECACHE" in sw
    precache = sw.split("const PRECACHE = [", 1)[1].split("];", 1)[0]
    assert "local-pack" not in precache
    assert not os.path.exists(os.path.join(out, "local-pack"))
    assert not any(f.startswith("local-pack") or f.startswith("test") for f in files)
    for bad in ("/tmp/outside-stage", root):
        try:
            stage_web.stage(os.path.join(root, "web"), bad)
            raise AssertionError("should refuse " + bad)
        except SystemExit:
            pass
finally:
    os.remove(probe)
    if not had_pack:
        shutil.rmtree(pack)
    shutil.rmtree(out, ignore_errors=True)
print("OK")
