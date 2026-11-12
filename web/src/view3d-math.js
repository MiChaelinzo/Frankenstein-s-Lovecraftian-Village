// Pure math for the opt-in first-person 3D view (?view=3d). No DOM, no WebGL, no randomness beyond SeededRandom.
// Camera, picking, collision, fog, sky, moon, lantern lights, coast and particle layout all live here so node tests can pin them.
// Gameplay rules (reach, cooldown, sanity cost) are NOT here: the view asks InteractionRules in core.js.
import { SeededRandom, tierFor } from './core.js';
import { queryParam } from './util.js';

export const LAMP_PICK_RADIUS = 0.45; // metres; small enough that a level gaze at a door (eye 1.6 m, lantern 2.2 m) still picks the door
export const CELL = 4;            // metres per layout cell
export const EYE_HEIGHT = 1.6;
export const BODY_RADIUS = 0.35;
export const WALK_SPEED = 3.2;    // metres per second
export const TURN_SPEED = 1.9;    // radians per second (stick and arrow keys)
export const MOUSE_SENSITIVITY = 0.0022;
export const FOV_Y = 1.12;        // about 64 degrees
export const NEAR = 0.1;
export const FAR = 400;
export const MAX_PITCH = 1.25;
export const MAX_LIGHTS = 8;
export const MAX_PIXELS = 1280 * 720; // same ceiling the static budget test enforces for the 2D canvas

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ---------- view parameters from the URL ----------

/** True only for an explicit view=3d in the query or hash. 2D stays the default. */
export const view3dWanted = (search, hash) => (queryParam(hash, 'view') ?? queryParam(search, 'view')) === '3d';

/** "x,z,yawDeg,pitchDeg" in metres and degrees, or null. Lets screenshots and shared links pick a viewpoint. */
export function parseCamParam(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split(',').map(Number);
  if (parts.length < 3 || parts.length > 4 || !parts.every(Number.isFinite)) return null;
  return { x: parts[0], z: parts[1], yaw: (parts[2] * Math.PI) / 180, pitch: clamp(((parts[3] || 0) * Math.PI) / 180, -MAX_PITCH, MAX_PITCH) };
}

// ---------- matrices (column-major, right handed, +Y up, camera looks down -Z at yaw 0) ----------

export function forwardVector(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
export const rightVector = (yaw) => [Math.cos(yaw), 0, Math.sin(yaw)];

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function cameraBasis(cam) {
  const f = forwardVector(cam.yaw, cam.pitch), r = rightVector(cam.yaw), u = cross(r, f);
  return { f, r, u };
}

export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function viewMatrix(cam) {
  const { f, r, u } = cameraBasis(cam), p = [cam.x, cam.y, cam.z];
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, p), -dot(u, p), dot(f, p), 1]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}
export const viewProjection = (cam, aspect) => multiply(perspective(FOV_Y, aspect, NEAR, FAR), viewMatrix(cam));

/** Projects a world point to normalised device coordinates, or null when it is behind the camera. */
export function projectPoint(vp, p) {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return w <= 0 ? null : [x / w, y / w];
}

// ---------- world layout ----------

/** Footprint boxes in metres for collision and picking. heights[i] is the building height, default 3 m. */
export function worldBoxes(layout, heights = [], cell = CELL) {
  return layout.map((p, i) => ({
    minX: p.x * cell, maxX: (p.x + p.sizeX) * cell, minZ: p.z * cell, maxZ: (p.z + p.sizeZ) * cell, height: heights[i] || 3,
  }));
}
export const worldBounds = (gridW, gridD, cell = CELL, margin = 2) => ({ minX: -margin, maxX: gridW * cell + margin, minZ: -margin, maxZ: gridD * cell + margin });

/** Circle against axis aligned boxes: push the position out of every box it overlaps. */
export function resolveCollisions(x, z, radius, boxes) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = clamp(x, b.minX, b.maxX), cz = clamp(z, b.minZ, b.maxZ);
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-9) { const d = Math.sqrt(d2), k = (radius - d) / d; x += dx * k; z += dz * k; continue; }
      // centre is inside the box: leave through the nearest face
      const exits = [[x - b.minX, -1, 0], [b.maxX - x, 1, 0], [z - b.minZ, 0, -1], [b.maxZ - z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
      x += exits[1] * (exits[0] + radius); z += exits[2] * (exits[0] + radius);
    }
  }
  return { x, z };
}

/** First free spot scanning rows inward from the south edge, columns outward from the middle. Deterministic for a given layout. */
export function spawnPoint(layout, gridW, gridD, cell = CELL) {
  const boxes = worldBoxes(layout, [], cell), cx = Math.floor(gridW / 2);
  for (let gz = gridD - 1; gz >= 0; gz--) {
    for (let step = 0; step < gridW; step++) {
      const gx = cx + (step % 2 ? (step + 1) / 2 : -step / 2);
      if (gx < 0 || gx >= gridW) continue;
      const x = (gx + 0.5) * cell, z = (gz + 0.5) * cell;
      if (!boxes.some((b) => x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1)) return { x, z };
    }
  }
  return { x: (gridW * cell) / 2, z: gridD * cell + 1 };
}

/**
 * One walking step. input = { forward, strafe, turn, look } each -1..1 (look is a pitch rate), dt seconds.
 * mouse = { dx, dy } pixel deltas applied once. Returns a new camera; the old one is not mutated.
 */
export function stepCamera(cam, input, dt, boxes, bounds, mouse = null) {
  const d = clamp(dt, 0, 0.1);
  let yaw = cam.yaw + (input.turn || 0) * TURN_SPEED * d, pitch = cam.pitch + (input.look || 0) * TURN_SPEED * d;
  if (mouse) { yaw += mouse.dx * MOUSE_SENSITIVITY; pitch -= mouse.dy * MOUSE_SENSITIVITY; }
  pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH);
  let mx = (input.forward || 0) * Math.sin(yaw) + (input.strafe || 0) * Math.cos(yaw);
  let mz = -(input.forward || 0) * Math.cos(yaw) + (input.strafe || 0) * Math.sin(yaw);
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  let x = cam.x + mx * WALK_SPEED * d, z = cam.z + mz * WALK_SPEED * d;
  x = clamp(x, bounds.minX, bounds.maxX); z = clamp(z, bounds.minZ, bounds.maxZ);
  ({ x, z } = resolveCollisions(x, z, BODY_RADIUS, boxes));
  return { x, y: cam.y, z, yaw, pitch };
}

/** Subtle head bob in metres. Zero when reduced motion is on or the player stands still. */
export const headBob = (timeSec, speedFactor, reduced) => (reduced ? 0 : Math.sin(timeSec * 7.5) * 0.035 * clamp(speedFactor, 0, 1));

// ---------- picking ----------

/** Ray against a box (slab method). Returns the entry distance or null. */
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity;
  const lo = [b.minX, 0, b.minZ], hi = [b.maxX, b.height, b.maxZ];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return null; continue; }
    let a = (lo[k] - o[k]) / d[k], c = (hi[k] - o[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

/** Nearest box hit along the ray within maxDistance: { index, distance } or null. */
export function pickBox(origin, dir, boxes, maxDistance = FAR) {
  let best = null;
  boxes.forEach((b, index) => {
    const t = rayBox(origin, dir, b);
    if (t !== null && t <= maxDistance && (!best || t < best.distance)) best = { index, distance: t };
  });
  return best;
}

/**
 * Nearest lamp whose pick sphere the ray crosses: { index, distance } or null. Lamps are { pos: [x, y, z] } in metres.
 * Shares the ray with pickBox so lamps and buildings are picked from one view ray, not a second picker.
 */
export function pickLamp(origin, dir, lamps, maxDistance = FAR, radius = LAMP_PICK_RADIUS) {
  let best = null;
  lamps.forEach((l, index) => {
    const c = [l.pos[0] - origin[0], l.pos[1] - origin[1], l.pos[2] - origin[2]];
    const along = c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2];
    if (along < 0) return;
    const off2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - along * along;
    if (off2 > radius * radius) return;
    const distance = Math.max(0, along - Math.sqrt(radius * radius - off2));
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { index, distance };
  });
  return best;
}

/** View ray for a point on screen (ndc -1..1, y up). Used for taps and clicks when the pointer is not locked. */
export function screenRay(cam, ndcX, ndcY, aspect) {
  const { f, r, u } = cameraBasis(cam), ty = Math.tan(FOV_Y / 2), tx = ty * aspect;
  const d = [0, 1, 2].map((k) => f[k] + r[k] * ndcX * tx + u[k] * ndcY * ty);
  const l = Math.hypot(d[0], d[1], d[2]);
  return d.map((v) => v / l);
}

// ---------- atmosphere ----------

const WEATHER_FOG = { clear: 0.011, rain: 0.017, fog: 0.03 };
/** Exponential squared fog density per metre. Dread thickens it; a slow 11 s breath is added unless motion is reduced. */
export function fogDensity({ dread = 0, weather = 'clear', timeSec = 0, reduced = false } = {}) {
  const base = (WEATHER_FOG[weather] ?? WEATHER_FOG.clear) + clamp(dread, 0, 1) * 0.02;
  const breath = reduced ? 0 : Math.sin((timeSec * Math.PI * 2) / 11) * 0.06 * clamp(dread, 0, 1);
  return base * (1 + breath);
}
export const fogFactor = (distance, density) => 1 - Math.exp(-Math.pow(Math.max(0, distance) * density, 2));

const SKIES = {
  dusk: { zenith: [0.09, 0.13, 0.3], horizon: [0.9, 0.52, 0.4], ambient: [0.26, 0.27, 0.38], stars: 0.35 },
  night: { zenith: [0.02, 0.05, 0.15], horizon: [0.2, 0.34, 0.5], ambient: [0.15, 0.21, 0.32], stars: 0.95 },
  witching: { zenith: [0.025, 0.02, 0.1], horizon: [0.18, 0.15, 0.32], ambient: [0.12, 0.13, 0.25], stars: 1 },
};
const WEATHER_SKY = { clear: { grey: 0, cloud: 0.15, stars: 1 }, rain: { grey: 0.35, cloud: 0.85, stars: 0.1 }, fog: { grey: 0.45, cloud: 0.6, stars: 0.2 } };

/** Sky and ambient colours (0..1 rgb) for a campaign night. The fog colour matches the horizon so the world fades into the sky. */
export function skyColors(sky, weather, dread = 0) {
  const s = SKIES[sky] || SKIES.night, w = WEATHER_SKY[weather] || WEATHER_SKY.clear, d = clamp(dread, 0, 1);
  const grey = (c) => mixc(c, [(c[0] + c[1] + c[2]) / 3, (c[0] + c[1] + c[2]) / 3, (c[0] + c[1] + c[2]) / 3], w.grey);
  const sick = [0.2, 0.16, 0.12];
  const zenith = mixc(grey(s.zenith), sick.map((v) => v * 0.4), d * 0.35);
  const horizon = mixc(grey(s.horizon), sick, d * 0.3);
  const ambient = mixc(grey(s.ambient), [0.2, 0.16, 0.18], d * 0.25);
  return { zenith, horizon, fog: horizon.map((v) => v * 0.85), ambient, stars: s.stars * w.stars * (1 - d * 0.3), cloud: w.cloud };
}

/** Moon direction (unit vector) and light colour. The same seed and night always give the same moon. */
export function moonParams(seed, nightNumber, sky, weather) {
  const rng = new SeededRandom(((seed | 0) * 31 + (nightNumber | 0) * 7919 + 17) | 0);
  const azimuth = (rng.next(360) * Math.PI) / 180, elevation = ((sky === 'dusk' ? 14 : 28) + rng.next(25)) * (Math.PI / 180);
  const dir = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)];
  const veil = weather === 'clear' ? 1 : weather === 'fog' ? 0.5 : 0.3;
  return { dir, color: [0.34 * veil, 0.4 * veil, 0.55 * veil], size: 0.05 + rng.next(20) / 1000, glow: veil };
}

// ---------- lanterns ----------

/** Warm light colour that drifts toward a sickly red as dread rises. */
export const lanternColor = (dread) => mixc([1, 0.72, 0.4], [0.85, 0.28, 0.2], clamp(dread, 0, 1));

/** True when a house shows a lit window: its seeded roll is high enough and its detail has not decayed away. */
export const windowLit = (piece) => !!piece.vis && piece.vis.lit > 0.35 && (piece.detail ?? 3) >= 2;

/**
 * Lantern lights: one beside the door of every lit house (the front is the +z side, matching the 2D door)
 * and one lamp post per lit house at the street corner. Returns [{pos, radius, phase, post}] with metres.
 */
export function lanternLights(layout, cell = CELL) {
  const out = [];
  for (const p of layout) {
    if (p.id !== 'house_a' && p.id !== 'house_b') continue;
    if (!windowLit(p)) continue;
    const x = (p.x + p.sizeX / 2) * cell, z = (p.z + p.sizeZ) * cell;
    out.push({ pos: [x, 2.2, z + 0.5], radius: 9, phase: p.vis.phase || 0, post: false });
    if (p.vis.lit2 > 0.45) out.push({ pos: [(p.x + p.sizeX) * cell + 0.7, 3.1, z + 0.7], radius: 11, phase: (p.vis.phase || 0) + 3, post: true });
  }
  return out;
}

/**
 * Whether a lantern light is lit in the vigil: 'lit' or 'unlit' when a vigil lamp stands at the same spot, 'free' when no lamp
 * claims it (free roam, or a lantern that is not a vigil target). lamps are [{pos, lit}] from getScene().
 */
export function lanternState(light, lamps) {
  const m = (lamps || []).find((l) => Math.abs(l.pos[0] - light.pos[0]) < 0.05 && Math.abs(l.pos[1] - light.pos[1]) < 0.05 && Math.abs(l.pos[2] - light.pos[2]) < 0.05);
  return !m ? 'free' : m.lit ? 'lit' : 'unlit';
}

export const COLD_LANTERN = [0.3, 0.5, 0.62];
/**
 * Pool of light a lantern throws: { color, gain, halo }. Lit and free lanterns are warm (tinted by lanternColor(dread)) and bright;
 * an unlit vigil lantern is a dim, cold glint so the player can see which ones still need a candle.
 */
export function lanternPool(state, dread) {
  if (state === 'unlit') return { color: COLD_LANTERN, gain: 0.16, halo: 0.3 };
  return { color: lanternColor(dread), gain: 2.1, halo: 1 };
}

/** Cool fill light: the sky ambient lifted and pushed toward blue so shadows read teal against the warm pools. Moon light is boosted the same way. */
export const coldFill = (ambient) => [ambient[0] * 1.15, ambient[1] * 1.45, ambient[2] * 1.75].map((v) => clamp(v, 0, 1));
export const moonBoost = (color) => color.map((v) => v * 1.9);

/**
 * Fake ambient occlusion on the ground: nested darker squares around each building footprint (largest and lightest first, drawn lower),
 * plus two small ones under every lamp post. Returns [{x0, z0, x1, z1, y, shade}] in metres; shade multiplies the ground colour.
 * Static geometry, no shadow maps.
 */
export function contactRings(layout, lights = [], cell = CELL) {
  const out = [], steps = [[1.4, 0.82], [0.8, 0.66], [0.3, 0.5]];
  steps.forEach(([grow, shade], k) => {
    for (const p of layout) {
      if (!p.sizeX || !p.sizeZ) continue;
      out.push({ x0: p.x * cell - grow, z0: p.z * cell - grow, x1: (p.x + p.sizeX) * cell + grow, z1: (p.z + p.sizeZ) * cell + grow, y: 0.03 + k * 0.01, shade });
    }
  });
  for (const l of lights) if (l.post) [[0.9, 0.78], [0.4, 0.55]].forEach(([r, shade], k) => out.push({ x0: l.pos[0] - r, z0: l.pos[2] - r, x1: l.pos[0] + r, z1: l.pos[2] + r, y: 0.06 + k * 0.01, shade }));
  return out;
}

/** The lights closest to the camera, at most MAX_LIGHTS - 1 (one slot is the carried lantern). */
export function nearestLights(lights, cam, max = MAX_LIGHTS - 1) {
  return lights.map((l) => ({ l, d: Math.hypot(l.pos[0] - cam.x, l.pos[2] - cam.z) })).filter((e) => e.d < e.l.radius + 40)
    .sort((a, b) => a.d - b.d || a.l.pos[0] - b.l.pos[0] || a.l.pos[2] - b.l.pos[2]).slice(0, max).map((e) => e.l);
}

/**
 * Flicker multiplier 0.55..1.1. Each light has its own rhythm; as dread rises the rhythms drift together into one
 * slow breath, so at the Abyss the whole village pulses as if it were a single thing. Reduced motion: steady 1.
 */
export function lanternFlicker(phase, timeSec, dread, reduced) {
  if (reduced) return 1;
  const d = clamp(dread, 0, 1), own = Math.sin(timeSec * 5.3 + phase * 1.7) * 0.5 + Math.sin(timeSec * 11.7 + phase * 3.1) * 0.5;
  const shared = Math.sin((timeSec * Math.PI * 2) / 6);
  const mix = tierFor(d) >= 2 ? d : 0;
  return 0.85 + 0.2 * (own * (1 - mix) + shared * mix) * (0.5 + 0.5 * d + 0.3);
}

/** Light carried by the player: weaker as dread rises, never fully dark. */
export const carriedLantern = (dread) => ({ radius: 11 - 4 * clamp(dread, 0, 1), color: lanternColor(dread) });

// ---------- coast, sea and particles ----------

/** Which edge the sea lies against: 0 west, 1 east, 2 north, 3 south (south is where the player spawns, so it is never the sea). */
export const coastSide = (seed) => new SeededRandom(((seed | 0) ^ 0x2f6b) | 0).next(3);

/** Ground and sea rectangles in metres. The ground stops short of the coast edge; the sea reaches the far fog. */
export function terrainRects(gridW, gridD, seed, cell = CELL) {
  const w = gridW * cell, d = gridD * cell, pad = 40, shore = 6;
  const g = { minX: -pad, maxX: w + pad, minZ: -pad, maxZ: d + pad };
  const side = coastSide(seed);
  if (side === 0) g.minX = -shore; else if (side === 1) g.maxX = w + shore; else g.minZ = -shore;
  return { ground: g, sea: { minX: -FAR, maxX: w + FAR, minZ: -FAR, maxZ: d + FAR, y: -0.4 }, side };
}

/** Particle counts for the active weather. Reduced motion draws none: falling rain is motion. */
export function particleCounts({ weather, dread, reduced }) {
  if (reduced) return { rain: 0, mist: 0 };
  const d = clamp(dread, 0, 1);
  return { rain: weather === 'rain' ? 900 : 0, mist: weather === 'fog' ? 140 : Math.round(40 + 60 * d) };
}
/** Seeded 0..1 positions for a particle field of n points: flat [x, y, z, ...]. */
export function particleSeeds(seed, n, salt = 0) {
  const r = new SeededRandom(((seed | 0) ^ (salt * 0x9e37)) | 0), out = new Float32Array(n * 3);
  for (let i = 0; i < out.length; i++) out[i] = r.next(10000) / 10000;
  return out;
}

// ---------- post processing ----------

/** Below this render scale (the dynamic resolution governor's nextScale) the scene is drawn directly: the post pass costs fill rate. */
export const POST_MIN_QUALITY = 0.75;
/**
 * Parameters of the single fullscreen post pass. quality is the governor's render scale 0.5..1.
 * Ranges: vignette 0.30..0.60, grain 0.035..0.06 (amplitude), bloom 0.45 gain above a 0.7 luminance threshold, chroma 0..0.004 (uv offset).
 * Reduced motion: grain stays as a still texture (grainMotion false) and the chromatic shift is exactly 0.
 */
export function postParams({ dread = 0, reduced = false, quality = 1 } = {}) {
  const d = clamp(Number.isFinite(dread) ? dread : 0, 0, 1), q = clamp(Number.isFinite(quality) ? quality : 1, 0, 1);
  return {
    enabled: q >= POST_MIN_QUALITY, vignette: 0.3 + 0.3 * d, grain: 0.035 + 0.025 * d, grainMotion: !reduced,
    bloom: 0.45, bloomThreshold: 0.7, chroma: reduced ? 0 : 0.0006 + 0.0034 * d * d,
  };
}

// ---------- performance ----------

/** Backing store size: css size times device ratio times scale, capped at MAX_PIXELS. */
export function renderSize(cssW, cssH, dpr, scale, maxPixels = MAX_PIXELS) {
  let w = Math.max(1, cssW * dpr * scale), h = Math.max(1, cssH * dpr * scale);
  const over = (w * h) / maxPixels;
  if (over > 1) { w /= Math.sqrt(over); h /= Math.sqrt(over); }
  return { width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) };
}
/** Adaptive resolution from the average frame time (perf.js stats). Steps down above 26 ms, back up below 15 ms. */
export function nextScale(scale, avgMs, frames) {
  if (!frames || frames < 30) return scale;
  if (avgMs > 26) return Math.max(0.5, scale - 0.25);
  if (avgMs < 15 && scale < 1) return Math.min(1, scale + 0.25);
  return scale;
}

// ---------- atmosphere layers: haze per night, ground mist, lantern halos ----------

/** One haze tint per campaign night, cycled. Cold sea green, bruised violet, tallow amber, drowned blue, sick olive. */
export const NIGHT_HAZE = [[0.1, 0.3, 0.3], [0.3, 0.14, 0.34], [0.38, 0.28, 0.1], [0.1, 0.18, 0.4], [0.28, 0.32, 0.1]];
export const nightHaze = (nightNumber) => NIGHT_HAZE[(((Math.floor(nightNumber) || 1) - 1) % NIGHT_HAZE.length + NIGHT_HAZE.length) % NIGHT_HAZE.length];

/** skyColors with the night's haze mixed into the horizon and fog (a quarter, a little more at dread) so each night reads differently. */
export function hazedSky(sky, weather, dread, nightNumber) {
  const s = skyColors(sky, weather, dread), haze = nightHaze(nightNumber), k = 0.1 + 0.12 * clamp(dread, 0, 1);
  const horizon = mixc(s.horizon, haze, k);
  return { ...s, horizon, fog: horizon.map((v) => v * 0.85), haze };
}

/**
 * Two fog layers: the existing exponential squared distance fog, plus a ground mist that hugs the lowest metres and thins with height.
 * Returns { density, ground: per-metre density of the low layer, groundHeight: scale height in metres }. The mist breathes unless reduced.
 */
export function fogLayers({ dread = 0, weather = 'clear', timeSec = 0, reduced = false } = {}) {
  const density = fogDensity({ dread, weather, timeSec, reduced });
  const d = clamp(dread, 0, 1), breath = reduced ? 0 : Math.sin((timeSec * Math.PI * 2) / 17) * 0.15;
  const ground = (weather === 'fog' ? 0.05 : weather === 'rain' ? 0.032 : 0.02) * (1 + d * 0.6) * (1 + breath);
  return { density, ground, groundHeight: 2.2 + d * 1.4, drift: fogDrift(weather, reduced) };
}
/** Metres per second the low fog sheets slide across the water and lanes: slow, mostly with the wind. Exactly zero under reduced motion. */
export const fogDrift = (weather, reduced) => (reduced ? [0, 0] : weather === 'rain' ? [0.55, 0.3] : weather === 'fog' ? [0.35, 0.2] : [0.22, 0.12]);

/**
 * Sea look. ripple: normal slope amplitude; speed: ripple animation rate (0 under reduced motion, so the water is still);
 * fresnel: exponent toward the horizon; tint: the deep water colour, sickening with dread; moonGain and lanternGain scale the reflected highlights.
 */
export function seaParams({ dread = 0, weather = 'clear', reduced = false } = {}) {
  const d = clamp(Number.isFinite(dread) ? dread : 0, 0, 1);
  return {
    ripple: 0.07 + (weather === 'rain' ? 0.06 : 0) + 0.03 * d, speed: reduced ? 0 : 1, fresnel: 3,
    tint: mixc([0.02, 0.07, 0.11], [0.08, 0.05, 0.06], d), moonGain: 4.5, lanternGain: 1.1,
  };
}

export const FIREFLIES_PER_LIGHT = 10, MAX_FIREFLIES = 100, FIREFLY_FLOATS = 4;
/** Fireflies drift around warm lanterns at low dread; from the Uneasy tier up they turn to embers that rise and glow red. Reduced motion: none. */
export function fireflyStyle(dread, reduced) {
  const d = clamp(Number.isFinite(dread) ? dread : 0, 0, 1), embers = tierFor(d) >= 2;
  return embers ? { kind: 'ember', color: [1, 0.42, 0.16], rise: 1, size: 0.1 } : { kind: 'firefly', color: [0.75, 1, 0.45], rise: 0, size: 0.13 };
}
export const fireflyCount = ({ lights = 0, reduced = false } = {}) => (reduced ? 0 : Math.min(MAX_FIREFLIES, Math.max(0, Math.floor(lights)) * FIREFLIES_PER_LIGHT));
/** Seeded flat [x, y, z, phase, ...] around the given lights (radius 1.2..5 m, 0.4..3 m high). Same seed and lights give the same cloud. */
export function fireflySeeds(lights, seed, count) {
  const n = lights.length ? Math.max(0, Math.floor(count)) : 0, out = new Float32Array(n * FIREFLY_FLOATS), r = new SeededRandom(((seed | 0) ^ 0xf1f1) | 0);
  for (let i = 0; i < n; i++) {
    const l = lights[i % lights.length], a = (r.next(1000) / 1000) * Math.PI * 2, rad = 1.2 + (r.next(380) / 100);
    out.set([l.pos[0] + Math.cos(a) * rad, 0.4 + (r.next(260) / 100), l.pos[2] + Math.sin(a) * rad, r.next(1000) / 1000], i * FIREFLY_FLOATS);
  }
  return out;
}

/** Halo size in world metres. Lamp posts glow wider than door lanterns. */
export const haloSize = (light) => (light.post ? 3.4 : 2.4);
export const HALO_FLOATS = 5;
/** Billboard halo per lantern: flat [x, y, z, phase, size, ...]. Every light gets one; light.haloScale (default 1) shrinks the halo of an unlit lantern. */
export function haloSprites(lights) {
  const out = new Float32Array(lights.length * HALO_FLOATS);
  lights.forEach((l, i) => out.set([l.pos[0], l.pos[1], l.pos[2], l.phase || 0, haloSize(l) * (l.haloScale ?? 1)], i * HALO_FLOATS));
  return out;
}

// ---------- coast frame, docks, boats, cliffs and the church on the hill ----------

/**
 * The coast as a local frame so features are described along the shore (u) and out to sea (v >= 0) and placed on any side.
 * { side, axis: 'x'|'z', edge: world coordinate of the shoreline, dir: +1 or -1 toward the sea, lo/hi: shoreline extent along u }.
 */
export function coastFrame(gridW, gridD, seed, cell = CELL) {
  const side = coastSide(seed), shore = 6;
  if (side === 0) return { side, axis: 'x', edge: -shore, dir: -1, lo: 0, hi: gridD * cell };
  if (side === 1) return { side, axis: 'x', edge: gridW * cell + shore, dir: 1, lo: 0, hi: gridD * cell };
  return { side, axis: 'z', edge: -shore, dir: -1, lo: 0, hi: gridW * cell };
}
/** Local (u along shore, v out to sea) to world x and z. */
export const coastToWorld = (f, u, v) => (f.axis === 'x' ? { x: f.edge + f.dir * v, z: u } : { x: u, z: f.edge + f.dir * v });

/**
 * Seeded dock, boats and cliff rocks on the coast, all in local (u, v) metres. Always: one dock, two boats, two cliffs flanking the
 * shoreline. Same seed and grid give the same set, so the harbour is part of the village's identity.
 */
export function coastFeatures(gridW, gridD, seed, cell = CELL) {
  const f = coastFrame(gridW, gridD, seed, cell), rng = new SeededRandom(((seed | 0) ^ 0x51ed) | 0), span = f.hi - f.lo;
  const dockU = f.lo + span * (0.3 + rng.next(40) / 100), dockLen = 14 + rng.next(8);
  const dock = { u: dockU, length: dockLen, width: 2.4, deck: 0.45, posts: Math.floor(dockLen / 3) + 1 };
  const boats = [0, 1].map((i) => ({ u: dockU + (i ? 4.2 : -4.2) + (rng.next(10) - 5) / 10, v: 5 + rng.next(60) / 10 + i * 4, len: 3.4 + rng.next(20) / 10, wid: 1.4 + rng.next(6) / 10, tilt: i ? 1 : -1 }));
  const cliffs = [f.lo - 8, f.hi + 8].map((u, i) => ({
    u, v: -2 - rng.next(4), w: 9 + rng.next(6), d: 10 + rng.next(6), h: 7 + rng.next(6), step: i ? 1 : -1,
  }));
  return { frame: f, dock, boats, cliffs };
}

export const DOCK_SEGMENT = 4;       // metres of dock covered by one dock mesh
export const FENCE_SEGMENT = 3;      // metres of fence covered by one fence mesh
export const LAMP_KINDS = ['lamp', 'lamp_tall', 'lamp_double'];

/**
 * Where the GLB props go along the coast, in local (u, v) metres: dock segments end to end out to sea, and two short fence runs on the
 * land side flanking the dock. Seeded through coastFeatures, so a harbour keeps its look. Fences stay inside the shoreline extent.
 */
export function coastProps(gridW, gridD, seed, cell = CELL) {
  const { frame: f, dock } = coastFeatures(gridW, gridD, seed, cell), segments = Math.ceil((dock.length + 1) / DOCK_SEGMENT);
  const dockSegments = Array.from({ length: segments }, (_, i) => ({ u: dock.u, v: -1 + DOCK_SEGMENT / 2 + i * DOCK_SEGMENT }));
  const fences = [];
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const u = dock.u + side * (dock.width / 2 + 3 + k * FENCE_SEGMENT);
    if (u >= f.lo && u <= f.hi) fences.push({ u, v: -2 });
  }
  return { dockSegments, fences };
}

/** Which lamp post mesh stands at a lit house: the three variants by the light's seeded phase. */
export const lampKind = (light) => LAMP_KINDS[Math.abs(Math.floor((light.phase || 0) * 3)) % LAMP_KINDS.length];

/** Where the church on the hill stands: opposite the sea (east or west for a north coast), beyond the village edge. Metres. */
export function churchSite(gridW, gridD, seed, cell = CELL) {
  const side = coastSide(seed), w = gridW * cell, d = gridD * cell;
  const east = side === 0 ? true : side === 1 ? false : (((seed | 0) ^ 0x3c3c) & 1) === 0;
  return { x: east ? w + 30 : -30, z: d * 0.35, faceX: east ? -1 : 1, hill: 9 };
}

// ---------- omens in the 3D world (decisions come from omenTargets in scene.js, same as the 2D canvas) ----------

/**
 * Seeded direction of the eye in the sky: unit vector. When the grid size is given the eye hangs over the sea (within about 20 degrees
 * of the direction the coast faces, 19 to 29 degrees up), so one view of the water holds the eye and the tentacles together.
 * Without a grid it keeps the older free direction (any bearing).
 */
export function eyeParams(seed, nightNumber, gridW = 0, gridD = 0) {
  const rng = new SeededRandom(((seed | 0) * 17 + (nightNumber | 0) * 104729 + 5) | 0);
  let az = (rng.next(360) * Math.PI) / 180, el = 0.38 + rng.next(25) / 100;
  if (gridW > 0 && gridD > 0) {
    const f = coastFrame(gridW, gridD, seed), sea = f.axis === 'x' ? (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (f.dir > 0 ? Math.PI : 0);
    az = sea + ((az / (Math.PI * 2)) - 0.5) * 0.7; el = 0.33 + (el - 0.38) * 0.8;
  }
  return { dir: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)], width: 0.26, height: 0.085 };
}

/** Three tentacle roots standing in the sea off the coast: world x, z, phase, lean (radians). Seeded. */
export function tentacleBases(gridW, gridD, seed, cell = CELL) {
  const f = coastFrame(gridW, gridD, seed, cell), rng = new SeededRandom(((seed | 0) ^ 0x7e57) | 0), span = f.hi - f.lo;
  return [0, 1, 2].map((i) => {
    const p = coastToWorld(f, f.lo + span * (0.2 + 0.3 * i) + rng.next(40) / 10, 16 + i * 5 + rng.next(30) / 10);
    return { x: p.x, z: p.z, phase: 0.9 + i * 0.6, lean: (rng.next(100) / 100 - 0.5) * 0.8 };
  });
}

// ---------- frame budget (counts, not timings: those depend on the GPU) ----------

// Round 17: drawCalls 14 -> 12 is a tighter ceiling, not a loosening: the worst frame is now sky + 5 triangle buffers + rain or mist + halos
// + fireflies + the one post pass = 11. points grew 1300 -> 1400 for the (at most 100) fireflies; rain and fireflies share the budget.
export const FRAME_BUDGET = Object.freeze({ drawCalls: 12, triangles: 60000, points: 1400, lights: MAX_LIGHTS, halos: 120 });

/** Per-frame work implied by the buffers: draw calls, triangles, points, lights and halos. Compared against FRAME_BUDGET in tests. */
export function frameCost({ vertices = {}, rain = 0, mist = 0, halos = 0, lights = 0, fireflies = 0, post = false }) {
  const tri = ['building', 'ground', 'sea', 'coast', 'tentacle'];
  const drawCalls = 1 + tri.filter((k) => vertices[k] > 0).length + (rain ? 1 : 0) + (mist ? 1 : 0) + (halos ? 1 : 0) + (fireflies ? 1 : 0) + (post ? 1 : 0);
  const triangles = tri.reduce((a, k) => a + Math.floor((vertices[k] || 0) / 3), 0);
  return { drawCalls, triangles, points: rain + mist + halos + fireflies, lights: Math.min(lights, MAX_LIGHTS), halos };
}

// ---------- omen framing: a fly-through viewpoint that keeps the eye and the tentacles inside the frame ----------

const TENTACLE_HEIGHT = 13;      // metres at full growth, matches buildTentacles in view3d.js
const FRAME_MARGIN = 0.88;       // every omen point must land within this fraction of the half screen
const OMEN_CAMERA_HEIGHT = 5;    // above the 3 m roofs
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** World points that must stay on screen: the tips and waterline of each risen tentacle, and the rim of the open eye (distant, so as directions). */
export function omenPoints({ gridW, gridD, seed, nightNumber, grow = 1, eyeOpen = 1 }) {
  const bases = tentacleBases(gridW, gridD, seed), pts = [];
  bases.forEach((b, i) => {
    const g = clamp(grow * 1.4 - i * 0.25, 0, 1);
    if (g <= 0) return;
    const reach = 5 * Math.abs(b.lean) + 3;
    pts.push({ p: [b.x, 0, b.z] }, { p: [b.x + reach, TENTACLE_HEIGHT * g, b.z] }, { p: [b.x - reach, TENTACLE_HEIGHT * g, b.z] });
  });
  if (eyeOpen > 0.5) {
    const e = eyeParams(seed, nightNumber, gridW, gridD), az = Math.atan2(e.dir[0], -e.dir[2]), el = Math.asin(e.dir[1]);
    for (const [da, de] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) pts.push({ dir: [az + da * e.width * 1.15, el + de * e.height * 1.6] });
  }
  return pts;
}

/**
 * Camera { x, y, z, yaw, pitch, fits } that looks out to sea with every omen point inside the frame. It stands inland of the tentacles
 * and backs away in 6 m steps until the view fits (at most 14 steps). Deterministic: same world and omen strength give the same camera.
 * `fits` is false only if even the furthest stand could not hold the points.
 */
export function omenFraming({ gridW, gridD, seed, nightNumber, grow = 1, eyeOpen = 1, aspect = 16 / 9 }) {
  const pts = omenPoints({ gridW, gridD, seed, nightNumber, grow, eyeOpen });
  const f = coastFrame(gridW, gridD, seed), sea = f.axis === 'x' ? [f.dir, 0] : [0, f.dir], heading = Math.atan2(sea[0], -sea[1]);
  const bases = tentacleBases(gridW, gridD, seed), cx = bases.reduce((a, b) => a + b.x, 0) / bases.length, cz = bases.reduce((a, b) => a + b.z, 0) / bases.length;
  let cam = null;
  for (let step = 0; step < 15; step++) {
    const back = 24 + step * 6, x = cx - sea[0] * back, z = cz - sea[1] * back;
    const ang = pts.map((q) => {
      if (q.dir) return [q.dir[0], q.dir[1]];
      const dx = q.p[0] - x, dz = q.p[2] - z;
      return [Math.atan2(dx, -dz), Math.atan2(q.p[1] - OMEN_CAMERA_HEIGHT, Math.hypot(dx, dz))];
    }).map(([a, e]) => [wrapPi(a - heading), e]);
    const yawMid = (Math.min(...ang.map((a) => a[0])) + Math.max(...ang.map((a) => a[0]))) / 2;
    const pitchMid = (Math.min(...ang.map((a) => a[1])) + Math.max(...ang.map((a) => a[1]))) / 2;
    cam = { x, y: OMEN_CAMERA_HEIGHT, z, yaw: heading + yawMid, pitch: clamp(pitchMid, -MAX_PITCH, MAX_PITCH), fits: false };
    const vp = viewProjection(cam, aspect);
    cam.fits = pts.every((q) => {
      const w = q.dir ? [cam.x + Math.sin(q.dir[0]) * Math.cos(q.dir[1]) * 300, OMEN_CAMERA_HEIGHT + Math.sin(q.dir[1]) * 300, cam.z - Math.cos(q.dir[0]) * Math.cos(q.dir[1]) * 300] : q.p;
      const n = projectPoint(vp, w);
      return n && Math.abs(n[0]) <= FRAME_MARGIN && Math.abs(n[1]) <= FRAME_MARGIN;
    });
    if (cam.fits) break;
  }
  return cam;
}

/** Blend a fly-through camera toward the omen framing by w (0..1). Yaw takes the short way round. */
export function blendCamera(a, b, w) {
  const k = clamp(w, 0, 1), lerp = (p, q) => p + (q - p) * k;
  return { x: lerp(a.x, b.x), y: lerp(a.y, b.y), z: lerp(a.z, b.z), yaw: a.yaw + wrapPi(b.yaw - a.yaw) * k, pitch: lerp(a.pitch, b.pitch) };
}

/** Weight 0..1 for blending the fly-through toward omenFraming: 0 when not flying or the tentacles are down, 1 from tentacle 0.4 (Dire) up. */
export function omenBlendWeight(flying, tentacle) {
  if (!flying || !(tentacle > 0.01)) return 0;
  return clamp(tentacle / 0.4, 0, 1);
}
