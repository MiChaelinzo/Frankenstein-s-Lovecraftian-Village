#!/usr/bin/env node
// Builds real saved sessions from the shipped builds of rounds 26 to 36 (round 37, FEAT-003 item 6).
// For each round it checks the merge commit out into a git worktree under a scratch directory, serves that worktree's web/ folder,
// plays a short scripted visit in headless Chromium (deep link to seed 1818 at night 3, open the villager list, talk to the first
// villager, close the dialog, cycle Horror Intensity and High contrast where the build has them) and copies every flv* localStorage
// key the old build wrote into web/test/fixtures/saves/round-NN.json. web/test/save-compat.test.js then proves each loads on the new build.
//
// Usage (from the repository root, on a machine with the Chromium headless shell and python3):
//   SAVE_TMP=/projects/sandbox/save-compat-tmp node tools/gen_save_fixtures.mjs [26 27 ...]
// Env: CHROME (browser binary), SAVE_TMP (scratch directory for the worktrees, default ../save-compat-tmp next to the repository; not /tmp,
// which some sandboxes clear between commands), CDP_PORT and HTTP_PORT (bases 9345 and 8140; the round number is added).
// Each generated worktree and browser profile is removed after its round. The shared scratch root is kept so unrelated files are never deleted.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The merge commit that shipped each round (git log, CHANGELOG). Round 35 was the bug sweep PR. */
export const ROUND_COMMITS = Object.freeze({
  26: 'ef33e6c', 27: '3c91db3', 28: 'cecbff0', 29: '5c5b0f1', 30: '3525a84', 31: 'bcc6657',
  32: 'e4ae251', 33: 'aeee804', 34: 'ded5da6', 35: '816300b', 36: '41704b7',
});
/** The scripted visit, recorded in each fixture so the run can be repeated. */
export const VISIT = '?intro=0&capture=1&tick=900#seed=1818&sanity=40&night=3';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web', 'test', 'fixtures', 'saves');
const CHROME = process.env.CHROME || '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const GL_FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser(port) {
  const ud = mkdtempSync(join(process.env.SAVE_TMP || join(ROOT, '..', 'save-compat-tmp'), 'chrome-'));
  const chrome = spawn(CHROME, ['--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, '--window-size=1280,900', ...GL_FLAGS, 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 60 && !targets.length; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { chrome.kill(); throw new Error('browser did not expose a page target'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const key = async (k, code, vk) => {
    const p = { key: k, code, windowsVirtualKeyCode: vk, text: k.length === 1 ? k : undefined };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  };
  const close = async () => { try { ws.close(); } catch { /* already closed */ } chrome.kill(); await new Promise((r) => (chrome.exitCode !== null ? r() : chrome.once('exit', r))); rmSync(ud, { recursive: true, force: true }); };
  return { send, ev, key, errors, close };
}

async function until(fn, ms) { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(300)) { const v = await fn(); if (v) return v; } return fn(); }

/** Plays VISIT on the build served at base and returns every flv* localStorage key it wrote. */
async function recordVisit(b, base) {
  await b.send('Page.navigate', { url: base + '?intro=0&capture=1' }); await sleep(1500);
  await b.ev('localStorage.clear()');
  await b.send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await b.send('Page.navigate', { url: base + VISIT });
  await until(() => b.ev(`!!localStorage.getItem('flv.session.v1')`), 60000);
  await sleep(1500);
  await b.key('r', 'KeyR', 82); await sleep(600);
  await b.ev(`(document.querySelector('#villagerList button[data-villager]:not([disabled])')||{click(){}}).click()`); await sleep(800);
  await b.key('Escape', 'Escape', 27); await sleep(400);
  await b.ev(`(document.getElementById('intensityToggle')||{click(){}}).click()`); await sleep(300);
  await b.ev(`(document.getElementById('contrastToggle')||{click(){}}).click()`); await sleep(300);
  await b.ev(`(document.getElementById('nightNext')||{click(){}}).click()`); await sleep(1200);
  return b.ev(`Object.fromEntries(Object.keys(localStorage).filter((k)=>k.startsWith('flv')).sort().map((k)=>[k,localStorage.getItem(k)]))`);
}

async function main() {
  const rounds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : Object.keys(ROUND_COMMITS).map(Number);
  const tmp = resolve(process.env.SAVE_TMP || join(ROOT, '..', 'save-compat-tmp'));
  mkdirSync(tmp, { recursive: true }); mkdirSync(OUT, { recursive: true });
  const httpBase = Number(process.env.HTTP_PORT || 8140), cdpBase = Number(process.env.CDP_PORT || 9345);
  let failed = 0;
  for (const round of rounds) {
    const sha = ROUND_COMMITS[round];
    if (!sha) { console.error(`round ${round}: no commit recorded`); failed++; continue; }
    const httpPort = httpBase + round, cdpPort = String(cdpBase + round); // a port per round, so a browser or server still shutting down never collides
    const tree = join(tmp, `r${round}`);
    let server = null, b = null;
    try {
      if (existsSync(tree)) execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT });
      execFileSync('git', ['worktree', 'add', '--detach', tree, sha], { cwd: ROOT, stdio: 'ignore' });
      server = spawn('python3', ['-m', 'http.server', String(httpPort), '-d', join(tree, 'web'), '--bind', '127.0.0.1'], { stdio: 'ignore' });
      await sleep(800);
      b = await openBrowser(cdpPort);
      const storage = await recordVisit(b, `http://127.0.0.1:${httpPort}/`);
      const full = execFileSync('git', ['rev-parse', sha], { cwd: ROOT }).toString().trim();
      if (!storage['flv.session.v1']) throw new Error('the old build wrote no session');
      const fixture = { round, commit: full, visit: VISIT, generator: 'tools/gen_save_fixtures.mjs', pageErrors: b.errors.slice(0, 5), storage };
      writeFileSync(join(OUT, `round-${round}.json`), JSON.stringify(fixture, null, 2) + '\n');
      console.log(`round ${round} (${sha}): ${Object.keys(storage).join(', ')}`);
    } catch (err) { failed++; console.error(`round ${round} (${sha}): ${err.message}`); }
    finally {
      if (b) await b.close();
      if (server) server.kill();
      if (existsSync(tree)) execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT });
    }
  }
  execFileSync('git', ['worktree', 'prune'], { cwd: ROOT });
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
