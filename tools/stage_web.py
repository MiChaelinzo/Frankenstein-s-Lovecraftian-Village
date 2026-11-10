#!/usr/bin/env python3
"""Stage web/ into a git-ignored dist/ for local-folder deploys, excluding local-pack and dev files."""
import os, shutil, subprocess, sys

root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
EXCLUDED_DIRS = {"local-pack", "test", "node_modules"}
EXCLUDED_FILES = {"package.json", "package-lock.json"}


def stage(src, out):
    src, out = os.path.realpath(src), os.path.realpath(out)
    if os.path.commonpath([out, os.path.realpath(root)]) != os.path.realpath(root) or out == os.path.realpath(root):
        raise SystemExit(f"refusing: output {out} must be a subdirectory of the repo")
    if out == src or out.startswith(src + os.sep) or src.startswith(out + os.sep):
        raise SystemExit("refusing: output and source overlap")
    if os.path.isdir(out):
        shutil.rmtree(out)
    staged = []
    for d, dirs, files in os.walk(src):
        dirs[:] = sorted(x for x in dirs if x not in EXCLUDED_DIRS and not x.startswith("."))
        for f in sorted(files):
            if f.startswith(".") or f in EXCLUDED_FILES:
                continue
            rel = os.path.relpath(os.path.join(d, f), src)
            dest = os.path.join(out, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(os.path.join(d, f), dest)
            staged.append(rel)
    for d, dirs, _ in os.walk(out):
        assert "local-pack" not in dirs, "local-pack leaked into the output"
    assert os.path.isfile(os.path.join(out, "index.html")), "index.html missing from output"
    return staged


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "dist")
    files = stage(os.path.join(root, "web"), out)
    for f in files:
        print("staged", f)
    print(f"OK: staged {len(files)} files to {out} (local-pack excluded)")
