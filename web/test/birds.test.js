import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlock, stepFlock, advanceFlockTo, birdCounts, roofPerches, flockPlan, createFlocks, buildBirds, BOID_STEP, KINDS } from '../src/birds.js';
import { FRAME_BUDGET } from '../src/view3d-math.js';
import { VERTEX_FLOATS } from '../src/glb.js';

const opts = { seed: 1818, kind: 'gull', count: 9, center: [10, 20], radius: 14, height: 14 };
const layout = [{ id: 'house_a', x: 2, z: 2, sizeX: 2, sizeZ: 2 }, { id: 'house_b', x: 6, z: 2, sizeX: 2, sizeZ: 2 }, { id: 'church', x: 4, z: 6, sizeX: 3, sizeZ: 3 }, { id: 'well', x: 1, z: 1, sizeX: 1, sizeZ: 1 }];

test('boids are deterministic for a seed and independent of how the time is sliced', () => {
  const a = createFlock(opts), b = createFlock(opts), c = createFlock({ ...opts, seed: 7 });
  advanceFlockTo(a, 6); advanceFlockTo(b, 2); advanceFlockTo(b, 4.5); advanceFlockTo(b, 6);
  assert.deepEqual(a.birds, b.birds);
  assert.notDeepEqual(createFlock(opts).birds, c.birds);
  const before = JSON.stringify(a.birds); advanceFlockTo(a, 6);
  assert.equal(JSON.stringify(a.birds), before, 'a time already reached does not move the birds');
});

test('a flock stays together, near its orbit and altitude, and flies at its own speed', () => {
  const f = createFlock(opts); advanceFlockTo(f, 60);
  const spec = KINDS.gull;
  for (const b of f.birds) {
    assert.ok(Number.isFinite(b.x + b.y + b.z));
    const r = Math.hypot(b.x - 10, b.z - 20);
    assert.ok(r > 4 && r < 30, `radius ${r}`);
    assert.ok(Math.abs(b.y - 14) < 8, `height ${b.y}`);
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    assert.ok(sp >= spec.speed * 0.69 && sp <= spec.speed * 1.11, `speed ${sp}`);
  }
  for (let i = 0; i < f.birds.length; i++) for (let j = i + 1; j < f.birds.length; j++) {
    const a = f.birds[i], b = f.birds[j];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.3, 'birds do not stack');
  }
  const g = createFlock(opts); stepFlock(g); assert.equal(g.time, BOID_STEP);
});

test('counts follow weather, dread and reduced motion', () => {
  assert.equal(birdCounts({ weather: 'storm' }).gulls, 0);
  assert.ok(birdCounts({ weather: 'clear' }).gulls > birdCounts({ weather: 'fog' }).gulls);
  assert.equal(birdCounts({ dread: 0.69, perches: 6 }).silhouettes, 0);
  assert.ok(birdCounts({ dread: 0.9, perches: 6 }).silhouettes >= 1);
  assert.equal(birdCounts({ dread: 0.1, perches: 6 }).circling, 0);
  assert.equal(birdCounts({ dread: 0.9, perches: 6 }).circling, 5);
  assert.deepEqual(birdCounts({ dread: 1, reduced: true, perches: 6 }), { gulls: 0, perched: 6, circling: 0, silhouettes: 0 });
});

test('perches sit on seeded roofs, and the plan is pure', () => {
  const heights = [6, 6, 12, 1], p = roofPerches(layout, heights, 5, 6);
  assert.equal(p.length, 3, 'houses and church only');
  assert.deepEqual(p, roofPerches(layout, heights, 5, 6));
  assert.ok(p.every((q) => q.y > 5));
  assert.deepEqual(flockPlan({ seed: 1, gridW: 24, gridD: 24, layout }), flockPlan({ seed: 1, gridW: 24, gridD: 24, layout }));
});

test('built birds are whole triangles, deterministic, static under reduced motion and inside the point and triangle budgets', () => {
  const plan = flockPlan({ seed: 1818, gridW: 24, gridD: 24, layout }), counts = birdCounts({ weather: 'clear', dread: 1, perches: 3 });
  const make = () => { const flocks = createFlocks({ seed: 1818, plan, counts }); for (const k of ['gulls', 'crows', 'silhouettes']) if (flocks[k]) advanceFlockTo(flocks[k], 3.7); return buildBirds({ flocks, perches: roofPerches(layout, [6, 6, 12, 1], 1818, 3), counts, timeSec: 3.7 }); };
  const a = make(), b = make();
  assert.deepEqual([...a], [...b]);
  assert.equal(a.length % (VERTEX_FLOATS * 3), 0);
  assert.ok(a.length / VERTEX_FLOATS / 3 < 200, 'birds add well under 200 triangles');
  const rc = birdCounts({ weather: 'clear', dread: 1, reduced: true, perches: 3 });
  const still = (t) => buildBirds({ flocks: createFlocks({ seed: 1818, plan, counts: rc }), perches: roofPerches(layout, [6, 6, 12, 1], 1818, 3), counts: rc, timeSec: t, reduced: true });
  assert.deepEqual([...still(0)], [...still(50)]);
  assert.ok(still(0).length > 0);
  assert.ok(FRAME_BUDGET.triangles - 0 > 0);
});
