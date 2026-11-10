import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SeededRandom, PrefabCatalog, generateLayout, SanityModel, StaticNarrationProvider,
  SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
} from '../src/core.js';

const cat = new PrefabCatalog([
  { id: 'a', weight: 3 }, { id: 'big', weight: 1, footprintX: 2, footprintZ: 2 },
  { id: 'bad', weight: 0 }, { id: 'a', weight: 9 }, { id: '' }, null,
]);

test('invalid and duplicate catalog entries are dropped', () => {
  assert.deepEqual(cat.entries.map((e) => e.id), ['a', 'big']);
  assert.equal(cat.totalWeight, 4);
  assert.equal(cat.pickByWeight(0).id, 'a');
  assert.equal(cat.pickByWeight(3).id, 'big');
  assert.equal(cat.pickByWeight(99).id, 'big');
});

test('layout is deterministic, in bounds and never overlaps', () => {
  for (let seed = -50; seed < 50; seed++) {
    const w = 1 + (Math.abs(seed) % 17), d = 1 + (Math.abs(seed * 3) % 13);
    const a = generateLayout(cat, w, d, 30, seed);
    assert.deepEqual(a, generateLayout(cat, w, d, 30, seed));
    const seen = new Set();
    for (const p of a) {
      assert.ok(cat.contains(p.id));
      assert.ok(p.x >= 0 && p.z >= 0 && p.x + p.sizeX <= w && p.z + p.sizeZ <= d);
      for (let x = 0; x < p.sizeX; x++) for (let z = 0; z < p.sizeZ; z++) assert.ok(!seen.has(`${p.x + x},${p.z + z}`) && seen.add(`${p.x + x},${p.z + z}`));
    }
  }
});

test('degenerate layout inputs give empty', () => {
  assert.deepEqual(generateLayout(null, 5, 5, 5, 1), []);
  assert.deepEqual(generateLayout(new PrefabCatalog([]), 5, 5, 5, 1), []);
  assert.deepEqual(generateLayout(cat, 0, 5, 5, 1), []);
  assert.equal(new SeededRandom(1).next(0), 0);
});

test('sanity is clamped, NaN safe, and dread is monotonic', () => {
  const s = new SanityModel();
  s.apply(50); assert.equal(s.value, 100);
  s.apply(-500); assert.equal(s.value, 0);
  s.apply(NaN); assert.equal(s.value, 0);
  let prev = 2;
  for (let v = 0; v <= 100; v += 5) { const d = SanityModel.dreadFor(v); assert.ok(d <= prev); prev = d; }
  assert.ok(SanityModel.dreadFor(80) < SanityModel.dreadFor(20));
});

test('safe narration falls back when the primary throws or returns blank', () => {
  const st = new StaticNarrationProvider();
  const boom = { narrate() { throw new Error('x'); } };
  const blank = { narrate() { return '  '; } };
  assert.equal(new SafeNarrationProvider(boom).narrate('well', 0.9), st.narrate('well', 0.9));
  assert.equal(new SafeNarrationProvider(blank).narrate('well', 0.9), st.narrate('well', 0.9));
  assert.equal(new SafeNarrationProvider(null).narrate(undefined, 0), 'The village sleeps beneath a pale moon.');
  assert.equal(new SafeNarrationProvider({ narrate: () => 'ok' }).narrate('w', 1), 'ok');
});

test('http narration provider never blocks and caches the latest line', async () => {
  const p = new HttpNarrationProvider('http://x', async () => ({ json: async () => ({ text: 'ai line' }) }));
  assert.equal(p.narrate('well', 0.5), '');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(p.narrate('well', 0.5), 'ai line');
  const failing = new HttpNarrationProvider('http://x', async () => { throw new Error('net'); });
  const safe = new SafeNarrationProvider(failing);
  assert.ok(safe.narrate('well', 0.5).length > 0);
});

test('hash round trip and hostile hashes fall back to defaults', () => {
  assert.deepEqual(decodeHash(encodeHash({ seed: -7, sanity: 42 })), { seed: -7, sanity: 42 });
  assert.deepEqual(decodeHash('#seed=abc&sanity=zzz'), { seed: 1818, sanity: 100 });
  assert.deepEqual(decodeHash(''), { seed: 1818, sanity: 100 });
  assert.equal(decodeHash('#sanity=999').sanity, 100);
});
