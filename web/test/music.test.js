import { test } from 'node:test';
import assert from 'node:assert/strict';
import { droneFrequencies, pulseSchedule, masterGain, clampVolume, modulation, cutoffFor, rootFor, createAmbient, ROOTS_HZ, footstepParams, wavesLayer, bellSchedule, whisperSchedule, whisperTier, cueNotes, windGain, SURFACES, BELL_PARTIALS } from '../src/music.js';

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
  const made = { closed: 0, lfoTargets: [], gains: [], nodes: [] };
  class P { constructor() { this.value = 0; this.sets = []; } setTargetAtTime(v) { this.sets.push(v); this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  class N { constructor(k) { this.k = k; this.gain = new P(); this.frequency = new P(); this.Q = new P(); this.playbackRate = new P(); this.to = null; this.started = 0; }
    connect(t) { this.to = t; return t; } start() { this.started++; } stop() {} }
  class AC {
    constructor() { this.currentTime = 0; this.sampleRate = 100; this.destination = new N('dest'); made.ctx = this; }
    createGain() { const n = new N('gain'); made.gains.push(n); return n; }
    createOscillator() { const n = new N('osc'); made.nodes.push(n); return n; } createBiquadFilter() { return new N('biquad'); }
    createBuffer() { return { getChannelData: () => new Float32Array(200) }; } createBufferSource() { const n = new N('src'); made.nodes.push(n); return n; }
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

test('footstep parameters differ by surface, alternate feet, and dread muffles them', () => {
  const [g, w, wet] = SURFACES.map((x) => footstepParams(x, 0));
  assert.ok(g.freq > w.freq && w.freq > 0 && w.thump > 0 && g.thump === 0 && wet.filter === 'lowpass');
  assert.ok(footstepParams('gravel', 1).freq < g.freq && footstepParams('gravel', 0, 1).freq < g.freq);
  assert.deepEqual(footstepParams('nope', 0), g, 'unknown surface falls back to gravel');
  assert.deepEqual(footstepParams('wood', 0.4, 1), footstepParams('wood', 0.4, 1));
});
test('waves get louder near the coast and hold still under reduced motion; wind follows dread', () => {
  assert.ok(wavesLayer(1, 0, false).gain > 3 * wavesLayer(0, 0, false).gain);
  assert.ok(wavesLayer(0, 0, true).depth < wavesLayer(0, 0, false).depth && wavesLayer(0, 0, true).lfoHz < wavesLayer(0, 0, false).lfoHz);
  assert.deepEqual(wavesLayer(NaN, NaN, false), wavesLayer(0, 0, false)); assert.ok(windGain(1) > windGain(0));
});
test('bells are rare, inharmonic, seeded and softer at low dread; none under reduced motion', () => {
  const b = bellSchedule(7, 0.5, 4, false), calm = bellSchedule(7, 0, 1, false)[0], dire = bellSchedule(7, 1, 1, false)[0];
  assert.deepEqual(b, bellSchedule(7, 0.5, 4, false)); assert.deepEqual(bellSchedule(7, 1, 3, true), []);
  for (let i = 1; i < b.length; i++) assert.ok(b[i].atMs - b[i - 1].atMs >= 25000);
  assert.ok(calm.gain < dire.gain); assert.ok(BELL_PARTIALS.slice(1).every(([r]) => Math.abs(r - Math.round(r)) > 0.05), 'partials are not harmonic');
});
test('whispers: tier 0 silent, denser and louder with dread, seeded, none under reduced motion', () => {
  assert.equal(whisperTier(0.1), 0); assert.equal(whisperTier(0.3), 1); assert.equal(whisperTier(0.6), 2); assert.equal(whisperTier(1), 3);
  assert.deepEqual(whisperSchedule(7, 0.1, 5, false), []); assert.deepEqual(whisperSchedule(7, 1, 5, true), []);
  const t1 = whisperSchedule(7, 0.3, 4, false), t3 = whisperSchedule(7, 0.9, 4, false);
  assert.deepEqual(t3, whisperSchedule(7, 0.9, 4, false)); assert.ok(t3[3].atMs < t1[3].atMs && t3[0].gain > t1[0].gain);
});
test('ui cues: lantern is a short rising pair, ending warm is a chord, cold a tritone; unknown is empty', () => {
  const l = cueNotes('lantern', 3); assert.equal(l.length, 2); assert.ok(l[1].freq > l[0].freq && l[1].atMs > 0);
  const warm = cueNotes('ending-warm', 3), cold = cueNotes('ending-cold', 3);
  assert.equal(warm.length, 4); assert.ok(Math.abs(warm[1].freq / warm[0].freq - Math.pow(2, 4 / 12)) < 1e-9);
  assert.ok(Math.abs(cold[1].freq / cold[0].freq - Math.SQRT2) < 1e-9); assert.deepEqual(cueNotes('x'), []);
});
test('footstep and cue are silent until started, and when muted or stopped', () => {
  const { AC, made } = fakeAC(), a = createAmbient(AC, { seed: 5 });
  a.footstep('wood'); a.cue('lantern'); assert.equal(made.nodes.length, 0, 'nothing before start');
  a.start(); const base = made.nodes.length;
  a.footstep('wood'); assert.ok(made.nodes.length > base);
  const n1 = made.nodes.length; a.mute(); a.footstep('gravel'); a.cue('ending-warm'); assert.equal(made.nodes.length, n1, 'muted is silent');
  a.unmute(); a.cue('lantern'); assert.ok(made.nodes.length > n1);
  a.stop(); const n2 = made.nodes.length; a.footstep('wet'); assert.equal(made.nodes.length, n2);
});
