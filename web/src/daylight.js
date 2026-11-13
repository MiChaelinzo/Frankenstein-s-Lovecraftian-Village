// How the village looks through the day. Pure: a clock tick, the night's own sky and the dread go in; sky, light, fog and lantern gain come out.
// The night look stays exactly what view3d-math.hazedSky and moonParams produce; this module only blends toward a day palette by the clock, so a
// frozen night tick (and every existing capture at night) is unchanged. Nothing here decides gameplay: lantern state comes from clock.js (Core mirror).
import { wrapTick, MINUTES_PER_DAY } from './clock.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Keyframes by minute of the village day (0 is dawn, see clock.js). w is how far the sky is from the night look (0 night, 1 day);
 * zenith/horizon/ambient are the day palette at that minute; sun is the light colour; fogScale multiplies the fog density; stars and cloud are gains.
 * Dawn is a cold rose mist, the day is an overcast pale blue-grey (this village never gets honest sun), dusk burns amber into bruised violet.
 */
export const KEYS = Object.freeze([
  { m: 0, w: 0, zenith: [0.1, 0.13, 0.28], horizon: [0.34, 0.3, 0.4], ambient: [0.2, 0.22, 0.32], sun: [0.5, 0.4, 0.5], fogScale: 1.1, stars: 1, cloud: 0 },
  { m: 70, w: 0.35, zenith: [0.17, 0.2, 0.36], horizon: [0.56, 0.4, 0.44], ambient: [0.28, 0.28, 0.38], sun: [0.78, 0.5, 0.42], fogScale: 1.3, stars: 0.6, cloud: 0.1 },
  { m: 150, w: 0.82, zenith: [0.3, 0.4, 0.55], horizon: [0.95, 0.64, 0.52], ambient: [0.4, 0.4, 0.46], sun: [1, 0.7, 0.5], fogScale: 1.25, stars: 0.15, cloud: 0.2 },
  { m: 240, w: 1, zenith: [0.38, 0.5, 0.62], horizon: [0.5, 0.54, 0.56], ambient: [0.4, 0.43, 0.48], sun: [1, 0.86, 0.7], fogScale: 0.8, stars: 0, cloud: 0.3 },
  { m: 540, w: 1, zenith: [0.34, 0.5, 0.67], horizon: [0.46, 0.53, 0.58], ambient: [0.42, 0.46, 0.52], sun: [1, 0.94, 0.82], fogScale: 0.55, stars: 0, cloud: 0.35 },
  { m: 840, w: 1, zenith: [0.34, 0.44, 0.6], horizon: [0.56, 0.5, 0.46], ambient: [0.4, 0.4, 0.46], sun: [1, 0.8, 0.58], fogScale: 0.75, stars: 0, cloud: 0.3 },
  { m: 900, w: 0.95, zenith: [0.26, 0.3, 0.5], horizon: [0.96, 0.62, 0.34], ambient: [0.42, 0.38, 0.46], sun: [1, 0.58, 0.3], fogScale: 0.9, stars: 0, cloud: 0.3 },
  { m: 960, w: 0.82, zenith: [0.17, 0.12, 0.33], horizon: [0.92, 0.4, 0.3], ambient: [0.32, 0.26, 0.4], sun: [0.95, 0.42, 0.26], fogScale: 1, stars: 0.1, cloud: 0.25 },
  { m: 1020, w: 0.45, zenith: [0.1, 0.09, 0.25], horizon: [0.6, 0.26, 0.34], ambient: [0.24, 0.22, 0.34], sun: [0.7, 0.3, 0.28], fogScale: 1.05, stars: 0.5, cloud: 0.1 },
  { m: 1080, w: 0, zenith: [0.1, 0.13, 0.28], horizon: [0.34, 0.3, 0.4], ambient: [0.2, 0.22, 0.32], sun: [0.5, 0.4, 0.5], fogScale: 1, stars: 1, cloud: 0 },
  { m: MINUTES_PER_DAY, w: 0, zenith: [0.1, 0.13, 0.28], horizon: [0.34, 0.3, 0.4], ambient: [0.2, 0.22, 0.32], sun: [0.5, 0.4, 0.5], fogScale: 1.1, stars: 1, cloud: 0 },
]);

/** Sun disc size in radians (a little larger than the moon so the hour reads from the sky alone). */
export const SUN_SIZE = 0.075;
/** Lantern light never fully dies by day: a lit window is still a lit window. */
export const DAY_LAMP_GAIN = 0.1;
const SUN_PEAK_DEG = 60, SUN_BELOW_DEG = -6, SUN_MIN_DEG = 1;

/** Keyframe blend at a (possibly fractional) tick: { w, zenith, horizon, ambient, sun, fogScale, stars, cloud }. Smooth and periodic over the day. */
export function keyLook(tick) {
  const m = wrapTick(tick) + (tick - Math.trunc(tick) > 0 ? tick - Math.trunc(tick) : 0);
  let i = 0;
  while (i < KEYS.length - 2 && m >= KEYS[i + 1].m) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = ease(clamp((m - a.m) / (b.m - a.m), 0, 1));
  return {
    w: lerp(a.w, b.w, t), zenith: mix3(a.zenith, b.zenith, t), horizon: mix3(a.horizon, b.horizon, t), ambient: mix3(a.ambient, b.ambient, t),
    sun: mix3(a.sun, b.sun, t), fogScale: lerp(a.fogScale, b.fogScale, t), stars: lerp(a.stars, b.stars, t), cloud: lerp(a.cloud, b.cloud, t),
  };
}

/** Sun elevation in degrees over the daylight arc (dawn start to dusk end), below the horizon after. Lighting uses the clamped value. */
export function sunElevationDeg(tick) {
  const m = wrapTick(tick), arc = 1080;
  if (m >= arc) return SUN_BELOW_DEG;
  return SUN_BELOW_DEG + (SUN_PEAK_DEG - SUN_BELOW_DEG) * Math.pow(Math.sin((Math.PI * m) / arc), 1.8);
}

/** Lantern light gain 0.1..1: full at night, falling away as the sky brightens (smooth, so a lantern never pops on or off). */
export function lampGain(tick) {
  const w = keyLook(tick).w;
  return lerp(1, DAY_LAMP_GAIN, ease(clamp((w - 0.1) / 0.8, 0, 1)));
}

/** Ambient audio mix by the clock: drone and wind gains as multipliers, and whether whispers may sound (never in full daylight). */
export function audioMix(tick) {
  const w = keyLook(tick).w;
  return { drone: lerp(1, 0.6, w), wind: lerp(1, 1.5, w), waves: lerp(1, 1.15, w), whispers: w < 0.5 };
}

/**
 * The sky the renderer draws at this tick. sky is hazedSky() output, moon is moonParams() output; both come back unchanged at full night.
 * Dread greys and sickens the day palette (a village that is watching does not get a clean blue sky).
 * Returns { sky, moon, sunWeight, fogScale, lampGain, w } where sky has zenith, horizon, ambient, fog, stars, cloud and moon has dir, color, size, glow.
 */
export function lookAt(tick, sky, moon, dread = 0) {
  const k = keyLook(tick), d = clamp(Number.isFinite(dread) ? dread : 0, 0, 1);
  if (k.w <= 0) return { sky, moon, sunWeight: 0, fogScale: k.fogScale, lampGain: 1, w: 0 };
  const sick = [0.42, 0.47, 0.4], tone = (c) => mix3(c, sick, 0.35 * d);
  const horizon = mix3(sky.horizon, tone(k.horizon), k.w);
  const out = {
    ...sky, zenith: mix3(sky.zenith, tone(k.zenith), k.w), horizon, ambient: mix3(sky.ambient, tone(k.ambient), k.w),
    fog: horizon.map((v) => v * 0.8), stars: sky.stars * lerp(1, k.stars, k.w) * (1 - k.w * 0.9), cloud: lerp(sky.cloud ?? 0.5, Math.max(sky.cloud ?? 0.5, k.cloud + 0.35), k.w),
  };
  const hl = Math.hypot(moon.dir[0], moon.dir[2]) || 1, hx = -moon.dir[0] / hl, hz = -moon.dir[2] / hl;
  const el = (Math.max(sunElevationDeg(tick), SUN_MIN_DEG) * Math.PI) / 180, ce = Math.cos(el), se = Math.sin(el);
  const dir = mix3(moon.dir, [hx * ce, se, hz * ce], k.w), n = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const sunColor = k.sun.map((v) => v * 0.55);
  const lit = {
    dir: dir.map((v) => v / n), size: lerp(moon.size, SUN_SIZE, k.w), glow: lerp(moon.glow ?? 1, 1, k.w),
    color: mix3(moon.color.map((v) => v * (1 - k.w)), sunColor.map((v) => v * k.w), 0.5).map((v) => v * 2),
  };
  return { sky: out, moon: lit, sunWeight: k.w, fogScale: k.fogScale, lampGain: lampGain(tick), w: k.w };
}
