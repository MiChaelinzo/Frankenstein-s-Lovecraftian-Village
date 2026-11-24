import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BEAT, CAUSE_IDS, MAX_STEP, MAX_INTENSITY, OMEN_AT, QUIET_AFTER_OMEN, FOG_GAIN_MAX, LIGHT_DIM_MAX, AMBIENCE_GAIN_MAX, RAMP_PER_SECOND,
  nextSafeZoneTicks, nearLitLamp, SAFE_ZONE_CAP, startState, step, target, dominantCause, dreadFromIntensity, presentation, ramp,
} from '../src/director.js';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.json'), 'utf8')).director;
const asInput = ([tick, sanity, knowledge, stress, safeZoneTicks, clueProgress, cultExposure, encounters]) => ({ tick, sanity, knowledge, stress, safeZoneTicks, clueProgress, cultExposure, encounters });

test('director runs match the C# golden for every seed (intensity, beat, quiet counter, cause)', () => {
  assert.ok(golden.runs.length >= 3);
  for (const run of golden.runs) {
    let s = startState();
    run.inputs.forEach((raw, i) => {
      s = step(run.seed, s, asInput(raw));
      assert.deepEqual([s.intensity, s.beat, s.quietLeft, s.cause], run.steps[i], `seed ${run.seed} step ${i}`);
    });
  }
});

test('golden runs are bounded, never jump past the cap, and hold quiet after each omen', () => {
  let omens = 0;
  for (const run of golden.runs) {
    run.steps.forEach(([intensity, beat, , cause], i) => {
      assert.ok(intensity >= 0 && intensity <= MAX_INTENSITY);
      assert.ok(Math.abs(intensity - (i ? run.steps[i - 1][0] : 0)) <= MAX_STEP);
      assert.equal(beat === BEAT.QUIET, cause === '');
      if (beat !== BEAT.QUIET) assert.ok(CAUSE_IDS.includes(cause));
      if (beat === BEAT.OMEN) {
        omens++;
        assert.ok(intensity >= OMEN_AT);
        for (let k = 1; k <= QUIET_AFTER_OMEN && i + k < run.steps.length; k++) assert.equal(run.steps[i + k][1], k === 1 ? BEAT.RELIEF : BEAT.QUIET);
      }
    });
  }
  assert.ok(omens > 0, 'the golden scenarios must include an omen');
});

test('worst input rises by exactly the cap; calm input has target 0; junk input is sanitised', () => {
  const s = step(1, startState(), { tick: 1190, sanity: 0, knowledge: 1000, stress: 1000, cultExposure: 1000, encounters: 9 });
  assert.equal(s.intensity, MAX_STEP);
  assert.equal(target({ tick: 300, sanity: 1000, safeZoneTicks: 500, clueProgress: 1000 }), 0);
  assert.equal(target({ tick: NaN, sanity: 5000, stress: -9, encounters: -2 }), 0);
  assert.equal(dominantCause({ tick: 300, sanity: 1000, encounters: 3 }), 'creature_sighting');
  assert.equal(dominantCause({ tick: 300, sanity: 1000 }), 'waning_sanity');
  assert.equal(dreadFromIntensity(500), 0.5);
});

test('presentation stays gentle, reduced motion keeps fog and light still, Low tier skips fog', () => {
  const full = presentation(1), reduced = presentation(1, { reduced: true }), low = presentation(1, { tier: 'low' });
  assert.ok(full.fogGain <= 1 + FOG_GAIN_MAX && full.lightGain >= 1 - LIGHT_DIM_MAX && full.ambienceGain <= 1 + AMBIENCE_GAIN_MAX);
  assert.deepEqual([reduced.fogGain, reduced.lightGain], [1, 1]);
  assert.ok(reduced.ambienceGain > 1 && reduced.ambienceGain < full.ambienceGain);
  assert.equal(low.fogGain, 1);
  assert.deepEqual(presentation(NaN), presentation(0));
});

test('ramp moves at most the capped rate per second, in both directions, whatever dt is', () => {
  assert.equal(ramp(0, 1, 1), RAMP_PER_SECOND);
  assert.equal(ramp(1, 0, 1), 1 - RAMP_PER_SECOND);
  assert.equal(ramp(0, 1, 500), RAMP_PER_SECOND);
  assert.equal(ramp(0.5, 0.51, 1), 0.51);
  assert.equal(ramp(0.2, 0.9, NaN), 0.2);
});

test('safe-zone ticks rise near a lit lantern, fall away from it and stay within 0..cap', () => {
  assert.equal(nextSafeZoneTicks(0, false), 0);
  assert.equal(nextSafeZoneTicks(5, true), 6);
  assert.equal(nextSafeZoneTicks(5, false), 4);
  assert.equal(nextSafeZoneTicks(SAFE_ZONE_CAP, true), SAFE_ZONE_CAP);
  assert.equal(nextSafeZoneTicks(NaN, true), 1);
});

test('nearLitLamp only counts lit lanterns inside the radius', () => {
  const lamps = [{ lit: false, pos: [0, 2, 0] }, { lit: true, pos: [10, 2, 0] }];
  assert.equal(nearLitLamp(lamps, 0, 0), false);
  assert.equal(nearLitLamp(lamps, 5, 0), true);
  assert.equal(nearLitLamp(lamps, 3, 0), false);
});
