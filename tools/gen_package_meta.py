#!/usr/bin/env python3
"""Writes Unity .meta files for the UPM package so Unity does not ignore its files.

Unity ignores assets in read-only (git or registry) packages that have no .meta file. Unity normally
generates these on import, which we cannot run here, so this script derives a stable GUID from the
package-relative path (md5) and writes minimal, standard meta files. Re-running never changes
existing GUIDs. Folders ending in '~' (Samples~) are hidden from Unity and get no meta.
Usage: python3 tools/gen_package_meta.py [--check]   (--check exits 1 if any meta is missing or stale)
"""
import hashlib, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PACKAGE = os.path.join(ROOT, "Packages", "com.michaelinzo.frankenstein-village")


def guid_for(rel):
    return hashlib.md5(("frankenstein-village/" + rel).encode("utf-8")).hexdigest()


def meta_text(rel, is_dir):
    g = guid_for(rel)
    head = "fileFormatVersion: 2\nguid: %s\n" % g
    if is_dir:
        return head + "folderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n"
    if rel.endswith(".cs"):
        return head + ("MonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n"
                       "  executionOrder: 0\n  icon: {instanceID: 0}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n")
    if rel.endswith(".asmdef"):
        return head + "AssemblyDefinitionImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n"
    if rel.endswith((".json", ".md")):
        return head + "TextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n"
    return head + "DefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n"


def expected():
    out = {}
    for base, dirs, files in os.walk(PACKAGE):
        dirs[:] = sorted(d for d in dirs if not d.endswith("~") and not d.startswith("."))
        for name in files:
            if name.endswith(".meta"):
                continue
            path = os.path.join(base, name)
            out[path + ".meta"] = meta_text(os.path.relpath(path, PACKAGE).replace(os.sep, "/"), False)
        for d in dirs:
            path = os.path.join(base, d)
            out[path + ".meta"] = meta_text(os.path.relpath(path, PACKAGE).replace(os.sep, "/") + "/", True)
    return out


def main():
    check = "--check" in sys.argv
    want = expected()
    bad = []
    for path, text in sorted(want.items()):
        if not os.path.isfile(path) or open(path, encoding="utf-8").read() != text:
            bad.append(os.path.relpath(path, ROOT))
            if not check:
                open(path, "w", encoding="utf-8", newline="\n").write(text)
    # Root files of the package (package.json, README) are covered by the walk; stale metas for deleted files:
    for base, dirs, files in os.walk(PACKAGE):
        dirs[:] = [d for d in dirs if not d.endswith("~")]
        for name in files:
            if name.endswith(".meta") and os.path.join(base, name) not in want:
                bad.append("stale " + os.path.relpath(os.path.join(base, name), ROOT))
                if not check:
                    os.remove(os.path.join(base, name))
    if check:
        for b in bad:
            print("meta out of date:", b)
        sys.exit(1 if bad else 0)
    print("wrote %d meta files" % len(bad))


if __name__ == "__main__":
    main()
