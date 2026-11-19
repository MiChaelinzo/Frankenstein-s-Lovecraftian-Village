// Round 24: the lighthouse beam mirrors Core/LighthouseBeam.cs. Golden key "lighthouseBeam".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PERIOD_SECONDS, HALF_ANGLE, LAMP_HEIGHT, BEAM_LENGTH, beamPhase, beamYaw, lighthouseSite, beamDirection } from '../src/lighthouse.js';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.json'), 'utf8')).lighthouseBeam;
const CITY_GRID = 36;

test('constants match Core', () => {
  assert.equal(PERIOD_SECONDS, golden.period); assert.equal(HALF_ANGLE, golden.halfAngle); assert.equal(LAMP_HEIGHT, golden.lampHeight); assert.equal(BEAM_LENGTH, golden.length);
});

test('phase, yaw and site match C# for every golden seed and time', () => {
  for (const c of golden.seeds) {
    assert.ok(Math.abs(beamPhase(c.seed) - c.phase) < 1e-12, `phase ${c.seed}`);
    golden.times.forEach((t, i) => assert.ok(Math.abs(beamYaw(c.seed, t) - c.yaw[i]) < 1e-9, `yaw seed ${c.seed} t ${t}: ${beamYaw(c.seed, t)} vs ${c.yaw[i]}`));
    const s = lighthouseSite(c.seed, CITY_GRID, CITY_GRID);
    assert.ok(Math.abs(s.x - c.site[0]) < 1e-9 && Math.abs(s.z - c.site[1]) < 1e-9, `site ${c.seed}`);
  }
});

test('one full turn per period, deterministic, direction is a unit vector', () => {
  for (const seed of [1, 42, 1818, -7]) {
    assert.ok(Math.abs(beamYaw(seed, 5) - beamYaw(seed, 5 + PERIOD_SECONDS)) < 1e-9);
    assert.equal(beamYaw(seed, 3.7), beamYaw(seed, 3.7));
    const d = beamDirection(beamYaw(seed, 2)); assert.ok(Math.abs(Math.hypot(d[0], d[1]) - 1) < 1e-12);
  }
});

import { buildBeam, BEAM_FLOATS } from '../src/view3d.js';
import { beamStrengthFor, BEAM_COLOR } from '../src/lighthouse.js';

test('buildBeam: 24 triangles from the lamp along the Core yaw, deterministic, fading to nothing at the far end', () => {
  const pos = [145.8, 8.7, 6], yaw = beamYaw(1818, 3.7), a = buildBeam({ pos, yaw });
  assert.equal(a.length, 4 * 18 * BEAM_FLOATS); // 4 sheets, 6 triangles each, 3 vertices each
  assert.deepEqual(buildBeam({ pos, yaw }), a);
  const [dx, dz] = beamDirection(yaw);
  let far = 0;
  for (let i = 0; i < a.length; i += BEAM_FLOATS) {
    const along = (a[i] - pos[0]) * dx + (a[i + 2] - pos[2]) * dz;
    assert.ok(along > -1e-3 && along <= BEAM_LENGTH + 1e-3, 'every vertex lies on the beam side of the lamp');
    assert.ok(a[i + 3] >= 0 && a[i + 3] <= 1);
    far = Math.max(far, along);
  }
  assert.ok(Math.abs(far - BEAM_LENGTH) < 1e-3);
  const turned = buildBeam({ pos, yaw: beamYaw(1818, 7.7) });
  assert.notDeepEqual(turned, a, 'the beam turns with time');
});

test('beam strength: dark by day, off on Low and with reduced motion, stronger in fog', () => {
  assert.equal(beamStrengthFor({ sunWeight: 1, fog: 0.02, quality: 2 }), 0);
  assert.equal(beamStrengthFor({ sunWeight: 0, fog: 0.02, quality: 0 }), 0);
  assert.equal(beamStrengthFor({ sunWeight: 0, fog: 0.02, quality: 2, reduced: true }), 0);
  assert.ok(beamStrengthFor({ sunWeight: 0, fog: 0.03, quality: 1 }) > beamStrengthFor({ sunWeight: 0, fog: 0.002, quality: 1 }));
  assert.ok(beamStrengthFor({ sunWeight: 0, fog: 1, quality: 2 }) <= 0.4 && BEAM_COLOR.every((v) => v > 0 && v <= 1));
});
