import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, keyLook, lookAt, lampGain, audioMix, sunElevationDeg, DAY_LAMP_GAIN } from '../src/daylight.js';
import { hazedSky, moonParams } from '../src/view3d-math.js';
import { MINUTES_PER_DAY, phaseAt } from '../src/clock.js';
import { clockTime, clockChipModel, sessionTickExact } from '../src/villager-view.js';

const night = () => ({ sky: hazedSky('night', 'clear', 0.2, 1), moon: moonParams(1818, 1, 'night', 'clear') });
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('full night leaves the existing night look untouched', () => {
  const n = night();
  for (const tick of [1080, 1200, 1439, 0]) { const r = lookAt(tick, n.sky, n.moon, 0.2); assert.equal(r.sky, n.sky); assert.equal(r.moon, n.moon); assert.equal(r.lampGain, 1); }
});

test('keyframes start and end on the same night look so the day is periodic and smooth', () => {
  assert.deepEqual(KEYS[0].zenith, KEYS[KEYS.length - 1].zenith);
  assert.equal(KEYS[KEYS.length - 1].m, MINUTES_PER_DAY);
  const a = keyLook(MINUTES_PER_DAY - 0.001), b = keyLook(MINUTES_PER_DAY + 0.001);
  assert.ok(Math.abs(a.w - b.w) < 1e-3 && Math.abs(lum(a.horizon) - lum(b.horizon)) < 1e-3);
  let prev = keyLook(0);
  for (let t = 1; t <= MINUTES_PER_DAY; t++) {
    const k = keyLook(t);
    assert.ok(Math.abs(k.w - prev.w) < 0.06 && Math.abs(lum(k.horizon) - lum(prev.horizon)) < 0.06, `jump at ${t}`);
    prev = k;
  }
});

test('sky, light, fog and lanterns differ measurably between dawn, day, dusk and night', () => {
  const n = night(), at = (t) => lookAt(t, n.sky, n.moon, 0);
  const dawn = at(150), day = at(540), dusk = at(960), deep = at(1200);
  assert.ok(lum(day.sky.horizon) > lum(deep.sky.horizon) + 0.15);
  assert.ok(day.sky.stars < 0.05 && deep.sky.stars === n.sky.stars);
  assert.ok(day.fogScale < dusk.fogScale && day.fogScale < dawn.fogScale);
  assert.ok(dusk.sky.horizon[0] > dusk.sky.horizon[2] + 0.3, 'dusk horizon burns warm');
  assert.ok(dusk.sky.zenith[2] > dusk.sky.zenith[0], 'dusk zenith is indigo');
  assert.ok(day.lampGain < 0.2 && deep.lampGain === 1 && day.lampGain >= DAY_LAMP_GAIN - 1e-9);
  assert.ok(day.moon.dir[1] > 0.5, 'high sun by day');
  assert.notDeepEqual(day.moon.dir, deep.moon.dir);
});

test('lantern gain and audio mix change gradually and never pop', () => {
  let prev = lampGain(0), prevMix = audioMix(0);
  for (let t = 1; t <= MINUTES_PER_DAY; t++) {
    const g = lampGain(t), m = audioMix(t);
    assert.ok(Math.abs(g - prev) < 0.03 && Math.abs(m.drone - prevMix.drone) < 0.01, `pop at ${t}`);
    prev = g; prevMix = m;
  }
  assert.equal(audioMix(1300).whispers, true); assert.equal(audioMix(540).whispers, false);
});

test('dread sickens the day palette and is deterministic', () => {
  const n = night();
  assert.deepEqual(lookAt(540, n.sky, n.moon, 0.9), lookAt(540, n.sky, n.moon, 0.9));
  assert.notDeepEqual(lookAt(540, n.sky, n.moon, 0).sky.horizon, lookAt(540, n.sky, n.moon, 1).sky.horizon);
  assert.ok(sunElevationDeg(540) > sunElevationDeg(150) && sunElevationDeg(1200) < 0);
  assert.ok(Number.isFinite(lookAt(540, n.sky, n.moon, NaN).sky.horizon[0]));
});

test('clock chip model and time of day', () => {
  assert.equal(clockTime(0), '04:00'); assert.equal(clockTime(240), '08:00'); assert.equal(clockTime(840), '18:00'); assert.equal(clockTime(1080), '22:00'); assert.equal(clockTime(1439), '03:59');
  const m = clockChipModel(960);
  assert.deepEqual([m.day, m.time, m.phase, m.lanterns, phaseAt(960)], [1, '20:00', 'dusk', true, 2]);
  assert.equal(clockChipModel(540).lanterns, false);
  assert.ok(sessionTickExact(1500, null) > sessionTickExact(1000, null) && sessionTickExact(1500, 5) === 5);
});
