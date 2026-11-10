import { test } from 'node:test';
import assert from 'node:assert/strict';
import { droneFrequencies, pulseSchedule, masterGain, clampVolume, modulation, cutoffFor, rootFor, createAmbient, ROOTS_HZ } from '../src/music.js';

test('drone and pulses are deterministic per seed', () => {
  assert.deepEqual(droneFrequencies(1818, 0.5), droneFrequencies(1818, 0.5));
  assert.deepEqual(pulseSchedule(7, 0.5, 6, false), pulseSchedule(7, 0.5, 6, false));
  assert.ok(ROOTS_HZ.includes(rootFor(99)));
  const seeds = new Set(Array.from({ length: 40 }, (_, s) => rootFor(s)));
  assert.ok(seeds.size > 1);
});

test('dread sours the fifth into a tritone and opens the filter', () => {
  const calm = droneFrequencies(5, 0), dire = droneFrequencies(5, 1);
  assert.ok(Math.abs(dire[2] / dire[0] - Math.SQRT2) < 1e-9 && Math.abs(calm[2] / calm[0] - 1.4983) < 1e-3);
  assert.ok(cutoffFor(1) > cutoffFor(0));
});

test('volume is clamped and mute silences', () => {
  assert.equal(clampVolume(5), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(NaN), 0);
  assert.equal(masterGain(0, false, 1), 0);
  assert.equal(masterGain(1, true, 1), 0);
  assert.ok(masterGain(1, false, 1) > masterGain(0.5, false, 1));
  assert.ok(masterGain(9, false, 2) <= 0.3);
});

test('reduced motion removes pulses and lowers modulation', () => {
  assert.deepEqual(pulseSchedule(7, 1, 5, true), []);
  assert.ok(pulseSchedule(7, 1, 5, false).length === 5);
  assert.ok(modulation(true).depth < modulation(false).depth);
  assert.ok(modulation(true).lfoHz < modulation(false).lfoHz);
});

test('pulses come faster with dread and times increase', () => {
  const calm = pulseSchedule(3, 0, 4, false), dire = pulseSchedule(3, 1, 4, false);
  assert.ok(dire[3].atMs < calm[3].atMs);
  for (let i = 1; i < calm.length; i++) assert.ok(calm[i].atMs > calm[i - 1].atMs);
});

test('createAmbient creates no audio until start and handles a missing AudioContext', () => {
  let made = 0;
  class Fake { constructor() { made++; } }
  const a = createAmbient(Fake, { seed: 1 });
  assert.equal(made, 0);
  assert.equal(a.running, false);
  assert.equal(createAmbient(null).start(), false);
  a.setVolume(2); assert.equal(a.volume, 1);
  a.mute(); assert.equal(a.muted, true);
  a.stop();
  assert.equal(made, 0);
});

function fakeAC() {
  const made = { closed: 0, lfoTargets: [], gains: [] };
  class P { constructor() { this.value = 0; this.sets = []; } setTargetAtTime(v) { this.sets.push(v); this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  class N { constructor(k) { this.k = k; this.gain = new P(); this.frequency = new P(); this.Q = new P(); this.to = null; }
    connect(t) { this.to = t; return t; } start() {} stop() {} }
  class AC {
    constructor() { this.currentTime = 0; this.sampleRate = 100; this.destination = new N('dest'); made.ctx = this; }
    createGain() { const n = new N('gain'); made.gains.push(n); return n; }
    createOscillator() { return new N('osc'); } createBiquadFilter() { return new N('biquad'); }
    createBuffer() { return { getChannelData: () => new Float32Array(200) }; } createBufferSource() { return new N('src'); }
    resume() {} suspend() {} close() { made.closed++; }
  }
  return { AC, made };
}

test('muted or zero volume gates the LFO so the gain is truly silent', () => {
  const { AC, made } = fakeAC();
  const a = createAmbient(AC, { seed: 5, volume: 0.6 });
  a.start();
  const lg = made.gains.find((g) => g.to && g.to === made.gains[0].gain);
  assert.ok(lg.gain.value > 0);
  a.mute();
  assert.equal(lg.gain.value, 0);
  a.unmute(); assert.ok(lg.gain.value > 0);
  a.setVolume(0); assert.equal(lg.gain.value, 0);
  a.stop();
});

test('dispose closes the AudioContext', () => {
  const { AC, made } = fakeAC();
  const a = createAmbient(AC, { seed: 5 });
  a.start(); a.dispose();
  assert.equal(made.closed, 1);
  assert.equal(a.running, false);
});
