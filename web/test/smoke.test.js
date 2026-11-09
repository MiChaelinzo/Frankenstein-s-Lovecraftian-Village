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
    get: (t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => grad : k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const els = {};
  const el = (id) => (els[id] ??= {
    id, style: {}, value: '1818', textContent: '', checked: false, listeners: {},
    addEventListener(n, f) { this.listeners[n] = f; },
    getContext: () => ctx, width: 960, height: 560,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 560 }),
  });
  let raf = null;
  Object.assign(globalThis, {
    document: { getElementById: el },
    matchMedia: () => ({ matches: false }),
    location: { search: '', hash: '#seed=42&sanity=10', href: 'http://x/' },
    history: { replaceState: (a, b, h) => { globalThis.location.hash = h; } },
    addEventListener() {},
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
  raf(5000);
  globalThis.setInterval = realSetInterval;
});
