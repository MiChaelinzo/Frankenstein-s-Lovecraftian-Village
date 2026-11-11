#!/usr/bin/env python3
"""Generates web/data/stitch.json: real repo facts for the "Stitch" panel (how the parts connect).

Deterministic (no timestamps). Run `python3 tools/gen_stitch.py` to rewrite, `--check` to verify it is current.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join("web", "data", "stitch.json")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def files(root, rel, ext):
    d = os.path.join(root, rel)
    return sorted(f for f in os.listdir(d) if f.endswith(ext)) if os.path.isdir(d) else []


def build(root=ROOT):
    golden_path = os.path.join(root, "web", "test", "golden.json")
    golden = json.loads(read(golden_path)) if os.path.isfile(golden_path) else {}
    tasks_path = os.path.join(root, ".kiro", "specs", "tasks.md")
    tasks = read(tasks_path) if os.path.isfile(tasks_path) else ""
    done = len(re.findall(r"^- \[x\]", tasks, re.M))
    total = done + len(re.findall(r"^- \[ \]", tasks, re.M))
    sw_path = os.path.join(root, "web", "sw.js")
    sw = read(sw_path) if os.path.isfile(sw_path) else ""
    m = re.search(r"const PRECACHE = (\[[\s\S]*?\]);", sw)
    precache = len(re.findall(r"'[^']+'", m.group(1))) if m else 0
    runtime = files(root, "Assets/Scripts/Runtime", ".cs")
    parts = {
        "core": {"count": len(files(root, "Assets/Scripts/Core", ".cs"))},
        "golden": {"count": len(golden), "vectors": sum(len(v) for v in golden.values() if isinstance(v, list))},
        "js": {"count": len(files(root, "web/src", ".js")), "tests": len(files(root, "web/test", ".test.js"))},
        "unity": {"count": len(runtime), "bridges": len([f for f in runtime if f.startswith("Dlnk")])},
        "audio": {"count": 1 if os.path.isfile(os.path.join(root, "web", "src", "music.js")) else 0},
        "pwa": {"count": precache},
        "kiro": {"count": len(files(root, ".kiro/hooks", ".kiro.hook")), "steering": len(files(root, ".kiro/steering", ".md")),
                 "tasksDone": done, "tasksTotal": total},
    }
    return {"version": 1, "parts": parts}


def render(data):
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def main(argv):
    text = render(build())
    path = os.path.join(ROOT, OUT)
    if "--check" in argv:
        cur = read(path) if os.path.isfile(path) else ""
        if cur != text:
            print(f"{OUT} is stale: run python3 tools/gen_stitch.py"); return 1
        print("OK: stitch data current"); return 0
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {OUT}"); return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
