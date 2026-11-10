# Hosting the web demo

The demo in `web/` is plain static files (no build step, no server code). Every path is relative, so it works at a site root or under a sub-path such as `/Frankenstein-s-Lovecraftian-Village/` (checked by `web/test/paths.test.js` with a local test server only).

**Nothing here has been tested against a real host. No live URL is confirmed.** The author must connect a host, verify it, then paste the resulting URL into `README.md` and the Devpost form in place of `<YOUR-LIVE-URL>`.

## Status

| Host | Status |
|------|--------|
| GitHub Pages | Blocked: the GitHub Actions account has a billing lock, so `pages.yml` cannot run and the Pages site returns 404. Unverified after the lock is fixed. |
| Netlify | Config added (`netlify.toml`, `web/_headers`). Not connected, not tested. |
| Vercel | Config added (`vercel.json`). Not connected, not tested. |
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

## Verifying a deployment

1. Open `/` and confirm the village draws and the seed controls work.
2. Open `/selftest.html` and confirm the parity checks pass.
3. `?pack=1` intentionally falls back to the procedural look on a host, because the local pack is not deployed.
4. Paste the confirmed URL into `README.md` and the Devpost form.
