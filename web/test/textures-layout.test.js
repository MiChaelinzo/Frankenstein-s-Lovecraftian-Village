import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextures } from '../src/textures.js';

const manifest = { source: { package: 'synthetic' }, roles: { wall_wood: { texture: 'textures/w.png', tint: [10, 20, 30] } } };

function setup(layoutResponse) {
  const saved = { fetch: globalThis.fetch, Image: globalThis.Image, document: globalThis.document };
  const o = { fillStyle: '', fillRect() {}, drawImage() {} };
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => o }) };
  globalThis.Image = class { set src(v) { this.width = 4; this.height = 4; setTimeout(() => this.onload(), 0); } };
  globalThis.fetch = async (url) => (url.endsWith('manifest.json') ? { ok: true, json: async () => manifest } : layoutResponse(url));
  const t = createTextures({ ctx: { createPattern: () => ({}) }, params: new URLSearchParams('pack=1'), tr: (k) => k });
  return { t, restore: () => Object.assign(globalThis, saved) };
}

test('loadPack keeps plain pack mode when scene_layout.json is absent', async () => {
  const { t, restore } = setup(async () => ({ ok: false }));
  const warn = console.warn; console.warn = () => {};
  try { await t.loadPack(); } finally { console.warn = warn; restore(); }
  assert.ok(t.pack.manifest);
  assert.equal(t.pack.layout, null);
});

test('loadPack ignores a rejected or unreadable scene layout', async () => {
  for (const resp of [async () => ({ ok: true, json: async () => ({ version: 9, scenes: {} }) }), async () => { throw new Error('boom'); }]) {
    const { t, restore } = setup(resp);
    const warn = console.warn; console.warn = () => {};
    try { await t.loadPack(); } finally { console.warn = warn; restore(); }
    assert.ok(t.pack.manifest);
    assert.equal(t.pack.layout, null);
  }
});

test('loadPack accepts a valid synthetic scene layout', async () => {
  const layout = { version: 1, scenes: { demo: { title: 'Demo', objects: [{ name: 'a', kind: 'rock', x: 0, z: 0, y: 0, rotY: 0, scale: 1 }] } } };
  const { t, restore } = setup(async () => ({ ok: true, json: async () => layout }));
  try { await t.loadPack(); } finally { restore(); }
  assert.deepEqual(Object.keys(t.pack.layout), ['demo']);
});
