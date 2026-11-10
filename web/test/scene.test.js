import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeView, occupancy, findPath, waypoints, buildWalkers, walkerPos, cultistCount, windowState,
  omenText, addEntry, entryLabel, reportFilename, wrapIndex, describeScene, MAX_WALKERS,
} from '../src/scene.js';
import { PrefabCatalog, generateLayout } from '../src/core.js';
import { readFileSync } from 'node:fs';

const catalog = new PrefabCatalog(JSON.parse(readFileSync(new URL('../data/village_catalog.json', import.meta.url), 'utf8')).entries);

test('computeView keeps the whole board inside the canvas', () => {
  const v = computeView(960, 560, 24, 24);
  const left = v.ox - 12 * v.tw, right = v.ox + 12 * v.tw, bottom = v.oy + 24 * v.th;
  assert.ok(left >= 0 && right <= 960 && bottom <= 560 && v.oy >= 0);
  assert.ok(right - left > 850, 'board fills the width');
});

test('findPath avoids blocked cells and reports unreachable goals', () => {
  const occ = new Uint8Array(25);
  for (let z = 0; z < 4; z++) occ[2 * 5 + z] = 1; // wall at x=2 with a gap at z=4
  const path = findPath(occ, 5, 5, [0, 0], [4, 0]);
  assert.ok(path && path.some(([x, z]) => x === 2 && z === 4));
  assert.ok(path.every(([x, z]) => !occ[x * 5 + z]));
  occ[2 * 5 + 4] = 1;
  assert.equal(findPath(occ, 5, 5, [0, 0], [4, 0]), null);
});

test('walkers are deterministic, bounded and stay on free cells', () => {
  const layout = generateLayout(catalog, 24, 24, 80, 1818);
  const a = buildWalkers(layout, 24, 24, 1818), b = buildWalkers(layout, 24, 24, 1818);
  assert.deepEqual(a, b);
  assert.ok(a.length > 0 && a.length <= MAX_WALKERS);
  const occ = occupancy(layout, 24, 24);
  for (const w of a) for (const [x, z] of w.path) assert.equal(occ[x * 24 + z], 0);
  for (const t of [0, 3.3, 99]) {
    const p = walkerPos(a[0], t);
    assert.ok(p.x >= 0 && p.x <= 24 && p.z >= 0 && p.z <= 24);
  }
  assert.ok(waypoints(layout, 24, 24, 1818).length >= 2);
});

test('cultist count grows with tier', () => {
  assert.deepEqual([0, 1, 2, 3].map(cultistCount), [0, 2, 4, MAX_WALKERS]);
  assert.equal(cultistCount(99), MAX_WALKERS);
});

test('windows go dark and red as dread rises', () => {
  assert.equal(windowState(0.5, 0), 'warm');
  assert.equal(windowState(0.1, 1), 'off');
  assert.equal(windowState(0.95, 1), 'red');
});

test('journal keeps newest first, caps length and drops repeats', () => {
  let list = [];
  for (let i = 0; i < 20; i++) list = addEntry(list, { kind: 'narration', text: `line ${i}`, sanity: 50 });
  assert.equal(list.length, 12);
  assert.equal(list[0].text, 'line 19');
  assert.equal(addEntry(list, { kind: 'narration', text: 'line 19', sanity: 40 }), list);
  assert.match(entryLabel({ kind: 'omen', text: 'x', sanity: 41.6 }), /^\[sanity 42\] Omen: x$/);
});

test('omen text, filenames, wrapping and description', () => {
  assert.match(omenText({ name: 'Abyss', rising: true, tier: 3 }), /eye/);
  assert.match(omenText({ name: 'Dire', rising: false, tier: 1 }), /Uneasy/);
  assert.equal(reportFilename(1818, 'md'), 'village-report-seed-1818.md');
  assert.equal(wrapIndex(-1, 3, 1), 0);
  assert.equal(wrapIndex(0, 3, -1), 2);
  assert.equal(wrapIndex(0, 0, 1), -1);
  assert.match(describeScene({ seed: 1, pieces: 2, tierName: 'Calm', dreadPercent: 0, focus: 'church' }), /Listening to church/);
});
