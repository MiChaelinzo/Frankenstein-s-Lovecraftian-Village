// Round 26: how a corrupted villager looks (2D and 3D). Pure and presentation only: the stage comes from society.js, nothing here changes a rule.
// A tell is a lean of the posture, a dim cold aura and a changed lantern colour. It never flashes: the aura breathes very slowly (one cycle in
// PULSE_PERIOD_MS, at most PULSE_DEPTH of its alpha) and holds still under reduced motion. Low quality tiers skip the aura but keep posture and lantern.
import { CORRUPTION_NONE, CORRUPTION_UNEASY, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST, CORRUPTION_MISSING } from './society.js';
import { VERTEX_FLOATS } from './glb.js';

export const PULSE_PERIOD_MS = 6000, PULSE_DEPTH = 0.2;
export const AURA_RGB = '70,120,130';              // 2D glow colour: a cold sea green, never red
export const COLD_LANTERN_RGB = [0.55, 0.86, 0.78]; // 3D lantern glass hue (0..1) for a corrupted villager
export const COLD_LANTERN_CSS = 'rgb(150,220,200)';  // 2D lantern fill
export const COLD_TINT = [0.32, 0.44, 0.46];        // 0..1 colour the coat is dimmed toward in 3D
const NO_TELL = Object.freeze({ stage: CORRUPTION_NONE, lean: 0, aura: 0, tint: 0, lantern: false });
const TELLS = [
  NO_TELL,
  Object.freeze({ stage: CORRUPTION_UNEASY, lean: 0.03, aura: 0, tint: 0, lantern: false }),
  Object.freeze({ stage: CORRUPTION_CORRUPTED, lean: 0.12, aura: 0.24, tint: 0.25, lantern: true }),
  Object.freeze({ stage: CORRUPTION_CULTIST, lean: 0.18, aura: 0.34, tint: 0.4, lantern: true }),
  Object.freeze({ stage: CORRUPTION_MISSING, lean: 0.18, aura: 0.34, tint: 0.4, lantern: true }),
];

/**
 * The tell of a corruption stage: { stage, lean (radians, forward), aura (alpha 0..1), tint (0..1 dimming of the coat), lantern (changed lantern colour), pulse (breath depth) }.
 * tier is a quality tier from quality.js (detail 0 is Low: no aura). Out-of-range stages give no tell.
 */
export function tellFor(stage, { reduced = false, tier = null } = {}) {
  const base = TELLS[Number.isInteger(stage) && stage >= 0 && stage < TELLS.length ? stage : 0];
  const lowTier = !!tier && tier.detail === 0;
  return { ...base, aura: lowTier ? 0 : base.aura, pulse: reduced || lowTier ? 0 : PULSE_DEPTH };
}

/** Aura alpha at a time (ms): static under reduced motion, otherwise a slow breath. Never below (1 - pulse) of the aura, never above it. */
export function auraAlpha(tell, timeMs) {
  if (!tell || tell.aura <= 0) return 0;
  if (!tell.pulse) return tell.aura;
  return tell.aura * (1 - tell.pulse * (0.5 + 0.5 * Math.sin((timeMs / PULSE_PERIOD_MS) * Math.PI * 2)));
}

/** True when a tell is visible at all. */
export const hasTell = (tell) => !!tell && (tell.lean > 0 || tell.aura > 0 || tell.tint > 0 || tell.lantern);

/**
 * 3D: applies a tell to one figure's freshly appended vertices (floats per vertex as in glb.js) around its base (cx, cz) facing yaw: the figure
 * leans forward by shearing along the facing, the coat is dimmed toward COLD_TINT and emissive vertices (the lantern glass) take the cold hue.
 * Pure on the array; the same input gives the same output.
 */
export function applyTell3d(out, from, cx, cz, yaw, tell) {
  if (!hasTell(tell)) return;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), shear = Math.tan(tell.lean);
  for (let i = from; i < out.length; i += VERTEX_FLOATS) {
    const along = out[i + 1] * shear;
    out[i] += fx * along; out[i + 2] += fz * along;
    if (out[i + 9] > 0) { if (tell.lantern) { out[i + 6] = COLD_LANTERN_RGB[0]; out[i + 7] = COLD_LANTERN_RGB[1]; out[i + 8] = COLD_LANTERN_RGB[2]; } continue; }
    for (let k = 0; k < 3; k++) out[i + 6 + k] = out[i + 6 + k] * (1 - tell.tint) + COLD_TINT[k] * tell.tint;
  }
}
