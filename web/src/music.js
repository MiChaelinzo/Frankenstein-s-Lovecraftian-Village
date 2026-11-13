// Procedural ambient soundtrack. Original synthesis only (oscillators and filtered noise), no samples, no audio files.
// The pure helpers below are deterministic and unit tested; createAmbient is a thin WebAudio controller that must be
// started from a user gesture (browsers keep an AudioContext silent otherwise, and the demo never starts one on load).
import { SeededRandom, tierFor } from './core.js';
import { clamp } from './util.js';

export const ROOTS_HZ = [49, 55, 61.74, 65.41];
// Phrygian semitone offsets: dark and unresolved.
export const SCALE = [0, 1, 3, 5, 7, 8, 10];
export const MAX_GAIN = 0.3;

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

// ---------- layered ambience and cues (pure parameter functions; createAmbient only turns them into nodes) ----------

export const SURFACES = ['gravel', 'wood', 'wet'];
/**
 * One footstep: filtered noise burst (+ a low thump on wood). foot is 0 or 1 (alternating feet vary the pitch a little).
 * Dread muffles the step. { filter, freq, q, durMs, gain, thump } where thump is a sine Hz or 0.
 */
export function footstepParams(surface, dread, foot = 0) {
  const d = clampDread(dread), k = foot ? 0.93 : 1, muffle = 1 - 0.35 * d;
  switch (surface) {
    case 'wood': return { filter: 'bandpass', freq: 520 * k * muffle, q: 1.1, durMs: 130, gain: 0.5, thump: 95 * k };
    case 'wet': return { filter: 'lowpass', freq: 900 * k * muffle, q: 0.7, durMs: 170, gain: 0.42, thump: 0 };
    default: return { filter: 'bandpass', freq: 2100 * k * muffle, q: 0.9, durMs: 95, gain: 0.34, thump: 0 };
  }
}

/** Waves: slow-modulated low-passed noise, louder near the coast (coast 0..1). Reduced motion keeps a nearly still bed. */
export function wavesLayer(coast, dread, reduced) {
  const c = clamp(num(coast, 0), 0, 1), d = clampDread(dread);
  return { gain: 0.012 + 0.07 * c * c, cutoff: 380 + 260 * c + 120 * d, lfoHz: reduced ? 0.03 : 0.11 + 0.05 * d, depth: reduced ? 0.15 : 0.7 };
}

/** The wind bed gain: grows with dread (the existing bed is 0.02 + 0.06 * dread). */
export const windGain = (dread) => 0.02 + 0.06 * clampDread(dread);

export const BELL_PARTIALS = [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.93, 0.14]]; // inharmonic ratios and relative gains
/** Rare distant bell strikes: [{ atMs, freq, durMs, gain }], 25..70 s apart, softer at low dread. Empty under reduced motion. */
export function bellSchedule(seed, dread, count, reduced, batch = 0) {
  if (reduced || !(count > 0)) return [];
  const d = clampDread(dread), rng = new SeededRandom((seed | 0) ^ 0xbe11 ^ Math.imul(batch | 0, 0x85ebca6b)), out = [];
  let at = 0;
  for (let i = 0; i < Math.trunc(count); i++) {
    at += 25000 + rng.next(45000);
    out.push({ atMs: at, freq: semitone(rootFor(seed) * 2, [0, 1, 6][rng.next(3)]), durMs: 5000 + rng.next(3000), gain: 0.05 + 0.2 * d });
  }
  return out;
}

/** Whisper tier 0..3 from dread: 0 is silent. */
export const whisperTier = (dread) => { const d = clampDread(dread); return d < 0.25 ? 0 : d < 0.5 ? 1 : d < 0.75 ? 2 : 3; };
/**
 * Voice-like swells of formant-filtered noise: [{ atMs, durMs, gain, f1, f2 }]. Tier 0 none; higher tiers come closer together and louder.
 * Empty under reduced motion. Seeded per seed, dread and batch.
 */
export function whisperSchedule(seed, dread, count, reduced, batch = 0) {
  const tier = whisperTier(dread);
  if (reduced || tier === 0 || !(count > 0)) return [];
  const rng = new SeededRandom((seed | 0) ^ 0x71a5 ^ Math.imul(batch | 0, 0xc2b2ae35)), out = [], vowels = [[300, 870], [400, 1700], [600, 1040], [500, 1500]];
  let at = 0;
  for (let i = 0; i < Math.trunc(count); i++) {
    at += Math.round((14000 - 3500 * tier) * (0.6 + rng.next(80) / 100));
    const [f1, f2] = vowels[rng.next(vowels.length)];
    out.push({ atMs: at, durMs: 1800 + rng.next(1800), gain: 0.012 * tier, f1, f2 });
  }
  return out;
}

export const CUES = ['lantern', 'ending-warm', 'ending-cold'];
/** Short original UI cues as note lists [{ atMs, freq, durMs, gain, type }]: a soft rising pair for a lit lantern, a warm major chord or a cold tritone for the ending. */
export function cueNotes(kind, seed = 0) {
  const root = rootFor(seed) * 4;
  if (kind === 'lantern') return [{ atMs: 0, freq: root * 1.5, durMs: 600, gain: 0.5, type: 'sine' }, { atMs: 140, freq: root * 2, durMs: 900, gain: 0.4, type: 'sine' }];
  if (kind === 'ending-warm') return [0, 4, 7, 12].map((n, i) => ({ atMs: i * 220, freq: semitone(root, n), durMs: 2600, gain: 0.35, type: 'triangle' }));
  if (kind === 'ending-cold') return [0, 6, 1].map((n, i) => ({ atMs: i * 380, freq: semitone(root / 2, n), durMs: 3600, gain: 0.35, type: 'sawtooth' }));
  return [];
}

/** Controller. `AC` is the AudioContext constructor. Nothing is created until start() is called from a gesture. */
export function createAmbient(AC, opts = {}) {
  const seed = opts.seed | 0, reduced = !!opts.reduced;
  let ctx = null, master = null, lfoGain = null, filter = null, voices = [], noiseGain = null, timer = null, batch = 0, noiseBuf = null, wavesGain = null, wavesFilter = null, wavesLfo = null, coast = 0, foot = 0, noiseCursor = 0; // noiseCursor walks the noise buffer deterministically so bursts differ without randomness
  let volume = clampVolume(opts.volume ?? 0.6), muted = false, dread = 0, running = false, mix = { drone: 1, wind: 1, waves: 1, whispers: true };

  const apply = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = masterGain(volume, muted, dread) * clamp(num(mix.drone, 1), 0, 1.5);
    master.gain.setTargetAtTime(g, t, 0.25);
    // the LFO adds to the gain param, so gate it too or a muted master still swings around zero
    if (lfoGain) lfoGain.gain.setTargetAtTime(g > 0 ? 0.02 * modulation(reduced).depth : 0, t, 0.25);
    filter.frequency.setTargetAtTime(cutoffFor(dread), t, 0.4);
    droneFrequencies(seed, dread).forEach((f, i) => voices[i].frequency.setTargetAtTime(f, t, 0.8));
    if (noiseGain) noiseGain.gain.setTargetAtTime(windGain(dread) * clamp(num(mix.wind, 1), 0, 3), t, 0.5);
    if (wavesGain) {
      const w = wavesLayer(coast, dread, reduced);
      wavesGain.gain.setTargetAtTime(w.gain * clamp(num(mix.waves, 1), 0, 3), t, 0.8); wavesFilter.frequency.setTargetAtTime(w.cutoff, t, 0.8); wavesLfo.gain.setTargetAtTime(w.gain * w.depth, t, 0.8);
    }
  };

  const live = () => !!ctx && running && !muted;
  /** A filtered noise burst through the master (so volume and mute apply), optionally with a sine thump. */
  function burst(o) {
    const t = ctx.currentTime + (o.atMs || 0) / 1000, dur = o.durMs / 1000, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; f.type = o.filter; f.frequency.value = o.freq; f.Q.value = o.q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.gain * (o.swell ? 0.6 : 1), t + (o.swell ? dur * 0.45 : 0.008)); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t, (noiseCursor = (noiseCursor + 0.37) % 1.5)); src.stop(t + dur + 0.05);
    if (o.thump) { const th = ctx.createOscillator(), tg = ctx.createGain(); th.frequency.value = o.thump; tg.gain.setValueAtTime(o.gain * 0.6, t); tg.gain.exponentialRampToValueAtTime(0.0005, t + 0.12); th.connect(tg); tg.connect(master); th.start(t); th.stop(t + 0.15); }
  }
  function bell(p) {
    const t = ctx.currentTime + p.atMs / 1000, dur = p.durMs / 1000;
    for (const [ratio, rel] of BELL_PARTIALS) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = p.freq * ratio;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.gain * rel * 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur / Math.sqrt(ratio));
      o.connect(g); g.connect(filter); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function whisper(p) {
    for (const f of [p.f1, p.f2]) burst({ atMs: p.atMs, durMs: p.durMs, gain: p.gain * (f === p.f1 ? 1 : 0.6), filter: 'bandpass', freq: f, q: 6, swell: true });
  }


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
    pulseSchedule(seed, dread, 3, reduced, batch).forEach(ping);
    bellSchedule(seed, dread, 1, reduced, batch).forEach(bell);
    if (mix.whispers) whisperSchedule(seed, dread, 2, reduced, batch).forEach(whisper); // never in full daylight
    batch++;
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
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0.02; noiseBuf = buf;
    src.connect(bp); bp.connect(noiseGain); noiseGain.connect(master); src.start();
    // waves: the same noise through a low-pass whose gain breathes slowly
    const wsrc = ctx.createBufferSource(); wsrc.buffer = buf; wsrc.loop = true; wsrc.playbackRate.value = 0.6;
    wavesFilter = ctx.createBiquadFilter(); wavesFilter.type = 'lowpass'; wavesFilter.frequency.value = 400;
    wavesGain = ctx.createGain(); wavesGain.gain.value = 0.012;
    const wl = ctx.createOscillator(), w = wavesLayer(0, 0, reduced); wl.frequency.value = w.lfoHz; wavesLfo = ctx.createGain(); wavesLfo.gain.value = 0;
    wl.connect(wavesLfo); wavesLfo.connect(wavesGain.gain); wsrc.connect(wavesFilter); wavesFilter.connect(wavesGain); wavesGain.connect(master); wsrc.start(); wl.start();
  }

  return {
    get running() { return running; },
    get muted() { return muted; },
    get volume() { return volume; },
    start() {
      if (!AC) return false;
      if (!ctx) { try { build(); } catch (err) { console.warn(`[music] could not start audio: ${err.message}`); ctx = null; return false; } }
      ctx.resume?.();
      running = true; apply(); scheduleBatch();
      return true;
    },
    setVolume(v) { volume = clampVolume(v); apply(); },
    mute() { muted = true; apply(); },
    unmute() { muted = false; apply(); },
    toggleMute() { muted = !muted; apply(); return muted; },
    /** How close the listener is to the sea, 0..1: waves get louder. */
    setCoast(c) { coast = clamp(num(c, 0), 0, 1); apply(); },
    /** One footstep on a surface ('gravel', 'wood' or 'wet'). Silent when stopped, muted or never started. */
    footstep(surface) { if (!live()) return; foot ^= 1; burst({ ...footstepParams(SURFACES.includes(surface) ? surface : 'gravel', dread, foot), atMs: 0 }); },
    /** A short UI cue ('lantern', 'ending-warm', 'ending-cold'). Silent when stopped, muted or never started. */
    cue(kind) {
      if (!live()) return;
      for (const n of cueNotes(kind, seed)) {
        const t = ctx.currentTime + n.atMs / 1000, dur = n.durMs / 1000, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = n.type; o.frequency.value = n.freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(n.gain * 0.25, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.1);
      }
    },
    setDread(d) { dread = clampDread(d); apply(); },
    /** The clock's ambient mix (daylight.audioMix): drone, wind and waves multipliers and whether whispers may sound. */
    setMix(m) { mix = { drone: num(m?.drone, 1), wind: num(m?.wind, 1), waves: num(m?.waves, 1), whispers: m?.whispers !== false }; apply(); },
    stop() {
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }
      ctx?.suspend?.();
    },
    /** Stop and release the AudioContext. The controller cannot be restarted afterwards. */
    dispose() {
      this.stop();
      const c = ctx; ctx = null; master = filter = lfoGain = noiseGain = noiseBuf = wavesGain = wavesFilter = wavesLfo = null; voices = [];
      c?.close?.();
    },
  };
}
