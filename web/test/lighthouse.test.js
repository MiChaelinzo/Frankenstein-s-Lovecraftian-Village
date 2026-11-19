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
