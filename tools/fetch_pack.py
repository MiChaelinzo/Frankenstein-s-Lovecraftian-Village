#!/usr/bin/env python3
"""Download a Lovecraftian Village .unitypackage from the author's public OneDrive links.

Uses the same anonymous guest flow as the OneDrive web viewer for public links:
an anonymous token is requested (no credentials), then the share's driveitem
content is streamed to a .part file, verified, and renamed. The token is never
printed. The target must be git-ignored or outside the repo.

Usage: python3 tools/fetch_pack.py urp|hdrp [--url SHARE_URL] [--out PATH] [--expect SHA256]

The default shares are checked against the pinned SHA-256 values below (also in README.md).
--expect overrides the pin; with --url and no --expect the pin is skipped. A mismatch deletes the
download and exits non-zero.
"""
import argparse, base64, hashlib, json, os, re, subprocess, sys, urllib.request

SHARES = {
    "hdrp": ("https://1drv.ms/u/c/2d20f0550256da29/IQB1mE-VisgWS4w-AoMNj6pTAQiJ_psYXKWDPJKcFUDpErQ?e=45G2wE",
             "Lovecraftian1.3_HDRP_Unity6.unitypackage"),
    "urp": ("https://1drv.ms/u/c/2d20f0550256da29/IQB9YNYXG0m2R7Z-3HOg2HmfARYqxwE4_Vvxa-Hth-dssso?e=opLROG",
            "Lovecraftian1.3_URP_Unity6.unitypackage"),
}
# Pinned digests of the packages as inspected (see README, "Inspecting the pack locally").
PINNED_SHA256 = {
    "urp": "939bc792eeccb4779be0c5bb6d12c0ad712f7daa3711021c43a5794757df60b8",
    "hdrp": "8bc5c2c1be7c639340512e54c49ab118db5f7a9aeaa2d0410a273e863651b488",
}
DOWNLOAD_DIR = "Assets/ThirdParty/LovecraftianVillage/downloads"
TOKEN_URL = "https://api-badgerp.svc.ms/v1.0/token"
APP_ID = "5cbed6ac-a083-4e14-b191-b4ba07653de2"
SHARE_API = "https://my.microsoftpersonalcontent.com/_api/v2.0/shares/"
CHUNK = 1 << 20


def share_id(url):
    """OneDrive share id: 'u!' + base64url(url) without padding."""
    return "u!" + base64.urlsafe_b64encode(url.encode("utf-8")).decode("ascii").rstrip("=")


def has_gzip_magic(head):
    return head[:2] == b"\x1f\x8b"


def verify(path, expected_size=None):
    """Check gzip magic and size; return sha256 hex."""
    with open(path, "rb") as f:
        if not has_gzip_magic(f.read(2)):
            raise ValueError("not a gzip file (magic 1f8b missing)")
    size = os.path.getsize(path)
    if expected_size is not None and size != expected_size:
        raise ValueError(f"size {size} != expected {expected_size}")
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(CHUNK), b""):
            h.update(b)
    return h.hexdigest()


def check_hash(actual, expected):
    """Returns None when equal (case-insensitive), else a clear mismatch message. No expectation means no check."""
    if not expected:
        return None
    exp = expected.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", exp):
        return f"expected hash is not 64 hex characters: {expected!r}"
    if actual.lower() != exp:
        return f"sha256 mismatch: expected {exp}, got {actual.lower()}"
    return None


def is_safe_target(path):
    """Allowed when outside the repo, or inside it and git-ignored."""
    root = os.path.realpath(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    real = os.path.realpath(path)
    if os.path.commonpath([root, real]) != root:
        return True
    return subprocess.run(["git", "check-ignore", "-q", os.path.relpath(real, root)]).returncode == 0


def get_token():
    req = urllib.request.Request(TOKEN_URL, data=json.dumps({"appId": APP_ID}).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["token"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("edition", choices=sorted(SHARES))
    ap.add_argument("--url", help="override the share URL")
    ap.add_argument("--out", help="output file (must be git-ignored or outside the repo)")
    ap.add_argument("--expect", help="expected sha256 (overrides the pinned value)")
    args = ap.parse_args(argv)

    url, fname = SHARES[args.edition]
    url = args.url or url
    out = args.out or os.path.join(DOWNLOAD_DIR, fname)
    if not is_safe_target(out):
        print(f"refusing to write {out}: not git-ignored", file=sys.stderr)
        return 2
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    headers = {"Authorization": "Badger " + get_token(), "Prefer": "autoredeem"}
    base = SHARE_API + share_id(url) + "/driveitem"
    with urllib.request.urlopen(urllib.request.Request(base, headers=headers), timeout=60) as r:
        expected = json.load(r).get("size")

    part = out + ".part"
    with urllib.request.urlopen(urllib.request.Request(base + "/content", headers=headers), timeout=120) as r:
        if r.status != 200:
            print(f"unexpected HTTP {r.status}", file=sys.stderr)
            return 1
        with open(part, "wb") as f:
            for b in iter(lambda: r.read(CHUNK), b""):
                f.write(b)
    try:
        digest = verify(part, expected)
    except ValueError as e:
        os.remove(part)
        print(f"verification failed: {e}", file=sys.stderr)
        return 1
    expect = args.expect or (None if args.url else PINNED_SHA256.get(args.edition))
    err = check_hash(digest, expect)
    if err:
        os.remove(part)
        print(f"verification failed: {err}", file=sys.stderr)
        return 3
    os.replace(part, out)
    print(f"{out}  {os.path.getsize(out)} bytes  sha256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
