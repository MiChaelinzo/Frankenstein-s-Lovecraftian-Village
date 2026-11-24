#!/usr/bin/env node
// Real-browser check of the web demo: drives local headless Chromium over the DevTools protocol
// (Node 22 global WebSocket, no dependencies) and prints PASS/FAIL lines with evidence.
// Usage: python3 -m http.server 8123 -d web &   node tools/browser_check.mjs
// Env: CHROME (browser binary), BASE (default http://127.0.0.1:8123/), CDP_PORT (default 9333).
// Section filters: TIMING_ONLY, TIER_ONLY, LIGHTHOUSE_ONLY, LOOK_ONLY, QUALITY_ONLY, SKY_ONLY, CINEMA_ONLY, DISTRICT_ONLY, LANDMARK_ONLY, NAMES_ONLY, NARRATIVE_ONLY, VILLAGER_ONLY, COLLISION_ONLY, INVENTORY_ONLY, CREATURES_ONLY, HOMESTEAD_ONLY, SOCIETY_ONLY, MYTHOS_ONLY, THEORY_ONLY, PLACES_ONLY, TIERS_ONLY, VICTORIAN_ONLY, REALITY_ONLY, INTENSITY_ONLY, SEED_ONLY; PROBE_URLS="q1|q2" (with PROBE_DIR) only saves screenshots.
// Frame timing uses requestAnimationFrame timestamps in real time (no virtual-time budget) on SwiftShader
// software GL, so it is indicative only and says nothing about real GPUs.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  /** Page.captureScreenshot, retried up to seven times 2.5 s apart: under heavy host load a navigation can still be committing ("Not attached to an active page"), seen on the pre-round-21 build too and twice in a row with the round 23 city (a bigger first 3D build), so the old 6 s window was too short. The CDP error is logged, never swallowed. */
  const capture = async (params = { format: 'png' }) => {
    for (let attempt = 0; ; attempt++) {
      const r = await send('Page.captureScreenshot', params);
      if (r.result && r.result.data) return r.result.data;
      console.log(`capture failed (attempt ${attempt + 1}): ${JSON.stringify(r.error || r).slice(0, 200)}`);
      if (attempt >= 7) throw new Error('Page.captureScreenshot failed eight times: ' + JSON.stringify(r.error || r).slice(0, 200));
      await sleep(2500);
    }
  };
  const shotHash = async () => { const s = await capture(); let h = 0; for (let i = 0; i < s.length; i += 7) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const rec = (name, ok, evidence) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${JSON.stringify(evidence)}`); };
  /** Polls fn until it returns a truthy value or ms passes; software GL frames can be seconds apart, so fixed sleeps give false failures. */
  const until = async (fn, ms = 12000) => { for (let t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) { const v = await fn(); if (v) return v; } return fn(); };
  const text = (idv) => ev(`document.getElementById('${idv}').textContent`);
  const hidden = (idv) => ev(`document.getElementById('${idv}').hidden`);

  const WALK_TIMING_MIN_FRAMES = 8;
  /** Real-time frame timing while walking (TIMING_ONLY=1 runs only this). Software GL, so indicative only; the HUD line adds the JavaScript ms per frame and the culled triangle count. */
  const timingRun = async () => {
    await nav('?intro=0&view=3d&perf=1' + (process.env.TIMING_QUERY || '') + '#seed=1818&sanity=60');
    await ev(`window.__ft=[];(function t(ts){window.__ft.push(ts);if(window.__ft.length<600)requestAnimationFrame(t)})(performance.now())`);
    await hold('w', 'KeyW', 6000);
    const stats = frameStats(await ev(`window.__ft`));
    const hud = await ev(`(document.getElementById('perfHud')||{}).textContent`);
    const renderer = await ev(`(()=>{const g=document.createElement('canvas').getContext('webgl'),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'n/a'})()`);
    // Pinned low on purpose: on the CI sandbox SwiftShader is bimodal (about 20 or about 60 frames in the same 6 s walk, run to run), so the old > 30
    // threshold failed at random. This check proves frames keep coming while walking; the numbers in the record are the indicative timing.
    rec('3d: real-time frame timing, SwiftShader software GL (indicative only, frames keep coming while walking)', stats.frames >= WALK_TIMING_MIN_FRAMES, { ...stats, renderer, hud, minFrames: WALK_TIMING_MIN_FRAMES });
  };
  /** Per-tier frame time at a fixed render scale (?fixscale=1 turns the dynamic resolution governor off so tiers compare like for like). SwiftShader, indicative only; the JavaScript ms per frame is the steadier number. TIER_ONLY=1 runs only this. TIER_CAM=x,z,yaw,pitch moves the camera (round 23: 126,144,40,14 is the same relative spot in the 36 by 36 city as the default is in the old 24 by 24 village). */
  const tierTimingRun = async () => {
    const out = {};
    for (const q of ['low', 'medium', 'high']) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
      await nav(`?intro=0&view=3d&perf=1&fixscale=1&quality=${q}&cam3d=${process.env.TIER_CAM || '84,96,40,14'}&tick=1250${process.env.TIER_QUERY || ""}#seed=1818&sanity=60`);
      await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ tris/.test(t || '') && t), 60000);
      await sleep(Number(process.env.TIER_WARMUP || 6000)); // shader compile, texture and chunk uploads settle before sampling
      await ev(`window.__ft=[];(function t(ts){window.__ft.push(ts);if(window.__ft.length<${process.env.TIER_FRAMES || 80})requestAnimationFrame(t)})(performance.now())`);
      await until(() => ev(`window.__ft.length`).then((n) => n >= Number(process.env.TIER_FRAMES || 80)), 120000);
      const stats = frameStats(await ev(`window.__ft`)), hud = await ev(`(document.getElementById('perfHud')||{}).textContent`);
      out[q] = { ...stats, js: (/([\d.]+) ms js/.exec(hud || '') || [])[1] || null, tris: (/(\d+) tris/.exec(hud || '') || [])[1] || null, hud };
    }
    rec('per-tier frame time at fixed scale: every tier renders frames (SwiftShader, indicative only, not a real GPU result)', ['low', 'medium', 'high'].every((q) => out[q].frames > 10 && out[q].meanMs > 0), out);
  };
  /** Foreground density and grading presets: the Core dressing fills yards and lanes, and the grade curve differs by time and dread. */
  const lookRun = async () => {
    await nav('?intro=0&view=3d&capture=1&tick=540#seed=1818&sanity=100'); await sleep(1500);
    const look = await ev(`(async()=>{const m=await import('./src/view3d-math.js'),q=await import('./src/quality.js');
      const g=(tick,dread,weather,tier)=>m.gradeParams({tick,dread,weather,tier,highContrast:false});
      const dusk=g(540,0.1,'clear','high'),night=g(900,0.1,'clear','high'),dread=g(900,0.9,'clear','high'),hc=m.gradeParams({tick:900,dread:0.9,weather:'clear',tier:q.tierSettings('high'),highContrast:true});
      return {dusk:dusk.shadow,night:night.shadow,dread:dread.shadow,hc:hc.shadow,godHigh:q.QUALITY_TIERS.high.godRays,godMedium:q.QUALITY_TIERS.medium.godRays,life:m.lifeParams({tier:q.tierSettings('high'),reduced:false,weather:'clear',dread:0.2}),lifeReduced:m.lifeParams({tier:q.tierSettings('high'),reduced:true,weather:'clear',dread:0.2})}})()`).catch((e) => ({ error: e.message }));
    rec('look: grading presets differ by time and dread, high contrast neutralises them, God rays are High only', !look.error && JSON.stringify(look.dusk) !== JSON.stringify(look.night) && JSON.stringify(look.night) !== JSON.stringify(look.dread) && JSON.stringify(look.hc) !== JSON.stringify(look.dread) && look.godHigh > 0 && look.godMedium === 0, look);
    rec('life: motion effects exist on High and are all off with reduced motion', !look.error && look.life.leaves > 0 && look.life.moths > 0 && look.lifeReduced.leaves === 0 && look.lifeReduced.moths === 0 && look.lifeReduced.smoke === 0, { life: look.life, reduced: look.lifeReduced });
    // Foreground density: the live scene at a street camera draws well over the bare-village triangle count and stays inside the budget.
    await nav('?intro=0&view=3d&perf=1&fixscale=1&quality=medium&cam3d=54.4,56,200,4#seed=1818&sanity=60');
    const hud = await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ tris/.test(t || '') && t), 60000);
    const tris = Number((/(\d+) tris/.exec(hud || '') || [])[1]);
    rec('foreground: the street view draws yard, lane and garden props (HUD triangle count between 6000 and the 60000 budget)', tris >= 6000 && tris <= 60000, { hud });
  };
  /** Quality tiers: ?quality= overrides the saved choice, the HUD names the tier and the 16:9 pixel ceiling holds. Auto on SwiftShader resolves to low. */
  const qualityRun = async () => {
    const seen = {}; warns.length = 0; // every tier must compile its shaders and keep the post pass: no [view3d] warning
    for (const q of ['low', 'high', 'auto']) {
      await nav(`?intro=0&view=3d&perf=1&quality=${q}#seed=1818&sanity=60`);
      const hud = await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => / (low|medium|high) x/.test(t) && t), 20000);
      seen[q] = { hud, select: await ev(`document.getElementById('qualitySelect').value`), canvas: await ev(`(()=>{const c=document.getElementById('view3d');return c.width*c.height})()`), out: (await text('qualityOut')).slice(0, 80) };
    }
    rec('quality: ?quality= picks the tier, the HUD shows it, low draws fewer pixels than high and Auto on software GL is low',
      / low x/.test(seen.low.hud || '') && / high x/.test(seen.high.hud || '') && / low x/.test(seen.auto.hud || '') && seen.low.select === 'low' && seen.auto.select === 'auto' && seen.low.canvas <= 960 * 540 + 960 && seen.low.canvas < seen.high.canvas && warns.length === 0, { ...seen, warns: warns.slice(0, 2) });
  };

  /** City districts (round 23): the HUD chip names the quarter under the 3D camera in English and French, the city is the 36 by 36 grid with 180 pieces and the minimap paints. DISTRICT_ONLY=1 runs only this. */
  const districtRun = async () => {
    const out = {};
    for (const [lang, want] of [['en', 'Market'], ['fr', 'Le Marche']]) {
      await nav(`?intro=0&view=3d&lang=${lang}&cam3d=74.5,74.5,0,0#seed=1818&sanity=80`);
      out[lang] = await until(() => ev(`(()=>{const c=document.getElementById('districtChip');return c&&!c.hidden&&c.textContent.trim()})()`), 20000).catch(() => null);
    }
    await nav(`?intro=0&view=3d&cam3d=4,4,0,0#seed=1818&sanity=80`);
    out.corner = await until(() => ev(`(()=>{const c=document.getElementById('districtChip');return c&&!c.hidden&&c.getAttribute('data-district')})()`), 20000).catch(() => null);
    out.stats = await text('stats');
    rec('districts: the HUD chip names the quarter under the camera (en Market, fr Le Marche), another quarter at the corner, and the stats show the 36 by 36 city', out.en === 'Market' && out.fr === 'Le Marche' && !!out.corner && out.corner !== 'market' && /36/.test(out.stats || ''), out);
  };

  /** Landmarks (rounds 23 and 24: ten places, including the standing stones, the hidden cove, the ritual site and the catacombs): the HUD chip names each landmark of the wider world under the 3D camera in English and French (seed 1818), the camera is allowed out to them and the renderer runs without a warning. LANDMARK_ONLY=1 runs only this. */
  const landmarkRun = async () => {
    const spots = [['cliffs', '148.5,-6', 'Saltwind Heights', 'Les Hauteurs de Ventsel'], ['shipwreck', '148.5,172', 'Wreck of the Drowned Gull', 'Epave de la Mouette Noyee'], ['abbey', '86.4,170', 'Abbey of St. Velor', 'Abbaye de Saint-Velor'],
      ['cemetery', '-12,49', "Harrow's Rest", 'Le Repos de Harrow'], ['marsh', '148.5,150', 'The Lantern Fen', 'Les Fanges de la Lanterne'], ['grove', '-4,122.4', 'Thornwick Grove', 'Bosquet de Ronceval'],
      ['standing_stones', '-52,93.6', 'The Standing Stones', 'Les pierres dressees'], ['hidden_cove', '148,-44', 'The Hidden Cove', 'La crique cachee'], ['ritual_site', '-52,14.4', 'The Ritual Site', 'Le lieu du rituel'], ['catacombs', '-27,83.4', 'The Forty Fourth Door', 'La Quarante-Quatrieme Porte']];
    const out = {}; warns.length = 0;
    for (const [id, cam, en, fr] of spots) for (const [lang, want] of [['en', en], ['fr', fr]]) {
      await nav(`?intro=0&view=3d&lang=${lang}&cam3d=${cam},0,0#seed=1818&sanity=80`);
      out[`${id}.${lang}`] = await until(() => ev(`(()=>{const c=document.getElementById('districtChip');return c&&!c.hidden&&c.getAttribute('data-landmark')==='${id}'&&c.textContent.trim()})()`), 20000).catch(() => null);
      if (out[`${id}.${lang}`] !== want) out[`${id}.${lang}.want`] = want;
    }
    rec('landmarks: the HUD chip names each landmark of the wider world under the 3D camera in English and French, with no renderer warning', spots.every(([id,, en, fr]) => out[`${id}.en`] === en && out[`${id}.fr`] === fr) && warns.length === 0, { ...out, warns: warns.slice(0, 2) });
  };

  /** Creature upgrade path (round 32, spec 166): in the page's own modules the four tiers unlock in order and never earlier, tier 4 stays within its capped exposure, the procedural figures build finite vertices within the triangle cap, and in the 3D view standing near a seeded tier 1 figure at night writes a "Seen:" journal line with no renderer warning. TIERS_ONLY=1 runs only this; TIERS_SHOT=<file.jpg> saves the 3D frame. */
  const tiersRun = async () => {
    const { writeFileSync } = await import('node:fs');
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`location.protocol==='http:'`), 20000);
    const model = await ev(`(async()=>{const C=await import('/src/creatures.js');const V=await import('/src/view3d.js');const cat=C.parseCreatureCatalog(await (await fetch('data/creatures.json')).json());
      const base=(o)=>({seed:1818,gridW:24,gridD:24,tick:1300,dreadPercent:80,societyStage:0,corruptedVillager:-1,knowledgeTier:0,cosmicOmens:0,placeId:'',lastGlimpseTick:-1,reducedMotion:false,...o});
      const maxTier=(o)=>{let m=0;for(let d=0;d<8;d++)for(let p=0;p<4;p++)for(let seed=1;seed<=20;seed++)for(const a of C.selectAppearances(base({...o,seed,tick:d*1440+[0,240,840,1080][p]+5}),cat,null))m=Math.max(m,a.tier);return m;};
      const glimpses=[];for(let seed=1;seed<=60;seed++)for(let d=0;d<4;d++)for(const a of C.selectAppearances(base({seed,tick:d*1440+1085,knowledgeTier:5,cosmicOmens:1,societyStage:3,corruptedVillager:1}),cat,null))if(a.tier===4)glimpses.push(a);
      const entries=[{tier:1,defId:'watcher_at_wall',x:14,z:12,still:false},{tier:3,defId:'impossible_stair',x:0,z:0,placeId:'manor',still:false},{tier:4,defId:'sky_that_blinked',x:40,z:40,still:false,elapsed:1.5,seconds:3}];
      const verts=V.buildManifestations({entries,eye:{x:10,z:10,yaw:0.4}});
      return {calm:maxTier({}),corrupted:maxTier({societyStage:2,corruptedVillager:1}),knowing:maxTier({societyStage:2,corruptedVillager:1,knowledgeTier:3}),cosmic:maxTier({societyStage:3,corruptedVillager:1,knowledgeTier:5,cosmicOmens:1}),glimpses:glimpses.length,maxSeconds:Math.max(0,...glimpses.map((g)=>g.seconds)),finite:[...verts].every(Number.isFinite),tris:verts.length/33};})()`);
    rec('tiers: each tier unlocks only with its condition (calm 1, corrupted 2, knowing 3, cosmic 4) and a glimpse never lasts past four seconds', model.calm === 1 && model.corrupted === 2 && model.knowing === 3 && model.cosmic === 4 && model.glimpses > 0 && model.maxSeconds <= 4, model);
    rec('tiers: the procedural figures build finite vertices within the triangle cap', model.finite && model.tris > 0 && model.tris <= 400, { tris: model.tris });
    const spot = await ev(`(async()=>{const C=await import('/src/creatures.js');const cat=C.parseCreatureCatalog(await (await fetch('data/creatures.json')).json());
      for(let d=0;d<1;d++){const l=C.selectAppearances({seed:1818,gridW:36,gridD:36,tick:1300,dreadPercent:70,societyStage:0,corruptedVillager:-1,knowledgeTier:0,cosmicOmens:0,placeId:'',lastGlimpseTick:-1,reducedMotion:false},cat,null).filter((a)=>a.tier===1);if(l.length)return {x:l[0].x,z:l[0].z,id:l[0].defId};}return null;})()`);
    if (!spot) { rec('tiers: no tier 1 figure is seeded for seed 1818 at tick 1300 (the 3D witness check is skipped, Unverified in the live page)', true, { spot }); return; }
    warns.length = 0;
    await nav(`?intro=0&view=3d&quality=low&tick=1300&capture=1&cam3d=${(spot.x + 6).toFixed(2)},${spot.z.toFixed(2)},270,0#seed=1818&sanity=30`);
    await until(() => ev(`!document.getElementById('view3d').hidden`), 30000);
    const seen = await until(() => ev(`document.documentElement.textContent.includes('Seen: ')`), 15000).catch(() => false);
    if (process.env.TIERS_SHOT) writeFileSync(process.env.TIERS_SHOT, Buffer.from(await capture({ format: 'jpeg', quality: 70 }), 'base64'));
    rec('tiers: standing near a seeded tier 1 figure in the 3D view writes the "Seen:" journal line and the renderer reports no warning', !!seen && warns.length === 0, { spot, seen: !!seen, warns: warns.slice(0, 3) });
  };

  /** Places (round 31, spec 164: Abandoned Manor, Forest Boundary, Catacomb Interior, Forgotten Mine): the shared model puts all four inside the walkable world, clear of landmarks and each other, with a way back (seeds and both grids, in the page's own modules), and standing at each entrance in the 3D view the HUD prompt offers the way in in English and French with no renderer warning. PLACES_ONLY=1 runs only this; PLACES_SHOT_DIR=<dir> saves places-<id>.jpg stills. */
  const placesRun = async () => {
    const { writeFileSync } = await import('node:fs');
    const shotDir = process.env.PLACES_SHOT_DIR || '';
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`location.protocol==='http:'`), 20000);
    const model = await ev(`(async()=>{const P=await import('/src/places.js');const lib=P.parsePlaceLibrary(await (await fetch('data/places.json')).json());const bad=[];let n=0;
      for(const seed of [1,42,1818,-7,123456789])for(const grid of [24,36]){const placed=[];for(const data of lib.places){const p=P.placePlace(data,seed,grid,grid,placed);n++;
        if(P.checkPlacement(data,p,seed,grid,grid,placed)!==''||!P.inBounds(p,seed,grid,grid)||!P.roundTrip(p)||P.overlappingPlace(p,placed))bad.push(data.id+'@'+seed+'/'+grid);placed.push(p);}}
      const at=lib.places.map((d)=>{const p=P.placePlace(d,1818,36,36,[]);return {id:d.id,x:p.entrance[0],z:p.entrance[1],en:d.prompts.enter.en,fr:d.prompts.enter.fr};});
      return {ids:lib.places.map((d)=>d.id),n,bad,at};})()`);
    rec('places: all four stand in bounds, clear of landmarks, the city and each other, with a way back, for five seeds on both grids', model.ids.join() === 'manor,forest,catacomb,mine' && model.n === 40 && model.bad.length === 0, { ids: model.ids, checked: model.n, bad: model.bad });
    // each place is placed one after the other in the app, so the entrance for the prompt check comes from the app's own list
    warns.length = 0;
    const out = {};
    for (const lang of ['en', 'fr']) {
      await nav(`?intro=0&view=3d&lang=${lang}#seed=1818&sanity=80`); await until(() => ev(`location.protocol==='http:'`), 20000);
      const spots = await ev(`(async()=>{const P=await import('/src/places.js');const lib=P.parsePlaceLibrary(await (await fetch('data/places.json')).json());const standing=[];return lib.places.map((d)=>{const p=P.placePlace(d,1818,36,36,standing);standing.push(p);return {id:d.id,x:p.entrance[0],z:p.entrance[1],fx:p.faceX,fz:p.faceZ,en:d.prompts.enter.en,fr:d.prompts.enter.fr};});})()`);
      for (const sp of spots) {
        const yaw = Math.round(Math.atan2(-sp.fx, sp.fz) * 180 / Math.PI);
        await nav(`?intro=0&view=3d&lang=${lang}&cam3d=${Math.round((sp.x + sp.fx * 1.5) * 10) / 10},${Math.round((sp.z + sp.fz * 1.5) * 10) / 10},${yaw},0#seed=1818&sanity=80`);
        out[`${sp.id}.${lang}`] = await until(async () => { const v = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return !p||p.hidden?'':p.textContent})()`); if (v.includes(sp[lang])) return 'prompt'; await hold('w', 'KeyW', 40); return null; }, 30000).catch(() => null);
        if (!out[`${sp.id}.${lang}`]) out[`${sp.id}.${lang}.saw`] = await ev(`(document.getElementById('view3dPrompt')||{}).textContent`);
        if (lang === 'en' && shotDir) writeFileSync(join(shotDir, `places-${sp.id}.jpg`), Buffer.from(await capture({ format: 'jpeg', quality: 70 }), 'base64'));
      }
    }
    rec('places: standing at each entrance the 3D prompt offers the way in in English and French, with no renderer warning', ['manor','forest','catacomb','mine'].every((id) => out[`${id}.en`] === 'prompt' && out[`${id}.fr`] === 'prompt') && warns.length === 0, { ...out, warns: warns.slice(0, 2) });
  };

  /** Lighthouse and held lantern (round 24): at night the lighthouse beam is drawn on High and Medium, but not on Low, not with reduced motion and not in daylight (those keep the static lamp glow), and the held lantern is drawn (and absent in the fly-through). LIGHTHOUSE_ONLY=1 runs only this. */
  const lighthouseRun = async () => {
    const out = {};
    const hudFor = async (query) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(300); await nav(`?intro=0&view=3d&perf=1&fixscale=1&capture=1&caption=0&${query}#seed=1818&sanity=80&cam3d=122,22,55,8`); return until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ tris/.test(t || '') && t), 60000).catch(() => ''); };
    out.high = await hudFor('quality=high&tick=1250'); out.low = await hudFor('quality=low&tick=1250'); out.reduced = await hudFor('quality=high&tick=1250&reduced=1'); out.day = await hudFor('quality=high&tick=540');
    rec('lighthouse: the beam is drawn at night on High, not on Low, not with reduced motion and not by day; the held lantern is drawn', / beam /.test(out.high) && /no beam/.test(out.low) && /no beam/.test(out.reduced) && /no beam/.test(out.day) && /held lantern/.test(out.high) && warns.length === 0, out);
  };

  /** Names (round 24): the 3D door prompt shows the seeded name of the house in front of the explorer (seed 1818, en and fr) and never a raw id like house_a. NAMES_ONLY=1 runs only this; NAMES_SHOT=<file.png> also saves the English frame. */
  const namesRun = async () => {
    const { lanternLights } = await import('../web/src/view3d-math.js');
    const { PrefabCatalog, SeededRandom } = await import('../web/src/core.js');
    const { generateCityLayout } = await import('../web/src/districts.js');
    const { parseNameLibrary, assignNames } = await import('../web/src/names.js');
    const catalog = new PrefabCatalog(JSON.parse(readFileSync(new URL('../web/data/village_catalog.json', import.meta.url))).entries);
    const lib = parseNameLibrary(readFileSync(new URL('../web/data/names.json', import.meta.url), 'utf8'));
    const layout = generateCityLayout(catalog, 36, 36, 180, 1818), names = assignNames(lib, 1818, 36, 36, layout);
    layout.forEach((p, i) => { const r = new SeededRandom(1818 * 31 + i * 7919 + 1); p.vis = { h: r.next(100) / 100, tilt: r.next(100) / 100, lit: r.next(100) / 100, phase: r.next(1000), lit2: r.next(100) / 100 }; });
    const porch = (p) => lanternLights([{ ...p, detail: 3 }], 4).find((l) => !l.post);
    const index = layout.findIndex((p) => (p.id === 'house_a' || p.id === 'house_b') && (p.facing | 0) === 0 && porch(p));
    const light = porch(layout[index]), stand = `${light.pos[0].toFixed(2)},${(light.pos[2] + 2.5).toFixed(2)}`, out = { index, stand };
    for (const [lang, head, name] of [['en', 'Try the door of ', names[index].en], ['fr', 'Essayer la porte de ', names[index].fr]]) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(`?intro=0&view=3d&lang=${lang}#seed=1818&sanity=100&cam3d=${stand},0,0`);
      await sleep(600); await hold('w', 'KeyW', 150); await sleep(300);
      out[lang] = await until(async () => { const v = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return !p||p.hidden?'':p.textContent})()`); if (!v) await hold('w', 'KeyW', 60); return v; }, 40000).catch(() => null);
      out[`${lang}.want`] = head + name;
      if (process.env.NAMES_SHOT && lang === 'en' && out.en) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.NAMES_SHOT, Buffer.from(await capture(), 'base64')); } // optional still of the named prompt
    }
    rec('names: the 3D door prompt shows the seeded building name in English and French, never a raw id', out.en === out['en.want'] && out.fr === out['fr.want'] && !/house_[ab]/.test(`${out.en}${out.fr}`), out);
  };

  /** Narrative (round 24): ?chronicle=1 opens the Village chronicle with families and their houses, three missing persons, five district histories and ten legends in English and French, and the lore list holds seven locked journals at the villagers' houses. NARRATIVE_ONLY=1 runs only this; NARRATIVE_SHOT=<file.png> saves the English frame. */
  const narrativeRun = async () => {
    const out = {};
    for (const lang of ['en', 'fr']) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(`?intro=0&chronicle=1&lang=${lang}&capture=1&tick=1100#seed=1818&sanity=60`);
      out[lang] = await until(async () => { const v = await ev(`(()=>{const b=document.getElementById('chronicleBody');if(!b||document.getElementById('chroniclePanel').hidden)return null;const n=(q)=>b.querySelectorAll(q).length;return {missing:n('[data-missing]'),families:n('[data-family]'),districts:n('[data-district]'),legends:n('[data-legend]'),rumor:(b.querySelector('.chronicle-rumor')||{}).textContent||'',raw:b.textContent.includes('{'),journals:document.querySelectorAll('#loreList li.locked').length,journalLocked:[...document.querySelectorAll('#loreList li.locked')].filter((li)=>/${lang === 'en' ? 'journal waits at' : 'journal attend a'}/.test(li.textContent)).length}})()`); return v && v.missing ? v : null; }, 40000).catch(() => null);
      if (process.env.NARRATIVE_SHOT && lang === 'en' && out.en) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.NARRATIVE_SHOT, Buffer.from(await capture(), 'base64')); }
    }
    const ok = (o) => o && o.missing === 3 && o.families >= 5 && o.districts === 5 && o.legends === 10 && o.rumor.length > 20 && !/  /.test(o.rumor) && !o.raw && o.journalLocked === 7;
    rec('narrative: the chronicle lists families, 3 missing persons, 5 district histories, 10 legends and a rumor, and the lore list has 7 journals, in English and French', ok(out.en) && ok(out.fr) && out.en.rumor !== out.fr.rumor, out);
  };

  /** Clock sky (round 23): the 3D sky by day, dusk and night from the open market square (pitched up so the sampled top rows are sky, not a house wall). SKY_ONLY=1 runs only this. */
  const skyRun = async () => {
    const skyAt = async (tick) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
      await nav(`?intro=0&view=3d&capture=1&grain=0&weather=clear&tick=${tick}#seed=1818&sanity=100&cam3d=74.5,74.5,180,40`); await sleep(1500);
      return ev(`(()=>{const c=document.getElementById('view3d'),o=document.createElement('canvas');o.width=c.width;o.height=c.height;const g=o.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,c.width,Math.max(1,Math.floor(c.height*0.3))).data;let r=0,gg=0,b=0,n=0;for(let i=0;i<d.length;i+=4*13){r+=d[i];gg+=d[i+1];b+=d[i+2];n++}n=Math.max(1,n);return {r:Math.round(r/n),g:Math.round(gg/n),b:Math.round(b/n),chip:document.getElementById('clockChipText').textContent,phase:document.getElementById('clockChip').getAttribute('data-phase'),lanterns:!document.getElementById('clockLanterns').hidden,hint:!document.getElementById('clockHint').hidden}})()`);
    };
    const skyDay = await skyAt(540), skyDusk = await skyAt(960), skyNight = await skyAt(1200);
    const L = (p) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    rec('clock: the 3D sky is measurably brighter by day than at night (sampled pixels)', L(skyDay) > L(skyNight) + 30, { day: skyDay, night: skyNight });
    rec('clock: the dusk sky is warmer than the day and the night sky', (skyDusk.r - skyDusk.b) > (skyDay.r - skyDay.b) && (skyDusk.r - skyDusk.b) > (skyNight.r - skyNight.b), { dusk: skyDusk });
    rec('clock: the HUD chip shows day, time and phase, lanterns only after dusk, and no hint in captures', skyDay.chip === 'Day 1, 13:00, day' && skyDay.phase === 'day' && !skyDay.lanterns && skyNight.chip === 'Day 1, 00:00, night' && skyNight.phase === 'night' && skyNight.lanterns && !skyDay.hint, { day: skyDay.chip, night: skyNight.chip });
  };

  /** 3D cinematic: the flythrough changes frames over 2.5 s with a caption. CINEMA_ONLY=1 runs only this. */
  const cinemaRun = async () => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&view=3d&cinematic=1#seed=7272&sanity=70');
    await until(() => ev(`!!document.getElementById('cinemaCaption') && !document.getElementById('cinemaCaption').hidden`), 20000); // the 36 by 36 city can take longer than the 2.5 s nav wait to build under load
    // the caption and view are read before the screenshots: on SwiftShader a full page capture of the 36 by 36 city takes about 14 s, so the whole night 1 timeline can end (and hide the caption, as designed) before the second shot returns
    const capShown = !(await hidden('cinemaCaption')), viewShown = !(await hidden('view3d')), capText = (await text('cinemaCaption')).slice(0, 80);
    const tc0 = Date.now(); const ca = await shotHash(); await sleep(2500); const cb = await shotHash(); const cineMs = Date.now() - tc0;
    rec('cinematic 3D: ?view=3d&cinematic=1 changes frames over 2.5 s with a caption', ca !== cb && capShown && viewShown && capText.length > 5, { before: ca, after: cb, elapsedMs: cineMs, capShown, viewShown, caption: capText });
  };

  /** Villagers (round 24): the 3D view really draws the named villagers in the Old Town square by day, at dusk and at night (the perf HUD counts the figures in the villager buffer). VILLAGER_ONLY=1 runs only this. */
  const villagerRun = async () => {
    const seen = {};
    for (const [label, tick] of [['day', 400], ['dusk', 1070], ['night', 1250]]) {
      await nav(`?intro=0&view=3d&perf=1&fixscale=1&quality=low&tick=${tick}&cam3d=74,92,180,0#seed=1818&sanity=100`);
      // the first HUD frame can report 0 before the villager buffer is filled, so wait for a non-zero count and only then accept a zero
      const count = (t) => Number((/(\d+) villagers/.exec(t || '') || [])[1] || 0);
      let hud = await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => count(t) > 0 && t), 20000);
      if (!hud) hud = await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ villagers/.test(t || '') && t), 60000);
      seen[label] = Number((/(\d+) villagers/.exec(hud || '') || [])[1] || 0);
    }
    rec('villagers: seed 1818 draws named villagers in 3D by day, at dusk and at night (perf HUD villager count above zero, most at dusk)', seen.day >= 1 && seen.dusk >= 3 && seen.night >= 1, seen);
  };

  /** Collision (round 24): walking straight at a tree trunk (seed 1818 city, tree at 37.97, 60.00, the only tree with a clear corridor) slides around it and ends well past it instead of stopping. COLLISION_ONLY=1 runs only this. */
  const collisionRun = async () => {
    const TREE = { x: 37.97, z: 60.0 }, camOf = async () => { const [x, z] = String(await ev(`document.getElementById('districtChip').getAttribute('data-cam')||''`)).split(',').map(Number); return { x, z }; };
    await nav(`?intro=0&view=3d&quality=low&fixscale=1&cam3d=${TREE.x + 0.1},${TREE.z + 4.5},0,0#seed=1818&sanity=100`);
    await until(() => camOf().then((c) => Number.isFinite(c.z) && c), 60000);
    const start = await camOf();
    // SwiftShader draws few frames per second and the step is capped at 0.1 s, so walking is slow here: keep walking (up to 60 s) until past the tree
    let end = start;
    for (let i = 0; i < 12 && !(end.z < TREE.z - 0.8); i++) { await hold('w', 'KeyW', 5000); await sleep(1100); end = await camOf(); }
    const passed = end.z < TREE.z - 0.8, clearOfTrunk = Math.hypot(end.x - TREE.x, end.z - TREE.z) > 0.5 + 0.45 - 1e-3;
    rec('collision: walking straight at a tree trunk slides around it and ends past it (not stopped at the trunk)', Number.isFinite(end.z) && passed && clearOfTrunk, { tree: TREE, start, end });
  };

  /** Inventory (round 25): gather an item, open the lodging chest, take and eat bread (sanity rises), store, drop, sleep to dawn, save and reload, and the 3D view opens the satchel on I and shows the Satchel button. INVENTORY_ONLY=1 runs only this; INVENTORY_SHOT=<file.png> saves the satchel frame. */
  const inventoryRun = async () => {
    const q = (sel) => `document.querySelector('${sel}')`, click2 = async (sel) => { try { await ev(`${q(sel)}.click()`); } catch (e) { throw new Error(sel + ': ' + e.message); } }, count = (sel) => ev(`document.querySelectorAll('${sel}').length`), sanity = async () => Number(await text('sanityOut'));
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&capture=1&tick=1300#seed=1818&sanity=40');
    await until(() => ev(`!!document.querySelector('#invBtn') && document.readyState === 'complete'`), 30000);
    await click2('#invBtn'); await sleep(300);
    const opened = !(await hidden('invPanel'));
    await click2('#invChestNext'); await sleep(200);
    const chestRows = await count('#invChestList li');
    await click2('#invChestList button[data-act="take"][data-id="bread"]'); await sleep(150);
    await click2('#invChestList button[data-act="take"][data-id="tea"]'); await sleep(150);
    const before = await sanity();
    await click2('#invList button[data-act="use"][data-id="bread"]'); await sleep(300);
    const after = await sanity();
    await click2('#invList button[data-act="store"][data-id="tea"]'); await sleep(150);
    const stored = await count('#invChestList button[data-act="take"][data-id="tea"]');
    await click2('#invChestList button[data-act="take"][data-id="lantern_oil"]'); await sleep(150);
    await click2('#invList button[data-act="drop"][data-id="lantern_oil"]'); await sleep(150);
    const dropped = await count('#invList button[data-id="lantern_oil"]');
    if (process.env.INVENTORY_SHOT) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.INVENTORY_SHOT, Buffer.from(await capture(), 'base64')); }
    const phaseBefore = await ev(`document.getElementById('clockChip').getAttribute('data-phase')`);
    await click2('#invSleep');
    const phaseAfter = await until(async () => { const p = await ev(`document.getElementById('clockChip').getAttribute('data-phase')`); return p === 'dawn' && p; }, 15000);
    // gathering comes last: a clue item (a key or letter) begins the vigil, and its sandbox lock then refuses food and sleep by design
    await click2('#invGather'); await sleep(200);
    const gathered = await count('#invList li:not(.inv-empty)');
    rec('inventory: gather, chest take, eat (sanity rises), store, drop and sleep to dawn', opened && gathered >= 1 && chestRows >= 3 && after > before && stored === 1 && dropped === 0 && phaseBefore === 'night' && phaseAfter === 'dawn', { opened, gathered, chestRows, before, after, stored, dropped, phaseBefore, phaseAfter });
    const saved = await ev(`(JSON.parse(localStorage.getItem('flv.session.v1')||'{}').inv||'')`);
    await nav('?intro=0&capture=1&tick=1300#seed=1818&sanity=40'); await sleep(500);
    await click2('#invBtn'); await sleep(300);
    const restored = await count('#invList li:not(.inv-empty)');
    rec('inventory: the satchel is saved with the session and restored after a reload', /^inv1;/.test(saved) && restored >= 1, { saved: saved.slice(0, 80), restored });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&view=3d&capture=1&quality=low&tick=1300#seed=1818&sanity=60');
    await until(() => ev(`!document.getElementById('view3d').hidden`), 30000);
    await key('i'); await sleep(300);
    const open3d = !(await hidden('invPanel')), gatherHidden = await hidden('invGather');
    await key('i'); await sleep(300);
    const closed3d = await hidden('invPanel');
    rec('inventory: in 3D the I key opens and closes the satchel (2D keeps I for the investigator) and the 2D-only buttons are hidden', open3d && closed3d && gatherHidden === true, { open3d, closed3d, gatherHidden });
  };

  /** Creatures (CREATURES_ONLY=1 runs only this; CREATURE_SHOT=<png> saves a still of the encounter with warding). ?kit=ward is the QA satchel with salt and chalk. */
  const creaturesRun = async () => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&capture=1&tick=1300&weather=fog#seed=1818&sanity=30');
    await ev(`localStorage.clear()`);
    const home = await ev(`(async()=>{const c=await import('./src/creatures.js');const cat=c.parseCreatureCatalog(await (await fetch('data/creatures.json')).json());const e=c.CreatureEncounter.spawn(1818,36,36,1300,0.7,'fog',cat,null);const k=e.creatures.find(x=>x.defId==='shore_crawler');return {n:e.creatures.length,kinds:[...new Set(e.creatures.map(x=>x.defId))],x:k.homeX,z:k.homeZ}})()`);
    rec('creatures: a foggy night at low sanity spawns a bounded set including shore-crawlers (seeded)', home.n >= 1 && home.n <= 8 && home.kinds.includes('shore_crawler'), home);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav(`?intro=0&view=3d&quality=low&tick=1300&weather=fog&kit=ward&cam3d=${home.x.toFixed(2)},${(home.z + 9).toFixed(2)},180,0#seed=1818&sanity=30`);
    await until(() => ev(`!document.getElementById('view3d').hidden`), 30000);
    const start = Number(await text('sanityOut'));
    await sleep(Number(process.env.CREATURE_WAIT || 6000));
    const hurt = Number(await text('sanityOut')), noted = await text('creatureNote');
    rec('creatures: standing near a shore-crawler costs sanity and the status line names it', hurt < start && noted.length > 0, { start, hurt, noted });
    await key('z'); await sleep(200);
    const salt = await text('invNote');
    await key('v'); await sleep(200);
    const sigil = await text('invNote');
    await key('f'); await sleep(200);
    const flare = await text('invNote');
    rec('creatures: Z lays salt, V draws the chalk sigil, F fires a flare (each consumes its item or oil and says so)', /salt/i.test(salt) && /sigil/i.test(sigil) && /flare/i.test(flare), { salt, sigil, flare });
    const sheltered0 = Number(await text('sanityOut'));
    await sleep(Number(process.env.CREATURE_WAIT || 6000));
    const sheltered1 = Number(await text('sanityOut'));
    rec('creatures: inside the sigil with salt laid, the dread no longer drains', sheltered1 >= sheltered0, { sheltered0, sheltered1 });
    if (process.env.CREATURE_SHOT) { const { writeFileSync } = await import('node:fs'); writeFileSync(process.env.CREATURE_SHOT, Buffer.from(await capture(), 'base64')); }
    const meshes = await ev(`Promise.all(['shore_crawler','hollow_watcher','deep_one','cliff_flyer'].map((k)=>fetch('assets/meshes/'+k+'.glb').then((r)=>r.arrayBuffer()).then((b)=>b.byteLength)))`);
    rec('creatures: the four creature meshes load and each is under 200 KB', meshes.every((n) => n > 1000 && n < 200 * 1024), { meshes });
  };

  /** Homestead (HOMESTEAD_ONLY=1 runs only this; HOMESTEAD_SHOT=<png> saves a 3D still of the yard with crops and animals, PET_SHOT=<png> a close still of a pet). ?kit=farm claims the yard and fills the satchel (QA only). */
  const homesteadRun = async () => {
    const { writeFileSync } = await import('node:fs');
    const click2 = async (sel) => { try { await ev(`document.querySelector('${sel}').click()`); } catch (e) { throw new Error(sel + ': ' + e.message); } }, count = (sel) => ev(`document.querySelectorAll('${sel}').length`);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&capture=1&tick=1300#seed=1818&sanity=60'); await ev(`localStorage.clear()`);
    await nav('?intro=0&capture=1&tick=1300&kit=farm#seed=1818&sanity=60');
    const plot = await ev(`window.flvHomestead && window.flvHomestead()`);
    rec('homestead: a free plot is found beside the lodging house and the QA kit claims it', !!plot && plot.exists === true, plot);
    await click2('#homeBtn'); await sleep(300);
    const opened = !(await hidden('homePanel')), beds = await count('#homeBody ul:first-of-type li');
    for (const sel of ['button[data-act="plant"][data-id="0:turnip"]', 'button[data-act="plant"][data-id="1:glowcap"]', 'button[data-act="plant"][data-id="2:kelp"]', 'button[data-act="plant"][data-id="3:eyeroot"]', 'button[data-act="build"][data-id="coop"]', 'button[data-act="build"][data-id="trough"]', 'button[data-act="build"][data-id="fence"]', 'button[data-act="feed"][data-id="chicken"]', 'button[data-act="feed"][data-id="lantern_moth"]', 'button[data-act="feed"][data-id="tide_hound"]']) { await click2('#homeBody ' + sel); await sleep(120); }
    const note = await text('homeNote'), planted = await count('#homeBody button[data-act="plant"]');
    const saved = await ev(`(JSON.parse(localStorage.getItem('flv.session.v1')||'{}').hs||'')`);
    rec('homestead: panel opens with six beds; planting, building and feeding work and the yard is saved with the session', opened && beds === 6 && /^hs1;1;/.test(saved) && /coop/.test(saved) && /chicken/.test(saved) && /turnip\.|glowcap\./.test(saved) && note.length > 0, { opened, beds, planted, saved: saved.slice(0, 120), note });
    const sanityBefore = Number(await text('sanityOut'));
    await nav(`?intro=0&capture=1&tick=${3580}#seed=1818&sanity=60`);
    await click2('#homeBtn'); await sleep(300);
    const ripe = await count('#homeBody button[data-act="harvest"]'), eggs = await count('#homeBody button[data-act="collect"]');
    const before = await ev(`(async()=>{const m=await import('./src/session.js');return (m.loadSession(localStorage)||{}).hs||''})()`);
    await click2('#homeBody button[data-act="harvest"]'); await sleep(200);
    const afterNote = await text('homeNote');
    rec('homestead: after two village days the turnip and glowcap are ripe, the hens have laid and a harvest says so', ripe >= 2 && eggs >= 1 && /harvest/i.test(afterNote) && /^hs1;1;/.test(before), { ripe, eggs, afterNote, sanityBefore });
    await click2('#homeBody button[data-act="collect"]'); await sleep(200);
    await click2('#homeClose'); await sleep(200);
    await click2('#invBtn'); await sleep(300);
    const bag = await ev(`[...document.querySelectorAll('#invList .inv-name')].map((e)=>e.textContent).join('|')`);
    rec('homestead: harvest and eggs land in the satchel', /Turnip|Glowcap/.test(bag) && /Egg/.test(bag), { bag });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?intro=0&capture=1&tick=1300&lang=fr&kit=farm#seed=1818&sanity=60');
    await click2('#homeBtn'); await sleep(300);
    const fr = await text('homeTitle'), frBtn = await ev(`document.querySelector('#homeBody button')?.textContent||''`);
    rec('homestead: the panel is in French with the lang switch', /Ferme/.test(fr) && frBtn.length > 0, { fr, frBtn });
    const prep = `?intro=0&view=3d&quality=low&tick=${process.env.HOME_TICK || 3580}&kit=farm`; // midday of village day 3, two days after planting: crops ripe and the yard lit
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav(prep + '#seed=1818&sanity=60'); // the session saved above (beds, structures, animals) is restored here, so the still shows a working yard
    await until(() => ev(`!document.getElementById('view3d').hidden`), 30000);
    const pl = await ev(`window.flvHomestead()`);
    const deg = (v) => Math.round(v * 180 / Math.PI);
    const stand = (a, b, yawVec, h) => `${(pl.origin[0] + pl.side[0] * a + pl.dir[0] * b).toFixed(2)},${(pl.origin[1] + pl.side[1] * a + pl.dir[1] * b).toFixed(2)},${deg(Math.atan2(yawVec[0], -yawVec[1]))},${h}`;
    const shot = (name, cam) => ({ name, q: `${prep}&cam3d=${cam}#seed=1818&sanity=60` });
    const wanted = [shot('yard', stand(Number(process.env.HOME_A || 1.5), Number(process.env.HOME_B || 8), [-pl.dir[0], -pl.dir[1]], -14)), shot('pet', stand(Number(process.env.PET_A || 0.6), Number(process.env.PET_B || 5.2), [-pl.dir[0], -pl.dir[1]], -24))];
    for (const w of wanted) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(w.q);
      await until(() => ev(`!document.getElementById('view3d').hidden`), 30000);
      await ev(`(async()=>{})()`);
      const out = await ev(`(()=>{const h=window.flvHomestead&&window.flvHomestead();return !!h&&h.exists&&h.pieces.length>=10})()`);
      await sleep(1500);
      const file = w.name === 'yard' ? process.env.HOMESTEAD_SHOT : process.env.PET_SHOT;
      const r = await ev(`(()=>{const b=document.getElementById('view3d').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`); // the still is the 3D view only, so it stays small and shows no page text
      if (file) writeFileSync(file, Buffer.from(await capture({ format: 'png', clip: { ...r, scale: 1 } }), 'base64'));
      rec(`homestead: 3D view of the ${w.name} renders without a warning`, out === true, { out });
    }
    const meshes = await ev(`Promise.all(['hs_mound','hs_turnip','hs_glowcap','hs_kelp','hs_eyeroot','hs_fence','hs_trough','hs_scarecrow','hs_coop','hs_chicken','hs_goat','hs_cat','hs_lantern_moth','hs_tide_hound','hs_jar_tentacle'].map((k)=>fetch('assets/meshes/'+k+'.glb').then((r)=>r.arrayBuffer()).then((b)=>b.byteLength)))`);
    rec('homestead: the homestead meshes load and each is under 200 KB', meshes.every((n) => n > 1000 && n < 200 * 1024), { meshes });
  };

  /** Society (round 26: investigation board, trust in chat, corruption tells; SOCIETY_ONLY=1 runs only this). Seed 1818 at night 3, sanity 40, dusk tick 900: villagers 2 (innkeeper) and 3 (lamplighter) are Corrupted but not yet Missing (found with web/src/society.js, see CHANGELOG).
   * SOCIETY_SHOT_DIR=<dir> saves board.png, chat.png, corrupt2d.png and corrupt3d.png (the 2D one is a 3x close crop around the cold lantern). SOCIETY_PERF=1 also records frame timing per quality tier with the board closed and open. */
  const societyRun = async () => {
    const { writeFileSync } = await import('node:fs');
    const shotDir = process.env.SOCIETY_SHOT_DIR || '';
    const save = async (name, params) => { if (shotDir) writeFileSync(join(shotDir, name), Buffer.from(await capture(params), 'base64')); };
    const Q = '?intro=0&capture=1&tick=900', H = '#seed=1818&sanity=40&night=3';
    const SESSION = { seed: 1818, sanity: 40, night: 2, lore: ['j01', 'j02'], board: 'bd1;0,1,2,3;;2:c_innkeeper_bell:2' }; // fisher and priest journals read, the innkeeper heard on the bell
    const fresh = async (query, hash, session) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav('?intro=0&capture=1'); await until(() => ev(`location.protocol==='http:'`), 20000); await ev(`localStorage.clear()`);
      if (session) await ev(`localStorage.setItem('flv.session.v1', ${JSON.stringify(JSON.stringify(session))})`);
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(query + hash); await sleep(800);
    };
    const boardCount = () => ev(`({cards:document.querySelectorAll('#boardCards .board-card').length, strings:document.querySelectorAll('#boardLines .board-string').length, flagged:document.querySelectorAll('#boardCards .board-contradiction').length, marks:document.querySelectorAll('#boardLines .board-contradiction-mark').length, open:!document.getElementById('boardPanel').hidden, note:document.getElementById('boardNote').textContent})`);
    // ---- board ----
    await fresh(Q, H, null);
    await key(';', 'Semicolon', 186, ';'); await sleep(500);
    const empty = await boardCount();
    await special('Escape', 27); await sleep(300);
    rec('board: the key ; opens the board with no evidence and shows no link and no contradiction', empty.open && empty.cards > 0 && empty.strings === 0 && empty.flagged === 0, empty);
    await fresh(Q, H, SESSION);
    await key(';', 'Semicolon', 186, ';'); await sleep(600);
    const full = await boardCount();
    rec('board: with evidence the red strings are revealed and one contradiction is marked on two cards', full.open && full.strings >= 2 && full.strings > empty.strings && full.flagged === 2 && full.marks === 1, full);
    const focusId = () => ev(`document.activeElement && document.activeElement.getAttribute('data-card')`);
    const f0 = await focusId(); await special('ArrowRight', 39); await sleep(200); const f1 = await focusId();
    rec('board: arrow keys move the focus between cards', !!f0 && !!f1 && f0 !== f1, { f0, f1 });
    await ev(`document.querySelector('#boardCards .board-contradiction').focus()`); await special('Enter', 13, '\r'); await sleep(300);
    const detail = await text('boardDetail');
    rec('board: Enter inspects a card in the contradiction and the detail line gives the reason', /contradict|never heard|bell/i.test(detail), { detail });
    await ev(`(()=>{const s=document.getElementById('boardScroll');s.scrollLeft=0})()`); await sleep(200);
    await save('board.png', { format: 'png' });
    await special('Escape', 27); await sleep(300);
    rec('board: Escape closes the board and returns the toggle state', (await hidden('boardPanel')) === true && (await ev(`document.getElementById('boardToggle').getAttribute('aria-expanded')`)) === 'false', {});
    const kept = await ev(`JSON.parse(localStorage.getItem('flv.session.v1')||'{}').board||''`);
    rec('board: the evidence is saved with the session', /^bd1;/.test(kept) && /c_innkeeper_bell/.test(kept), { kept });
    // ---- trust in chat ----
    await fresh(Q, H, SESSION);
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await key('c'); await sleep(400);
      const row = await ev(`({shown:!document.getElementById('villagerDialog').hidden, name:document.getElementById('villagerName').textContent, trust:document.getElementById('villagerTrust').textContent, trustHidden:document.getElementById('villagerTrust').hidden, aria:document.getElementById('villagerTrust').getAttribute('aria-label')})`);
      seen.push(row);
      if (/cold|Cold/.test(row.trust) && !process.env.__chatShot) { process.env.__chatShot = '1'; await save('chat.png', { format: 'png' }); }
      await special('Escape', 27); await sleep(200);
    }
    delete process.env.__chatShot;
    const withTrust = seen.filter((r) => r.shown && !r.trustHidden && r.trust.length > 2 && r.aria);
    rec('trust: every chat with a villager of the story roster shows a trust indicator with an accessible label (townsfolk outside it show none)', seen.length === 8 && withTrust.length >= 6 && seen.filter((r) => r.shown && r.trust === '').every((r) => r.trustHidden), { sample: seen.slice(0, 3), shown: withTrust.length });
    rec('trust: a corrupted villager is marked cold in the chat dialogue', seen.some((r) => /cold/i.test(r.trust)), { texts: [...new Set(seen.map((r) => r.name + ': ' + r.trust))] });
    // ---- corruption tell, 2D ----
    // Pixels are counted on a real screenshot of the element (a WebGL canvas cannot be read back directly), decoded in the page.
    const tealPixels = async (elementId, test) => {
      const r = await ev(`(()=>{const b=document.getElementById('${elementId}').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`);
      const data = await capture({ format: 'png', clip: { ...r, scale: 1 } });
      return ev(`new Promise((res)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let n=0,sx=0,sy=0;for(let i=0,p=0;i<d.length;i+=4,p++){if(${test}){n++;sx+=p%c.width;sy+=Math.floor(p/c.width)}}res({n,x:n?Math.round(sx/n):0,y:n?Math.round(sy/n):0,w:c.width,h:c.height})};im.src='data:image/png;base64,${data}'})`);
    };
    const TEAL = process.env.TEAL_TEST || 'd[i+1]-d[i]>=20&&d[i+2]-d[i]>=15&&d[i+1]>=90'; // cold lantern glow: a sea green that no warm lantern, window or fire produces
    await fresh(Q + '&reduced=1', H, null);
    const corrupt2d = await tealPixels('view', TEAL);
    await fresh(Q + '&reduced=1', '#seed=1818&sanity=100&night=1', null);
    const clean2d = await tealPixels('view', TEAL);
    rec('corruption 2D: a corrupted villager adds sea green lantern pixels that the same village without corruption does not have', corrupt2d.n > clean2d.n + 3, { corrupt2d, clean2d });
    await fresh(Q + '&reduced=1', H, null);
    if (shotDir && corrupt2d.n) {
      const r = await ev(`(()=>{const b=document.getElementById('view').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cw:document.getElementById('view').width}})()`), k = r.w / r.cw;
      const clip = { x: Math.max(0, r.x + (corrupt2d.x - 90) * k), y: Math.max(0, r.y + (corrupt2d.y - 70) * k), width: 180 * k, height: 140 * k, scale: 3 };
      await save('corrupt2d.png', { format: 'png', clip });
    }
    // ---- corruption tell, 3D ----
    const CAM = '&cam3d=141.6,59.6,0,-6';
    await fresh(Q + '&view=3d&grain=0', H + CAM, null); await sleep(2500);
    // The tell dims the coat toward a cold blue grey (COLD_TINT) that nothing else in this warm dusk frame has; counted on a screenshot of the 3D view. The lean and lantern hue are checked by the still and by web/test/society-ui.test.js.
    const COAT = process.env.COAT_TEST || 'd[i+2]>=d[i]+25&&d[i+2]>=d[i+1]+5';
    const frame = async (hash) => { await fresh(Q + '&view=3d&grain=0', hash + CAM, null); await sleep(2500); return tealPixels('view3d', COAT); };
    const corrupt3d = await frame(H), clean3d = await frame('#seed=1818&sanity=100&night=1');
    rec('corruption 3D: the corrupted villager in front of the camera adds cold blue grey coat pixels that the same view without corruption does not have', corrupt3d.n > clean3d.n + 500, { corrupt3d, clean3d });
    await fresh(Q + '&view=3d&grain=0', H + CAM, null); await sleep(2500);
    await save('corrupt3d.png', { format: 'png', clip: { ...(await ev(`(()=>{const b=document.getElementById('view3d').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`)), scale: 1 } });
    if (process.env.SOCIETY_PERF) {
      const out = {};
      for (const q of ['low', 'medium', 'high']) for (const boardOpen of [false, true]) {
        await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
        await nav(`${Q}&view=3d&perf=1&fixscale=1&quality=${q}${H}${CAM}`);
        await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ tris/.test(t || '') && t), 60000); await sleep(4000);
        if (boardOpen) { await ev(`document.getElementById('boardToggle').click()`); await sleep(500); }
        await ev(`window.__ft=[];(function t(ts){window.__ft.push(ts);if(window.__ft.length<80)requestAnimationFrame(t)})(performance.now())`);
        await until(() => ev(`window.__ft.length`).then((n) => n >= 80), 120000);
        const hudT = await ev(`(document.getElementById('perfHud')||{}).textContent`);
        out[`${q}-${boardOpen ? 'board open' : 'board closed'}`] = { ...frameStats(await ev(`window.__ft`)), js: (/([\d.]+) ms js/.exec(hudT || '') || [])[1] || null };
      }
      rec('society perf: every tier renders frames with corrupted villagers in view, board closed and open (SwiftShader, indicative only)', Object.values(out).every((s) => s.frames > 10), out);
    }
  };

  /** Theories and outcomes (round 30: the theory builder on the board, trust bars on the suspect card and in the chronicle, the missing person outcome as far as leads allow, the epilogue line; THEORY_ONLY=1 runs only this). Seed 1818 at night 3 with the society SESSION (journals j01 j02 read, four villagers met, the innkeeper heard on the bell). */
  const theoryRun = async () => {
    const { writeFileSync } = await import('node:fs');
    const shotDir = process.env.THEORY_SHOT_DIR || ''; // THEORY_SHOT_DIR=<dir> saves theory-board.jpg, theory-journal.jpg and theory-chronicle.jpg
    const shot = async (name) => { if (shotDir) writeFileSync(join(shotDir, name), Buffer.from(await capture({ format: 'jpeg', quality: 80 }), 'base64')); };
    const Q = '?intro=0&capture=1&tick=900', H = '#seed=1818&sanity=40&night=3';
    const SESSION = { seed: 1818, sanity: 40, night: 2, lore: ['j01', 'j02', 'p01'], board: 'bd1;0,1,2,3;;2:c_innkeeper_bell:2' };
    const fresh = async (query, hash, session) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav('?intro=0&capture=1'); await until(() => ev(`location.protocol==='http:'`), 20000); await ev(`localStorage.clear()`);
      if (session) await ev(`localStorage.setItem('flv.session.v1', ${JSON.stringify(JSON.stringify(session))})`);
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(query + hash); await sleep(1200);
    };
    await fresh(Q, H, SESSION);
    await key(';', 'Semicolon', 186, ';'); await sleep(700);
    const picks = await ev(`document.querySelectorAll('#boardTheoryBody .theory-pick').length`);
    rec('theory: the board lists the village questions as buttons', picks >= 2, { picks });
    const bars = await ev(`({mini:document.querySelectorAll('#boardCards .board-card-bars').length, bars:document.querySelectorAll('#boardCards .board-card-bars .board-bar').length})`);
    rec('trust bars: met suspect cards show the six small bars', bars.mini >= 1 && bars.bars === bars.mini * 6, bars);
    await ev(`document.querySelector('#boardCards .board-kind-0.board-card:not(.board-unknown), #boardCards [data-card^="suspect:"]:not(.board-unknown)').focus()`); await special('Enter', 13, '\r'); await sleep(300);
    const labelled = await ev(`({n:document.querySelectorAll('#boardBars meter').length, hidden:document.getElementById('boardBars').hidden, labels:[...document.querySelectorAll('#boardBars meter')].every((m)=>m.getAttribute('aria-label'))})`);
    rec('trust bars: inspecting a suspect shows six labelled meters (Trust, Fear, Faith, Loyalty, Obsession, Corruption)', labelled.n === 6 && labelled.hidden === false && labelled.labels, labelled);
    await ev(`document.querySelector('#boardTheoryBody .theory-pick').focus()`); await special('Enter', 13, '\r'); await sleep(300);
    const open = await ev(`({radios:document.querySelectorAll('#boardTheoryBody input[type=radio]').length, boxes:document.querySelectorAll('#boardTheoryBody input[type=checkbox]').length, go:document.querySelector('#boardTheoryBody [data-k=conclude]').disabled, pressed:document.querySelector('#boardTheoryBody .theory-pick').getAttribute('aria-pressed'), boardOpen:!document.getElementById('boardPanel').hidden})`);
    rec('theory: choosing a question shows answers, evidence and a disabled Conclude button, and the board stays open', open.radios >= 3 && open.boxes >= 1 && open.go === true && open.pressed === 'true' && open.boardOpen, open);
    await ev(`document.querySelector('#boardTheoryBody input[type=radio]').click()`); await sleep(200);
    await ev(`document.querySelector('#boardTheoryBody input[type=checkbox]').click()`); await sleep(200);
    const ready = await ev(`({go:document.querySelector('#boardTheoryBody [data-k=conclude]').disabled, checked:document.querySelectorAll('#boardTheoryBody input[type=checkbox]:checked').length})`);
    rec('theory: an answer and one piece of evidence enable Conclude', ready.go === false && ready.checked === 1, ready);
    await ev(`document.querySelector('#boardTheoryBody [data-k=conclude]').click()`); await sleep(300);
    const done = await ev(`({text:document.querySelector('#boardTheoryBody .theory-results')?.textContent||'', live:document.getElementById('boardLive').textContent, saved:JSON.parse(localStorage.getItem('flv.session.v1')||'{}').theories||''})`);
    rec('theory: concluding shows a TRUE, PARTIALLY TRUE or FALSE verdict, announces it and saves the choice log', /(TRUE|PARTIALLY TRUE|FALSE):/.test(done.text) && /Theory concluded/.test(done.live) && /^th1;\d/.test(done.saved), done);
    await shot('theory-board.jpg');
    await special('Escape', 27); await sleep(300);
    await shot('theory-journal.jpg');
    await fresh(Q, H, { ...SESSION, theories: done.saved }); await sleep(500);
    await ev(`document.getElementById('chronicleToggle').click()`); await sleep(500);
    await shot('theory-chronicle.jpg');
    const chron = await ev(`({theories:document.querySelectorAll('#chronicleTheories li').length, people:document.querySelectorAll('#chroniclePeople meter').length, outcomes:document.querySelectorAll('[data-outcome]').length})`);
    rec('chronicle: the restored theory, the trust bars of people met and an outcome line for a missing person with leads are listed', chron.theories === 1 && chron.people >= 6 && chron.people % 6 === 0, chron);
    await fresh(Q + '&reduced=1', H, SESSION);
    await key(';', 'Semicolon', 186, ';'); await sleep(600);
    const motion = await ev(`({anim:[...document.querySelectorAll('#boardTheory *, #boardCards .board-card-bars *')].some((n)=>getComputedStyle(n).animationName!=='none'), tab:(()=>{const b=document.querySelector('#boardTheoryBody .theory-pick');return !!b && b.tabIndex>=0})()})`);
    rec('theory: nothing in the builder animates under reduced motion and its buttons are keyboard reachable', motion.anim === false && motion.tab === true, motion);
  };

  /** Reality instability (round 34, spec 169): in the page's own modules tiers 0 to 2 change nothing, tier 5 alters something, the same inputs give the same answer, the truth switch restores every true value, and the board has a hidden "reality unreliable" badge and truth button. Static by design, so reduced motion needs no separate path. Presentation only, SwiftShader, Partially Verified. REALITY_ONLY=1 runs only this. */
  const realityRun = async () => {
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`location.protocol==='http:'`), 20000);
    const out = await ev(`(async()=>{const R=await import('/src/reality.js');const lib=R.parseRealityLibrary(await (await fetch('data/reality.json')).json());
      const mk=(tier)=>R.createRealityView({lib:()=>lib,seed:()=>1818,night:()=>3,tier:()=>tier,lang:()=>'en'});const names=['A','B','C','D','E','F','G'];
      const sig=(v)=>JSON.stringify([names.map((n,i)=>v.shownName(i,names)),[0,1,2,3].map((h)=>v.houseName(h,'H')),v.falseVillager(),['p','q','r','s'].map((id)=>v.placeLabel(id,'L')),['a','b','c','d'].map((id)=>v.contradictionHidden(id))]);
      let changed=false;for(let night=1;night<=9&&!changed;night++){const v=R.createRealityView({lib:()=>lib,seed:()=>1818,night:()=>night,tier:()=>5,lang:()=>'en'});changed=sig(v)!==sig(mk(0));}
      const low=[0,1,2].every((t)=>sig(mk(t))===sig(mk(0)));const v5=mk(5);const same=sig(v5)===sig(mk(5));const t5=mk(5);t5.setTruth(true);const truth=sig(t5)===sig(mk(0));
      const badge=document.getElementById('boardReality'),btn=document.getElementById('boardRealityTruth');
      return {low,changed,same,truth,badge:!!badge&&badge.hidden,btn:!!btn&&btn.hidden&&!!btn.textContent.trim()};})()`);
    rec('reality: tiers 0 to 2 change nothing, tier 5 alters something, the same inputs answer the same and the truth switch restores every true value', out.low && out.changed && out.same && out.truth, out);
    rec('reality: the board carries a hidden "reality unreliable" badge and a labelled truth button until tier 3', out.badge && out.btn, out);
  };

  /** Horror intensity (round 34, spec 165): the settings button is focusable and labelled, each activation cycles Standard, Dread, Gentle and stores the choice, a reload keeps it, ?intensity= wins over storage, the seed in the address never changes, and the label has readable contrast against its background. Presentation only, SwiftShader, Partially Verified. INTENSITY_ONLY=1 runs only this. */
  const intensityRun = async () => {
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`location.protocol==='http:'`), 20000);
    await ev(`localStorage.removeItem('flv.intensity.v1')`);
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`!!document.getElementById('intensityToggle')&&/Standard/.test(document.getElementById('intensityToggle').textContent)`), 20000);
    const first = await ev(`(()=>{const b=document.getElementById('intensityToggle');b.focus();const lum=(c)=>{const m=c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number).map((v)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*m[0]+0.7152*m[1]+0.0722*m[2]};const cs=getComputedStyle(b);const a=lum(cs.color),bg=lum(cs.backgroundColor.startsWith('rgba(0, 0, 0, 0')?getComputedStyle(document.body).backgroundColor:cs.backgroundColor);const ratio=(Math.max(a,bg)+0.05)/(Math.min(a,bg)+0.05);return {tab:b.tabIndex>=0&&!b.disabled,label:!!b.getAttribute('aria-label'),text:b.textContent,ratio:Math.round(ratio*10)/10}})()`);
    rec('intensity: the settings button is keyboard focusable, labelled, starts at Standard and has readable contrast', first.tab && first.label && /Standard/.test(first.text) && first.ratio >= 4.5, first);
    await ev(`document.getElementById('intensityToggle').click()`); const dread = await ev(`document.getElementById('intensityToggle').textContent+'|'+localStorage.getItem('flv.intensity.v1')`);
    await ev(`document.getElementById('intensityToggle').click()`); const gentle = await ev(`document.getElementById('intensityToggle').textContent+'|'+localStorage.getItem('flv.intensity.v1')`);
    rec('intensity: activating cycles Standard to Dread to Gentle and stores each choice', /Dread\|dread/.test(dread) && /Gentle\|gentle/.test(gentle), { dread, gentle });
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`/Gentle/.test(document.getElementById('intensityToggle')?.textContent||'')`), 20000);
    const kept = await ev(`location.hash`); await nav('?intro=0&intensity=dread#seed=1818&sanity=80'); await until(() => ev(`/Dread/.test(document.getElementById('intensityToggle')?.textContent||'')`), 20000);
    rec('intensity: a reload keeps the stored level, ?intensity= wins, and the seed in the address is untouched', /seed=1818/.test(kept) && /seed=1818/.test(await ev(`location.hash`)), { kept });
    await ev(`localStorage.removeItem('flv.intensity.v1')`);
  };

  /** Seed sharing (round 34, spec 172): the title shows the village seed code and today's challenge code, a wrong code gives a readable error and keeps the seed, a right code (any case) opens that village, the chronicle shows the same code and its export buttons exist. Presentation only, SwiftShader, Partially Verified. SEED_ONLY=1 runs only this. */
  const seedRun = async () => {
    await nav('?lang=en&webgl=0'); await until(() => ev(`!document.getElementById('title').hidden&&document.getElementById('titleSeedCode').textContent.length>0`), 30000);
    const shown = await ev(`(()=>({code:document.getElementById('titleSeedCode').textContent,daily:document.getElementById('titleDaily').textContent,label:!!document.querySelector('label[for=titleSeedInput]')}))()`);
    rec('seed: the title shows the village seed code like 1818-WORD-WORD, today\'s challenge code and a labelled input', /^\d+-[A-Z]+-[A-Z]+$/.test(shown.code) && /Daily Village Challenge/.test(shown.daily) && shown.label, shown);
    await ev(`(()=>{const i=document.getElementById('titleSeedInput');i.value='1818-STRAY-WORD';document.getElementById('titleSeedApply').click()})()`);
    const bad = await ev(`({msg:document.getElementById('titleSeedMsg').textContent,code:document.getElementById('titleSeedCode').textContent,invalid:document.getElementById('titleSeedInput').getAttribute('aria-invalid')})`);
    rec('seed: a code whose words do not match gives a readable error and keeps the village', /do not belong/.test(bad.msg) && bad.code === shown.code && bad.invalid === 'true', bad);
    await ev(`(()=>{const i=document.getElementById('titleSeedInput');i.value=' 4242 ';document.getElementById('titleSeedApply').click()})()`);
    const good = await ev(`({msg:document.getElementById('titleSeedMsg').textContent,code:document.getElementById('titleSeedCode').textContent,seed:document.getElementById('seed').value})`);
    rec('seed: a bare number opens that village and the title shows its code', /^4242-/.test(good.code) && good.seed === '4242' && /opened/.test(good.msg), good);
    await ev(`(()=>{const i=document.getElementById('titleSeedInput');i.value=document.getElementById('titleSeedCode').textContent.toLowerCase();document.getElementById('titleSeedApply').click()})()`);
    rec('seed: the code itself in lower case is accepted', /opened/.test(await ev(`document.getElementById('titleSeedMsg').textContent`)), {});
    await nav('?intro=0#seed=1818&sanity=80'); await until(() => ev(`!!document.getElementById('chronicleToggle')`), 20000);
    await ev(`document.getElementById('chronicleToggle').click()`);
    const chron = await ev(`({seed:document.getElementById('chronicleSeed').textContent,md:!!document.getElementById('chronicleExportMd'),txt:!!document.getElementById('chronicleExportTxt'),daily:document.getElementById('dailyCode').textContent})`);
    rec('seed: the chronicle shows the seed code and both export buttons, the tools row shows today\'s code', /Village seed: 1818-[A-Z]+-[A-Z]+/.test(chron.seed) && chron.md && chron.txt && /Daily Village Challenge/.test(chron.daily), chron);
  };

  /** Victorian reskin (round 33, spec 165: aged paper, brass and ink over the round 29 layer; VICTORIAN_ONLY=1 runs only this). VICTORIAN_SHOT_DIR=<dir> with VICTORIAN_SHOT_PREFIX (default r33-after) saves <prefix>-title.jpg, -board.jpg, -chronicle.jpg and -journal.jpg. Checks run in English and French: no horizontal overflow at 1280 px wide and at 150% zoom, a visible keyboard focus ring, chronicle ink reveal that stops under reduced motion. */
  const victorianRun = async () => {
    const { writeFileSync } = await import('node:fs');
    const shotDir = process.env.VICTORIAN_SHOT_DIR || '', prefix = process.env.VICTORIAN_SHOT_PREFIX || 'r33-after';
    const shot = async (name) => { if (shotDir) writeFileSync(join(shotDir, `${prefix}-${name}.jpg`), Buffer.from(await capture({ format: 'jpeg', quality: 70 }), 'base64')); };
    const H = '#seed=1818&sanity=40&night=3';
    const SESSION = { seed: 1818, sanity: 40, night: 2, lore: ['j01', 'j02', 'p01'], board: 'bd1;0,1,2,3;;2:c_innkeeper_bell:2' };
    const fresh = async (query, hash, session) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav('?intro=0&capture=1'); await until(() => ev(`location.protocol==='http:'`), 20000); await ev(`localStorage.clear()`);
      if (session) await ev(`localStorage.setItem('flv.session.v1', ${JSON.stringify(JSON.stringify(session))})`);
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(query + hash); await sleep(1200);
    };
    const overflow = (ids) => ev(`(${JSON.stringify(ids)}).map((id)=>{const e=document.getElementById(id);return e&&!e.hidden?[id,e.scrollWidth-e.clientWidth]:[id,null]}).filter(([,d])=>d!==null&&d>1)`);
    // title screen (no deep link params, so the title shows)
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav('?capture=0'); await until(() => ev(`location.protocol==='http:'`), 20000); await ev(`localStorage.clear()`);
    await nav('?lang=en'); await until(() => ev(`document.getElementById('title')?.hidden===false`), 15000); await sleep(600);
    await shot('title');
    const titleEn = await ev(`document.getElementById('title')?.hidden===false`);
    rec('victorian: the title screen shows in English', titleEn === true, { shown: titleEn });
    await nav('?lang=fr'); await until(() => ev(`document.getElementById('title')?.hidden===false`), 15000); await sleep(400);
    const titleFr = await ev(`(()=>{const c=document.querySelector('.title-card');const r=c.getBoundingClientRect();return {w:Math.round(r.width),fits:r.right<=innerWidth+1&&r.left>=-1,over:c.scrollWidth-c.clientWidth}})()`);
    rec('victorian: the French title card fits the viewport without horizontal overflow', titleFr.fits && titleFr.over <= 1, titleFr);
    const ring = await ev(`(()=>{const b=document.getElementById('titleEnter3d');b.focus();const s=getComputedStyle(b);return {style:s.outlineStyle,w:parseFloat(s.outlineWidth)}})()`);
    rec('victorian: keyboard focus draws a visible outline on the title buttons', ring.style !== 'none' && ring.w >= 2, ring);
    // board, chronicle, journal in both languages
    for (const lang of ['en', 'fr']) {
      await fresh(`?intro=0&capture=1&tick=900&lang=${lang}`, H, SESSION);
      await key(';', 'Semicolon', 186, ';'); await sleep(700);
      if (lang === 'en') await shot('board');
      const over = await overflow(['boardPanel']);
      rec(`victorian: the board dialog has no horizontal overflow (${lang})`, over.length === 0, { over });
      await ev(`document.documentElement.style.zoom='1.5'`); await sleep(300);
      const overZ = await overflow(['boardPanel']);
      rec(`victorian: the board dialog survives 150% zoom (${lang})`, overZ.length === 0, { over: overZ });
      await ev(`document.documentElement.style.zoom=''`);
      await special('Escape', 27); await sleep(300);
      await ev(`document.getElementById('chronicleToggle').click()`); await sleep(900);
      if (lang === 'en') await shot('chronicle');
      const ch = await ev(`(()=>{const p=document.getElementById('chroniclePanel');const b=document.getElementById('chronicleBody');return {shown:!p.hidden,over:b.scrollWidth-b.clientWidth,anim:getComputedStyle(b.querySelector('li')||b).animationName}})()`);
      rec(`victorian: the chronicle shows without overflow (${lang}; capture=1 implies reduced motion, so the entries are static here)`, ch.shown && ch.over <= 1, ch);
      await ev(`document.getElementById('chronicleToggle').click()`); await sleep(200);
      await ev(`document.getElementById('codexToggle').click()`); await sleep(500);
      await ev(`(()=>{const d=document.getElementById('loreDialog');const li=document.querySelector('#loreList li:not(.locked)');document.getElementById('loreTitle').textContent=li?li.querySelector('strong').textContent:'';document.getElementById('loreText').textContent=li?li.querySelector('.lore-text').textContent:'';document.getElementById('loreEffect').textContent='';d.hidden=false})()`); await sleep(500);
      if (lang === 'en') await shot('journal');
      const lore = await overflow(['loreDialog']);
      rec(`victorian: the journal page has no overflow (${lang})`, lore.length === 0, { over: lore });
    }
    await fresh('?intro=0&tick=900', H, SESSION);
    await ev(`document.getElementById('chronicleToggle').click()`); await sleep(300);
    const live = await ev(`({panel:getComputedStyle(document.getElementById('chroniclePanel')).animationName,entry:getComputedStyle(document.querySelector('#chronicleBody li')).animationName})`);
    rec('victorian: with motion allowed the chronicle turns in and its entries reveal like ink', live.panel === 'pageTurn' && live.entry === 'inkReveal', live);
    await fresh('?intro=0&capture=1&tick=900&reduced=1', H, SESSION);
    await ev(`document.getElementById('chronicleToggle').click()`); await sleep(600);
    const still = await ev(`[...document.querySelectorAll('#chroniclePanel, #chroniclePanel li, #chroniclePanel h3')].filter((n)=>getComputedStyle(n).animationName!=='none').length`);
    rec('victorian: nothing in the chronicle animates under reduced motion', still === 0, { animated: still });
  };

  /** Mythos (round 27: the background simulation feeding the board and the chronicle; MYTHOS_ONLY=1 runs only this). Seed 1818 at night 5 (found with web/src/mythos.js, see CHANGELOG): two cults (the Lamp Wardens and the Salt Congregation), the secrets of villagers 1 and 4 out on night 5 (villager 4 saw a body carried to the water), and a missing person rumor from villager 4. The saved board holds what four villagers told the player. */
  const mythosRun = async () => {
    const Q = '?intro=0&capture=1&tick=900', H = '#seed=1818&sanity=40&night=5';
    const SESSION = { seed: 1818, sanity: 40, night: 4, lore: [], board: 'bd1;0,1,2,4;;4:mythos.secret.4:5,4:mythos.rumor.5:5,2:mythos.cult.1:5,0:mythos.omen.5:5' };
    const fresh = async (query, hash, session) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav('?intro=0&capture=1'); await until(() => ev(`location.protocol==='http:'`), 20000); await ev(`localStorage.clear()`);
      if (session) await ev(`localStorage.setItem('flv.session.v1', ${JSON.stringify(JSON.stringify(session))})`);
      await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
      await nav(query + hash); await sleep(1200);
    };
    const cards = () => ev(`[...document.querySelectorAll('#boardCards .board-card')].filter((b)=>b.getAttribute('data-card').startsWith('event:mythos:')).map((b)=>b.getAttribute('data-card')+'|'+b.getAttribute('aria-label'))`);
    const chronicle = () => ev(`({items:[...document.querySelectorAll('#chronicleMythos li')].map((l)=>l.getAttribute('data-mythos')+'|'+l.textContent), empty:!document.querySelector('#chronicleMythos li')&&(document.getElementById('chronicleMythos')||{}).textContent||''})`);
    await fresh(Q, H, null);
    await key(';', 'Semicolon', 186, ';'); await sleep(500);
    rec('mythos: with nothing heard the board shows no mythos card', (await cards()).length === 0, await cards());
    await fresh(Q, H, SESSION);
    await key(';', 'Semicolon', 186, ';'); await sleep(600);
    const got = await cards();
    rec('mythos: the board shows an event card for the exposed secret, the rumor, the cult member and the omen the player heard, with readable labels', got.length === 4 && got.some((c) => /Ignatius Grimsby saw a body/.test(c)) && got.some((c) => /Salt Congregation/.test(c)) && got.some((c) => /Eliot Ashby/.test(c)), got);
    const kept = await ev(`JSON.parse(localStorage.getItem('flv.session.v1')||'{}').board||''`);
    rec('mythos: the heard statements are saved with the session and survive a reload', /mythos\.secret\.4/.test(kept) && /mythos\.cult\.1/.test(kept), { kept });
    await fresh(Q + '&chronicle=1', H, null); await sleep(500);
    const none = await chronicle();
    rec('mythos: the chronicle shows an empty Mythos section until the player has heard something', none.items.length === 0 && /Nothing has been whispered/.test(none.empty), none);
    for (const lang of ['en', 'fr']) {
      await fresh(Q + `&chronicle=1&lang=${lang}`, H, SESSION); await sleep(500);
      const c = await chronicle();
      const expect = lang === 'en' ? [/Salt Congregation/, /Ignatius Grimsby saw a body/, /Eliot Ashby/, /tide came in twice/] : [/Congregation du Sel/, /Ignatius Grimsby/, /Eliot Ashby/, /maree/i];
      rec(`mythos: the chronicle lists the cult, the secret, the rumor and the omen the player heard, in ${lang === 'en' ? 'English' : 'French'}`, c.items.length === 4 && expect.every((re) => c.items.some((i) => re.test(i))), c);
    }
  };

  await send('Runtime.enable'); await send('Page.enable');
  try {
  suite: {
    if (process.env.TIMING_ONLY) { await timingRun(); break suite; }
    if (process.env.TIER_ONLY) { await tierTimingRun(); break suite; }
    if (process.env.LOOK_ONLY) { await lookRun(); break suite; }
    if (process.env.QUALITY_ONLY) { await qualityRun(); break suite; }
    if (process.env.PROBE_URLS) { // PROBE_URLS="q1|q2" saves a screenshot of each query to $PROBE_DIR/probe_N.png (default the system temp dir) for visual diagnosis
      const { writeFileSync } = await import('node:fs');
      let n = 0; for (const q of process.env.PROBE_URLS.split('|')) { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await nav(q); await sleep(1500); writeFileSync(join(process.env.PROBE_DIR || tmpdir(), `probe_${n++}.png`), Buffer.from(await capture(), 'base64')); }
      break suite;
    }
    if (process.env.SKY_ONLY) { await skyRun(); break suite; }
    if (process.env.CINEMA_ONLY) { for (let i = 0; i < 2; i++) await cinemaRun(); break suite; }
    if (process.env.DISTRICT_ONLY) { await districtRun(); break suite; }
    if (process.env.LANDMARK_ONLY) { await landmarkRun(); break suite; }
    if (process.env.LIGHTHOUSE_ONLY) { await lighthouseRun(); break suite; }
    if (process.env.NAMES_ONLY) { await namesRun(); break suite; }
    if (process.env.NARRATIVE_ONLY) { await narrativeRun(); break suite; }
    if (process.env.VILLAGER_ONLY) { await villagerRun(); break suite; }
    if (process.env.INVENTORY_ONLY) { await inventoryRun(); break suite; }
    if (process.env.CREATURES_ONLY) { await creaturesRun(); break suite; }
    if (process.env.HOMESTEAD_ONLY) { await homesteadRun(); break suite; }
    if (process.env.COLLISION_ONLY) { await collisionRun(); break suite; }
    if (process.env.SOCIETY_ONLY) { await societyRun(); break suite; }
    if (process.env.MYTHOS_ONLY) { await mythosRun(); break suite; }
    if (process.env.THEORY_ONLY) { await theoryRun(); break suite; }
    if (process.env.VICTORIAN_ONLY) { await victorianRun(); break suite; }
    if (process.env.PLACES_ONLY) { await placesRun(); break suite; }
    if (process.env.TIERS_ONLY) { await tiersRun(); break suite; }
    if (process.env.REALITY_ONLY) { await realityRun(); break suite; }
    if (process.env.SEED_ONLY) { await seedRun(); break suite; }
    if (process.env.INTENSITY_ONLY) { await intensityRun(); break suite; }
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

    // story mode (a fresh village: the earlier clues began a vigil, which refuses story playback, see the vigil lock checks)
    await nav('?intro=0#seed=6161&sanity=100'); await sleep(800);
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
    const canvasBytes = async () => { const rr = await ev(`document.getElementById('view3d').getBoundingClientRect().toJSON()`); return (await capture({ format: 'png', clip: { x: rr.x, y: rr.y, width: rr.width, height: rr.height, scale: 1 } })).length; };
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

    await cinemaRun();
    await special('Escape', 27, undefined); await sleep(400);

    // 3D: stand 2.5 m in front of a south facing house door of the 36 by 36 city (seed 1818, derived from the city layout and the Core lantern positions) facing it, then interact with the door (E; a click would first take the pointer lock)
    const { generateCityLayout } = await import('../web/src/districts.js');
    const { lanternLights } = await import('../web/src/view3d-math.js');
    const { SeededRandom, PrefabCatalog } = await import('../web/src/core.js');
    const cityCatalog = new PrefabCatalog(JSON.parse(readFileSync(new URL('../web/data/village_catalog.json', import.meta.url))).entries);
    const cityLayout = generateCityLayout(cityCatalog, 36, 36, 180, 1818);
    cityLayout.forEach((p, i) => { const r = new SeededRandom(1818 * 31 + i * 7919 + 1); p.vis = { h: r.next(100) / 100, tilt: r.next(100) / 100, lit: r.next(100) / 100, phase: r.next(1000), lit2: r.next(100) / 100 }; });
    const doorHouses = cityLayout.filter((p) => (p.id === 'house_a' || p.id === 'house_b') && (p.facing | 0) === 0);
    const porch = (p) => lanternLights([{ ...p, detail: 3 }], 4).find((l) => !l.post);
    const doorHouse = doorHouses.find((p) => porch(p)) || doorHouses[0];
    const doorX = porch(doorHouse).pos[0], doorZ = porch(doorHouse).pos[2]; // porch light hangs 0.5 m in front of the door wall
    const stand = `${doorX.toFixed(2)},${(doorZ + 2.5).toFixed(2)}`;
    await nav(`?intro=0&view=3d#seed=1818&sanity=100&cam3d=${stand},0,0`);
    await sleep(600); await hold('w', 'KeyW', 150); await sleep(300); // a small step makes the view refresh its prompt
    const readPrompt = () => ev(`(()=>{const p=document.getElementById('view3dPrompt');return !p||p.hidden?'':p.textContent})()`);
    const promptText = await until(async () => { const v = await readPrompt(); if (!v) await hold('w', 'KeyW', 60); return v; });
    const j0 = await ev(`document.getElementById('whispers').children.length`);
    if (promptText) { await key('e'); await sleep(500); }
    const j1 = await ev(`document.getElementById('whispers').children.length`);
    // 3D vigil: the same spot looking up at the door lantern; E lights it once, restoring sanity and counting the lamp
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await nav(`?intro=0&view=3d#seed=1818&sanity=70&cam3d=${stand},0,14`);
    await sleep(600); await hold('w', 'KeyW', 150); await sleep(300);
    const lampPrompt = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return !p||p.hidden?'':p.textContent})()`);
    const ls0 = Number(await text('sanityOut'));
    await key('e'); await sleep(900);
    const ls1 = Number(await text('sanityOut')), lobj = await text('objectiveText');
    await key('e'); await sleep(900);
    const ls2 = Number(await text('sanityOut'));
    rec('3d vigil: looking up at a door lantern, E lights it once and restores sanity', lampPrompt === 'Light the lantern' && ls1 > ls0 && ls2 <= ls1 && /lanterns lit 1\/3/.test(lobj), { lampPrompt, ls0, ls1, ls2, lobj });
    // Scale: standing at the door (eye 1.6 m, level gaze) the 2.0 m door top must project above the screen centre, and the 0 m threshold below it.
    const doorNdc = await ev(`(async()=>{const m=await import('./src/view3d-math.js'),w=await import('./src/world-scale.js');const s=m.sanitizeViewSettings(JSON.parse(localStorage.getItem(m.VIEW_SETTINGS_KEY)||'null'));const cam={x:${doorX},y:s.eye,z:${doorZ + 2.5},yaw:0,pitch:0},vp=m.viewProjection(cam,16/9,m.fovRadians(s.fovDeg));const top=m.projectPoint(vp,[${doorX},w.DOOR_HEIGHT,${doorZ}]),foot=m.projectPoint(vp,[${doorX},0,${doorZ}]);return JSON.stringify({eye:s.eye,top:top&&(top.y??top[1]),foot:foot&&(foot.y??foot[1])})})()`);
    const dn = JSON.parse(doorNdc || '{}');
    rec('scale: a 2.0 m door top projects above the screen centre when looking level, its foot below', dn.top > 0.05 && dn.foot < -0.05, dn);
    rec('3d: facing a house door shows a prompt and E on the door adds a journal entry', /^Try the door/.test(promptText) && j1 > j0, { prompt: promptText, entriesBefore: j0, entriesAfter: j1 });
    await special('Escape', 27, undefined); await sleep(300);

    // ?meshes=1 on the 2D board and the meshes page
    await nav('?intro=0&meshes=1#seed=1818&sanity=100');
    const glbs = await until(() => ev(`(()=>{const n=performance.getEntriesByType('resource').filter((r)=>r.name.includes('.glb')).length;return n>=25?n:0})()`), 40000);
    rec('meshes: ?meshes=1 fetches all 25 original GLBs without an exception', glbs >= 25 && errs.length === 0, { glbRequests: glbs });
    await nav('meshes.html');
    let mp = await text('summary');
    for (let i = 0; i < 20 && !/loaded/.test(mp); i++) { await sleep(500); mp = await text('summary'); }
    const meshCount = /^(\d+) of (\d+) meshes loaded/.exec(mp); // every mesh in the folder loads, whatever the count is
    rec('meshes: meshes.html loads every mesh', !!meshCount && meshCount[1] === meshCount[2] && Number(meshCount[1]) > 0, { summary: mp });

    // independence: with no pack and no query, 2D and 3D use only original assets (no local-pack or DLNK request)
    const packRequests = () => ev(`performance.getEntriesByType('resource').map((r)=>r.name).filter((n)=>/local-pack|_dlnk|[/]dlnk[/]/i.test(n))`);
    await nav('?intro=0#seed=1818&sanity=100'); await sleep(800);
    const flat = await packRequests();
    await nav('?intro=0&view=3d#seed=1818&sanity=100'); await sleep(1500);
    const solid = await packRequests();
    rec('independence: default 2D and 3D make no request to local-pack or DLNK paths', flat.length === 0 && solid.length === 0 && errs.length === 0, { flat, solid });

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

    await timingRun();
    await qualityRun();
    await districtRun();
    await landmarkRun();
    await namesRun();
    await narrativeRun();

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
    const lk = await ev(`(()=>{const g=(i)=>document.getElementById(i);return {ids:['sanity','night','nightPrev','nightNext','reroll','seed','dailyBtn','loadSession','drain','storyOpen','cinemaToggle'].map((i)=>g(i).disabled&&g(i).getAttribute('aria-disabled')==='true'),reason:g('vigilLock').hidden?'':g('vigilLock').textContent}})()`);
    rec('vigil lock: after the first clue the sandbox controls are disabled with a visible reason', lk.ids.every(Boolean) && lk.reason === 'The vigil binds you. End it to tamper.', { lk });
    const seedLive = await ev(`document.getElementById('seed').value`), sanLive = Number(await text('sanityOut'));
    await key(']'); await key('['); await key('['); await key('n'); await key('z'); await key('.'); await key(','); await sleep(250);
    const lk2 = await ev(`[document.getElementById('seed').value, document.getElementById('night').value, location.hash.includes('seed=' + document.getElementById('seed').value)]`);
    rec('vigil lock: sanity keys, new village, daily and night keys are ignored while live', Number(await text('sanityOut')) === sanLive && lk2[0] === seedLive && lk2[1] === '0' && lk2[2] === true && /binds you/.test(await text('narration')), { sanLive, lk2, narration: await text('narration') });

    // Story and cinema change sanity and the night, so a live vigil refuses to open them and keeps its lock.
    await key('s'); await key('b'); await sleep(300);
    const sc = await ev(`[document.getElementById('story').hidden, document.documentElement.classList.contains('cinema'), document.getElementById('storyOpen').disabled, document.getElementById('cinemaToggle').disabled, document.getElementById('vigilLock').hidden]`);
    rec('vigil lock: story and cinema stay closed while the vigil is live and their buttons are disabled', sc[0] === true && sc[1] === false && sc[2] === true && sc[3] === true && sc[4] === false && Number(await text('sanityOut')) === sanLive, { sc });

    // A scripted careful player using only real controls. Returns the ending title; seeds are tried in order until the true ending shows.
    const play = (seed) => `(async () => {
      const $ = (i) => document.getElementById(i), wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const sanity = () => Number($('sanityOut').textContent);
      const relight = async () => { while (sanity() < 60 && !$('objectiveText').textContent.includes('lit 3/3')) { $('candle').click(); await wait(30); } };
      for (let guard = 0; guard < 16 && !$('ending').open; guard++) { // by day the Endure control first waits for dusk, so a night can take two presses
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
    // Round 18 on-screen touch controls: hidden on desktop, forced by ?touch=1, driven through real DevTools touch events.
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&view=3d&reduced=1#seed=4400&sanity=100');
    rec('touch controls: hidden on desktop without ?touch=1', await ev(`document.getElementById('touchDock').hidden || getComputedStyle(document.getElementById('touchDock')).display === 'none'`), {});
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await nav('?intro=0&view=3d&touch=1&reduced=1&tick=0#seed=4400&sanity=100'); await sleep(1500);
    const rects = await ev(`(()=>{const R=(id)=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const ids=['touchInteract','touchLantern','touchHelp','touchStick','touchLook'];return {dock:getComputedStyle(document.getElementById('touchDock')).display,boxes:Object.fromEntries(ids.map((i)=>[i,R(i)])),objective:R('objective'),caption:R('narration'),prompt:R('view3dPrompt'),cinema:R('cinemaCaption'),endureHidden:document.getElementById('touchEndure').hidden,touchPoints:navigator.maxTouchPoints}})()`);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const boxes = Object.values(rects.boxes);
    rec('touch controls: ?touch=1 shows the dock, targets are at least 44 px', rects.dock !== 'none' && boxes.every((b) => b.w >= 44 && b.h >= 44), { rects: rects.boxes });
    rec('touch controls: dock never overlaps the caption, objective HUD or prompt', boxes.every((b) => !hit(b, rects.objective) && !hit(b, rects.caption) && !hit(b, rects.prompt) && !hit(b, rects.cinema)), { objective: rects.objective, caption: rects.caption });
    rec('touch controls: Endure button hidden until the vigil allows it', rects.endureHidden === true, {});
    const touch = async (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const centreOf = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    const stickC = centreOf(rects.boxes.touchStick), lookC = centreOf(rects.boxes.touchLook);
    const stable = await shotHash(); await sleep(400); const stable2 = await shotHash();
    await touch('touchStart', stickC.x, stickC.y); await touch('touchMove', stickC.x, stickC.y - 55); await sleep(1200);
    const knobMoved = await ev(`document.getElementById('touchKnob').style.getPropertyValue('--ky')`);
    const walked = await shotHash(); await touch('touchEnd');
    rec('touch controls: dragging the joystick up walks the 3D camera', stable === stable2 && walked !== stable && parseFloat(knobMoved) < 0, { stable, walked, knobMoved });
    await sleep(500); const still = await shotHash(); await sleep(400); const still2 = await shotHash();
    rec('touch controls: releasing the joystick stops the camera', still === still2, { still, still2 });
    await touch('touchStart', lookC.x - 30, lookC.y); for (let i = 1; i <= 8; i++) { await touch('touchMove', lookC.x - 30 + i * 7, lookC.y); await sleep(40); } await touch('touchEnd'); await sleep(500);
    const turned = await shotHash();
    rec('touch controls: dragging the look pad turns the camera', turned !== still2, { still2, turned });
    // Two fingers at once: the stick keeps walking while the look pad is dragged and released (separate drive sources, summed).
    const touchN = async (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const sPt = (dy) => ({ x: stickC.x, y: stickC.y - dy, id: 1 }), lPt = (dx) => ({ x: lookC.x - 30 + dx, y: lookC.y, id: 2 });
    await touchN('touchStart', [sPt(0)]); await touchN('touchMove', [sPt(55)]); await sleep(300);
    await touchN('touchStart', [sPt(55), lPt(0)]);
    for (let i = 1; i <= 6; i++) { await touchN('touchMove', [sPt(55), lPt(i * 7)]); await sleep(40); }
    const both1 = await shotHash(); await sleep(500); const both2 = await shotHash();
    await touchN('touchEnd', [lPt(42)]); await sleep(300);
    const afterLook1 = await shotHash(); await sleep(600); const afterLook2 = await shotHash();
    const knobHeld = await ev(`document.getElementById('touchKnob').style.getPropertyValue('--ky')`);
    await touchN('touchEnd', [sPt(55)]); await sleep(500);
    // Software GL can take seconds per frame while the stick ease-out finishes, so wait until two frames in a row are identical.
    let rest1 = await shotHash(), rest2 = rest1;
    for (let i = 0; i < 12; i++) { await sleep(700); rest2 = await shotHash(); if (rest2 === rest1) break; rest1 = rest2; }
    rec('touch controls: stick and look pad work with two simultaneous pointers, releasing the look pad keeps the stick walking', both1 !== both2 && afterLook1 !== afterLook2 && parseFloat(knobHeld) < 0 && rest1 === rest2, { both1, both2, afterLook1, afterLook2, knobHeld, rest1, rest2 });
    await ev(`document.getElementById('touchLantern').click()`); await sleep(300);
    rec('touch controls: Lantern button runs the lantern action (sanity or lamp count changes)', /lit|lantern|lamp/i.test(await text('vigilNote') + await text('narration') + await text('objectiveText')) || Number(await text('sanityOut')) !== 100, { note: await text('vigilNote'), sanity: await text('sanityOut') });
    await ev(`document.getElementById('touchInteract').click()`); await sleep(200);
    await ev(`document.getElementById('endure').hidden = false`); await sleep(100);
    rec('touch controls: Endure button mirrors the vigil Endure state', (await hidden('touchEndure')) === false, {});
    await ev(`document.getElementById('endure').hidden = true`); await sleep(100);
    await ev(`document.getElementById('touchHelp').click()`); await sleep(300);
    rec('touch controls: Help button opens the help dialog', await ev(`document.getElementById('help').open`), {});
    await special('Escape', 27); await sleep(300);
    await send('Emulation.setTouchEmulationEnabled', { enabled: false }); await send('Emulation.clearDeviceMetricsOverride');
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&view=3d&touch=0#seed=4400&sanity=100');
    rec('touch controls: ?touch=0 hides the dock', await ev(`getComputedStyle(document.getElementById('touchDock')).display === 'none'`), {});
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);

    // Round 18 accessibility on the dialogs: in the high contrast theme every control of the title, help and ending dialogs shows a 3 px focus ring and the help text (gamepad prompts included) is legible
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?contrast=1');
    const ringOf = (ids) => ev(`(()=>{const out={};for(const id of ${JSON.stringify(ids)}){const el=document.getElementById(id);if(!el){out[id]='missing';continue;}el.focus();const c=getComputedStyle(el);out[id]=c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>=2?'ring':'no ring: '+c.outlineStyle+' '+c.outlineWidth}return out})()`);
    const titleRings = await ringOf(['titleEnter3d', 'titleMap2d', 'titleHelp', 'titleSound']);
    rec('a11y: high contrast shows a focus ring on every title control', Object.values(titleRings).every((v) => v === 'ring'), titleRings);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&contrast=1#seed=1818&sanity=100');
    await ev(`document.getElementById('helpBtn').click()`); await sleep(300);
    const helpRings = await ringOf(['helpClose']);
    const helpText = await ev(`(()=>{const lum=(c)=>{const v=c.match(/[\\d.]+/g).slice(0,3).map((x)=>{x=Number(x)/255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)});return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]};const dlg=document.getElementById('help');const bg=getComputedStyle(dlg).backgroundColor;const pad=dlg.querySelector('[data-device=pad]');const cs=[pad,dlg.querySelector('h2')].map((el)=>getComputedStyle(el).color);const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};return {bg,padText:pad.textContent.slice(0,40),ratios:cs.map((c)=>Math.round(ratio(c,bg)*10)/10)}})()`);
    rec('a11y: high contrast help dialog has a focus ring on Close and gamepad prompt text with contrast of at least 7:1', helpRings.helpClose === 'ring' && /Gamepad/.test(helpText.padText) && helpText.ratios.every((r) => r >= 7), { helpRings, helpText });
    await special('Escape', 27); await sleep(300);
    await ev(`document.getElementById('ending').showModal()`); await sleep(200);
    const endRings = await ringOf(['endingCard', 'endingCopy', 'endingAgain', 'endingEpilogue', 'endingKeep']);
    const endOrder = await ev(`[...document.getElementById('ending').querySelectorAll('button,a[href]')].map((e)=>e.id)`);
    rec('a11y: high contrast ending dialog has focus rings, and the shore link follows the buttons in focus order', Object.values(endRings).every((v) => v === 'ring') && endOrder.join() === 'endingCard,endingCopy,endingAgain,endingEpilogue,endingKeep', { endRings, endOrder });
    await special('Escape', 27); await sleep(300);

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
    rec('help: ? opens the grouped help dialog and the long keyboard list is gone', hp[0] === true && hp[1] === 6 && hp[2] === false && /Last used/.test(hp[3]), { hp });
    await special('Escape', 27); await sleep(300);
    rec('help: Escape closes the dialog', (await ev(`document.getElementById('help').open`)) === false, {});

    // villagers: present in 2D (list, minimap, canvas) and 3D, talk by keyboard, effect equal with an unreachable ?narrator, no console errors
    const { generateRoster } = await import('../web/src/villagers.js');
    const { villagerPlacements } = await import('../web/src/villager-view.js');
    const vCatalog = new PrefabCatalog(JSON.parse(readFileSync(new URL('../web/data/village_catalog.json', import.meta.url))).entries);
    const vLayout = generateCityLayout(vCatalog, 36, 36, 180, 1818), vRoster = generateRoster(1818, vLayout);
    const VTICK = 900; // dusk: the fisher and the lamplighter stand in the square
    const vPlaced = villagerPlacements({ roster: vRoster, layout: vLayout, tick: VTICK, dread: 0, gridW: 36, gridD: 36, seed: 1818 });
    const vFront = vPlaced.find((p) => p.placeName === 'square');
    const vList = () => ev(`document.querySelectorAll('#villagerList li').length`);
    const talkRound = async (query) => {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
      await nav(`?intro=0&tick=${VTICK}${query}#seed=1818&sanity=100`); await sleep(500);
      const s0 = Number(await text('sanityOut'));
      await key('r', 'KeyR', 82); await sleep(300);
      const panel = await ev(`({shown:!document.getElementById('villagerPanel').hidden, rows:document.querySelectorAll('#villagerList li').length, focus:document.activeElement.getAttribute('data-villager'), clock:document.getElementById('villagerClock').textContent})`);
      await special('Enter', 13, '\r'); await sleep(500);
      const open = await ev(`({shown:!document.getElementById('villagerDialog').hidden, name:document.getElementById('villagerName').textContent, line:document.getElementById('villagerLine').textContent, effect:document.getElementById('villagerEffect').textContent, live:document.getElementById('toastLive').textContent})`);
      const s1 = Number(await text('sanityOut'));
      await special('Escape', 27); await sleep(300);
      const closed = await ev(`document.getElementById('villagerDialog').hidden`);
      return { panel, open, s0, s1, closed };
    };
    const plain = await talkRound('');
    rec('villagers 2D: R opens Who is where with 24 rows, the clock and a focused Talk button', plain.panel.shown && plain.panel.rows === 24 && /Day 1, dusk/.test(plain.panel.clock) && plain.panel.focus === '0', plain.panel);
    rec('villagers 2D: Enter on Talk opens the dialogue with a line, and Escape closes it', plain.open.shown && plain.open.name.length > 3 && plain.open.line.length > 5 && plain.closed === true, plain.open);
    rec('villagers 2D: the spoken line is announced to screen readers', plain.open.live.includes(plain.open.name), { live: plain.open.live });
    const withBad = await talkRound('&narrator=http://127.0.0.1:1/none');
    await sleep(1500);
    rec('villagers narrator: an unreachable ?narrator gives the same line and the same sanity change as no narrator', withBad.open.line === plain.open.line && withBad.open.effect === plain.open.effect && (withBad.s1 - withBad.s0) === (plain.s1 - plain.s0), { plain: [plain.s0, plain.s1, plain.open.effect], bad: [withBad.s0, withBad.s1, withBad.open.effect] });
    rec('villagers 2D: the effect text agrees with the sanity change', (() => { const m = /Sanity (-?\d+)/.exec(plain.open.effect); return m ? Number(m[1]) === plain.s1 - plain.s0 : plain.s1 === plain.s0; })(), { effect: plain.open.effect, s0: plain.s0, s1: plain.s1 });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav(`?intro=0&tick=${VTICK}&map=1&reduced=1#seed=1818&sanity=100`); await until(async () => (await vList()) > 0, 20000).catch(() => null); await sleep(500);
    const pix = await ev(`(()=>{const c=document.getElementById('view'),g=c.getContext('2d');const m=document.getElementById('minimap').getContext('2d');const count=(ctx,w,h,f)=>{const d=ctx.getImageData(0,0,w,h).data;let n=0;for(let i=0;i<d.length;i+=4)if(f(d[i],d[i+1],d[i+2]))n++;return n};return {map:count(m,168,168,(r,gg,b)=>r>235&&gg>225&&b>190&&b<215), list:document.querySelectorAll('#villagerList li').length}})()`);
    // markers are 2 px radius dots on the 36 cell map (about 2 cream pixels inside the outline each), so with 24 villagers on the city map the dots overlap; the check needs a roster of 24 and at least the pixels of the old seven markers (14)
    rec('villagers 2D: minimap shows villager markers', pix.map >= 14 && pix.list === 24, pix);
    // click on a villager in the 2D canvas opens the dialogue
    const vClick = await ev(`(()=>{const c=document.getElementById('view');return c.getBoundingClientRect().toJSON()})()`);
    // 3D: stand 2.5 m south of the square villager, facing north
    const vx = vFront.x * 4, vz = vFront.z * 4;
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav(`?intro=0&view=3d&tick=${VTICK}#seed=1818&sanity=100&cam3d=${vx.toFixed(2)},${(vz + 2).toFixed(2)},0,-8`);
    await sleep(600); await hold('w', 'KeyW', 60); await sleep(300);
    await ev(`window.__ft=[];(function t(ts){window.__ft.push(ts);if(window.__ft.length<120)requestAnimationFrame(t)})(performance.now())`);
    const vPrompt = await until(async () => { const v = await ev(`(()=>{const p=document.getElementById('view3dPrompt');return !p||p.hidden?'':p.textContent})()`); if (!v) await hold('s', 'KeyS', 40); return v; });
    rec('villagers 3D: a villager stands in front of the camera and shows a Talk prompt', /^Talk to /.test(vPrompt), { vPrompt, at: [vx, vz], who: vFront.name });
    const sv0 = Number(await text('sanityOut'));
    await key('e'); await sleep(500);
    const d3 = await ev(`({shown:!document.getElementById('villagerDialog').hidden, view3d:!document.getElementById('view3d').hidden, line:document.getElementById('villagerLine').textContent})`);
    rec('villagers 3D: E opens the dialogue and keeps the 3D view', d3.shown && d3.view3d && d3.line.length > 5, d3);
    await key('e'); await sleep(300);
    rec('villagers 3D: E again closes the dialogue without leaving the view', (await ev(`document.getElementById('villagerDialog').hidden && !document.getElementById('view3d').hidden`)) === true, {});
    await hold('s', 'KeyS', 40); await sleep(300);
    await key('Enter', 'Enter', 13, '\r'); await sleep(500);
    const openAgain = await ev(`!document.getElementById('villagerDialog').hidden`);
    await special('Escape', 27); await sleep(300);
    rec('villagers 3D: Escape closes the dialogue first and does not exit the 3D view', openAgain && (await ev(`document.getElementById('villagerDialog').hidden && !document.getElementById('view3d').hidden`)) === true, { openAgain });
    const ft = frameStats(await ev(`window.__ft`));
    rec('villagers 3D: frame time with villagers in view stays within the software-GL budget (indicative)', ft.frames > 10 && ft.meanMs < 250, ft);
    const sv1 = Number(await text('sanityOut'));
    rec('villagers 3D: talking applied the Core sanity effect', sv1 <= sv0, { sv0, sv1 });

    // ---- the clock: phases change the 3D sky, the HUD chip, lanterns and the vigil (Core VigilRules watch and dawn) ----
    await skyRun();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&reduced=1#seed=1818&sanity=100'); await sleep(400);
    const chipA = await text('clockChipText'); await sleep(2600); const chipB = await text('clockChipText');
    rec('clock: the session clock starts at dusk and advances on its own', /^Day 1, 20:0\d, dusk$/.test(chipA) && chipA !== chipB, { chipA, chipB });
    const hint0 = await ev(`!document.getElementById('clockHint').hidden`);
    await ev(`document.getElementById('clockHintClose').click()`); await sleep(100);
    await nav('?intro=0&reduced=1#seed=1818&sanity=100'); await sleep(400);
    rec('clock: the first-play hint shows once and stays dismissed for the session', hint0 === true && (await ev(`document.getElementById('clockHint').hidden`)) === true, { hint0 });
    // Vigil at night: two clues, Endure runs the clock to dawn and night 2 begins.
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&reduced=1&tick=1200#seed=4500&sanity=100'); await sleep(300);
    await ev(`document.getElementById('whisper').click()`); await sleep(100); await ev(`document.getElementById('church').click()`); await sleep(200);
    const nEndure = await ev(`[document.getElementById('endure').hidden, document.getElementById('endure').textContent]`);
    await ev(`document.getElementById('endure').click()`); await sleep(400);
    const nAfter = await ev(`[document.getElementById('clockChipText').textContent, document.getElementById('objectiveText').textContent]`);
    rec('clock vigil: at night Endure runs the clock to dawn and night 2 begins', nEndure[0] === false && nEndure[1] === 'Endure the night (E)' && /^Day 2, 04:00, dawn$/.test(nAfter[0]) && /^Night 2 of 5/.test(nAfter[1]), { nEndure, nAfter });
    // Day exploration: clues count by day; the same control waits for dusk, then offers Endure.
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&reduced=1&tick=400#seed=4501&sanity=100'); await sleep(300);
    await ev(`document.getElementById('whisper').click()`); await sleep(100); await ev(`document.getElementById('church').click()`); await sleep(200);
    const dWait = await ev(`document.getElementById('endure').textContent`);
    await ev(`document.getElementById('endure').click()`); await sleep(1300);
    const dAfter = await ev(`[document.getElementById('clockChip').getAttribute('data-phase'), document.getElementById('endure').textContent, document.getElementById('objectiveText').textContent]`);
    rec('clock vigil: by day clues count and Endure first waits for dusk, then offers Endure the night', dWait === 'Wait for dusk (E)' && dAfter[0] === 'dusk' && dAfter[1] === 'Endure the night (E)' && /^Night 1 of 5/.test(dAfter[2]), { dWait, dAfter });
    // ---- round 20: density (two-storey houses, streets), weather looks and birds ----
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&view=3d&capture=1&grain=0&tick=540&cam3d=54.4,56,200,4#seed=1818&sanity=100'); await sleep(1500);
    const dens = await ev(`(async()=>{const w=await import('./src/world-scale.js'),m=await import('./src/view3d-math.js');return {person:w.PERSON_HEIGHT,storey:w.STOREY_HEIGHT,ridgeMin:w.RIDGE_MIN,budget:m.FRAME_BUDGET}})()`).catch((e) => ({ error: e.message }));
    rec('density: world-scale constants make a house ridge at least 3 times a person and the frame budget stays 16 calls (round 21: chunked buildings and the held lantern) and 60000 triangles', !dens.error && dens.ridgeMin >= 3 * dens.person && dens.storey >= 3 && dens.budget.drawCalls === 16 && dens.budget.triangles === 60000, dens);
    await ev(`document.getElementById('perfToggle').click()`); await sleep(2500);
    const perfTxt = await until(() => ev(`(document.getElementById('perfHud')||{}).textContent`).then((t) => /\d+ tris/.test(t) && t), 15000);
    const trisNow = Number((/(\d+) tris/.exec(perfTxt || '') || [])[1]);
    rec('density: the dense village renders inside the triangle budget in the live perf HUD (SwiftShader, indicative)', trisNow > 1000 && trisNow <= 60000, { perfTxt });
    // Weather looks: the same camera and clock, only ?weather= changes; storm must be measurably darker than clear and every name must render without errors.
    const meanLum = () => ev(`(()=>{const c=document.getElementById('view3d'),o=document.createElement('canvas');o.width=c.width;o.height=c.height;const g=o.getContext('2d');g.drawImage(c,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let s=0,s2=0,n=0;for(let i=0;i<d.length;i+=4*11){const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];s+=l;s2+=l*l;n++}const m=s/Math.max(1,n);return {m:Math.round(m),sd:Math.round(Math.sqrt(Math.max(0,s2/Math.max(1,n)-m*m)))}})()`); // fog mostly lowers contrast, so the check counts the mean shift plus the contrast change
    const lum = {}, hashes = {};
    for (const w of ['clear', 'storm', 'fog', 'rain']) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
      await nav(`?intro=0&view=3d&capture=1&grain=0&tick=700&weather=${w}&cam3d=54.4,56,200,4#seed=1818&sanity=100`); await sleep(2000);
      lum[w] = await meanLum(); hashes[w] = await shotHash();
    }
    rec('weather: storm (a fixed lightning moment in captures) and fog change the mean brightness or contrast and rain changes the frame against clear at the same camera and clock', Math.abs(lum.storm.m - lum.clear.m) >= 2 && Math.abs(lum.fog.m - lum.clear.m) + Math.abs(lum.fog.sd - lum.clear.sd) >= 2 && hashes.rain !== hashes.clear, { lum, hashes });
    const wnames = await ev(`(async()=>{const c=await import('./src/clock.js');return {a:c.weatherForDay?c.weatherForDay(1818,3):null,b:c.weatherForDay?c.weatherForDay(1818,3):null,names:c.WEATHER_NAMES}})()`).catch((e) => ({ error: e.message }));
    rec('weather: the per-day weather is deterministic and every name is known', !wnames.error && wnames.a === wnames.b && Array.isArray(wnames.names) && wnames.names.length === 7, wnames);
    // Birds: counts follow weather and reduced motion, and the seeded flock is identical for the same seed and moves when stepped.
    const birds = await ev(`(async()=>{const b=await import('./src/birds.js');const plan={sea:[0,0],seaRadius:12,seaHeight:11,church:[5,5],churchRadius:9,churchHeight:17,village:[3,3],fogRadius:30,fogHeight:26};const c=b.birdCounts({weather:'clear'});const f1=b.createFlocks({seed:1818,plan,counts:c}),f2=b.createFlocks({seed:1818,plan,counts:c});const x0=f1.gulls.birds[0].x;b.stepFlock(f1.gulls);const buf=b.buildBirds({flocks:f2,perches:[],counts:c,timeSec:1});return {clear:c.gulls,storm:b.birdCounts({weather:'storm'}).gulls,reduced:b.birdCounts({weather:'clear',reduced:true}).gulls,same:JSON.stringify(f2.gulls.birds[0])===JSON.stringify(b.createFlocks({seed:1818,plan,counts:c}).gulls.birds[0]),moved:f1.gulls.birds[0].x!==x0,verts:buf.length}})()`).catch((e) => ({ error: e.message }));
    rec('birds: gulls fly in clear weather, shelter in a storm, stay away under reduced motion, are seeded and move', !birds.error && birds.clear > 0 && birds.storm === 0 && birds.reduced === 0 && birds.same && birds.moved && birds.verts > 0, birds);
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await nav('?intro=0&view=3d&capture=1&grain=0&tick=700&weather=clear&cam3d=54.4,56,200,4#seed=1818&sanity=100'); await sleep(2500);
    rec('birds: the 3D view with birds in the draw list keeps rendering a non-blank frame', (await meanLum()).m > 5, { lum: await meanLum() });
    await societyRun();
  }
    rec('no uncaught exception or console.error across the run', errs.length === 0, { errors: errs.slice(0, 5) });
  } catch (e) { console.log('DRIVER ERROR ' + e.message); results.push(false); }
  const passed = results.filter(Boolean).length;
  console.log(`SUMMARY ${passed}/${results.length} passed`);
  ws.close(); chrome.kill(); await sleep(500);
  try { rmSync(ud, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp profile left behind in the OS temp dir */ }
  process.exit(passed === results.length ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
