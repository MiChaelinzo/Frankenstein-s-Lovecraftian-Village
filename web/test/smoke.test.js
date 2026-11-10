import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Runs app.js against stubbed DOM and canvas APIs to catch runtime errors in every draw path.
test('app renders frames at several sanity levels without throwing', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalog = readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8');
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 200 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => grad : k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const els = {};
  const el = (id) => (els[id] ??= {
    id, style: {}, value: '1818', textContent: '', innerHTML: '', checked: false, open: true, listeners: {},
    addEventListener(n, f) { this.listeners[n] = f; },
    getContext: () => ctx, width: 960, height: 560,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 560 }),
  });
  let raf = null;
  const clicked = [], blobs = [], keys = [];
  Object.assign(globalThis, {
    document: { getElementById: el, hidden: false, documentElement: { classList: { add() {} } }, addEventListener() {}, createElement: () => ({ click() { clicked.push(this); }, remove() {}, getContext: () => ctx, toBlob(cb) { cb(new Blob(['png'])); } }), body: { appendChild() {} } },
    URL: { createObjectURL: (b) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL() {} },
    matchMedia: () => ({ matches: false }),
    location: { search: '', hash: '#seed=42&sanity=10', href: 'http://x/' },
    history: { replaceState: (a, b, h) => { globalThis.location.hash = h; } },
    addEventListener: (n, f) => { if (n === 'keydown') keys.push(f); },
    fetch: async () => ({ json: async () => JSON.parse(catalog) }),
    requestAnimationFrame: (f) => { raf = f; },
  });
  globalThis.window = globalThis;
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => 0; // keep timers from holding the process open
  await import('../src/app.js');
  await new Promise((r) => setTimeout(r, 20));
  assert.match(els.stats.textContent, /Seed 42: \d+ pieces/);
  for (const s of [100, 60, 30, 0]) {
    els.sanity.value = String(s);
    els.sanity.listeners.input();
    for (let i = 0; i < 3; i++) raf(1000 + i * 16);
  }
  els.view.listeners.click({ clientX: 480, clientY: 200 });
  els.church.listeners.click();
  assert.match(els.dreadOut.textContent, /Dread \d+%/);
  assert.ok(els.narration.textContent.length > 0);
  els.seed.value = '7'; els.seed.listeners.change();
  assert.match(els.stats.textContent, /Seed 7:/);
  assert.match(els.whispers.innerHTML, /<li class="e-/);
  assert.ok(els.listen.innerHTML.includes('<option'));
  const press = (key) => keys.forEach((f) => f({ key, target: { tagName: 'BODY' } }));
  els.sanity.value = '100'; els.sanity.listeners.input();
  press(']'); press('['); press('['); press('w'); press('l'); press('?'); press('n');
  assert.match(els.stats.textContent, /Seed -?\d+:/);
  els.dlMd.listeners.click(); els.dlJson.listeners.click();
  assert.equal(clicked.length, 2);
  assert.match(clicked[0].download, /^village-report-seed--?\d+\.md$/);
  assert.match(clicked[1].download, /\.json$/);
  els.sanity.value = '3'; els.sanity.listeners.input();
  assert.match(els.whispers.innerHTML, /e-omen/);
  for (let i = 0; i < 5; i++) raf(6000 + i * 16);
  raf(5000);
  // campaign: walk every night of several seeds so dusk/night/witching tints and rain/fog layers all draw
  for (const seed of ['7', '42', '99', '1818']) {
    els.seed.value = seed; els.seed.listeners.change();
    for (let i = 0; i < 5; i++) {
      els.night.value = String(i); els.night.listeners.change();
      for (let k = 0; k < 2; k++) raf(7000 + k * 16);
    }
  }
  assert.match(els.nightInfo.innerHTML, /Rumor: .+Lore: /);
  assert.match(els.villageName.textContent, /^[A-Z][a-z]+[a-z]+$/);
  els.nightPrev.listeners.click(); els.nightNext.listeners.click();
  assert.match(globalThis.location.hash, /night=\d/);
  assert.match(els.viewDesc.textContent, /night \d of 5/);
  press('.'); press(',');
  const before = clicked.length;
  els.postcard.listeners.click();
  assert.equal(clicked.length, before + 1);
  assert.match(clicked[before].download, /^village-postcard-seed-\d+-night-\d+\.png$/);
  // building features: themes, cameras, floor peel, doors; draw every combination at calm and abyss dread
  assert.match(els.theme.innerHTML, /optgroup label="DLNK group: Nature"/);
  for (const sanity of ['100', '40', '0']) {
    els.sanity.value = sanity; els.sanity.listeners.input();
    for (const theme of ['auto', 'bricks', 'plaster', 'tiles', 'wood', 'rocks', 'water']) {
      els.theme.value = theme; els.theme.listeners.change();
      for (const cam of ['first', 'third', 'top', 'auto']) {
        els.camera.value = cam; els.camera.listeners.change();
        els.floor.value = '1'; els.floor.listeners.input();
        raf(9000); raf(9016);
      }
    }
  }
  assert.match(els.cameraNote.textContent, /Looking: /);
  els.door.listeners.click();
  assert.match(els.whispers.innerHTML, /e-door/);
  assert.ok(els.toastLive.textContent.length > 0);
  press('o'); press('t'); press('v'); press('f');
  assert.match(globalThis.location.hash, /theme=|cam=|floor=|night=/);
  // story mode: open with S, step with next/prev and keys, autoplay toggle, exit
  press('s');
  assert.equal(els.story.hidden, false);
  assert.match(els.storyText.textContent, /^Night \d+: /);
  assert.match(globalThis.location.hash, /story=1&beat=0/);
  els.storyNext.listeners.click(); els.storyNext.listeners.click();
  assert.match(globalThis.location.hash, /beat=2/);
  assert.match(els.storyMeta.textContent, /beat 3 of 5/);
  press('.'); press(','); press('.');
  for (let i = 0; i < 30; i++) els.storyNext.listeners.click();
  assert.equal(els.storyNext.disabled, true);
  els.storyPrev.listeners.click();
  els.storyPlay.listeners.click();
  assert.equal(els.storyPlay.textContent, 'Pause');
  els.storyPlay.listeners.click();
  assert.equal(els.storyPlay.textContent, 'Play');
  for (let i = 0; i < 40; i++) els.storyPrev.listeners.click();
  assert.equal(els.storyPrev.disabled, true);
  els.storyExit.listeners.click();
  assert.equal(els.story.hidden, true);
  assert.doesNotMatch(globalThis.location.hash, /story=/);
  // mute and volume work without an AudioContext (no audio is created until the sound box is ticked)
  press('u'); assert.equal(els.mute.textContent, 'Unmute (U)');
  els.mute.listeners.click(); assert.equal(els.mute.textContent, 'Mute (U)');
  els.volume.value = '20'; els.volume.listeners.input();
  globalThis.setInterval = realSetInterval;
});
