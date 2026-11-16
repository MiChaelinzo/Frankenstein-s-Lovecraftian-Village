import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateLayout, PrefabCatalog } from '../src/core.js';
import { laneLines, isStreetCell, isSquareCell, isBuilding, facingFor, streetsEnabled, streetSurfaces, streetWalkers, wellDeflected } from '../src/streets.js';
import { composeDressing, walkBounds, footprintOf, CELL_M, COAST_ROAD_V, coastToWorldAt, hiOf } from '../src/dressing.js';
import { stepCamera, BODY_RADIUS } from '../src/view3d-math.js';
import { OVERHANG_CLEARANCE, VILLAGER_RADIUS } from '../src/world-scale.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
const SEEDS = [1, 7, 42, -7, 1818, 99999, 123456789], GRIDS = [[24, 24, 80], [20, 20, 60], [32, 24, 100]];

test('street walkers and walk bounds match the C# golden', () => {
  assert.ok(golden.walkers.length > 20);
  for (const w of golden.walkers) {
    const got = streetWalkers(w.seed, w.grid, w.grid, w.tick, w.dread);
    assert.equal(got.length, w.walkers.length, `count ${w.seed}/${w.grid}/${w.tick}/${w.dread}`);
    got.forEach((g, i) => {
      const e = w.walkers[i];
      assert.equal(g.id, e[0]);
      [g.x, g.z, g.yaw].forEach((v, j) => assert.ok(Math.abs(v - e[j + 1]) < 1e-9, `${w.seed}/${w.grid} walker ${i}.${j}`));
      assert.equal(g.lantern, e[4]);
    });
    const b = walkBounds(w.seed, w.grid, w.grid);
    [b.minX, b.maxX, b.minZ, b.maxZ].forEach((v, j) => assert.ok(Math.abs(v - w.bounds[j]) < 1e-9, `bounds ${w.seed}/${w.grid}.${j}`));
  }
});

test('lanes are centred, squares are 3 by 3 cells and small grids have no streets', () => {
  assert.deepEqual(laneLines(24), [6, 12, 18]);
  assert.deepEqual(laneLines(15), []);
  assert.equal(streetsEnabled(12, 24), false);
  assert.equal(isStreetCell(12, 12, 6, 6), false);
  assert.ok(isStreetCell(24, 24, 12, 0) && isStreetCell(24, 24, 0, 18) && isStreetCell(24, 24, 11, 11) && isSquareCell(24, 24, 13, 13));
  assert.ok(!isStreetCell(24, 24, 3, 3) && !isStreetCell(24, 24, -1, 12));
  assert.equal(streetSurfaces(24, 24, 4).length, 7);
  assert.deepEqual(streetSurfaces(12, 12, 4), []);
});

test('pieces never stand on a street and every building fronts one', () => {
  let buildings = 0;
  for (const [w, d, n] of GRIDS) for (const seed of SEEDS) {
    for (const p of generateLayout(catalog, w, d, n, seed)) {
      for (let x = p.x; x < p.x + p.sizeX; x++) for (let z = p.z; z < p.z + p.sizeZ; z++) assert.ok(!isStreetCell(w, d, x, z), `${p.id} on a street`);
      if (!isBuilding(p.sizeX, p.sizeZ)) continue;
      buildings++;
      assert.ok(p.facing >= 0 && p.facing <= 3);
      assert.equal(p.facing, facingFor(w, d, p.x, p.z, p.sizeX, p.sizeZ));
    }
  }
  assert.ok(buildings > 100);
});

const hitsBox = (x, z, b) => { const dx = x - Math.max(b.minX, Math.min(x, b.maxX)), dz = z - Math.max(b.minZ, Math.min(z, b.maxZ)); return dx * dx + dz * dz < BODY_RADIUS * BODY_RADIUS; };
const solidBoxes = (items, layout) => [
  ...items.filter((it) => footprintOf(it.kind).solid).map((it) => {
    const f = footprintOf(it.kind), c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw)), hx = (c * f.halfX + s * f.halfZ) * it.scale + OVERHANG_CLEARANCE, hz = (s * f.halfX + c * f.halfZ) * it.scale + OVERHANG_CLEARANCE;
    return { minX: it.x - hx, maxX: it.x + hx, minZ: it.z - hz, maxZ: it.z + hz };
  }),
  ...layout.map((p) => ({ minX: p.x * CELL_M, maxX: (p.x + p.sizeX) * CELL_M, minZ: p.z * CELL_M, maxZ: (p.z + p.sizeZ) * CELL_M })),
];

test('the coast road is walkable along the whole harbour quarter, inside the walk bounds', () => {
  for (const [w, d, n] of GRIDS) for (const seed of SEEDS) {
    const layout = generateLayout(catalog, w, d, n, seed), boxes = solidBoxes(composeDressing(seed, w, d, layout), layout), b = walkBounds(seed, w, d);
    const hi = hiOf(seed, w, d);
    for (let u = 0.5; u < hi - 0.5; u += 0.1) {
      const p = coastToWorldAt(seed, w, u, COAST_ROAD_V);
      assert.ok(p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ, `road leaves the bounds at u=${u.toFixed(1)} seed ${seed}`);
      assert.ok(!boxes.some((bx) => hitsBox(p.x, p.z, bx)), `coast road blocked at u=${u.toFixed(1)} seed ${seed} ${w}x${d}`);
    }
  }
});

test('the camera walks the coast road with the real collision step', () => {
  const seed = 1818, layout = generateLayout(catalog, 24, 24, 80, seed), items = composeDressing(seed, 24, 24, layout);
  const boxes = solidBoxes(items, layout).map((b) => ({ ...b, height: 2 })), b = walkBounds(seed, 24, 24), hi = hiOf(seed, 24, 24);
  const a = coastToWorldAt(seed, 24, 2, COAST_ROAD_V), z = coastToWorldAt(seed, 24, hi - 2, COAST_ROAD_V);
  const dx = z.x - a.x, dz = z.z - a.z, yaw = Math.atan2(dx, -dz); // forward is (sin yaw, -cos yaw)
  let cam = { x: a.x, y: 1.6, z: a.z, yaw, pitch: 0 };
  for (let i = 0; i < 400 && Math.hypot(z.x - cam.x, z.z - cam.z) > 1; i++) cam = stepCamera(cam, { forward: 1 }, 0.1, boxes, b);
  assert.ok(Math.hypot(z.x - cam.x, z.z - cam.z) <= 1, `stopped at ${cam.x.toFixed(1)},${cam.z.toFixed(1)}`);
});

test('walkers are deterministic, thin out with dread and carry lanterns only after dark', () => {
  const day = streetWalkers(1818, 24, 24, 700, 0), night = streetWalkers(1818, 24, 24, 1300, 0), dread = streetWalkers(1818, 24, 24, 700, 1);
  assert.deepEqual(day, streetWalkers(1818, 24, 24, 700, 0));
  assert.ok(day.length >= 10 && dread.length < day.length / 2);
  assert.ok(day.every((w) => !w.lantern) && night.every((w) => w.lantern));
  assert.deepEqual(streetWalkers(1818, 12, 12, 700, 0), []);
  for (const w of day) assert.ok(w.x > 0 && w.x < 96 && w.z > 0 && w.z < 96);
});

test('a dense street village with every committed mesh stays within the triangle budget (counts, not timings)', async () => {
  const { buildWorld } = await import('../src/view3d.js');
  const { loadGlbBuffer, KINDS } = await import('../src/glb.js');
  const { frameCost, FRAME_BUDGET } = await import('../src/view3d-math.js');
  const meshes = new Map(KINDS.map((k) => { const b = readFileSync(join(here, '..', 'assets', 'meshes', `${k}.glb`)); return [k, loadGlbBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))]; }));
  for (const seed of [1818, 7, 42]) {
    const layout = generateLayout(catalog, 24, 24, 80, seed).map((p) => ({ ...p, vis: { lit: 1, lit2: 1, phase: 0 }, detail: 3 }));
    const w = buildWorld({ layout, meshes, seed, gridW: 24, gridD: 24 }), n = (a) => a.length / 11;
    const cost = frameCost({ vertices: { building: n(w.building), ground: n(w.ground), sea: 6, coast: n(w.coast), tentacle: 900, villager: 900 }, rain: 900, halos: 100, fireflies: 100, post: true, lights: 8 });
    assert.ok(cost.triangles <= FRAME_BUDGET.triangles * 0.6 && cost.drawCalls <= FRAME_BUDGET.drawCalls, JSON.stringify(cost));
  }
});

test('walkers on the main lanes swing round the well and the square props, never through them', () => {
  assert.equal(wellDeflected(1.2, 10), 1.2); assert.equal(wellDeflected(-1.2, 0), -2); assert.equal(wellDeflected(1.2, 0), 2);
  for (const [w, d, n] of GRIDS) for (const seed of [1818, 7, 42]) {
    const solids = composeDressing(seed, w, d, generateLayout(catalog, w, d, n, seed)).filter((it) => ['well', 'market_stall', 'bench', 'sign'].includes(it.kind));
    assert.ok(solids.some((it) => it.kind === 'well'));
    for (let tick = 0; tick < 400; tick += 0.5) for (const wk of streetWalkers(seed, w, d, tick, 0)) for (const it of solids) {
      const f = footprintOf(it.kind), c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw));
      const hx = (c * f.halfX + s * f.halfZ) * it.scale, hz = (s * f.halfX + c * f.halfZ) * it.scale;
      const dx = Math.max(Math.abs(wk.x - it.x) - hx, 0), dz = Math.max(Math.abs(wk.z - it.z) - hz, 0);
      assert.ok(Math.hypot(dx, dz) >= VILLAGER_RADIUS, `walker ${wk.id} inside the ${it.kind} at tick ${tick} seed ${seed}`);
    }
  }
});
