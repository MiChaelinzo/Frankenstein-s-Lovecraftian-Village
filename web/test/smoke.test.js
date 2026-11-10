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
    document: { getElementById: el, hidden: false, documentElement: { classList: { add() {} } }, addEventListener() {}, createElement: () => ({ click() { clicked.push(this); }, remove() {} }), body: { appendChild() {} } },
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
  globalThis.setInterval = realSetInterval;
});
