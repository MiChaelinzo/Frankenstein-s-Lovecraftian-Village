# Hosting the web demo

The demo in `web/` is plain static files (no build step, no server code). Every path is relative, so it works at a site root or under a sub-path such as `/Frankenstein-s-Lovecraftian-Village/` (checked by `web/test/paths.test.js` with a local test server only).

**Live URL:** [https://frankensteinlovecraftianvillage.vercel.app/](https://frankensteinlovecraftianvillage.vercel.app/) (Vercel; deep link [https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1](https://frankensteinlovecraftianvillage.vercel.app/#seed=1818&sanity=100&night=1)). Verified at HTTP level only by `python3 tools/check_live.py` (200 and content types on `/`, `/selftest.html`, `/meshes.html`, `/src/app.js`, `/data/village_catalog.json`, `/sw.js`, `/assets/meshes/house_a.glb`; CSP and HSTS headers served; `/local-pack/manifest.json` returns 404). Real-browser behavior on the host is not verified. Netlify and Cloudflare Pages remain untested.

## Status

| Host | Status |
|------|--------|
| GitHub Pages | Blocked: the GitHub Actions account has a billing lock, so `pages.yml` cannot run and the Pages site returns 404. Unverified after the lock is fixed. |
| Netlify | Config added (`netlify.toml`, `web/_headers`). Not connected, not tested. |
| Vercel | Deployed (see Live URL). HTTP checks pass via `tools/check_live.py`; browser use not verified. |
| Cloudflare Pages | Uses `web/_headers`. Not connected, not tested. |

## Dashboard steps (each host builds from Git, so `web/local-pack` never exists there)

### Netlify
1. Add new site, Import from Git, pick this repository.
2. Build command: empty. Publish directory: `web`.
3. Deploy. `netlify.toml` already says the same.

### Vercel
1. Add New Project, import this repository.
2. Framework Preset: Other. Build Command: empty. Output Directory: `web`.
3. Deploy. `vercel.json` already says the same.

### Cloudflare Pages
1. Create a project, Connect to Git, pick this repository.
2. Build command: empty. Build output directory: `web`.
3. `web/_headers` supplies the security headers.

### GitHub Pages
1. Fix the account billing lock.
2. Settings, Pages, Source: GitHub Actions.
3. Run the "Deploy web demo to GitHub Pages" workflow (`workflow_dispatch`). It runs the node tests and the staging test, stages `web/` into `dist/` with `tools/stage_web.py`, and uploads `dist`.

## Local-folder deploy (the only safe way)

If `web/local-pack/` exists on your machine (pack-derived, must never be published), never drag `web/` onto a host. Stage first:

```
python3 tools/stage_web.py
netlify deploy --dir dist        # or: wrangler pages deploy dist
```

or drop the `dist/` folder into Netlify Drop. `dist/` is git-ignored. The script excludes `local-pack/`, `test/`, `node_modules`, `package.json` and dotfiles, and refuses an output directory outside the repo. Those CLIs are not installed here and were not run.

## Security headers

`netlify.toml`, `vercel.json` and `web/_headers` carry the same headers: `nosniff`, a referrer policy, a `Permissions-Policy`, and a Content-Security-Policy that allows same-origin scripts and styles, `data:` and `blob:` images, and `https:` fetches (for the optional `?narrator=` endpoint). There is no catch-all rewrite. The CSP has not been checked in a browser against every feature; if something is blocked on a host, check the console first.

## Optional villager voices (`?narrator=`)

Talking to a villager (R list, or face one in 3D and press E) always resolves in Core first: the clue and sanity effect come from the deterministic `talk()` rule and are applied before any network request starts. If `?narrator=<url>` is set, the demo then POSTs a small JSON body and, when a valid answer arrives within 4 s, shows that text instead of the built-in en/fr line. The answer is display only (written with `textContent`, control characters stripped, capped at 240 characters) and can never change clues, sanity or the vigil. Any failure (unreachable host, CSP block, HTTP error, timeout, malformed JSON, empty text) keeps the deterministic line, so a session plays identically with or without the endpoint.

Request: `{"kind":"villager","villager":"Lucan Tallow","role":"fisher","behavior":0,"cause":"","phase":"dusk","dread":30,"night":1,"lang":"en","fallback":"<built-in line>"}`. Reply: `{"text":"..."}`.

A tiny local endpoint for testing (no keys; echoes the fallback in brackets, replace the body with your own model call that reads its key from an environment variable):

```python
# villager_echo.py: python3 villager_echo.py, then open http://localhost:8123/?narrator=http://localhost:8787/
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

class Echo(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
        body = json.dumps({"text": f"[{req.get('villager', '?')}] {req.get('fallback', '')}"}).encode()
        self.send_response(200); self._cors(); self.send_header("content-type", "application/json"); self.end_headers()
        self.wfile.write(body)

HTTPServer(("127.0.0.1", 8787), Echo).serve_forever()
```

The deployed CSP allows `connect-src 'self' https:` only, so on a host the endpoint must be https; plain `http://localhost` works only with the local `python3 -m http.server` (which sends no CSP). Not run against a real AI service here.

## Offline mode

`web/sw.js` and `web/manifest.webmanifest` make the demo installable and usable offline. The service worker registers only on https or localhost, precaches an explicit list of core files (never `local-pack`), serves nothing for `?pack=1`, and is network first so updates are not stuck behind a cache. All paths are relative, so it works at a domain root and under `/Frankenstein-s-Lovecraftian-Village/`. The CSP adds `worker-src 'self'` and `manifest-src 'self'`. Not tested on a real host. When you add a file under `web/`, add it to `PRECACHE` in `sw.js` (`web/test/pwa.test.js` fails if a `web/src` module is missing).

## Verifying a deployment

1. Open `/` and confirm the village draws and the seed controls work.
2. Open `/selftest.html` and confirm the parity checks pass.
3. `?pack=1` intentionally falls back to the procedural look on a host, because the local pack is not deployed.
4. Paste the confirmed URL into `README.md` and the Devpost form.
