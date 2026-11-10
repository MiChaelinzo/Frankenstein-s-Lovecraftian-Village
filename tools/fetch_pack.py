#!/usr/bin/env python3
"""Download a Lovecraftian Village .unitypackage from the author's public OneDrive links.

Uses the same anonymous guest flow as the OneDrive web viewer for public links:
an anonymous token is requested (no credentials), then the share's driveitem
content is streamed to a .part file, verified, and renamed. The token is never
printed. The target must be git-ignored or outside the repo.

Usage: python3 tools/fetch_pack.py urp|hdrp [--url SHARE_URL] [--out PATH]
"""
import argparse, base64, hashlib, json, os, subprocess, sys, urllib.request

SHARES = {
    "hdrp": ("https://1drv.ms/u/c/2d20f0550256da29/IQB1mE-VisgWS4w-AoMNj6pTAQiJ_psYXKWDPJKcFUDpErQ?e=45G2wE",
             "Lovecraftian1.3_HDRP_Unity6.unitypackage"),
    "urp": ("https://1drv.ms/u/c/2d20f0550256da29/IQB9YNYXG0m2R7Z-3HOg2HmfARYqxwE4_Vvxa-Hth-dssso?e=opLROG",
            "Lovecraftian1.3_URP_Unity6.unitypackage"),
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
    os.replace(part, out)
    print(f"{out}  {os.path.getsize(out)} bytes  sha256 {digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
