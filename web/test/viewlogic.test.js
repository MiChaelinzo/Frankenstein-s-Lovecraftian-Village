import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRandom, doorOmen, detailLevel } from '../src/core.js';
import {
  THEMES, THEME_IDS, parseTheme, themeRole, themeColors, parseCamera, effectiveCamera, cameraProfile, cameraOverridden,
  floorCountFor, visibleFloors, parseFloor, detailFeatures, doorMessage, nearestDoor, doorShake, buildingKey,
} from '../src/building.js';

function forAll(fn) {
  for (let seed = 1; seed <= 200; seed++) fn(new SeededRandom(seed * 7919), seed);
}

test('themes cover the six texture families across the three DLNK groups', () => {
  assert.deepEqual(THEMES.map((t) => t.label), ['Bricks', 'Plaster', 'Tiles', 'Wood', 'Rocks', 'Water']);
  assert.deepEqual([...new Set(THEMES.map((t) => t.group))].sort(), ['Construction', 'Manmade', 'Nature']);
  for (const t of THEMES) assert.ok(themeColors(t.id), t.id);
});

test('parseTheme and parseCamera never throw and fall back safely', () => {
  for (const bad of [undefined, null, '', 'lava', '<script>', 42]) {
    assert.equal(parseTheme(bad), 'auto');
    assert.equal(parseCamera(bad), 'third');
  }
  for (const id of THEME_IDS) assert.equal(parseTheme(id.toUpperCase()), id);
});

test('themeRole prefers the pack texture and falls back to the procedural pattern', () => {
  assert.equal(themeRole('bricks', { wall_brick: 1 }), 'wall_brick');
  assert.equal(themeRole('bricks', {}), 'proc_bricks');
  assert.equal(themeRole('bricks', null), 'proc_bricks');
  assert.equal(themeRole('water', { wall_brick: 1, roof: 1 }), 'proc_water');
  assert.equal(themeRole('auto', {}), null);
});

test('top-down is never effective at Abyss dread; auto follows dread', () => {
  assert.equal(effectiveCamera('top', 0.1), 2);
  assert.equal(effectiveCamera('top', 0.95), 0);
  assert.equal(cameraOverridden('top', 0.95), true);
  assert.equal(cameraOverridden('top', 0.1), false);
  assert.equal(cameraOverridden('auto', 0.95), false);
  assert.equal(effectiveCamera('third', 0.95), 1);
  assert.equal(effectiveCamera('auto', 0), 2);
  assert.equal(effectiveCamera('auto', 0.5), 1);
  assert.notEqual(effectiveCamera('auto', 0.95), 2);
  for (const m of [0, 1, 2]) { const p = cameraProfile(m); assert.ok(p.k > 0 && p.hs > 0); }
});

test('visible floors are a contiguous prefix in top-down and all floors otherwise', () => {
  forAll((r) => {
    const count = 1 + r.next(4), active = r.next(8) - 2;
    assert.equal(visibleFloors(count, active, false).length, count);
    const vis = visibleFloors(count, active, true);
    assert.deepEqual(vis, [...vis.keys()]);
    assert.ok(vis.length >= 1 && vis.length <= count);
    assert.equal(vis.length, Math.max(0, Math.min(count - 1, active)) + 1);
  });
});

test('floorCountFor stays in 1..3 and parseFloor clamps', () => {
  forAll((r) => {
    for (const id of ['house_a', 'house_b', 'church', 'well']) {
      const n = floorCountFor(id, r.next(100) / 100, r.next(100) / 100);
      assert.ok(n >= 1 && n <= 3);
    }
  });
  assert.equal(parseFloor('abc'), 0);
  assert.equal(parseFloor('99', 2), 2);
  assert.equal(parseFloor('-4', 2), 0);
});

test('detail features only ever disappear as detail falls', () => {
  const keys = Object.keys(detailFeatures(3));
  for (let d = 1; d <= 3; d++) for (const k of keys) assert.ok(!detailFeatures(d - 1)[k] || detailFeatures(d)[k], `${k} at ${d}`);
  assert.ok(keys.every((k) => detailFeatures(3)[k]));
  assert.ok(keys.every((k) => !detailFeatures(0)[k]));
  assert.equal(detailFeatures(99).trim, true);
});

test('detail driven by dread never rises, per building', () => {
  forAll((r, seed) => {
    const key = buildingKey({ id: 'house_a', x: r.next(24), z: r.next(24) });
    let prev = 3;
    for (let i = 0; i <= 20; i++) { const d = detailLevel(i / 20, key, seed); assert.ok(d <= prev); prev = d; }
  });
});

test('door interactions are deterministic by seed and attempt, and calm doors stay normal', () => {
  forAll((r, seed) => {
    const key = buildingKey({ id: 'house_b', x: r.next(24), z: r.next(24) });
    for (let a = 0; a < 5; a++) {
      assert.equal(doorOmen(0, key, 0, a, seed), 0);
      assert.equal(doorOmen(0.8, key, 0, a, seed), doorOmen(0.8, key, 0, a, seed));
      const b = doorOmen(0.95, key, 0, a, seed);
      assert.ok(b >= 0 && b <= 3);
      const msg = doorMessage(b, key);
      assert.ok(msg.length > 0 && !msg.includes('\u2014'));
      assert.equal(msg, doorMessage(b, key));
    }
  });
});

test('nearestDoor picks the closest point inside the radius only', () => {
  const pts = [{ x: 10, y: 10 }, { x: 30, y: 10 }];
  assert.equal(nearestDoor(pts, 12, 10, 14), 0);
  assert.equal(nearestDoor(pts, 28, 12, 14), 1);
  assert.equal(nearestDoor(pts, 200, 200, 14), -1);
  assert.equal(nearestDoor([], 0, 0), -1);
});

test('doorShake is zero for reduced motion, normal doors and expired reactions', () => {
  assert.deepEqual(doorShake(2, 100, true), { dx: 0, dy: 0 });
  assert.deepEqual(doorShake(0, 100, false), { dx: 0, dy: 0 });
  assert.deepEqual(doorShake(2, 900, false), { dx: 0, dy: 0 });
  const s = doorShake(2, 30, false);
  assert.ok(Math.abs(s.dx) > 0 || Math.abs(s.dy) > 0);
  assert.ok(Math.abs(s.dx) <= 3.5 && Math.abs(s.dy) <= 1.5);
});
