import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  BEAT, CAUSE_IDS, MAX_STEP, MAX_INTENSITY, OMEN_AT, QUIET_AFTER_OMEN, FOG_GAIN_MAX, LIGHT_DIM_MAX, AMBIENCE_GAIN_MAX, RAMP_PER_SECOND,
  freshRun, dimStep, dimEnvelope, DIM_RISE_MS, DIM_HOLD_MS, DIM_FALL_MS, nextSafeZoneTicks, nextSafeZoneAbuse, pickAmbientBeat, beatCause, BEAT_IDS, NO_BEAT_YET, CAMPING_TICKS, SAFE_ZONE_ABUSE_CAP, ABUSE_DECAY_PER_STEP, ABUSE_WEIGHT_PERCENT, MAX_CUE_VOLUME, MAX_BRIGHTNESS_STEP, MIN_BEAT_GAP_TICKS, GENTLE_SCALE, causeHolds, nearLitLamp, SAFE_ZONE_CAP, startState, step, target, dominantCause, dreadFromIntensity, presentation, ramp,
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

test('freshRun resets every piece of web director bookkeeping', () => {
  const f = freshRun();
  assert.deepEqual(f, { state: startState(), tick: null, level: 0, at: null, safeTicks: 0, abuse: 0, beatTick: NO_BEAT_YET });
  assert.notEqual(freshRun().state, f.state);
});

// Director 2.0 (spec 175): ambient beats. The golden runs rebuild the Core BeatRun scenario (abuse tracker, tier from knowledge, remembered villager every 7th step).
const beatRun = (run, scale, reduced) => {
  let s = startState(), abuse = 0, last = NO_BEAT_YET;
  const out = [], abuses = [];
  run.inputs.forEach((raw, i) => {
    abuse = nextSafeZoneAbuse(abuse, i % 10 < 6 ? CAMPING_TICKS : 0);
    abuses.push(abuse);
    const x = { ...asInput(raw), safeZoneAbuse: abuse, knowledgeTier: Math.min(5, Math.trunc(raw[2] / 200)), rememberedVillager: i % 7 === 0 ? (i % 5) + 1 : 0 };
    s = step(run.seed, s, x);
    const b = pickAmbientBeat(run.seed, s, x, last, { scale, reduced });
    if (b.emitted) { last = x.tick; out.push([i, b.id, b.cause, b.volume, b.brightness, b.prop ? 1 : 0, b.villager]); }
  });
  return { out, abuses };
};
const goldenBeats = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.json'), 'utf8')).directorBeats;

test('ambient beats and the safe-zone abuse tracker match the C# golden (additive key)', () => {
  assert.equal(goldenBeats.runs.length, golden.runs.length);
  goldenBeats.runs.forEach((r, k) => {
    const run = golden.runs[k];
    assert.equal(r.seed, run.seed);
    for (const v of r.variants) {
      const got = beatRun(run, v.scale, !!v.reduced);
      assert.deepEqual(got.out, v.beats, `seed ${r.seed} scale ${v.scale} reduced ${v.reduced}`);
      assert.deepEqual(got.abuses, r.abuse);
    }
  });
  assert.ok(goldenBeats.runs.some((r) => r.variants[0].beats.length > 5));
  assert.ok(goldenBeats.runs.every((r) => r.variants[2].beats.length === 0), 'gentle skips every beat');
});

test('every golden beat names a cause that holds, is bounded, and respects the rate limit', () => {
  for (const r of goldenBeats.runs) for (const v of r.variants) {
    let prevTick = null;
    for (const [i, id, cause, volume, brightness, prop, villager] of v.beats) {
      assert.ok(BEAT_IDS.includes(id));
      assert.equal(cause, beatCause(id));
      assert.ok(volume >= 0 && volume <= MAX_CUE_VOLUME);
      assert.ok(brightness <= 0 && brightness >= -MAX_BRIGHTNESS_STEP);
      if (v.reduced) assert.ok(!prop && brightness === 0);
      assert.equal(villager >= 0, id === 'npc_sighting');
      const tick = golden.runs[goldenBeats.runs.indexOf(r)].inputs[i][0];
      if (prevTick !== null) assert.ok(tick - prevTick >= MIN_BEAT_GAP_TICKS);
      prevTick = tick;
    }
  }
});

test('abuse tracker grows while camping, decays after and stays bounded; it adds a cause and pressure', () => {
  let a = 0;
  for (let i = 0; i < 200; i++) { a = nextSafeZoneAbuse(a, CAMPING_TICKS); assert.ok(a >= 0 && a <= SAFE_ZONE_ABUSE_CAP); }
  assert.equal(a, SAFE_ZONE_ABUSE_CAP);
  assert.equal(nextSafeZoneAbuse(a, CAMPING_TICKS - 1), SAFE_ZONE_ABUSE_CAP - ABUSE_DECAY_PER_STEP);
  assert.equal(nextSafeZoneAbuse(-50, 0), 0);
  const calm = { tick: 300, sanity: 1000 }, camped = { ...calm, safeZoneAbuse: 1000 };
  assert.equal(target(calm), 0);
  assert.equal(target(camped), ABUSE_WEIGHT_PERCENT * 10);
  assert.equal(dominantCause(camped), 'safe_zone_abuse');
  assert.ok(causeHolds('safe_zone_abuse', camped) && !causeHolds('safe_zone_abuse', calm) && !causeHolds('omen_passed', camped));
});

test('ambient beats need a held cause, tier and villager; gentle skips; quiet after an omen has none', () => {
  const night = { tick: 1200 + 200, sanity: 1000 }, pressure = { intensity: 400, beat: BEAT.PRESSURE, quietLeft: 0, cause: 'nightfall' };
  const emitted = (state, x, opts) => { const ids = new Set(); for (let seed = 0; seed < 300; seed++) { const b = pickAmbientBeat(seed, state, x, NO_BEAT_YET, opts); if (b.emitted) ids.add(b.id); } return ids; };
  const std = { scale: 1000, reduced: false };
  assert.ok(emitted(pressure, { tick: 1190, sanity: 0, knowledgeTier: 0 }, std).size > 0);
  assert.equal(emitted(pressure, { tick: 300, sanity: 1000 }, std).size, 0);
  assert.equal(emitted({ ...pressure, beat: BEAT.OMEN, quietLeft: 10 }, night, std).size, 0);
  assert.equal(emitted(pressure, { tick: 1190, sanity: 0, knowledgeTier: 5, rememberedVillager: 3 }, { scale: GENTLE_SCALE, reduced: false }).size, 0);
  assert.ok(!emitted(pressure, { tick: 300, sanity: 0, knowledgeTier: 0 }, std).has('npc_sighting'));
  assert.ok(emitted(pressure, { tick: 300, sanity: 0, knowledgeTier: 1, rememberedVillager: 3 }, std).has('npc_sighting'));
});

test('reduced motion removes props and dimming; dread scale stays within the volume and dimming caps', () => {
  const pressure = { intensity: 400, beat: BEAT.PRESSURE, quietLeft: 0, cause: '' };
  const x = { tick: 1190, sanity: 0, stress: 1000, cultExposure: 1000, knowledge: 1000, knowledgeTier: 5, safeZoneAbuse: 1000, rememberedVillager: 2 };
  let seen = 0;
  for (let seed = 0; seed < 400; seed++) {
    const loud = pickAmbientBeat(seed, pressure, x, NO_BEAT_YET, { scale: 99999 }), calm = pickAmbientBeat(seed, pressure, x, NO_BEAT_YET, { scale: 1500, reduced: true });
    if (loud.emitted) { seen++; assert.ok(loud.volume <= MAX_CUE_VOLUME && loud.brightness >= -MAX_BRIGHTNESS_STEP && loud.brightness <= 0); }
    if (calm.emitted) assert.ok(!calm.prop && calm.brightness === 0);
  }
  assert.ok(seen > 20);
});

// Round 37 (spec 175): the dimming step applied through the scene hook. Core HorrorDirector.DimStep is the source of truth.
test('dimStep matches the C# golden rows, is skipped at Gentle and under reduced motion, and never jumps', () => {
  assert.ok(goldenBeats.dim.length >= 16);
  for (const [scale, reduced, brightness, steps] of goldenBeats.dim) {
    const got = steps.map((_, k) => dimStep(brightness, -500 + k * 500, { scale, reduced: !!reduced }));
    assert.deepEqual(got, steps, `scale ${scale} reduced ${reduced} brightness ${brightness}`);
    if (reduced || scale <= 500 || brightness === 0) assert.ok(steps.every((v) => v === 0));
  }
  for (const brightness of [0, -20, -30, -90]) for (let ms = -500; ms <= 13000; ms += 100) {
    assert.equal(dimStep(brightness, ms, { scale: 500 }), 0);
    assert.equal(dimStep(brightness, ms, { scale: 1500, reduced: true }), 0);
  }
  let previous = 0;
  for (let ms = 0; ms <= DIM_RISE_MS + DIM_HOLD_MS + DIM_FALL_MS + 500; ms += 50) {
    const now = dimStep(-30, ms, { scale: 1000 });
    assert.ok(now >= 0 && now <= MAX_BRIGHTNESS_STEP && Math.abs(now - previous) <= 2);
    previous = now;
  }
  assert.equal(dimEnvelope(NaN), 0);
  assert.equal(dimStep(-30, 3000), 30);
});

test('round 37 wiring: the dimming step reaches the 3D light and a 2D canvas wash only through dimStep, with no inline style', () => {
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app.js'), 'utf8');
  assert.match(app, /dimNow = dimStep\(dimBeat\.brightness, now - dimBeat\.at, \{ scale: INTENSITY_PER_MILLE\[horrorIntensity\], reduced: reduceMotion \}\)/);
  assert.match(app, /lightGain: look\.lightGain \* \(1 - dimNow \/ 1000\)/);
  assert.match(app, /if \(dimNow > 0\) paintDimming\(dimNow\)/);
  assert.match(app, /if \(beat\.brightness < 0\) dimBeat = /);
  const paint = app.slice(app.indexOf('function paintDimming'), app.indexOf('let running = false;'));
  assert.doesNotMatch(paint, /\.style\b/);
  assert.doesNotMatch(app, /dimBeat[^;\n]*(snapshot|serialize)/); // presentation only, never saved
});
