import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Same stubs as smoke.test.js, but with ?lang=fr: UI strings must come from the French table.
test('app boots in French and routes dynamic UI strings through the table', async () => {
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
    document: { getElementById: el, hidden: false, documentElement: { classList: { add() {} }, setAttribute(k, v) { els.__html = { ...(els.__html || {}), [k]: v }; } }, querySelectorAll: () => [], addEventListener() {}, createElement: () => ({ click() { clicked.push(this); }, remove() {}, getContext: () => ctx, toBlob(cb) { cb(new Blob(['png'])); } }), body: { appendChild() {} } },
    URL: { createObjectURL: (b) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL() {} },
    matchMedia: () => ({ matches: false }),
    location: { search: '', hash: '#seed=42&sanity=10&lang=fr', href: 'http://x/' },
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
  assert.match(els.stats.textContent, /^Graine 42 : \d+ pieces assemblees/);
  assert.equal(els.__html.lang, 'fr');
  assert.match(els.nightInfo.innerHTML, /objectif d&#39;effroi/);
  assert.match(els.nightInfo.innerHTML, /Rumeur: .+Legende: /);
  assert.match(els.night.innerHTML, /Nuit 1 : /);
  assert.ok(els.listen.innerHTML.includes('Choisir un lieu'));
  els.church.listeners.click();
  assert.match(els.dreadOut.textContent, /^Effroi \d+%$/);
  assert.match(els.viewDesc.textContent, /^Village de graine 42/);
  assert.match(els.whispers.innerHTML, /\[raison \d+\]/);
  assert.match(els.objectiveText.textContent, /^(Nuit 1 sur \d : indices \d\/2, lanternes allumees |La veillee est terminee\. Fins trouvees \d\/6)/); // sanity 10 plus the church can hollow the vigil
  assert.ok(!/Seed|Dread/.test(els.stats.textContent + els.dreadOut.textContent));
  els.mute.listeners.click();
  assert.equal(els.mute.textContent, 'Remettre le son (U)');
});
