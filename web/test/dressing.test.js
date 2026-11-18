import test from 'node:test';
import { COLLISION_ONLY_KINDS } from '../src/landmarks.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLayout, PrefabCatalog } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { composeDressing, dressingBoxes, dockU, footprintOf, DRESSING_KINDS, overlapsLayout, CELL_M, hiOf, coastToWorldAt, COAST_ROAD_V, RUT_LIFT, INN_SCALE, CHAPEL_SCALE } from '../src/dressing.js';
import { facingYaw } from '../src/streets.js';
import { OVERHANG_CLEARANCE, BODY_RADIUS } from '../src/world-scale.js';
import { DOOR_KINDS, DOOR_WALL_CLEARANCE, DRESSING_LAMP_KINDS, LAMP_POLE_HALF } from '../src/dressing.js';
import { laneLines, isStreetCell } from '../src/streets.js';
import { coastFeatures } from '../src/view3d-math.js';
import { loadGlbBuffer } from '../src/glb.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).dressing;
const entries = JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries;
const catalog = new PrefabCatalog(entries);
const layoutFor = (seed, grid) => (grid === CITY_GRID ? generateCityLayout(catalog, grid, grid, CITY_PIECES, seed) : generateLayout(catalog, grid, grid, grid === 24 ? 40 : 20, seed));

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

test('collision boxes cover only solid kinds and lamp poles', () => {
  const items = composeDressing(1818, 24, 24, layoutFor(1818, 24));
  assert.equal(dressingBoxes(items).length, items.filter((i) => footprintOf(i.kind).solid || DRESSING_LAMP_KINDS.includes(i.kind)).length);
});

test('footprint table matches the committed meshes within 5 cm and heights within 10 cm', () => {
  for (const kind of DRESSING_KINDS) {
    if (COLLISION_ONLY_KINDS.includes(kind)) continue; // the church boxes have no mesh: the renderer draws the church on its rise itself
    const b = readFileSync(join(here, '..', 'assets', 'meshes', `${kind}.glb`)), m = loadGlbBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), f = footprintOf(kind);
    const { min, max } = m.bounds;
    assert.ok(Math.abs((max[0] - min[0]) / 2 - f.halfX) < 0.05, `${kind} halfX`);
    assert.ok(Math.abs((max[2] - min[2]) / 2 - f.halfZ) < 0.05, `${kind} halfZ`);
    assert.ok(Math.abs(max[1] - f.height) < 0.1, `${kind} height`);
  }
});

// ---------- round 22: foreground fill ----------
const FOREGROUND_KINDS = ['grass_tuft', 'stump', 'log', 'woodpile', 'hedge', 'picket_fence', 'bollard', 'rope_coil', 'crop_row', 'wheel_ruts'];
/** Walk positions a first-person player stands on: every 2 m of every lane centre line and of the coast road. */
function walkSamples(seed, grid) {
  const pts = [];
  for (const c of laneLines(grid)) for (let z = 3; z < grid * CELL_M - 3; z += 2) pts.push([(c + 0.5) * CELL_M, z]);
  for (const r of laneLines(grid)) for (let x = 3; x < grid * CELL_M - 3; x += 2) pts.push([x, (r + 0.5) * CELL_M]);
  for (let u = 1; u < hiOf(seed, grid, grid) - 1; u += 2) { const w = coastToWorldAt(seed, grid, u, COAST_ROAD_V); pts.push([w.x, w.z]); }
  return pts;
}

test('near field: every sampled walk position has a ground prop 2 to 8 m away, and at least 90% have three or more', () => {
  for (const [seed, grid, n] of [[1818, 24, 80], [7, 24, 80], [42, 24, 80], [1, 20, 60], [99999, 32, 100]]) {
    const items = composeDressing(seed, grid, grid, generateLayout(catalog, grid, grid, n, seed)).filter((it) => it.y < 0.5);
    const counts = walkSamples(seed, grid).map(([x, z]) => items.filter((it) => { const d = Math.hypot(it.x - x, it.z - z); return d >= 2 && d <= 8; }).length);
    assert.ok(counts.length > 200);
    assert.ok(Math.min(...counts) >= 1, `seed ${seed}: an empty spot (${Math.min(...counts)} props within 2 to 8 m)`);
    assert.ok(counts.filter((k) => k >= 3).length >= counts.length * 0.9, `seed ${seed}: fewer than 90% of spots have 3 props`);
  }
});

test('foreground fill places every new kind, keeps off layout pieces, and leaves the earlier dressing untouched in order', () => {
  const seen = new Set();
  for (const seed of [1, 42, 1818, 7]) {
    const layout = layoutFor(seed, 24), items = composeDressing(seed, 24, 24, layout);
    items.forEach((it) => seen.add(it.kind));
    for (const it of items) if (FOREGROUND_KINDS.includes(it.kind) && it.x > 0 && it.x < 96 && it.z > 0 && it.z < 96 && it.kind !== 'wheel_ruts') assert.ok(!overlapsLayout(it, layout, 0), `${it.kind} on a piece`);
    for (const it of items.filter((i) => i.kind === 'wheel_ruts')) { assert.equal(it.y, RUT_LIFT); assert.ok(isStreetCell(24, 24, Math.floor(it.x / CELL_M), Math.floor(it.z / CELL_M))); }
  }
  for (const k of FOREGROUND_KINDS) assert.ok(seen.has(k), `some seed places ${k}`);
});

test('the coast cottages, inn and chapel are bigger than round 21 and still cottage sized', () => {
  assert.ok(footprintOf('cottage_thatch').halfX * 2 >= 4.4 && footprintOf('cottage_tall').halfX * 2 >= 3.6);
  assert.ok(footprintOf('inn').halfX * 2 * INN_SCALE >= 6.4 && footprintOf('chapel').halfZ * 2 * CHAPEL_SCALE >= 4.9);
});

test('batchProps merges any mix of kinds into one static buffer with one uv pair per vertex and skips missing meshes', async () => {
  const { batchProps } = await import('../src/view3d.js');
  const { VERTEX_FLOATS } = await import('../src/glb.js');
  const meshes = new Map(['grass_tuft', 'bollard', 'barrel'].map((k) => { const b = readFileSync(join(here, '..', 'assets', 'meshes', `${k}.glb`)); return [k, loadGlbBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))]; }));
  const items = [{ kind: 'grass_tuft', x: 1, y: 0, z: 1, yaw: 0, scale: 1 }, { kind: 'bollard', x: 3, y: 0, z: 1, yaw: 1, scale: 1 }, { kind: 'nope', x: 0, y: 0, z: 0, yaw: 0, scale: 1 }, { kind: 'barrel', x: 5, y: 0, z: 2, yaw: 0, scale: 1 }];
  const out = [], uv = [];
  assert.equal(batchProps(out, uv, items, meshes), 3);
  const tris = ['grass_tuft', 'bollard', 'barrel'].reduce((a, k) => a + meshes.get(k).triangles.length, 0);
  assert.equal(out.length, tris * 3 * VERTEX_FLOATS);
  assert.equal(uv.length, (out.length / VERTEX_FLOATS) * 2);
  const again = [], uv2 = [];
  batchProps(again, uv2, items, meshes);
  assert.deepEqual(again, out, 'deterministic');
  assert.equal(batchProps([], [], items, null), 0);
});

test('door props keep wall clearance so a bench never touches the plaster (mirrors Core)', () => {
  let checked = 0;
  for (let facing = 0; facing < 4; facing++) for (let seed = 1; seed <= 60; seed++) {
    const house = { id: 'house_a', x: 10, z: 10, sizeX: 3, sizeZ: 3, facing };
    const yaw = facingYaw(facing), dirX = Math.sin(yaw), dirZ = Math.cos(yaw), sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
    const cx = (house.x + 1.5) * CELL_M, cz = (house.z + 1.5) * CELL_M, wall = 3 * CELL_M / 2 - 0.7;
    for (const it of composeDressing(seed, 24, 24, [house])) {
      if (DOOR_KINDS.indexOf(it.kind) < 1 || it.yaw !== yaw) continue;
      const ahead = (it.x - cx) * dirX + (it.z - cz) * dirZ, across = (it.x - cx) * sideX + (it.z - cz) * sideZ;
      if (Math.abs(Math.abs(across) - 2.2) > 1e-6) continue;
      assert.ok(ahead - footprintOf(it.kind).halfZ - wall >= DOOR_WALL_CLEARANCE - 1e-9, `${it.kind} touches the wall, facing ${facing} seed ${seed}`);
      assert.ok(ahead + footprintOf(it.kind).halfZ <= 3 * CELL_M / 2 + 1e-9, `${it.kind} sticks out into the lane, facing ${facing} seed ${seed}`);
      checked++;
    }
  }
  assert.ok(checked > 20, `only ${checked} door props checked`);
});

test('solid collision boxes carry the overhang clearance and the body radius is the Core value', () => {
  const barrel = { kind: 'barrel', x: 5, z: 5, yaw: 0, scale: 1 }, [box] = dressingBoxes([barrel, { kind: 'bench', x: 1, z: 1, yaw: 0, scale: 1 }]);
  const f = footprintOf('barrel');
  assert.ok(Math.abs(box.maxX - box.minX - 2 * (f.halfX + OVERHANG_CLEARANCE)) < 1e-9);
  assert.ok(Math.abs(box.maxZ - box.minZ - 2 * (f.halfZ + OVERHANG_CLEARANCE)) < 1e-9);
  assert.equal(BODY_RADIUS, 0.45);
});

// ---------- round 23: corruption growth (tentacle trees, fungi, spires) ----------
import { corruptionLevel, corruptionSites, corruptionScale, growCorruption, CORRUPTION_LEVELS, CORRUPTION_FIRST_SCALE } from '../src/dressing.js';
const corruptionGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).corruption;

test('corruption growth levels match the C# golden, including NaN, negative and huge inputs', () => {
  assert.ok(corruptionGolden.levels.length >= 60);
  for (const [dread, night, level] of corruptionGolden.levels) assert.equal(corruptionLevel(dread === null ? NaN : dread, night), level, `${dread}/${night}`);
});

test('corruption sites and per-level scales match the C# golden', () => {
  assert.equal(corruptionGolden.worlds.length, 15); // five seeds on the 24, 16 and 36 (city) grids
  for (const w of corruptionGolden.worlds) {
    const sites = corruptionSites(w.seed, w.grid, w.grid);
    assert.equal(sites.length, w.sites.length);
    sites.forEach((it, i) => {
      assert.equal(it.kind, w.sites[i][0]);
      [it.x, it.y, it.z, it.yaw, it.scale].forEach((v, j) => assert.ok(Math.abs(v - w.sites[i][j + 1]) < 1e-9, `${w.seed}/${w.grid} site ${i}.${j}`));
    });
    w.scales.forEach((row, level) => row.forEach((s, rank) => assert.ok(Math.abs(corruptionScale(rank, sites.length, level) - s) < 1e-12, `${w.seed} level ${level} rank ${rank}`)));
  }
});

test('corruption is empty when calm, complete at the top level, and only ever grows', () => {
  for (const seed of [1, 42, 1818]) {
    assert.equal(growCorruption(seed, 24, 24, 0).length, 0);
    assert.equal(growCorruption(seed, 24, 24, CORRUPTION_LEVELS).length, corruptionSites(seed, 24, 24).length);
    let prev = 0;
    for (let level = 0; level <= CORRUPTION_LEVELS; level++) {
      const grown = growCorruption(seed, 24, 24, level);
      assert.ok(grown.length >= prev); prev = grown.length;
      for (const it of grown) assert.ok(it.scale >= CORRUPTION_FIRST_SCALE && it.scale <= 1, `${it.kind} scale ${it.scale}`);
    }
  }
  assert.equal(corruptionLevel(0, 1), 0);
  assert.equal(corruptionLevel(1, 10), CORRUPTION_LEVELS);
  let last = 0;
  for (let d = 0; d <= 100; d++) { const l = corruptionLevel(d / 100, 3); assert.ok(l >= last); last = l; }
});

test('corruption kinds have meshes and their stand sites lie outside the village grid', async () => {
  for (const grid of [24, CITY_GRID]) for (const seed of [1, 42, 1818, 7, 2024]) for (const it of corruptionSites(seed, grid, grid)) {
    const w = grid * CELL_M;
    assert.ok(DRESSING_KINDS.includes(it.kind));
    assert.ok(!(it.x > 0 && it.x < w && it.z > 0 && it.z < w), `${it.kind} inside the ${grid} grid`);
  }
});
