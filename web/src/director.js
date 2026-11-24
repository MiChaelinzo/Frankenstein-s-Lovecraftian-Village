// Dynamic Horror Director (spec 161). Port of Core HorrorDirector.cs: the C# code is the source of truth and web/test/golden.json the proof.
// Paces dread from state with small steps, enforced quiet after an Omen, and a narrative cause on every non-quiet beat. No scares.
import { SeededRandom } from './core.js';
import { phaseAt } from './clock.js';

export const BEAT = Object.freeze({ QUIET: 0, UNEASE: 1, PRESSURE: 2, OMEN: 3, RELIEF: 4 });
export const BEAT_NAMES = Object.freeze(['quiet', 'unease', 'pressure', 'omen', 'relief']);
export const MAX_INTENSITY = 1000, MAX_STEP = 40, UNEASE_AT = 150, PRESSURE_AT = 350, OMEN_AT = 600, OMEN_CHANCE_PERCENT = 35;
export const QUIET_AFTER_OMEN = 10, QUIET_CEILING = 200, SAFE_ZONE_CAP = 120, ENCOUNTER_CAP = 3, NIGHT_WEIGHT = 150, DUSK_WEIGHT = 60;
export const SANITY_WEIGHT_PERCENT = 30, STRESS_WEIGHT_PERCENT = 20, CULT_WEIGHT_PERCENT = 20, KNOWLEDGE_WEIGHT_PERCENT = 10;
export const ENCOUNTER_WEIGHT = 60, SAFE_ZONE_WEIGHT_PER_TICK = 2, CLUE_RELIEF_PERCENT = 10;
export const CAUSE_IDS = Object.freeze(['waning_sanity', 'mounting_stress', 'cult_exposure', 'creature_sighting', 'nightfall', 'forbidden_knowledge', 'omen_passed']);

const num = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);
const permille = (v) => Math.max(0, Math.min(1000, num(v)));
const NIGHT = 3, DUSK = 2;

export const startState = () => ({ intensity: 0, beat: BEAT.QUIET, quietLeft: 0, cause: '' });

function pressures(x) {
  const phase = phaseAt(num(x.tick));
  return [
    Math.trunc((1000 - permille(x.sanity)) * SANITY_WEIGHT_PERCENT / 100),
    Math.trunc(permille(x.stress) * STRESS_WEIGHT_PERCENT / 100),
    Math.trunc(permille(x.cultExposure) * CULT_WEIGHT_PERCENT / 100),
    Math.max(0, Math.min(ENCOUNTER_CAP, num(x.encounters))) * ENCOUNTER_WEIGHT,
    phase === NIGHT ? NIGHT_WEIGHT : phase === DUSK ? DUSK_WEIGHT : 0,
    Math.trunc(permille(x.knowledge) * KNOWLEDGE_WEIGHT_PERCENT / 100),
  ];
}

/** The intensity (0..1000) the village drifts toward: summed pressures minus safe-zone time and clue progress. */
export function target(x) {
  const total = pressures(x).reduce((a, b) => a + b, 0);
  const relief = Math.max(0, Math.min(SAFE_ZONE_CAP, num(x.safeZoneTicks))) * SAFE_ZONE_WEIGHT_PER_TICK + Math.trunc(permille(x.clueProgress) * CLUE_RELIEF_PERCENT / 100);
  return Math.max(0, Math.min(MAX_INTENSITY, total - relief));
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

/** Look gains from the smoothed level (0..1). Reduced motion keeps fog and light still (zero) and leaves only a steady, tiny ambient lift; Low tier skips the fog. */
export function presentation(level, { reduced = false, tier = 'medium' } = {}) {
  const l = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  return {
    fogGain: reduced || tier === 'low' ? 1 : 1 + FOG_GAIN_MAX * l,
    lightGain: reduced ? 1 : 1 - LIGHT_DIM_MAX * l,
    ambienceGain: 1 + (reduced ? AMBIENCE_GAIN_MAX / 3 : AMBIENCE_GAIN_MAX) * l,
  };
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
