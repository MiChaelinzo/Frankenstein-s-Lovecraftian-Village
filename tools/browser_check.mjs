#!/usr/bin/env node
// Real-browser check of the web demo: drives local headless Chromium over the DevTools protocol
// (Node 22 global WebSocket, no dependencies) and prints PASS/FAIL lines with evidence.
// Usage: python3 -m http.server 8123 -d web &   node tools/browser_check.mjs
// Env: CHROME (browser binary), BASE (default http://127.0.0.1:8123/), CDP_PORT (default 9333).
// Frame timing uses requestAnimationFrame timestamps in real time (no virtual-time budget) on SwiftShader
// software GL, so it is indicative only and says nothing about real GPUs.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Summarize requestAnimationFrame timestamps (ms) into mean, median, p95 and max frame time. */
export function frameStats(timestamps) {
  if (!Array.isArray(timestamps) || timestamps.length < 2) return { frames: timestamps?.length || 0, meanMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, fps: 0 };
  const d = [];
  for (let i = 1; i < timestamps.length; i++) d.push(timestamps[i] - timestamps[i - 1]);
  d.sort((a, b) => a - b);
  const mean = d.reduce((s, x) => s + x, 0) / d.length, r1 = (v) => Math.round(v * 10) / 10;
  return { frames: timestamps.length, meanMs: r1(mean), medianMs: r1(d[d.length >> 1]), p95Ms: r1(d[Math.floor(d.length * 0.95)]), maxMs: r1(d[d.length - 1]), fps: r1(1000 / mean) };
}

const DEFAULT_CHROME = '/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell';
const GL_FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chromePath = process.env.CHROME || DEFAULT_CHROME;
  if (!existsSync(chromePath)) { console.error('no chrome binary; set CHROME'); process.exit(2); }
  const base = process.env.BASE || 'http://127.0.0.1:8123/', port = process.env.CDP_PORT || '9333';
  const ud = mkdtempSync(join(tmpdir(), 'flv-bc-'));
  const chrome = spawn(chromePath, ['--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, '--hide-scrollbars', '--window-size=1280,900', ...GL_FLAGS, 'about:blank'], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 60 && !targets.length; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); } }
  const page = targets.find((t) => t.type === 'page');
  if (!page) { chrome.kill(); console.error('browser did not expose a page target'); process.exit(2); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0; const pending = new Map(), errs = [], results = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error ' + d.params.args.map((a) => a.value || a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const keyParams = (k, code, vk, text) => ({ key: k, code: code || 'Key' + k.toUpperCase(), windowsVirtualKeyCode: vk || k.toUpperCase().charCodeAt(0), text });
  const key = async (k, code, vk, text = k.length === 1 ? k : undefined) => {
    const p = keyParams(k, code, vk, text);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  };
  const special = (name, vk, text) => key(name, name, vk, text);
  const hold = async (k, code, ms) => {
    const p = keyParams(k, code);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await sleep(ms); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const drag = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + i * 20, y, button: 'left', buttons: 1 }); await sleep(30); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 160, y, button: 'left', clickCount: 1 });
  };
  // A hash-only change would be a same-document navigation, so callers that need a fresh load go through about:blank first.
  const nav = async (q) => { await send('Page.navigate', { url: base + q }); await sleep(2500); };
  const shotHash = async () => { const s = (await send('Page.captureScreenshot', { format: 'png' })).result.data; let h = 0; for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const rec = (name, ok, evidence) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${JSON.stringify(evidence)}`); };
  const text = (idv) => ev(`document.getElementById('${idv}').textContent`);
  const hidden = (idv) => ev(`document.getElementById('${idv}').hidden`);

  await send('Runtime.enable'); await send('Page.enable');
  try {
    // keyboard and panels on the 2D view
    await nav('?intro=0#seed=1818&sanity=100');
    const s0 = await ev(`document.getElementById('sanityOut').textContent+'|'+document.getElementById('whispers').children.length`);
    await key('['); await key('['); await key('w'); await sleep(300);
    const s1 = await ev(`document.getElementById('sanityOut').textContent+'|'+document.getElementById('whispers').children.length`);
    rec('keyboard: [ [ w lowers sanity and logs a whisper', Number(s1.split('|')[0]) < Number(s0.split('|')[0]) && Number(s1.split('|')[1]) > Number(s0.split('|')[1]), { before: s0, after: s1 });
    await key('g'); await sleep(150); rec('keyboard: G opens the map panel', !(await hidden('mapPanel')), {});
    await key('k'); await sleep(150); rec('keyboard: K opens the codex panel', !(await hidden('codexPanel')), {});
    await key('x'); await sleep(500); rec('keyboard: X shows the perf readout', !(await hidden('perfHud')), { text: await text('perfHud') });

    // journal tabs
    await ev(`document.getElementById('tab-progress').click()`); await sleep(150);
    const jt = await ev(`[document.getElementById('tab-progress').getAttribute('aria-selected'),document.getElementById('pane-progress').hidden,document.getElementById('pane-story').hidden]`);
    rec('journal: clicking Progress switches panes', jt[0] === 'true' && jt[1] === false && jt[2] === true, { state: jt });
    await ev(`document.getElementById('tab-progress').focus()`); await special('ArrowLeft', 37, undefined); await sleep(150);
    const jt2 = await ev(`[document.getElementById('tab-story').getAttribute('aria-selected'),document.getElementById('pane-story').hidden]`);
    rec('journal: ArrowLeft on a tab returns to Story', jt2[0] === 'true' && jt2[1] === false, { state: jt2 });

    // doors
    const d0 = await ev(`document.getElementById('whispers').children.length`);
    await ev(`document.getElementById('door').click()`); await sleep(300);
    const d1 = await ev(`document.getElementById('whispers').children.length`);
    rec('door: button adds a journal entry', d1 > d0, { entriesBefore: d0, entriesAfter: d1, narration: (await text('narration')).slice(0, 80) });
    await key('o'); await sleep(300);
    rec('door: O key runs without an exception', errs.length === 0, { narration: (await text('narration')).slice(0, 80) });

    // story mode
    await key('s'); await sleep(300);
    const st = [!(await hidden('story')), await text('storyMeta')];
    await key('.'); await sleep(200); const st2 = await text('storyMeta');
    await special('Escape', 27, undefined); await sleep(200); const st3 = await hidden('story');
    rec('story: S opens, . steps a beat, Escape closes', st[0] && st[1] !== st2 && st3 === true, { open: st, afterStep: st2, hiddenAfterEscape: st3 });

    // judge tour
    await nav('?intro=0&tour=1#seed=1818&sanity=100');
    const t0 = [!(await hidden('tour')), await text('tourStep')];
    await special('Enter', 13, '\r'); await sleep(300); await special('Enter', 13, '\r'); await sleep(300);
    const t1 = await text('tourStep');
    await special('ArrowLeft', 37, undefined); await sleep(300); const t2 = await text('tourStep');
    await special('Escape', 27, undefined); await sleep(300); const t3 = await hidden('tour');
    rec('tour: ?tour=1 opens, Enter advances twice, Left goes back, Escape skips', t0[0] && t1 !== t0[1] && t2 !== t1 && t3 === true, { start: t0[1], afterTwoEnter: t1, afterLeft: t2, hiddenAfterEscape: t3 });

    // 3D: render, movement, pointer lock acquired path
    await nav('?intro=0&view=3d#seed=1818&sanity=60');
    const v = await ev(`({active:!document.getElementById('view3d').hidden,gl:!!document.getElementById('view3d').getContext('webgl'),width:document.getElementById('view3d').width})`);
    rec('3d: ?view=3d shows the canvas with a WebGL context', v.active && v.gl, v);
    const r = await ev(`document.getElementById('view3d').getBoundingClientRect().toJSON()`), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const h0 = await shotHash(); await hold('w', 'KeyW', 1200); await sleep(300);
    const h1 = await shotHash(); rec('3d: holding W changes the rendered frame', h0 !== h1, { before: h0, after: h1 });
    await hold('a', 'KeyA', 600); await sleep(300);
    const h2 = await shotHash(); rec('3d: holding A changes the rendered frame', h1 !== h2, { before: h1, after: h2 });
    await click(cx, cy); await sleep(500);
    rec('3d: click acquires pointer lock', await ev(`document.pointerLockElement===document.getElementById('view3d')`), {});
    await special('Escape', 27, undefined); await sleep(400);
    const afterEsc = await ev(`({locked:document.pointerLockElement===document.getElementById('view3d'),view3dHidden:document.getElementById('view3d').hidden})`);
    rec('3d: first Escape releases the lock and keeps 3D open', !afterEsc.locked && !afterEsc.view3dHidden, afterEsc);
    await key('e'); await sleep(400);
    rec('3d: E interact runs without an exception', errs.length === 0, { narration: (await text('narration')).slice(0, 80) });
    await special('Escape', 27, undefined); await sleep(400);
    rec('3d: second Escape returns to the 2D view', await hidden('view3d'), {});

    // 3D cinematic
    await nav('?intro=0&view=3d&cinematic=1#seed=1818&sanity=70');
    const ca = await shotHash(); await sleep(2500); const cb = await shotHash();
    rec('cinematic 3D: ?view=3d&cinematic=1 changes frames over 2.5 s with a caption', ca !== cb && !(await hidden('cinemaCaption')) && !(await hidden('view3d')), { before: ca, after: cb, caption: (await text('cinemaCaption')).slice(0, 80) });
    await special('Escape', 27, undefined); await sleep(400);

    // 3D: stand 2.5 m south of the house at layout cell (18, 21) of seed 1818 facing it, then interact with the door (E; a click would first take the pointer lock)
    await nav('?intro=0&view=3d#seed=1818&sanity=100&cam3d=74,90.5,0,0');
    await sleep(600); await hold('w', 'KeyW', 150); await sleep(300); // a small step makes the view refresh its prompt
    const promptText = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return p.hidden?'':p.textContent})()`);
    const j0 = await ev(`document.getElementById('whispers').children.length`);
    if (promptText) { await key('e'); await sleep(500); }
    const j1 = await ev(`document.getElementById('whispers').children.length`);
    rec('3d: facing a house door shows a prompt and E on the door adds a journal entry', !!promptText && j1 > j0, { prompt: promptText, entriesBefore: j0, entriesAfter: j1 });
    await special('Escape', 27, undefined); await sleep(300);

    // ?meshes=1 on the 2D board and the meshes page
    await nav('?intro=0&meshes=1#seed=1818&sanity=100');
    const glbs = await ev(`performance.getEntriesByType('resource').filter((r)=>r.name.includes('.glb')).length`);
    rec('meshes: ?meshes=1 fetches all 13 original GLBs without an exception', glbs >= 13 && errs.length === 0, { glbRequests: glbs });
    await nav('meshes.html');
    let mp = await text('summary');
    for (let i = 0; i < 20 && !/loaded/.test(mp); i++) { await sleep(500); mp = await text('summary'); }
    rec('meshes: meshes.html loads every mesh', /^13 of 13 meshes loaded/.test(mp), { summary: mp });

    // codex and achievements
    await nav('?intro=0#seed=1818&sanity=100');
    await key('k'); await sleep(200); await ev(`document.getElementById('tab-progress').click()`); await sleep(200);
    const cdx = await ev(`({codex:!document.getElementById('codexPanel').hidden,progressPane:!document.getElementById('pane-progress').hidden,log:document.getElementById('progressLog').children.length})`);
    rec('codex: K opens the codex and the Progress tab shows the log', cdx.codex && cdx.progressPane && cdx.log >= 1, cdx);

    // high contrast
    await nav('?intro=0&contrast=1#seed=1818&sanity=100');
    const hc1 = await ev(`[document.documentElement.classList.contains('hc'),document.getElementById('contrastToggle').getAttribute('aria-pressed')]`);
    await key('h'); await sleep(200);
    const hc2 = await ev(`document.documentElement.classList.contains('hc')`);
    rec('contrast: ?contrast=1 turns the hc theme on and H toggles it off', hc1[0] && hc1[1] === 'true' && hc2 === false, { initial: hc1, afterH: hc2 });

    // French
    await nav('?intro=0&lang=fr#seed=1818&sanity=100');
    const fr = await ev(`[document.documentElement.lang,document.getElementById('contrastToggle').textContent]`);
    rec('i18n: ?lang=fr switches the page language and labels', fr[0] === 'fr' && fr[1] === 'Contraste eleve (H)', { lang: fr[0], contrast: fr[1] });

    // 3D fly-through at the Abyss (night 5 opens near the bottom of the sanity range). The framing itself is proven by the node tests and docs/media/r16-omen.png.
    await nav('?intro=0&view=3d&cinematic=1#seed=1818&night=5');
    const oa = await shotHash(); await sleep(2000); const ob = await shotHash();
    const sanityNow = Number((await text('sanityOut')).replace(/\D+/g, ''));
    rec('cinematic 3D: night 5 fly-through runs at low sanity with the omen view moving', oa !== ob && !(await hidden('view3d')) && sanityNow <= 30, { before: oa, after: ob, sanity: sanityNow, caption: (await text('cinemaCaption')).slice(0, 60) });
    await special('Escape', 27, undefined); await sleep(400);

    // real-time frame timing
    await nav('?intro=0&view=3d#seed=1818&sanity=60');
    await ev(`window.__ft=[];(function t(ts){window.__ft.push(ts);if(window.__ft.length<600)requestAnimationFrame(t)})(performance.now())`);
    await hold('w', 'KeyW', 6000);
    const stats = frameStats(await ev(`window.__ft`));
    const renderer = await ev(`(()=>{const g=document.createElement('canvas').getContext('webgl'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'n/a'})()`);
    rec('3d: real-time frame timing, SwiftShader software GL (indicative only)', stats.frames > 30, { ...stats, renderer });

    // pointer-lock fallback last: the injected script persists for later navigations
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Element.prototype.requestPointerLock=undefined;' });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&view=3d#seed=1818&sanity=60');
    const noLock = await ev(`typeof document.getElementById('view3d').requestPointerLock`);
    const a = await shotHash(); await drag(cx, cy); await sleep(500); const b = await shotHash();
    rec('3d fallback: without requestPointerLock, drag-look rotates the view', noLock === 'undefined' && a !== b, { requestPointerLock: noLock, before: a, after: b });
    await click(cx, cy); await sleep(400);
    rec('3d fallback: click-pick without a lock throws nothing', errs.length === 0, { errors: errs.slice(0, 3) });
    await special('Escape', 27, undefined); await sleep(400);
    rec('3d fallback: a single Escape exits to 2D when there is no lock', await hidden('view3d'), {});
    rec('no uncaught exception or console.error across the run', errs.length === 0, { errors: errs.slice(0, 5) });
  } catch (e) { console.log('DRIVER ERROR ' + e.message); results.push(false); }
  const passed = results.filter(Boolean).length;
  console.log(`SUMMARY ${passed}/${results.length} passed`);
  ws.close(); chrome.kill(); await sleep(500);
  try { rmSync(ud, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp profile left behind in the OS temp dir */ }
  process.exit(passed === results.length ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
