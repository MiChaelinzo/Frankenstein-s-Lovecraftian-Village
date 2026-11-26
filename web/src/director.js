// Dynamic Horror Director (spec 161). Port of Core HorrorDirector.cs: the C# code is the source of truth and web/test/golden.json the proof.
// Paces dread from state with small steps, enforced quiet after an Omen, and a narrative cause on every non-quiet beat. No scares.
import { SeededRandom } from './core.js';
import { phaseAt } from './clock.js';

export const BEAT = Object.freeze({ QUIET: 0, UNEASE: 1, PRESSURE: 2, OMEN: 3, RELIEF: 4 });
export const BEAT_NAMES = Object.freeze(['quiet', 'unease', 'pressure', 'omen', 'relief']);
export const MAX_INTENSITY = 1000, MAX_STEP = 40, UNEASE_AT = 150, PRESSURE_AT = 350, OMEN_AT = 600, OMEN_CHANCE_PERCENT = 35;
export const QUIET_AFTER_OMEN = 10, QUIET_CEILING = 200, SAFE_ZONE_CAP = 120, ENCOUNTER_CAP = 3, NIGHT_WEIGHT = 150, DUSK_WEIGHT = 60;
export const SANITY_WEIGHT_PERCENT = 30, STRESS_WEIGHT_PERCENT = 20, CULT_WEIGHT_PERCENT = 20, KNOWLEDGE_WEIGHT_PERCENT = 10;
export const ABUSE_WEIGHT_PERCENT = 20, CAMPING_TICKS = 60, SAFE_ZONE_ABUSE_CAP = 1000, ABUSE_GAIN_PER_STEP = 20, ABUSE_DECAY_PER_STEP = 10;
export const MIN_BEAT_GAP_TICKS = 45, BEAT_CHANCE_PERCENT = 15, MAX_CUE_VOLUME = 150, MAX_BRIGHTNESS_STEP = 40, GENTLE_SCALE = 500, STANDARD_SCALE = 1000, BEAT_STREAM = 0x1750;
/** Round 37 (spec 175): a dimming step eases in over DIM_RISE_MS, holds for DIM_HOLD_MS and eases out over DIM_FALL_MS (Core HorrorDirector.DimEnvelope). */
export const DIM_RISE_MS = 2000, DIM_HOLD_MS = 4000, DIM_FALL_MS = 6000;
export const NO_BEAT_YET = -2147483648; // C# int.MinValue
export const ENCOUNTER_WEIGHT = 60, SAFE_ZONE_WEIGHT_PER_TICK = 2, CLUE_RELIEF_PERCENT = 10;
export const CAUSE_IDS = Object.freeze(['waning_sanity', 'mounting_stress', 'cult_exposure', 'creature_sighting', 'nightfall', 'forbidden_knowledge', 'safe_zone_abuse', 'omen_passed']);

const num = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);
const permille = (v) => Math.max(0, Math.min(1000, num(v)));
const NIGHT = 3, DUSK = 2;

export const startState = () => ({ intensity: 0, beat: BEAT.QUIET, quietLeft: 0, cause: '' });

/** Web-only bookkeeping for a new seed or campaign: calm director, no smoothed level, no safe-zone time or abuse, no ambient beat yet. */
export const freshRun = () => ({ state: startState(), tick: null, level: 0, at: null, safeTicks: 0, abuse: 0, beatTick: NO_BEAT_YET });

function pressures(x) {
  const phase = phaseAt(num(x.tick));
  return [
    Math.trunc((1000 - permille(x.sanity)) * SANITY_WEIGHT_PERCENT / 100),
    Math.trunc(permille(x.stress) * STRESS_WEIGHT_PERCENT / 100),
    Math.trunc(permille(x.cultExposure) * CULT_WEIGHT_PERCENT / 100),
    Math.max(0, Math.min(ENCOUNTER_CAP, num(x.encounters))) * ENCOUNTER_WEIGHT,
    phase === NIGHT ? NIGHT_WEIGHT : phase === DUSK ? DUSK_WEIGHT : 0,
    Math.trunc(permille(x.knowledge) * KNOWLEDGE_WEIGHT_PERCENT / 100),
    Math.trunc(permille(x.safeZoneAbuse) * ABUSE_WEIGHT_PERCENT / 100),
  ];
}

/** The intensity (0..1000) the village drifts toward: summed pressures minus safe-zone time and clue progress. */
export function target(x) {
  const total = pressures(x).reduce((a, b) => a + b, 0);
  const relief = Math.max(0, Math.min(SAFE_ZONE_CAP, num(x.safeZoneTicks))) * SAFE_ZONE_WEIGHT_PER_TICK + Math.trunc(permille(x.clueProgress) * CLUE_RELIEF_PERCENT / 100);
  return Math.max(0, Math.min(MAX_INTENSITY, total - relief));
}

/** The narrative cause rule for creature appearances (spec 166). Mirrors HorrorDirector.CauseHolds: a known cause id, not the relief marker, whose own pressure is above zero. */
export function causeHolds(cause, x) {
  const i = CAUSE_IDS.indexOf(cause);
  return i >= 0 && i !== CAUSE_IDS.length - 1 && pressures(x)[i] > 0;
}

export function dominantCause(x) {
  const p = pressures(x);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  return CAUSE_IDS[best];
}

const beatFor = (i) => (i >= PRESSURE_AT ? BEAT.PRESSURE : i >= UNEASE_AT ? BEAT.UNEASE : BEAT.QUIET);

/** One deterministic step: { intensity, beat, quietLeft, cause }. */
export function step(seed, state, x) {
  let t = target(x);
  const quiet = state.quietLeft > 0;
  if (quiet) t = Math.min(t, QUIET_CEILING);
  const delta = Math.max(-MAX_STEP, Math.min(MAX_STEP, t - state.intensity));
  const intensity = Math.max(0, Math.min(MAX_INTENSITY, state.intensity + delta));
  if (quiet) {
    const first = state.quietLeft === QUIET_AFTER_OMEN;
    return { intensity, beat: first ? BEAT.RELIEF : BEAT.QUIET, quietLeft: state.quietLeft - 1, cause: first ? 'omen_passed' : '' };
  }
  if (intensity >= OMEN_AT && new SeededRandom((seed | 0) ^ Math.imul(num(x.tick), 7919)).next(100) < OMEN_CHANCE_PERCENT) {
    return { intensity, beat: BEAT.OMEN, quietLeft: QUIET_AFTER_OMEN, cause: dominantCause(x) };
  }
  const beat = beatFor(intensity);
  return { intensity, beat, quietLeft: 0, cause: beat === BEAT.QUIET ? '' : dominantCause(x) };
}

/** Core DreadCurve.FromIntensity: intensity 0..1000 as a dread level 0..1. */
export const dreadFromIntensity = (i) => Math.max(0, Math.min(1, num(i) / MAX_INTENSITY));

// Presentation. Gentle by design: the director only leans a little on fog, lamplight and the ambient bed, and never above these caps.
export const FOG_GAIN_MAX = 0.12, LIGHT_DIM_MAX = 0.08, AMBIENCE_GAIN_MAX = 0.12;
export const RAMP_PER_SECOND = 0.05; // the smoothed level moves at most 5% of its range per second

/** Look gains from the smoothed level (0..1), scaled by the optional Horror Intensity (scale, per mille). Reduced motion keeps fog and light still (zero) and leaves only a steady, tiny ambient lift; Low tier skips the fog. */
export function presentation(level, { reduced = false, tier = 'medium', scale = 1000 } = {}) {
  // scale is the Horror Intensity setting in per mille (500 gentle, 1000 standard, 1500 dread): it scales only how much of the level shows, never the level itself.
  const k = Number.isFinite(scale) ? Math.max(0, Math.min(1500, scale)) / 1000 : 1;
  const l = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0)) * k;
  return {
    fogGain: reduced || tier === 'low' ? 1 : 1 + FOG_GAIN_MAX * l,
    lightGain: reduced ? 1 : 1 - LIGHT_DIM_MAX * l,
    ambienceGain: 1 + (reduced ? AMBIENCE_GAIN_MAX / 3 : AMBIENCE_GAIN_MAX) * l,
  };
}

// Director 2.0 (spec 175). Mirrors Core HorrorDirector.NextSafeZoneAbuse, Beats and PickAmbientBeat. Presentation only: text, a bounded cue volume, a dimming step and a prop cue.
/** Camping (CAMPING_TICKS or more safe-zone ticks) adds ABUSE_GAIN_PER_STEP, anything else decays by ABUSE_DECAY_PER_STEP; bounded 0..SAFE_ZONE_ABUSE_CAP. */
export const nextSafeZoneAbuse = (abuse, safeZoneTicks) => Math.max(0, Math.min(SAFE_ZONE_ABUSE_CAP, num(abuse) + (num(safeZoneTicks) >= CAMPING_TICKS ? ABUSE_GAIN_PER_STEP : -ABUSE_DECAY_PER_STEP)));

const BEATS = Object.freeze([
  { id: 'distant_bell', cause: 'nightfall', minTier: 0, volume: 120, brightness: 0, prop: false, needsVillager: false },
  { id: 'false_footprints', cause: 'safe_zone_abuse', minTier: 0, volume: 30, brightness: 0, prop: true, needsVillager: false },
  { id: 'moved_lantern', cause: 'safe_zone_abuse', minTier: 0, volume: 30, brightness: -30, prop: true, needsVillager: false },
  { id: 'empty_boat', cause: 'waning_sanity', minTier: 1, volume: 0, brightness: 0, prop: true, needsVillager: false },
  { id: 'wrong_road_sign', cause: 'mounting_stress', minTier: 0, volume: 0, brightness: 0, prop: true, needsVillager: false },
  { id: 'distant_singing', cause: 'cult_exposure', minTier: 1, volume: 80, brightness: 0, prop: false, needsVillager: false },
  { id: 'impossible_stars', cause: 'forbidden_knowledge', minTier: 2, volume: 0, brightness: -20, prop: true, needsVillager: false },
  { id: 'npc_sighting', cause: 'waning_sanity', minTier: 0, volume: 0, brightness: 0, prop: true, needsVillager: true },
]);
export const BEAT_IDS = Object.freeze(BEATS.map((b) => b.id));
export const beatCause = (id) => BEATS.find((b) => b.id === id)?.cause ?? '';

const NO_BEAT = Object.freeze({ emitted: false, id: '', cause: '', volume: 0, brightness: 0, prop: false, villager: -1 });

/** One ambient beat decision. x adds safeZoneAbuse, knowledgeTier and rememberedVillager (0 none, else index + 1). settings: { scale, reduced }. Same rules as Core PickAmbientBeat. */
export function pickAmbientBeat(seed, state, x, lastBeatTick, { scale = STANDARD_SCALE, reduced = false } = {}) {
  if (num(scale) <= GENTLE_SCALE) return NO_BEAT;
  if (state.quietLeft > 0 || (state.beat !== BEAT.UNEASE && state.beat !== BEAT.PRESSURE)) return NO_BEAT;
  const tick = num(x.tick), gap = tick - lastBeatTick;
  if (lastBeatTick !== NO_BEAT_YET && gap >= 0 && gap < MIN_BEAT_GAP_TICKS) return NO_BEAT;
  const rng = new SeededRandom((seed | 0) ^ Math.imul(tick, 104729) ^ BEAT_STREAM);
  if (rng.next(100) >= BEAT_CHANCE_PERCENT) return NO_BEAT;
  const candidates = BEATS.filter((b) => causeHolds(b.cause, x) && num(x.knowledgeTier) >= b.minTier && (!b.needsVillager || num(x.rememberedVillager) > 0));
  if (candidates.length === 0) return NO_BEAT;
  const pick = candidates[rng.next(candidates.length)];
  const k = Math.max(0, Math.min(1500, num(scale)));
  return {
    emitted: true, id: pick.id, cause: pick.cause,
    volume: Math.min(MAX_CUE_VOLUME, Math.trunc(pick.volume * k / STANDARD_SCALE)),
    brightness: reduced ? 0 : -Math.min(MAX_BRIGHTNESS_STEP, Math.trunc(-pick.brightness * k / STANDARD_SCALE)) || 0,
    prop: pick.prop && !reduced,
    villager: pick.needsVillager ? num(x.rememberedVillager) - 1 : -1,
  };
}

/** The 0..1000 shape of a dimming step elapsedMs after its beat: linear rise, hold, linear fall, 0 before and after. Mirror of Core HorrorDirector.DimEnvelope (integer math). */
export function dimEnvelope(elapsedMs) {
  const ms = Math.trunc(Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (ms <= 0) return 0;
  if (ms < DIM_RISE_MS) return Math.trunc(ms * 1000 / DIM_RISE_MS);
  if (ms < DIM_RISE_MS + DIM_HOLD_MS) return 1000;
  const fall = ms - DIM_RISE_MS - DIM_HOLD_MS;
  return fall >= DIM_FALL_MS ? 0 : Math.trunc((DIM_FALL_MS - fall) * 1000 / DIM_FALL_MS);
}

/**
 * Round 37 (spec 175): how much light to take off right now, per mille, 0..MAX_BRIGHTNESS_STEP, for a beat with the given brightness (0 or negative) that began elapsedMs ago.
 * Always 0 at gentle intensity (scale 500 or less) and under reduced motion, whatever the beat says. Mirror of Core HorrorDirector.DimStep. The scene multiplies its light by 1 - dimStep / 1000.
 */
export function dimStep(brightness, elapsedMs, { scale = STANDARD_SCALE, reduced = false } = {}) {
  if (reduced || num(scale) <= GENTLE_SCALE || num(brightness) >= 0) return 0;
  return Math.trunc(Math.min(MAX_BRIGHTNESS_STEP, -num(brightness)) * dimEnvelope(elapsedMs) / 1000);
}

/** Moves the smoothed level toward the wanted one by at most RAMP_PER_SECOND * dtSec. Reduced motion still ramps (nothing flashes); a huge dt cannot jump further than the cap allows. */
export function ramp(current, wanted, dtSec) {
  const dt = Math.max(0, Math.min(1, Number.isFinite(dtSec) ? dtSec : 0)), cap = RAMP_PER_SECOND * dt;
  const c = Number.isFinite(current) ? current : 0, w = Number.isFinite(wanted) ? wanted : 0;
  return c + Math.max(-cap, Math.min(cap, w - c));
}

/** Web-only bookkeeping (no Core counterpart, the C# director just receives the number): one game minute near a lit lantern adds a safe-zone tick, one away takes it back, bounded by SAFE_ZONE_CAP. */
export const SAFE_LAMP_RADIUS = 6; // metres, inside the lantern's lit pool
export const nextSafeZoneTicks = (ticks, near) => Math.max(0, Math.min(SAFE_ZONE_CAP, num(ticks) + (near ? 1 : -1)));
export function nearLitLamp(lamps, x, z, radius = SAFE_LAMP_RADIUS) {
  for (const l of lamps) if (l.lit && (l.pos[0] - x) ** 2 + (l.pos[2] - z) ** 2 <= radius * radius) return true;
  return false;
}
