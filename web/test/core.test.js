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

import { DreadEventTracker as Tracker, eventToString as ev, tierFor, buildVillageReport as build, reportToMarkdown as md, reportToJson as js } from '../src/core.js';

test('tracker: hysteresis silences jitter, falls below threshold minus 0.05', () => {
  const t = new Tracker();
  assert.deepEqual(t.update(0.35).map(ev), ['Uneasy+1']);
  for (let i = 0; i < 10; i++) assert.deepEqual(t.update(i % 2 ? 0.35 : 0.33), []);
  assert.deepEqual(t.update(0.2).map(ev), ['Uneasy-0']);
});

test('tracker: sweep emits each rising event once in order, non-finite is zero', () => {
  const t = new Tracker();
  const all = [];
  for (let d = 0; d <= 1.0001; d += 0.01) all.push(...t.update(d).map(ev));
  assert.deepEqual(all, ['Uneasy+1', 'Dire+2', 'Abyss+3']);
  const z = new Tracker();
  for (const d of [NaN, Infinity, -Infinity]) { assert.deepEqual(z.update(d), []); assert.equal(tierFor(d), 0); }
});

test('report: counts add up, deterministic, no em dash', () => {
  const layout = generateLayout(cat, 10, 10, 20, 5);
  const a = build(cat, layout, 10, 10, 5, 0.5);
  assert.equal(a.pieces, layout.length);
  assert.equal(a.byId.reduce((s, [, n]) => s + n, 0), layout.length);
  assert.ok(a.cellsUsed <= 100);
  assert.equal(md(a), md(build(cat, layout, 10, 10, 5, 0.5)));
  assert.ok(!md(a).includes('\u2014') && !js(a).includes('\u2014'));
  assert.doesNotThrow(() => JSON.parse(js(a)));
  assert.ok(md(build(null, null, 4, 4, 1, NaN)).includes('- none'));
});

import { generateRitual as _gr, generateCampaign as _gc, ritualProgress as _rp, scheduledStageForNight as _ss, serializeRitualSave as _sr, parseRitualSave as _pr, clampRitualSave as _cr } from '../src/core.js';
test('ritual progress: night sets a floor, dread can run ahead', () => {
  const r = _gr(_gc(1818, 5));
  const p = _rp(r, 4, 20);
  assert.equal(p.scheduled, 3);
  assert.ok(p.dreadReached < 3);
  assert.equal(p.effective, 3);
  assert.equal(p.pace, 'behind');
  assert.equal(_rp(r, 1, 100).pace, 'ahead');
  assert.equal(_rp(r, 1, 100).effective, 4);
  assert.equal(_ss(null, 2), -1);
  assert.equal(_ss(r, 0), -1);
  assert.equal(_ss(r, 99), 4);
});
test('ritual save text round trips, rejects junk and clamps', () => {
  const s = { seed: -5, nightNumber: 3, stage: 2 };
  assert.deepEqual(_pr(_sr(s)), s);
  for (const bad of [null, '', 'ritual1;1;2', 'ritual2;1;2;3', 'ritual1;a;2;3', 'ritual1;1;2;99999999999']) assert.equal(_pr(bad), null);
  assert.deepEqual(_cr({ seed: 1, nightNumber: 50, stage: 50 }, 5), { seed: 1, nightNumber: 5, stage: 4 });
  assert.deepEqual(_cr({ seed: 1, nightNumber: 50, stage: 50 }, 0), { seed: 1, nightNumber: 1, stage: -1 });
});
