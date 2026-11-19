// JS port of Core/LighthouseBeam.cs: the lamp of the lighthouse turns once every PERIOD_SECONDS; the beam yaw depends only on the seed and the time.
// Core is the source of truth. Golden-checked ("lighthouseBeam"). Direction vector of a yaw: (sin yaw, -cos yaw), the camera convention.
import { lightU, coastToWorldAt } from './dressing.js';

export const PERIOD_SECONDS = 16, HALF_ANGLE = 0.105, LAMP_HEIGHT = 8.7, BEAM_LENGTH = 140, SITE_V = -4.2;
const TAU = 2 * Math.PI;

/** Where the beam points at time zero, 0 up to 2 pi, from the seed alone (same 32 bit multiplicative hash as Core). */
export function beamPhase(seed) { return (Math.imul(seed | 0, 2654435761 | 0) >>> 0) / 4294967296 * TAU; }

/** Yaw of the beam in radians (0 up to 2 pi) after timeSec seconds. */
export function beamYaw(seed, timeSec) {
  const yaw = (beamPhase(seed) + TAU * (timeSec / PERIOD_SECONDS)) % TAU;
  return yaw < 0 ? yaw + TAU : yaw;
}

/** Ground position { x, z } of the lighthouse (the slot its mesh is placed in). */
export function lighthouseSite(seed, gridW, gridD) { return coastToWorldAt(seed, gridW, lightU(seed, gridW, gridD), SITE_V); }

/** Unit direction on the ground plane [x, z] for a beam yaw. */
export function beamDirection(yaw) { return [Math.sin(yaw), -Math.cos(yaw)]; }
