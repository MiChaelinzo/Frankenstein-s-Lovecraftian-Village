// Cinematic capture mode: a pure, deterministic timeline. No clocks, no randomness, no DOM.
// The same durations and elapsed time always give the same beat and camera, so a take can be repeated exactly.
export const TAIL_MS = 2000;
// Camera waypoints as fractions of the canvas (pan x, pan y) and a zoom factor. Cycled by beat index.
export const WAYPOINTS = [
  { x: -0.10, y: -0.04, zoom: 1.18 },
  { x: 0.10, y: -0.02, zoom: 1.12 },
  { x: 0.08, y: 0.07, zoom: 1.22 },
  { x: -0.08, y: 0.06, zoom: 1.10 },
  { x: 0, y: 0, zoom: 1.0 },
];
const STILL = Object.freeze({ x: 0, y: 0, zoom: 1 });
const smooth = (u) => u * u * (3 - 2 * u);
const finite = (n) => Number.isFinite(n) && n > 0;

export const waypoint = (i) => WAYPOINTS[((Math.floor(i) % WAYPOINTS.length) + WAYPOINTS.length) % WAYPOINTS.length];

/** Total length of a take in ms. */
export const totalMs = (durations) => durations.reduce((a, d) => a + (finite(d) ? d : 0), 0) + TAIL_MS;

/**
 * Where is the take at elapsed ms t?
 * durations: per-beat ms. Returns { done, beat, beatT (0..1), cam: { x, y, zoom } }.
 * With reduced motion the camera never moves (beats still advance on their fixed timings).
 */
export function cinematicFrame(t, durations, reduced = false) {
  const ds = Array.isArray(durations) ? durations.map((d) => (finite(d) ? d : 0)) : [];
  if (!ds.length) return { done: true, beat: 0, beatT: 0, cam: STILL };
  const time = Number.isFinite(t) && t > 0 ? t : 0;
  const sum = ds.reduce((a, d) => a + d, 0);
  if (time >= sum + TAIL_MS) return { done: true, beat: ds.length - 1, beatT: 1, cam: reduced ? STILL : { ...waypoint(ds.length) } };
  let beat = ds.length - 1, local = 1, acc = 0;
  if (time < sum) {
    for (let i = 0; i < ds.length; i++) {
      if (time < acc + ds[i]) { beat = i; local = ds[i] ? (time - acc) / ds[i] : 1; break; }
      acc += ds[i];
    }
  }
  if (reduced) return { done: false, beat, beatT: local, cam: STILL };
  const a = waypoint(beat), b = waypoint(beat + 1), u = smooth(Math.max(0, Math.min(1, local)));
  return { done: false, beat, beatT: local, cam: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, zoom: a.zoom + (b.zoom - a.zoom) * u } };
}

/** Canvas transform for a camera: scale about the centre, then pan by fractions of the canvas size. */
export function cameraTransform(cam, w, h) {
  const z = cam && cam.zoom > 0 ? cam.zoom : 1;
  return { scale: z, tx: (w / 2) * (1 - z) + (cam ? cam.x : 0) * w, ty: (h / 2) * (1 - z) + (cam ? cam.y : 0) * h };
}

export const cinematicWanted = (search, hash) => /(^|[?#&])cinematic=1(?![0-9A-Za-z])/.test(`${search || ''}${hash || ''}`);

// ---------- 3D fly-through (?view=3d&cinematic=1) ----------
// The same beats drive a camera that circles the village. Everything is metres and radians in the 3D view's convention
// (camera looks down -Z at yaw 0, so yaw = atan2(dx, -dz)). Pure and deterministic: no clocks, no randomness beyond the seed.
export const FLY_ANGLE_STEP = 0.95; // radians travelled around the village per beat
const FLY_MIN_HEIGHT = 4.6;         // above the 3 m houses so the camera never clips a roof

/** The camera stop for beat index i (any integer). Seed picks the starting bearing so different villages open differently. */
export function flyStop(i, { gridW, gridD, seed = 0, cell = 4 }) {
  const cx = (gridW * cell) / 2, cz = (gridD * cell) / 2, half = Math.hypot(cx, cz);
  const start = ((Math.imul(seed | 0, 2654435761) >>> 0) % 6283) / 1000;
  const angle = start + i * FLY_ANGLE_STEP;
  const radius = half * (i % 2 === 0 ? 0.78 : 0.58);
  const height = FLY_MIN_HEIGHT + 1.6 + Math.sin(i * 1.7) * 1.4;
  return { pos: [cx + Math.sin(angle) * radius, height, cz - Math.cos(angle) * radius], look: [cx + Math.sin(i * 2.1) * 6, 1.6, cz + Math.cos(i * 2.3) * 6] };
}

const lerpV = (a, b, u) => a.map((v, k) => v + (b[k] - v) * u);
const aim = (pos, look) => {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  return { yaw: Math.atan2(dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
};

/**
 * Camera { x, y, z, yaw, pitch } for elapsed ms t and the beat durations. Moves between stops beat by beat (eased), so a
 * beat change in the story is a visible change of viewpoint. Reduced motion: one fixed still viewpoint, never moving.
 */
export function flythroughCamera(t, durations, world, reduced = false) {
  const f = cinematicFrame(t, durations, reduced);
  const a = flyStop(reduced ? 0 : f.beat, world), b = flyStop(reduced ? 0 : f.beat + 1, world);
  const u = reduced ? 0 : f.done ? 1 : smooth(Math.max(0, Math.min(1, f.beatT)));
  const pos = lerpV(a.pos, b.pos, u), look = lerpV(a.look, b.look, u), { yaw, pitch } = aim(pos, look);
  return { x: pos[0], y: pos[1], z: pos[2], yaw, pitch };
}
