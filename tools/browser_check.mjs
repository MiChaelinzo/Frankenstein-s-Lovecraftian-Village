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
  let id = 0; const pending = new Map(), errs = [], warns = [], results = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'warning') { const t = d.params.args.map((a) => a.value || a.description).join(' '); if (t.includes('[view3d]')) warns.push(t); }
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
    // Round 17 post pass: the default render and the ?post=0 direct render are both non-blank, and neither logs a 3D warning.
    const canvasBytes = async () => { const rr = await ev(`document.getElementById('view3d').getBoundingClientRect().toJSON()`); return (await send('Page.captureScreenshot', { format: 'png', clip: { x: rr.x, y: rr.y, width: rr.width, height: rr.height, scale: 1 } })).result.data.length; };
    const withPost = await canvasBytes();
    rec('3d post: default render is non-blank and logs no 3D warning', withPost > 20000 && warns.length === 0, { bytes: withPost, warns: warns.slice(0, 3) });
    await nav('?intro=0&view=3d&post=0#seed=1818&sanity=60'); await sleep(1500);
    const noPost = await canvasBytes();
    rec('3d post: ?post=0 falls back to direct rendering, still non-blank, no warning', noPost > 20000 && warns.length === 0, { bytes: noPost, warns: warns.slice(0, 3) });
    await nav('?intro=0&view=3d#seed=1818&sanity=60'); await sleep(800);
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
    // 3D vigil: the same spot looking up at the door lantern; E lights it once, restoring sanity and counting the lamp
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&view=3d#seed=1818&sanity=70&cam3d=74,90.5,0,16');
    await sleep(600); await hold('w', 'KeyW', 150); await sleep(300);
    const lampPrompt = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return p.hidden?'':p.textContent})()`);
    const ls0 = Number(await text('sanityOut'));
    await key('e'); await sleep(900);
    const ls1 = Number(await text('sanityOut')), lobj = await text('objectiveText');
    await key('e'); await sleep(900);
    const ls2 = Number(await text('sanityOut'));
    rec('3d vigil: looking up at a door lantern, E lights it once and restores sanity', lampPrompt === 'Light the lantern' && ls1 > ls0 && ls2 <= ls1 && /lanterns lit 1\/3/.test(lobj), { lampPrompt, ls0, ls1, ls2, lobj });
    rec('3d: facing a house door shows a prompt and E on the door adds a journal entry', /^Try the door/.test(promptText) && j1 > j0, { prompt: promptText, entriesBefore: j0, entriesAfter: j1 });
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

    // ---- the vigil: objective line, lanterns, clues, endure the night, ending dialog, result card, begin again ----
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&reduced=1#seed=4321&sanity=100'); // a seed no earlier check played, so no autosaved vigil is restored
    const obj0 = await text('objectiveText');
    rec('vigil: a fresh seed shows the objective line', /^Night 1 of 5: clues 0\/2, lanterns lit 0\/3, the name: /.test(obj0), { obj0 });
    await ev(`document.getElementById('whisper').click()`); await sleep(200);
    const obj1 = await text('objectiveText');
    await ev(`document.getElementById('whisper').click()`); await sleep(200);
    const obj2 = await text('objectiveText');
    rec('vigil: a new source adds a clue, hearing it again does not', /clues 1\/2/.test(obj1) && /clues 1\/2/.test(obj2), { obj1, obj2 });
    const sBefore = Number(await text('sanityOut'));
    await key('l'); await sleep(250);
    const sAfter = Number(await text('sanityOut')), obj3 = await text('objectiveText');
    rec('vigil: the candle lights a lantern, restores sanity and updates the count', sAfter > sBefore && /lanterns lit 1\/3/.test(obj3), { sBefore, sAfter, obj3 });
    await key('l'); await key('l'); await sleep(200);
    const sFull = Number(await text('sanityOut'));
    await key('l'); await sleep(250);
    const sNone = Number(await text('sanityOut'));
    rec('vigil: no sanity once the night\'s lanterns are lit', sNone <= sFull && /No unlit lantern/.test(await text('narration')), { sFull, sNone, narration: await text('narration') });
    rec('vigil: endure is hidden until enough is heard', await hidden('endure'), {});

    // Sandbox lock: the vigil is live (started, not finished), so the sandbox controls refuse and say why.
    const lk = await ev(`(()=>{const g=(i)=>document.getElementById(i);return {ids:['sanity','night','nightPrev','nightNext','reroll','seed','dailyBtn','loadSession','drain'].map((i)=>g(i).disabled&&g(i).getAttribute('aria-disabled')==='true'),reason:g('vigilLock').hidden?'':g('vigilLock').textContent}})()`);
    rec('vigil lock: after the first clue the sandbox controls are disabled with a visible reason', lk.ids.every(Boolean) && lk.reason === 'The vigil binds you. End it to tamper.', { lk });
    const seedLive = await ev(`document.getElementById('seed').value`), sanLive = Number(await text('sanityOut'));
    await key(']'); await key('['); await key('['); await key('n'); await key('z'); await key('.'); await key(','); await sleep(250);
    const lk2 = await ev(`[document.getElementById('seed').value, document.getElementById('night').value, location.hash.includes('seed=' + document.getElementById('seed').value)]`);
    rec('vigil lock: sanity keys, new village, daily and night keys are ignored while live', Number(await text('sanityOut')) === sanLive && lk2[0] === seedLive && lk2[1] === '0' && lk2[2] === true && /binds you/.test(await text('narration')), { sanLive, lk2, narration: await text('narration') });

    // A scripted careful player using only real controls. Returns the ending title; seeds are tried in order until the true ending shows.
    const play = (seed) => `(async () => {
      const $ = (i) => document.getElementById(i), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sanity = () => Number($('sanityOut').textContent);
      const relight = async () => { while (sanity() < 60 && !$('objectiveText').textContent.includes('lit 3/3')) { $('candle').click(); await wait(30); } };
      for (let guard = 0; guard < 8 && !$('ending').open; guard++) {
        const opts = [...$('listen').options].map((o) => o.value).filter(Boolean);
        const steps = [() => $('whisper').click(), () => $('church').click(), ...opts.map((v) => () => { $('listen').value = v; $('listen').dispatchEvent(new Event('change')); })];
        for (const step of steps) { if ($('ending').open || !$('endure').hidden) break; await relight(); step(); await wait(30); }
        if (!$('endure').hidden) { $('endure').click(); await wait(60); }
        else if (!$('ending').open) break;
      }
      await wait(300);
      return { open: $('ending').open, title: $('endingTitle').textContent, score: $('endingScore').textContent };
    })()`;
    let ended = null, usedSeed = 0;
    for (const sd of [1818, 7, 42, 99, 2024, 31337, 5, 11, 123, 777, 4242, 9001]) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
      await nav(`?intro=0&reduced=1#seed=${sd}&sanity=100`);
      ended = await ev(play(sd)); usedSeed = sd;
      if (ended.open && ended.title === 'The Name Spoken') break;
    }
    rec('vigil: a scripted run endures every night and reaches the true ending on a known seed', ended.open && ended.title === 'The Name Spoken', { seed: usedSeed, ended });
    const dlg = await ev(`[document.getElementById('endingEpitaph').textContent.length>20, document.getElementById('endingScore').textContent, document.getElementById('endingFound').textContent]`);
    rec('vigil: the ending dialog shows an epitaph, score, rank and endings found', dlg[0] && /Score \d+, rank \w+/.test(dlg[1]) && /Endings found [1-6]\/6/.test(dlg[2]), { dlg });
    await ev(`window.__blobs=[];const oc=URL.createObjectURL.bind(URL);URL.createObjectURL=(b)=>{window.__blobs.push(b);return oc(b)};document.getElementById('endingCard').click()`); await sleep(600);
    const px = await ev(`(async()=>{const b=window.__blobs.find((x)=>x.type==='image/png');if(!b)return null;const im=await createImageBitmap(b),c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;const seen=new Set();let lit=0;for(let i=0;i<d.length;i+=4*97){seen.add((d[i]>>4)*256+(d[i+1]>>4)*16+(d[i+2]>>4));if(d[i]+d[i+1]+d[i+2]>300)lit++}return {w:c.width,h:c.height,colors:seen.size,lit}})()`);
    rec('vigil: the result card PNG is 1200x630 and not blank', !!px && px.w === 1200 && px.h === 630 && px.colors > 20 && px.lit > 20, { px });
    await ev(`window.__copied=null;navigator.clipboard.writeText=async(t)=>{window.__copied=t};document.getElementById('endingCopy').click()`); await sleep(300);
    const copied = await ev(`window.__copied`);
    rec('vigil: Copy result yields a result code and a link', /\| V1-\d+-\w+-\d+\n.*#seed=/.test(copied || ''), { copied });
    const seedBefore = await ev(`document.getElementById('seed').value`);
    await ev(`document.getElementById('endingAgain').click()`); await sleep(500);
    const again = await ev(`[document.getElementById('ending').open, document.getElementById('seed').value, document.getElementById('objectiveText').textContent]`);
    rec('vigil: Begin again closes the dialog and starts a fresh vigil on a new seed', again[0] === false && again[1] !== seedBefore && /clues 0\//.test(again[2]), { seedBefore, again });
    const rel = await ev(`['sanity','night','reroll','seed','dailyBtn'].map((i)=>document.getElementById(i).disabled).concat(document.getElementById('vigilLock').hidden)`);
    rec('vigil lock: Begin again releases the lock', rel.slice(0, 5).every((d) => d === false) && rel[5] === true, { rel });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&reduced=1#seed=4322&sanity=100');
    const freeBefore = Number(await text('sanityOut'));
    await key('['); await sleep(200);
    const freeAfter = Number(await text('sanityOut'));
    rec('vigil lock: free roam before any vigil action is unaffected (sanity key works, controls enabled)', freeAfter === freeBefore - 5 && await ev(`!document.getElementById('sanity').disabled && !document.getElementById('reroll').disabled`), { freeBefore, freeAfter });
    await ev(`(async()=>{for(let i=0;i<16&&!document.getElementById('ending').open;i++){document.getElementById('whisper').click();await new Promise((r)=>setTimeout(r,40))}})()`); await sleep(500);
    const hollow = await ev(`[document.getElementById('ending').open, document.getElementById('endingTitle').textContent]`);
    rec('vigil: whispering sanity down to 0 ends the vigil as Hollowed', hollow[0] === true && hollow[1] === 'Hollowed', { hollow });
    // title screen: bare URL shows it with both entries, nothing plays until opted in; ?webgl=0 is the documented no-WebGL switch
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('');
    const ti = await ev(`(()=>{const g=(i)=>document.getElementById(i);return {open:!g('title').hidden,heading:g('titleHeading').textContent,enter3d:!g('titleEnter3d').disabled,map2d:!!g('titleMap2d'),sound:g('titleSound').checked,musicOn:g('sound').checked,rumor:g('titleRumor').textContent.length>10,endings:g('titleEndings').textContent,inert:document.getElementById('main').inert,veilHidden:g('loading').hidden,focus:document.activeElement&&document.activeElement.id,help:!!g('titleHelp')}})()`);
    rec('title: a bare URL shows the title screen with both CTAs, an unchecked sound toggle and the endings line', ti.open && /Frankenstein/.test(ti.heading) && ti.enter3d && ti.map2d && ti.help && !ti.sound && !ti.musicOn && ti.rumor && /^Endings found \d\/6$/.test(ti.endings) && ti.inert && ti.veilHidden && ti.focus === 'titleEnter3d', ti);
    const meta = await ev(`['og:title','og:description','og:image','og:url','og:image:alt'].map((p)=>!!document.querySelector('meta[property="'+p+'"]')).concat(['twitter:card','twitter:image'].map((n)=>!!document.querySelector('meta[name="'+n+'"]')),[!!document.querySelector('link[rel=canonical]')])`);
    rec('title: Open Graph, Twitter and canonical tags are present', meta.every(Boolean), { meta });
    await special('Escape', 27); await sleep(300);
    const ts2 = await ev(`[document.getElementById('title').hidden, document.getElementById('view3d').hidden, document.getElementById('main').inert]`);
    rec('title: Escape opens the 2D map view', ts2[0] === true && ts2[1] === true && ts2[2] === false, { ts2 });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('');
    await ev(`document.getElementById('titleEnter3d').click()`); await sleep(1500);
    const ts3 = await ev(`[document.getElementById('title').hidden, document.getElementById('view3d').hidden, document.getElementById('view3dBtn').getAttribute('aria-pressed')]`);
    rec('title: Enter the village (3D) starts the first-person view', ts3[0] === true && ts3[1] === false && ts3[2] === 'true', { ts3 });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?webgl=0');
    const ts4 = await ev(`[document.getElementById('titleEnter3d').disabled, document.getElementById('titleReason').textContent, document.activeElement.id]`);
    rec('title: without WebGL the 3D entry is disabled with a reason and 2D is focused', ts4[0] === true && /WebGL/.test(ts4[1]) && ts4[2] === 'titleMap2d', { ts4 });
    await key('Enter', 'Enter', 13, '\r'); await sleep(300);
    rec('title: Enter on the title activates the 2D entry when 3D is unavailable', await hidden('title') && await hidden('view3d'), {});
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0');
    rec('title: ?intro=0 skips it', await hidden('title'), {});
    await key('?', 'Slash', 191, '?'); await sleep(300);
    const hp = await ev(`[document.getElementById('help').open, document.querySelectorAll('#help .help-group').length, !!document.getElementById('keys'), document.getElementById('helpDevice').textContent]`);
    rec('help: ? opens the grouped help dialog and the long keyboard list is gone', hp[0] === true && hp[1] === 5 && hp[2] === false && /Last used/.test(hp[3]), { hp });
    await special('Escape', 27); await sleep(300);
    rec('help: Escape closes the dialog', (await ev(`document.getElementById('help').open`)) === false, {});
    rec('no uncaught exception or console.error across the run', errs.length === 0, { errors: errs.slice(0, 5) });
  } catch (e) { console.log('DRIVER ERROR ' + e.message); results.push(false); }
  const passed = results.filter(Boolean).length;
  console.log(`SUMMARY ${passed}/${results.length} passed`);
  ws.close(); chrome.kill(); await sleep(500);
  try { rmSync(ud, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp profile left behind in the OS temp dir */ }
  process.exit(passed === results.length ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
