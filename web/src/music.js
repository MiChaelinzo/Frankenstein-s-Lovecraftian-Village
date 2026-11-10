// Procedural ambient soundtrack. Original synthesis only (oscillators and filtered noise), no samples, no audio files.
// The pure helpers below are deterministic and unit tested; createAmbient is a thin WebAudio controller that must be
// started from a user gesture (browsers keep an AudioContext silent otherwise, and the demo never starts one on load).
import { SeededRandom } from './core.js';

export const ROOTS_HZ = [49, 55, 61.74, 65.41];
// Phrygian semitone offsets: dark and unresolved.
export const SCALE = [0, 1, 3, 5, 7, 8, 10];
export const MAX_GAIN = 0.3;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);

export const clampVolume = (v) => clamp(num(v, 0), 0, 1);
export const clampDread = (d) => clamp(num(d, 0), 0, 1);
export const semitone = (hz, n) => hz * Math.pow(2, n / 12);

export function rootFor(seed) {
  return ROOTS_HZ[new SeededRandom((seed | 0) ^ 0x5eed5eed).next(ROOTS_HZ.length)];
}

/** Three drone voices: root, a slightly detuned root (slow beating), and a fifth that sours to a tritone with dread. */
export function droneFrequencies(seed, dread) {
  const root = rootFor(seed), d = clampDread(dread);
  const third = d > 0.67 ? semitone(root, 6) : semitone(root, 7);
  return [root, root * (1 + 0.006 + 0.012 * d), third];
}

/** Low-pass cutoff opens with dread. */
export const cutoffFor = (dread) => 160 + 520 * clampDread(dread);

/** Final master gain from volume (0..1, squared for a perceptual curve), mute and dread. */
export function masterGain(volume, muted, dread) {
  if (muted) return 0;
  return MAX_GAIN * clampVolume(volume) ** 2 * (0.4 + 0.6 * clampDread(dread));
}

/** Slow LFO on the master gain. Reduced motion lowers the modulation to a very gentle swell. */
export function modulation(reduced) {
  return reduced ? { lfoHz: 0.05, depth: 0.1 } : { lfoHz: 0.15, depth: 0.5 };
}

/** Sparse bell-like pulses: [{ atMs, freq, durMs, gain }]. Empty under reduced motion. Same seed, dread and batch give the same list. */
export function pulseSchedule(seed, dread, count, reduced, batch = 0) {
  if (reduced || !(count > 0)) return [];
  const d = clampDread(dread);
  const rng = new SeededRandom((seed | 0) ^ 0x70151e ^ Math.imul(batch | 0, 0x9e3779b1));
  const root = rootFor(seed);
  const out = [];
  let at = 0;
  for (let i = 0; i < Math.trunc(count); i++) {
    // pulses get closer together as dread rises: about 9s down to 3s
    at += Math.round((9000 - 6000 * d) * (0.7 + rng.next(60) / 100));
    const degree = SCALE[rng.next(SCALE.length)];
    out.push({ atMs: at, freq: semitone(root * 4, degree), durMs: 2500 + rng.next(2000), gain: 0.15 + 0.35 * d });
  }
  return out;
}

/** Controller. `AC` is the AudioContext constructor. Nothing is created until start() is called from a gesture. */
export function createAmbient(AC, opts = {}) {
  const seed = opts.seed | 0, reduced = !!opts.reduced;
  let ctx = null, master = null, lfoGain = null, filter = null, voices = [], noiseGain = null, timer = null, batch = 0;
  let volume = clampVolume(opts.volume ?? 0.6), muted = false, dread = 0, running = false;

  const apply = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = masterGain(volume, muted, dread);
    master.gain.setTargetAtTime(g, t, 0.25);
    // the LFO adds to the gain param, so gate it too or a muted master still swings around zero
    if (lfoGain) lfoGain.gain.setTargetAtTime(g > 0 ? 0.02 * modulation(reduced).depth : 0, t, 0.25);
    filter.frequency.setTargetAtTime(cutoffFor(dread), t, 0.4);
    droneFrequencies(seed, dread).forEach((f, i) => voices[i].frequency.setTargetAtTime(f, t, 0.8));
    if (noiseGain) noiseGain.gain.setTargetAtTime(0.02 + 0.06 * dread, t, 0.5);
  };

  function ping(p) {
    const t = ctx.currentTime + p.atMs / 1000, dur = p.durMs / 1000;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = p.freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(p.gain * 0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(filter); o.start(t); o.stop(t + dur + 0.1);
  }
  function scheduleBatch() {
    if (!running || !ctx) return;
    pulseSchedule(seed, dread, 3, reduced, batch++).forEach(ping);
    if (!reduced) timer = setTimeout(scheduleBatch, 20000);
  }

  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoffFor(0); filter.connect(master);
    const freqs = droneFrequencies(seed, 0);
    voices = freqs.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.4;
      o.connect(g); g.connect(filter); o.start(); return o;
    });
    const m = modulation(reduced);
    const lfo = ctx.createOscillator(); lfo.frequency.value = m.lfoHz;
    const lg = lfoGain = ctx.createGain(); lg.gain.value = 0; lfo.connect(lg); lg.connect(master.gain); lfo.start();
    // filtered noise: a faint wind, from a short deterministic noise buffer
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    const rng = new SeededRandom(seed ^ 0x6e015e);
    for (let i = 0; i < len; i++) data[i] = (rng.next(2000) - 1000) / 1000;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0.02;
    src.connect(bp); bp.connect(noiseGain); noiseGain.connect(master); src.start();
  }

  return {
    get running() { return running; },
    get muted() { return muted; },
    get volume() { return volume; },
    start() {
      if (!AC) return false;
      if (!ctx) { try { build(); } catch { ctx = null; return false; } }
      ctx.resume?.();
      running = true; apply(); scheduleBatch();
      return true;
    },
    setVolume(v) { volume = clampVolume(v); apply(); },
    mute() { muted = true; apply(); },
    unmute() { muted = false; apply(); },
    toggleMute() { muted = !muted; apply(); return muted; },
    setDread(d) { dread = clampDread(d); apply(); },
    stop() {
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }
      ctx?.suspend?.();
    },
    /** Stop and release the AudioContext. The controller cannot be restarted afterwards. */
    dispose() {
      this.stop();
      const c = ctx; ctx = null; master = filter = lfoGain = noiseGain = null; voices = [];
      c?.close?.();
    },
  };
}
