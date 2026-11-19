// Round 23: lantern halos and fireflies that lie beyond the draw distance (lost in the fog) are not sent to the GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/view3d-math.js';
import { tierSettings } from '../src/quality.js';

test('the camera cell is 8 m wide and its centre is inside it', () => {
  assert.deepEqual(M.cullCell(0, 0), { key: '0,0', x: 4, z: 4 });
  assert.equal(M.cullCell(-0.1, 7.9).key, '-1,0'); assert.equal(M.cullCell(16, 16).key, '2,2');
  for (const [x, z] of [[3, 3], [-9.5, 20.2], [143, 77]]) { const c = M.cullCell(x, z); assert.ok(Math.abs(c.x - x) <= 4 && Math.abs(c.z - z) <= 4); }
});

test('the cull radius is the tier draw distance plus the margin and the cell half diagonal, and is infinite without a draw distance', () => {
  for (const q of ['low', 'medium', 'high']) { const d = tierSettings(q).drawDistance; assert.ok(M.lightCullRadius(d) > d + M.CULL_MARGIN_M && M.lightCullRadius(d) < d + 20); }
  assert.equal(M.lightCullRadius(0), Infinity); assert.equal(M.lightCullRadius(NaN), Infinity);
});

test('every light the camera can see inside the draw distance is kept, from any spot in its cell, and far lights are dropped', () => {
  const lights = []; for (let x = 0; x <= 288; x += 12) for (let z = 0; z <= 288; z += 12) lights.push({ pos: [x, 2, z] });
  const far = tierSettings('high').drawDistance, r = M.lightCullRadius(far);
  for (const [cx, cz] of [[72, 72], [3, 140], [200, 10]]) {
    const cell = M.cullCell(cx, cz), kept = new Set(M.lightsWithin(lights, cell.x, cell.z, r));
    lights.forEach((l, i) => { if (Math.hypot(l.pos[0] - cx, l.pos[2] - cz) <= far) assert.ok(kept.has(i), `a light at ${l.pos} inside ${far} m was culled`); });
    assert.ok(kept.size < lights.length, 'something is culled');
  }
  assert.equal(M.lightsWithin(lights, 0, 0, Infinity).length, lights.length);
});

test('pointsWithin keeps whole points in order and drops the far ones', () => {
  const flat = new Float32Array([1, 1, 1, 0.5, 100, 1, 100, 0.5, 5, 2, 5, 0.25]);
  const out = M.pointsWithin(flat, 4, 0, 0, 20);
  assert.deepEqual([...out], [1, 1, 1, 0.5, 5, 2, 5, 0.25]);
  assert.equal(M.pointsWithin(new Float32Array(0), 4, 0, 0, 20).length, 0);
  assert.equal(M.pointsWithin(flat, 4, 0, 0, Infinity).length, flat.length);
});
