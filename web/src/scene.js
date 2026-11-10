// Pure helpers for the browser scene. No DOM access here so node can test them.
import { SeededRandom } from './core.js';

/** Fit a gw x gd isometric board into a cw x ch canvas. Returns tile size and the screen origin of cell (0,0). */
export function computeView(cw, ch, gw, gd, margin = { x: 8, top: 110, bottom: 8 }) {
  const span = gw + gd;
  const byWidth = ((cw - 2 * margin.x) * 2) / span;
  const byHeight = ((ch - margin.top - margin.bottom) * 4) / span;
  const tw = Math.min(byWidth, byHeight);
  const th = tw / 2;
  const boardH = (span * th) / 2;
  return {
    tw, th,
    ox: cw / 2 + ((gd - gw) * tw) / 4,
    oy: margin.top + (ch - margin.top - margin.bottom - boardH) / 2,
  };
}

export function occupancy(layout, w, d) {
  const occ = new Uint8Array(w * d);
  for (const p of layout) for (let dx = 0; dx < p.sizeX; dx++) for (let dz = 0; dz < p.sizeZ; dz++) occ[(p.x + dx) * d + (p.z + dz)] = 1;
  return occ;
}

/** Breadth-first path over free cells (4-neighbour). Returns [[x,z],...] including both ends, or null. */
export function findPath(occ, w, d, from, to) {
  const key = (x, z) => x * d + z;
  if (occ[key(from[0], from[1])] || occ[key(to[0], to[1])]) return null;
  const prev = new Int32Array(w * d).fill(-2);
  const queue = [key(from[0], from[1])];
  prev[queue[0]] = -1;
  const goal = key(to[0], to[1]);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = Math.floor(cur / d), cz = cur % d;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue;
      const k = key(nx, nz);
      if (occ[k] || prev[k] !== -2) continue;
      prev[k] = cur;
      queue.push(k);
    }
  }
  if (prev[goal] === -2) return null;
  const path = [];
  for (let k = goal; k !== -1; k = prev[k]) path.push([Math.floor(k / d), k % d]);
  return path.reverse();
}

/** Free cells next to landmarks and wells, falling back to any free cell. Deterministic per seed. */
export function waypoints(layout, w, d, seed) {
  const occ = occupancy(layout, w, d);
  const out = [];
  const seen = new Set();
  const add = (x, z) => {
    if (x < 0 || z < 0 || x >= w || z >= d || occ[x * d + z] || seen.has(x * d + z)) return false;
    seen.add(x * d + z); out.push([x, z]); return true;
  };
  for (const p of layout) {
    if (p.id !== 'church' && p.id !== 'altar' && p.id !== 'well') continue;
    // approach from the south-east side first, which is the side the viewer sees
    for (const [dx, dz] of [[p.sizeX, 0], [0, p.sizeZ], [-1, 0], [0, -1]]) if (add(p.x + dx, p.z + dz)) break;
  }
  const rng = new SeededRandom(seed * 17 + 5);
  for (let i = 0; i < 200 && out.length < 4; i++) add(rng.next(w), rng.next(d));
  return out;
}

export const MAX_WALKERS = 7;
const WALKERS_BY_TIER = [0, 2, 4, MAX_WALKERS];
export const cultistCount = (tier) => WALKERS_BY_TIER[Math.max(0, Math.min(3, tier | 0))];

/** Pre-computes up to MAX_WALKERS routes. Each walker ping-pongs along its path. */
export function buildWalkers(layout, w, d, seed) {
  const occ = occupancy(layout, w, d);
  const wp = waypoints(layout, w, d, seed);
  const rng = new SeededRandom(seed * 131 + 11);
  const walkers = [];
  if (wp.length < 2) return walkers;
  for (let i = 0; walkers.length < MAX_WALKERS && i < MAX_WALKERS * 6; i++) {
    const a = wp[(i + rng.next(wp.length)) % wp.length];
    const b = wp[(i * 2 + 1 + rng.next(wp.length)) % wp.length];
    if (a === b) continue;
    const path = findPath(occ, w, d, a, b);
    if (path && path.length > 3) walkers.push({ path, speed: 0.5 + rng.next(40) / 100, phase: rng.next(path.length * 2) });
  }
  return walkers;
}

/** Position of a walker at t seconds, in grid cell units (cell centre), plus facing for the lantern side. */
export function walkerPos(walker, t) {
  const n = walker.path.length - 1;
  const s = (((t * walker.speed + walker.phase) % (2 * n)) + 2 * n) % (2 * n);
  const u = s <= n ? s : 2 * n - s;
  const i = Math.min(n - 1, Math.floor(u)), f = u - i;
  const a = walker.path[i], b = walker.path[i + 1];
  return { x: a[0] + (b[0] - a[0]) * f + 0.5, z: a[1] + (b[1] - a[1]) * f + 0.5 };
}

/** 'off' | 'warm' | 'red' for a window. vis is a 0..1 roll for this window. */
export function windowState(roll, dread) {
  if (dread > 0.6 && roll > 0.8) return 'red';
  if (roll < dread * 0.85) return 'off';
  return 'warm';
}

const OMEN_RISE = {
  Uneasy: 'The windows dim, one by one.',
  Dire: 'Something in the well turns to look up.',
  Abyss: 'The sky opens an eye.',
};
export function omenText(event) {
  if (!event) return '';
  if (event.rising) return OMEN_RISE[event.name] || 'Something shifts.';
  return `The dark withdraws a little (${['Calm', 'Uneasy', 'Dire', 'Abyss'][event.tier] || event.name}).`;
}

/** Newest first, capped, consecutive duplicates dropped. Returns a new array. */
export function addEntry(list, entry, max = 12) {
  if (list.length && list[0].text === entry.text && list[0].kind === entry.kind) return list;
  return [entry, ...list].slice(0, max);
}

export function entryLabel(e) {
  return `[sanity ${Math.round(e.sanity)}] ${e.kind === 'omen' ? 'Omen: ' : ''}${e.text}`;
}

export function reportFilename(seed, ext) {
  return `village-report-seed-${seed | 0}.${ext}`;
}

export const wrapIndex = (i, n, dir) => (n <= 0 ? -1 : (((i + dir) % n) + n) % n);

export function describeScene({ seed, pieces, tierName, dreadPercent, focus }) {
  return `Village seed ${seed} with ${pieces} pieces. Dread ${dreadPercent}%, ${tierName}.` + (focus ? ` Listening to ${focus}.` : '');
}

/** Sky tint overlay per campaign sky stage. rgb is the overlay colour, alpha its strength, light scales the sun glow. */
const SKY_TINTS = {
  dusk: { rgb: [150, 80, 50], alpha: 0.18, light: 1 },
  night: { rgb: [20, 30, 60], alpha: 0.14, light: 0.5 },
  witching: { rgb: [10, 6, 20], alpha: 0.2, light: 0.15 },
};
export function skyTint(name) {
  return SKY_TINTS[name] || SKY_TINTS.night;
}

export function weatherFor(name) {
  return { rain: name === 'rain', fog: name === 'fog' };
}

export function postcardFilename(seed, night) {
  return `village-postcard-seed-${seed | 0}-night-${night | 0}.png`;
}

export function postcardCaption({ villageName, seed, night, title }) {
  return `${villageName} | Night ${night}: ${title} | seed ${seed | 0}`;
}

/** Reads an optional night=N (1-based) from a URL hash and returns a 0-based index clamped to [0, count). */
export function nightFromHash(hash, count) {
  const v = Number.parseInt(new URLSearchParams(String(hash || '').replace(/^#/, '')).get('night'), 10);
  if (!Number.isFinite(v) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, v - 1));
}
