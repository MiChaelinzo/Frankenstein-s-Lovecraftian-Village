// Birds of the village: gulls over the sea, crows on the roofs, and (at high dread only) a few huge silhouettes high in the fog.
// Everything here is pure and seeded: a flock is a plain object, stepping it uses fixed 1/20 s substeps, and the same seed, plan and total
// time always give the same birds. The triangles go into the renderer's existing dynamic triangle buffer (see view3d.js), so there is no
// second renderer and no extra draw call. Reduced motion: only the perched crows remain, in a fixed pose.
// The full creature system is a later round; these silhouettes are only a hint of it.
import { SeededRandom } from './core.js';
import { CELL, coastFrame, coastToWorld } from './view3d-math.js';

export const BOID_STEP = 1 / 20;
const MAX_STEPS_PER_CALL = 600;
const NEIGHBOUR_RADIUS = 9, SEPARATION_RADIUS = 2.6;
const WEIGHTS = Object.freeze({ separation: 1.7, alignment: 0.6, cohesion: 0.45, orbit: 0.95, altitude: 1.1 });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const GULL_COLOR = [0.62, 0.64, 0.68], CROW_COLOR = [0.025, 0.025, 0.035], SILHOUETTE_COLOR = [0.01, 0.01, 0.02];
export const KINDS = Object.freeze({
  gull: { span: 2.3, speed: 5.5, flapHz: 2.6, color: GULL_COLOR },
  crow: { span: 1.4, speed: 6.5, flapHz: 4.5, color: CROW_COLOR },
  silhouette: { span: 7, speed: 3.5, flapHz: 0.45, color: SILHOUETTE_COLOR },
});

/** How many of each bird to draw. Gulls shelter in a storm and thin out in fog; crows come off the roofs to circle the church at high dread; silhouettes need dread of 0.7 and up. */
export function birdCounts({ weather = 'clear', dread = 0, reduced = false, perches = 0 } = {}) {
  const d = clamp(Number.isFinite(dread) ? dread : 0, 0, 1);
  const perched = Math.min(perches, 6);
  if (reduced) return { gulls: 0, perched, circling: 0, silhouettes: 0 };
  const gulls = { storm: 0, fog: 3, rain: 4, drizzle: 6, mist: 6 }[weather] ?? 9;
  return { gulls, perched: d >= 0.6 ? Math.max(0, perched - 3) : perched, circling: d >= 0.6 ? 5 : 0, silhouettes: d >= 0.7 ? 1 + Math.floor((d - 0.7) / 0.15) : 0 };
}

/**
 * A flock of `count` birds orbiting `center` ([x, z]) at `radius` metres and `height` metres up. Birds start on a seeded ring heading along it.
 * Returns { kind, birds: [{ x, y, z, vx, vy, vz, phase }], center, radius, height, time, acc }.
 */
export function createFlock({ seed, salt = 0, kind = 'gull', count, center, radius, height }) {
  const rng = new SeededRandom(((seed | 0) ^ Math.imul(salt | 0, 0x9e3779b1) ^ 0x6b1d5) | 0), spec = KINDS[kind], birds = [];
  const a0 = (rng.next(360) * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a = a0 + (rng.next(100) / 100 - 0.5) * 0.9, r = radius * (0.85 + rng.next(30) / 100);
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r, y = height + (rng.next(100) / 100 - 0.5) * 4;
    birds.push({ x, y, z, vx: -Math.sin(a) * spec.speed, vy: 0, vz: Math.cos(a) * spec.speed, phase: rng.next(628) / 100 });
  }
  return { kind, birds, center: [center[0], center[1]], radius, height, time: 0, acc: 0 };
}

/** One fixed step of separation, alignment, cohesion, an orbit around the centre and a pull toward the flock altitude. Mutates the flock. */
export function stepFlock(flock, dt = BOID_STEP) {
  const spec = KINDS[flock.kind], n = flock.birds.length, next = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = flock.birds[i];
    let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, near = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = flock.birds[j], dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > NEIGHBOUR_RADIUS * NEIGHBOUR_RADIUS) continue;
      near++; ax += o.vx; ay += o.vy; az += o.vz; cx += dx; cy += dy; cz += dz;
      if (d2 < SEPARATION_RADIUS * SEPARATION_RADIUS) { const d = Math.sqrt(d2) || 0.01, push = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS; sx -= (dx / d) * push; sy -= (dy / d) * push; sz -= (dz / d) * push; }
    }
    let fx = sx * WEIGHTS.separation, fy = sy * WEIGHTS.separation, fz = sz * WEIGHTS.separation;
    if (near) { fx += (ax / near - b.vx) * 0.2 * WEIGHTS.alignment + (cx / near) * 0.1 * WEIGHTS.cohesion; fy += (ay / near - b.vy) * 0.2 * WEIGHTS.alignment + (cy / near) * 0.1 * WEIGHTS.cohesion; fz += (az / near - b.vz) * 0.2 * WEIGHTS.alignment + (cz / near) * 0.1 * WEIGHTS.cohesion; }
    // orbit: aim at a point a little ahead of the bird on the circle around the centre
    const rx = b.x - flock.center[0], rz = b.z - flock.center[1], ang = Math.atan2(rz, rx) + 0.45;
    fx += (flock.center[0] + Math.cos(ang) * flock.radius - b.x) * 0.12 * WEIGHTS.orbit;
    fz += (flock.center[1] + Math.sin(ang) * flock.radius - b.z) * 0.12 * WEIGHTS.orbit;
    fy += (flock.height - b.y) * 0.3 * WEIGHTS.altitude;
    let vx = b.vx + fx * dt * 4, vy = b.vy + fy * dt * 4, vz = b.vz + fz * dt * 4;
    const sp = Math.hypot(vx, vy, vz) || 1, target = clamp(sp, spec.speed * 0.7, spec.speed * 1.1), k = target / sp;
    vx *= k; vy *= k * 0.6; vz *= k;
    next[i] = { x: b.x + vx * dt, y: b.y + vy * dt, z: b.z + vz * dt, vx, vy, vz, phase: b.phase };
  }
  flock.birds = next;
  flock.time += dt;
  return flock;
}

/** Advances the flock to `timeSec` in fixed steps. Idempotent for a time already reached, so repeated draws of one still frame do not move the birds. */
export function advanceFlockTo(flock, timeSec) {
  let steps = Math.floor((timeSec - flock.time) / BOID_STEP + 1e-9);
  if (steps > MAX_STEPS_PER_CALL) { flock.time = timeSec - MAX_STEPS_PER_CALL * BOID_STEP; steps = MAX_STEPS_PER_CALL; } // a long pause (hidden tab) skips ahead instead of simulating it
  for (let i = 0; i < steps; i++) stepFlock(flock);
  return flock;
}

/** Seeded perches on the roof ridges: [{ x, y, z, yaw }] for up to `count` of the houses and the church. heights[i] is the roof height of layout[i]. */
export function roofPerches(layout, heights, seed, count, cell = CELL) {
  const rng = new SeededRandom(((seed | 0) ^ 0xc70e5) | 0), candidates = [];
  layout.forEach((p, i) => { if (p.id === 'house_a' || p.id === 'house_b' || p.id === 'church') candidates.push({ p, h: heights[i] || 3 }); });
  const out = [];
  while (out.length < count && candidates.length) {
    const c = candidates.splice(rng.next(candidates.length), 1)[0], along = (rng.next(100) / 100 - 0.5) * c.p.sizeX * cell * 0.5;
    out.push({ x: (c.p.x + c.p.sizeX / 2) * cell + along, y: c.h + 0.05, z: (c.p.z + c.p.sizeZ / 2) * cell, yaw: (rng.next(628) / 100) });
  }
  return out;
}

/** Where the flocks live: gulls circle over the sea off the coast, crows over the church (or the village centre), silhouettes wide and high. */
export function flockPlan({ seed, gridW, gridD, layout, cell = CELL }) {
  const f = coastFrame(gridW, gridD, seed, cell), mid = (f.lo + f.hi) / 2, sea = coastToWorld(f, mid, 22);
  const church = layout.find((p) => p.id === 'church'), cx = church ? (church.x + church.sizeX / 2) * cell : (gridW * cell) / 2, cz = church ? (church.z + church.sizeZ / 2) * cell : (gridD * cell) / 2;
  return { sea: [sea.x, sea.z], seaRadius: 12, seaHeight: 11, church: [cx, cz], churchRadius: 9, churchHeight: 17, village: [(gridW * cell) / 2, (gridD * cell) / 2], fogRadius: 30, fogHeight: 26 };
}

/**
 * The live flocks for a plan and counts: { gulls, crows, silhouettes } (each a flock or null). Pure in its inputs, so a rebuild gives the same birds.
 */
export function createFlocks({ seed, plan, counts }) {
  return {
    gulls: counts.gulls ? createFlock({ seed, salt: 1, kind: 'gull', count: counts.gulls, center: plan.sea, radius: plan.seaRadius, height: plan.seaHeight }) : null,
    crows: counts.circling ? createFlock({ seed, salt: 2, kind: 'crow', count: counts.circling, center: plan.church, radius: plan.churchRadius, height: plan.churchHeight }) : null,
    silhouettes: counts.silhouettes ? createFlock({ seed, salt: 3, kind: 'silhouette', count: counts.silhouettes, center: plan.village, radius: plan.fogRadius, height: plan.fogHeight }) : null,
  };
}

/**
 * Triangle vertices of one bird in the scene vertex layout (x, y, z, nx, ny, nz, r, g, b, glow, phase), appended to `out`.
 * body: a pointed triangle along the heading; wings: one triangle per side whose tip flaps. A perched bird folds its wings flat against the body.
 */
export function appendBird(out, { x, y, z, heading, kind, phase = 0, timeSec = 0, perched = false }) {
  const spec = KINDS[kind], c = spec.color, s = spec.span, fx = Math.cos(heading), fz = Math.sin(heading), rx = -fz, rz = fx;
  const flap = perched ? 0 : Math.sin(timeSec * spec.flapHz * Math.PI * 2 + phase), lift = flap * s * 0.28, reach = perched ? s * 0.18 : s * 0.5;
  const v = (px, py, pz) => out.push(x + px, y + py, z + pz, 0, 1, 0, c[0], c[1], c[2], 0, 0);
  const nose = [fx * s * 0.3, 0, fz * s * 0.3], tail = [-fx * s * 0.28, 0, -fz * s * 0.28];
  // body: one pointed triangle along the heading
  const push = (a, b2, c2) => { for (const p of [a, b2, c2]) v(p[0], p[1], p[2]); };
  push(nose, [rx * s * 0.07 + tail[0], 0, rz * s * 0.07 + tail[2]], [-rx * s * 0.07 + tail[0], 0, -rz * s * 0.07 + tail[2]]);
  // wings: root on the body, tip out to the side, swept back a little
  for (const side of [1, -1]) {
    const root0 = [fx * s * 0.12, 0, fz * s * 0.12], root1 = [-fx * s * 0.12, 0, -fz * s * 0.12];
    const tip = [rx * side * reach - fx * s * 0.12, lift * (perched ? 0 : 1) + (perched ? 0.02 : 0), rz * side * reach - fz * s * 0.12];
    push(root0, tip, root1);
  }
  return out;
}

/** Heading of a bird (radians in the x, z plane) from its velocity. */
export const headingOf = (b) => Math.atan2(b.vz, b.vx);

/**
 * Every bird as scene vertices (Float32Array). `flocks` is createFlocks output, `perches` roofPerches output (only the first counts.perched are used).
 * Reduced motion draws the perched crows in a fixed pose and nothing else (counts already reflect that).
 */
export function buildBirds({ flocks, perches, counts, timeSec = 0, reduced = false }) {
  const out = [];
  for (const k of ['gulls', 'crows', 'silhouettes']) {
    const flock = flocks && flocks[k];
    if (!flock || reduced) continue;
    for (const b of flock.birds) appendBird(out, { x: b.x, y: b.y, z: b.z, heading: headingOf(b), kind: flock.kind, phase: b.phase, timeSec });
  }
  (perches || []).slice(0, counts ? counts.perched : 0).forEach((p) => appendBird(out, { x: p.x, y: p.y, z: p.z, heading: p.yaw, kind: 'crow', perched: true }));
  return new Float32Array(out);
}
