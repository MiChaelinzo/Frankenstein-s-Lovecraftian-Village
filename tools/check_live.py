#!/usr/bin/env python3
"""Check a deployed web demo over HTTP: entry pages, modules, content types, CSP, HSTS.

Usage: python3 tools/check_live.py [URL]   (default: the live Vercel deployment)
Exit code 0 when every check passes, 1 otherwise. This proves HTTP-level behavior only,
not that the demo works in a real browser.
"""
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://frankensteinlovecraftianvillage.vercel.app/"
TIMEOUT_SECONDS = 20

# (path, accepted content-type substrings)
EXPECT_OK = [
    ("/", ("text/html",)),
    ("/selftest.html", ("text/html",)),
    ("/meshes.html", ("text/html",)),
    ("/src/app.js", ("javascript",)),
    ("/data/village_catalog.json", ("application/json",)),
    ("/sw.js", ("javascript",)),
    ("/assets/meshes/house_a.glb", ("model/gltf-binary", "application/octet-stream")),
]
EXPECT_MISSING = ["/local-pack/manifest.json"]


def fetch(url):
    """Return (status, lowercase header dict). HTTP error statuses are returned, not raised."""
    request = urllib.request.Request(url, headers={"User-Agent": "flv-check-live"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}


def check(base_url, fetcher=fetch):
    """Return a list of (ok, message) results."""
    base = base_url.rstrip("/")
    results = []
    root_headers = {}
    for path, types in EXPECT_OK:
        status, headers = fetcher(base + path)
        if path == "/":
            root_headers = headers
        content_type = headers.get("content-type", "")
        ok = status == 200 and any(t in content_type for t in types)
        results.append((ok, f"{path}: status {status}, content-type '{content_type}'"))
    for path in EXPECT_MISSING:
        status, _ = fetcher(base + path)
        results.append((status == 404, f"{path}: status {status}, expected 404"))
    csp = root_headers.get("content-security-policy", "")
    results.append((bool(csp), f"content-security-policy present: {bool(csp)}"))
    hsts = root_headers.get("strict-transport-security", "")
    results.append((bool(hsts), f"strict-transport-security present: {bool(hsts)}"))
    return results


def main(argv):
    url = argv[1] if len(argv) > 1 else DEFAULT_URL
    try:
        results = check(url)
    except (urllib.error.URLError, OSError) as error:
        print(f"FAIL: could not reach {url}: {error}")
        return 1
    for ok, message in results:
        print(("PASS " if ok else "FAIL ") + message)
    failed = sum(1 for ok, _ in results if not ok)
    print(f"{len(results) - failed}/{len(results)} checks passed for {url}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
