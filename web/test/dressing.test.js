import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLayout, PrefabCatalog } from '../src/core.js';
import { composeDressing, dressingBoxes, dockU, footprintOf, DRESSING_KINDS, overlapsLayout } from '../src/dressing.js';
import { coastFeatures } from '../src/view3d-math.js';
import { loadGlbBuffer } from '../src/glb.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).dressing;
const entries = JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries;
const catalog = new PrefabCatalog(entries);
const layoutFor = (seed, grid) => generateLayout(catalog, grid, grid, grid === 24 ? 40 : 20, seed);

test('dressing matches the C# golden items', () => {
  assert.ok(golden.length >= 10);
  for (const w of golden) {
    const items = composeDressing(w.seed, w.grid, w.grid, layoutFor(w.seed, w.grid));
    assert.ok(Math.abs(dockU(w.seed, w.grid, w.grid) - w.dockU) < 1e-9);
    assert.equal(items.length, w.items.length, `count ${w.seed}/${w.grid}`);
    items.forEach((it, i) => {
      const g = w.items[i];
      assert.equal(it.kind, g[0]);
      [it.x, it.y, it.z, it.yaw, it.scale].forEach((v, j) => assert.ok(Math.abs(v - g[j + 1]) < 1e-9, `${w.seed}/${w.grid} item ${i}.${j}: ${v} vs ${g[j + 1]}`));
    });
  }
});

test('dock position equals the web coast dock, so harbour props share one rule', () => {
  for (const seed of [1, 42, -7, 1818, 123456789]) assert.ok(Math.abs(dockU(seed, 24, 24) - coastFeatures(24, 24, seed).dock.u) < 1e-9);
});

test('dressing is deterministic, never enlarges, and keeps solid items off layout pieces', () => {
  for (const seed of [1, 42, 1818]) {
    const layout = layoutFor(seed, 24), a = composeDressing(seed, 24, 24, layout);
    assert.deepEqual(a, composeDressing(seed, 24, 24, layout));
    assert.ok(a.every((it) => it.scale <= 1 && DRESSING_KINDS.concat(['lamp', 'lamp_tall', 'lamp_double']).includes(it.kind)));
    for (const it of a) if (it.y === 0 && it.kind !== 'lamp' && !it.kind.startsWith('lamp') && footprintOf(it.kind).solid) {
      const inGrid = it.x > 0 && it.x < 96 && it.z > 0 && it.z < 96;
      if (inGrid) assert.ok(!overlapsLayout(it, layout, 0), `${it.kind} overlaps a piece`);
    }
    for (const k of ['lighthouse', 'chapel', 'inn', 'cottage_thatch', 'crate_stack', 'barrel', 'market_stall', 'gravestone', 'fence_iron', 'lamp']) assert.ok(a.some((it) => it.kind === k), `${seed} has ${k}`);
  }
});

test('collision boxes cover only solid kinds', () => {
  const items = composeDressing(1818, 24, 24, layoutFor(1818, 24));
  assert.equal(dressingBoxes(items).length, items.filter((i) => footprintOf(i.kind).solid).length);
});

test('footprint table matches the committed meshes within 5 cm and heights within 10 cm', () => {
  for (const kind of DRESSING_KINDS) {
    const b = readFileSync(join(here, '..', 'assets', 'meshes', `${kind}.glb`)), m = loadGlbBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), f = footprintOf(kind);
    const { min, max } = m.bounds;
    assert.ok(Math.abs((max[0] - min[0]) / 2 - f.halfX) < 0.05, `${kind} halfX`);
    assert.ok(Math.abs((max[2] - min[2]) / 2 - f.halfZ) < 0.05, `${kind} halfZ`);
    assert.ok(Math.abs(max[1] - f.height) < 0.1, `${kind} height`);
  }
});
