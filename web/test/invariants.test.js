import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SeededRandom, PrefabCatalog, generateLayout, SanityModel, tierFor, DREAD_THRESHOLDS,
  generateCampaign, buildVillageReport,
} from '../src/core.js';

function randomCatalog(r) {
  const list = [];
  const n = 1 + r.next(8);
  for (let i = 0; i < n; i++) {
    list.push({ id: 'p' + i, category: 'c', weight: 1 + r.next(9), footprintX: 1 + r.next(3), footprintZ: 1 + r.next(3), horror: r.next(10) });
  }
  return new PrefabCatalog(list);
}

function forAll(fn) {
  for (let seed = 1; seed <= 300; seed++) fn(new SeededRandom(seed * 7919), seed);
}

test('layout stays in bounds, never overlaps and respects target count', () => {
  forAll((r, seed) => {
    const cat = randomCatalog(r);
    const w = 1 + r.next(20), d = 1 + r.next(20), n = 1 + r.next(80);
    const layout = generateLayout(cat, w, d, n, seed);
    assert.ok(layout.length <= n);
    const cells = new Set();
    for (const p of layout) {
      assert.ok(p.x >= 0 && p.z >= 0 && p.x + p.sizeX <= w && p.z + p.sizeZ <= d);
      for (let x = 0; x < p.sizeX; x++) for (let z = 0; z < p.sizeZ; z++) {
        const key = (p.x + x) + ',' + (p.z + z);
        assert.ok(!cells.has(key));
        cells.add(key);
      }
    }
  });
});

test('dread is in unit range and non-increasing in sanity', () => {
  forAll((r) => {
    const a = r.next(1001) / 10, b = r.next(1001) / 10;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const dLo = SanityModel.dreadFor(lo), dHi = SanityModel.dreadFor(hi);
    assert.ok(dLo >= dHi);
    assert.ok(dLo >= 0 && dLo <= 1 && dHi >= 0 && dHi <= 1);
  });
});

test('tier is monotone in dread and within range', () => {
  forAll((r) => {
    const a = r.next(101) / 100, b = r.next(101) / 100;
    const tLo = tierFor(Math.min(a, b)), tHi = tierFor(Math.max(a, b));
    assert.ok(tLo <= tHi);
    assert.ok(tHi >= 0 && tHi < DREAD_THRESHOLDS.tierNames.length);
  });
});

test('campaign nights are numbered in order, clamped, and the sky never lightens', () => {
  const order = ['dusk', 'night', 'witching'];
  forAll((r) => {
    const c = generateCampaign(r.next(2000000) - 1000000, r.next(14) - 2);
    assert.ok(c.nights.length >= 1 && c.nights.length <= 9);
    let prev = 0;
    c.nights.forEach((n, i) => {
      assert.equal(n.number, i + 1);
      const idx = order.indexOf(n.sky);
      assert.ok(idx >= prev);
      prev = idx;
    });
  });
});

test('report landmarks match category count and average horror is bounded', () => {
  forAll((r, seed) => {
    const cat = randomCatalog(r);
    const w = 1 + r.next(20), d = 1 + r.next(20);
    const layout = generateLayout(cat, w, d, 1 + r.next(60), seed);
    const rep = buildVillageReport(cat, layout, w, d, seed, r.next(101) / 100);
    const lm = rep.byCategory.filter((c) => c[0] === "Landmark").reduce((s, c) => s + c[1], 0);
    assert.equal(rep.landmarks.length, lm);
    if (rep.pieces === 0) { assert.equal(rep.averageHorrorX100, 0); return; }
    const horrors = layout.map((p) => cat.get(p.id).horror);
    assert.ok(rep.averageHorrorX100 >= Math.min(...horrors) * 100 && rep.averageHorrorX100 <= Math.max(...horrors) * 100);
    assert.ok(rep.dreadPercent >= 0 && rep.dreadPercent <= 100);
  });
});

test('same seed gives identical layout and report', () => {
  forAll((r, seed) => {
    const cat = randomCatalog(r);
    const a = generateLayout(cat, 12, 12, 30, seed), b = generateLayout(cat, 12, 12, 30, seed);
    assert.deepEqual(a, b);
    assert.deepEqual(buildVillageReport(cat, a, 12, 12, seed, 0.5), buildVillageReport(cat, b, 12, 12, seed, 0.5));
  });
});
