// Pure helpers for the browser scene. No DOM access here so node can test them.
import { SeededRandom, ritualProgress } from './core.js';

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

/** Sky tint overlay per campaign sky stage. rgb is the overlay colour, alpha its strength. */
const SKY_TINTS = {
  dusk: { rgb: [150, 80, 50], alpha: 0.18 },
  night: { rgb: [20, 30, 60], alpha: 0.14 },
  witching: { rgb: [10, 6, 20], alpha: 0.2 },
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

/** Returns a visible notice when night=N in the hash is outside 1..count and gets clamped, else an empty string. */
export function nightClampNotice(hash, count) {
  const v = Number.parseInt(new URLSearchParams(String(hash || '').replace(/^#/, '')).get('night'), 10);
  if (!Number.isFinite(v) || count <= 0 || (v >= 1 && v <= count)) return '';
  return `Night ${v} does not exist: this campaign has ${count} nights, so showing night ${Math.max(1, Math.min(count, v))}.`;
}

/** Reads an optional night=N (1-based) from a URL hash and returns a 0-based index clamped to [0, count). */
export function nightFromHash(hash, count) {
  const v = Number.parseInt(new URLSearchParams(String(hash || '').replace(/^#/, '')).get('night'), 10);
  if (!Number.isFinite(v) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, v - 1));
}

/**
 * HUD text for the current ritual stage. `ritual` comes from generateRitual; dreadPercent is 0..100.
 * With a 1-based `nightNumber` the night schedule sets a floor: the shown stage is the larger of the scheduled and dread-reached
 * stage and the text also states both ("Night schedule: stage 4 of 5, dread reached: stage 1 (behind)").
 */
export function ritualHudText(ritual, dreadPercent, nightNumber) {
  if (!ritual || !Array.isArray(ritual.stages) || !ritual.stages.length) return '';
  const prog = ritualProgress(ritual, typeof nightNumber === 'number' ? nightNumber : 0, dreadPercent);
  const found = prog.effective;
  if (found < 0) {
    return `${ritual.name}: not yet begun (first stage, ${ritual.stages[0].name}, at ${ritual.stages[0].dreadThresholdPercent}% dread).`;
  }
  const st = ritual.stages[found];
  const next = ritual.stages[found + 1];
  const sched = prog.scheduled < 0 ? '' :
    ` Night schedule: stage ${prog.scheduled + 1} of ${ritual.stages.length}, dread reached: ${prog.dreadReached < 0 ? 'none' : `stage ${prog.dreadReached + 1}`} (${prog.pace === 'on' ? 'on schedule' : prog.pace}).`;
  return `${ritual.name}: stage ${found + 1} of ${ritual.stages.length}, ${st.name} (sigil ${st.sigil}).${sched}` +
    (next ? ` Next: ${next.name} at ${next.dreadThresholdPercent}% dread.` : ' The rite is complete.');
}

// ---- Notice policy (round 13 horror review): quiet, rate-limited, seed-driven. See the Horror design review in docs/ARCHITECTURE_AUDIT.md. ----
/** How long the omen banner stays up. Was 6000 before the round 13 review. */
export const TOAST_MS = 4500;
/** A banner shown less than this long ago is not replaced by a calmer one (the screen reader still hears every notice). */
export const TOAST_MIN_HOLD_MS = 1500;
/** Brightest full-screen flash allowed. Was 0.6 before the review. */
export const FLASH_MAX = 0.3;
/** No second flash inside this window, so flashes can never strobe. */
export const FLASH_MIN_GAP_MS = 4000;
/** Ambient lightning and dread shake sample a new seeded value this often. */
export const AMBIENT_SLOT_MS = 250;
export const JITTER_SLOT_MS = 60;
/** Chance per ambient slot, scaled by dread. About the old per-frame odds at 60 fps. */
export const AMBIENT_FLASH_ODDS = 0.02;
export const AMBIENT_FLASH_LEVEL = 0.2;
const MAX_JITTER_PX = 3;

/** Integer hash to [0,1). Same inputs, same output, no Math.random. */
export function unitHash(seed, slot, salt = 0) {
  let h = (Math.imul(seed | 0, 2654435761) ^ Math.imul(slot | 0, 40503) ^ Math.imul(salt | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether `next` may replace the banner `current` right now. Rising notices always win over calm ones. */
export function toastMayReplace(current, next, now) {
  if (!current) return true;
  if (next.rising && !current.rising) return true;
  return now - current.at >= TOAST_MIN_HOLD_MS;
}

/**
 * The flash level actually allowed: capped, and zero inside the minimum gap after the previous one,
 * unless the new flash is stronger than the one that opened the gap (a light flash never masks a heavy one).
 */
export function gatedFlash(level, lastAt, now, lastLevel = 0) {
  if (!(level > 0)) return 0;
  const capped = Math.min(FLASH_MAX, level);
  if (lastAt != null && now - lastAt < FLASH_MIN_GAP_MS && !(capped > lastLevel)) return 0;
  return capped;
}

/** Requests a flash on `flashState` ({ flash, flashAt, flashLevel }) through the gate. Returns true if it started. */
export function applyFlash(flashState, level, now) {
  const f = gatedFlash(level, flashState.flashAt, now, flashState.flashLevel);
  if (f <= 0) return false;
  flashState.flash = Math.max(flashState.flash, f);
  flashState.flashAt = now;
  flashState.flashLevel = f;
  return true;
}

/** Distant lightning at high dread, chosen by seed and time slot. Returns a flash level or 0. */
export function ambientFlash(seed, nowMs, dread) {
  if (!(dread > 0.4)) return 0;
  return unitHash(seed, Math.floor(nowMs / AMBIENT_SLOT_MS), 1) < AMBIENT_FLASH_ODDS * dread ? AMBIENT_FLASH_LEVEL : 0;
}

/** Camera tremor at high dread, deterministic per seed and time slot. */
export function dreadJitter(seed, nowMs, dread) {
  if (!(dread > 0.5)) return { dx: 0, dy: 0 };
  const slot = Math.floor(nowMs / JITTER_SLOT_MS), amp = (dread - 0.5) * MAX_JITTER_PX;
  return { dx: (unitHash(seed, slot, 2) - 0.5) * amp, dy: (unitHash(seed, slot, 3) - 0.5) * amp };
}
