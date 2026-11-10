import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRandom, detailLevel, floorVisible, clampFloor, doorOmen, suggestedCamera, allowedCamera, stableHash } from '../src/core.js';

function forAll(fn) {
  for (let seed = 1; seed <= 300; seed++) {
    try { fn(new SeededRandom(seed * 7919), seed); } catch (e) { throw new Error(`Property failed for case seed ${seed}: ${e.message}`); }
  }
}

test('detail is full when calm and never rises with dread', () => {
  forAll((r) => {
    const id = `b${r.next(50)}`, s = r.next(100000);
    assert.equal(detailLevel(0, id, s), 3);
    let prev = 3;
    for (let i = 0; i <= 100; i++) {
      const l = detailLevel(i / 100, id, s);
      assert.ok(l >= 0 && l <= prev, `dread ${i / 100}`);
      prev = l;
    }
  });
});

test('floor peel shows floors up to active in top-down and all otherwise', () => {
  forAll((r) => {
    const count = 1 + r.next(8), active = r.next(14) - 3, c = clampFloor(active, count);
    let visible = 0;
    for (let f = 0; f < count; f++) {
      assert.ok(floorVisible(f, active, count, false));
      if (floorVisible(f, active, count, true)) visible++;
    }
    assert.equal(visible, c + 1);
    assert.ok(!floorVisible(count, active, count, false));
  });
});

test('door omens are gated by tier and deterministic', () => {
  forAll((r) => {
    const id = `b${r.next(50)}`, s = r.next(100000);
    for (let a = 0; a < 20; a++) {
      assert.equal(doorOmen(0.1, id, 0, a, s), 0);
      assert.ok([0, 1].includes(doorOmen(0.4, id, 1, a, s)));
      assert.notEqual(doorOmen(0.7, id, 2, a, s), 3);
      assert.equal(doorOmen(0.95, id, 0, a, s), doorOmen(0.95, id, 0, a, s));
    }
  });
  const seen = new Set();
  for (let a = 0; a < 200; a++) seen.add(doorOmen(1, 'house_a', 0, a, 1818));
  assert.ok(seen.has(2) && seen.has(3));
});

test('camera policy removes top-down only at Abyss', () => {
  assert.equal(suggestedCamera(0), 2);
  assert.equal(suggestedCamera(1), 0);
  assert.equal(allowedCamera(2, 0.5), 2);
  assert.equal(allowedCamera(2, 0.95), 0);
  assert.equal(stableHash('a'), 0xe40c292c | 0);
});
