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
