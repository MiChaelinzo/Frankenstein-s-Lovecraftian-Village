import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeViewSettings, parseViewSettings, fovRadians, FOV_Y, EYE_HEIGHT, TILE_M, viewProjection, projectPoint, resolveCollisions } from '../src/view3d-math.js';
import * as scale from '../src/world-scale.js';
import { proceduralTexture } from '../src/proc-textures.js';
import { flyStop, FLY_BASE_HEIGHT, FLY_HEIGHT_SWAY } from '../src/cinematic.js';

test('view settings: defaults, clamping and junk input', () => {
  const d = sanitizeViewSettings(null);
  assert.deepEqual(d, { eye: EYE_HEIGHT, fovDeg: scale.FOV_DEFAULT_DEG });
  assert.ok(Math.abs(fovRadians(d.fovDeg) - FOV_Y) < 1e-12);
  assert.deepEqual(sanitizeViewSettings({ eye: 9, fovDeg: 200 }), { eye: scale.EYE_MAX, fovDeg: scale.FOV_MAX_DEG });
  assert.deepEqual(sanitizeViewSettings({ eye: 0.2, fovDeg: -4 }), { eye: scale.EYE_MIN, fovDeg: scale.FOV_MIN_DEG });
  assert.deepEqual(sanitizeViewSettings({ eye: 'x', fovDeg: NaN }), d);
  assert.deepEqual(sanitizeViewSettings({ eye: null, fovDeg: '' }), d);
  assert.deepEqual(sanitizeViewSettings({ eye: '1.7', fovDeg: '70' }), { eye: 1.7, fovDeg: 70 });
  assert.deepEqual(parseViewSettings('not json'), d);
  assert.deepEqual(parseViewSettings(JSON.stringify({ eye: 1.55, fovDeg: 60 })), { eye: 1.55, fovDeg: 60 });
});

test('a wider field of view shrinks things on screen', () => {
  const cam = { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 }, p = [1, 1.6, -4];
  const narrow = projectPoint(viewProjection(cam, 1.6, fovRadians(55)), p), wide = projectPoint(viewProjection(cam, 1.6, fovRadians(75)), p);
  assert.ok(Math.abs(narrow.x ?? narrow[0]) > Math.abs(wide.x ?? wide[0]));
});

test('texture tiles are real sizes: one feature of each procedural texture lands in the real-world range', () => {
  assert.ok(TILE_M.cobble / 7 >= 0.12 && TILE_M.cobble / 7 <= 0.25, 'cobble stones 0.12 to 0.25 m');
  assert.ok((TILE_M.stone * 0.4) >= 0.3 && (TILE_M.stone * 0.4) <= 0.6, 'stone blocks 0.3 to 0.6 m wide');
  assert.ok(TILE_M.roof / 4 >= 0.25 && TILE_M.roof / 4 <= 0.4, 'slate rows 0.25 to 0.4 m');
  assert.ok(TILE_M.timber * (5 / 64) >= 0.15 && TILE_M.timber * (5 / 64) <= 0.25, 'timber beams 0.15 to 0.25 m');
  assert.equal(TILE_M.timber, scale.STOREY_HEIGHT, 'a timber bay is one storey');
  assert.equal(proceduralTexture('timber').data.length, 64 * 64 * 4);
});

test('fly-through stops sit at street level and the street fly is pushed out of walls', () => {
  assert.ok(FLY_BASE_HEIGHT - FLY_HEIGHT_SWAY >= scale.EYE_MIN && FLY_BASE_HEIGHT + FLY_HEIGHT_SWAY <= 2.2 + 1e-9);
  for (let i = -3; i < 12; i++) { const y = flyStop(i, { gridW: 24, gridD: 24, seed: 7 }).pos[1]; assert.ok(y >= 1.6 - 1e-9 && y <= 2.2 + 1e-9, `stop ${i} y ${y}`); }
  const p = resolveCollisions(5, 5, 0.7, [{ minX: 0, maxX: 10, minZ: 0, maxZ: 10 }]);
  assert.ok(p.x <= -0.7 + 1e-9 || p.x >= 10.7 - 1e-9 || p.z <= -0.7 + 1e-9 || p.z >= 10.7 - 1e-9);
});
