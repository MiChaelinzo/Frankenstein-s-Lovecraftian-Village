// Dependency-free JS port of Assets/Scripts/Core. Keep behavior identical to the C# source;
// test/parity.test.js checks it against test/golden.json emitted by the C# tests.

const MAX_SANITY = 100;

/** Deterministic xorshift32, same integer math as SeededRandom.cs. */
export class SeededRandom {
  constructor(seed) {
    let s = (Math.imul(seed | 0, 2654435761) + 0x9e3779b9) >>> 0;
    if (s === 0) s = 0x1234abcd;
    this.state = s;
  }
  nextUInt() {
    let s = this.state;
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    this.state = s;
    return s;
  }
  /** Int in [0, maxExclusive). */
  next(maxExclusive) {
    if (!(maxExclusive > 0)) return 0;
    return this.nextUInt() % (maxExclusive >>> 0);
  }
}

export class PrefabCatalog {
  constructor(entries) {
    this.entries = [];
    const seen = new Set();
    for (const e of entries || []) {
      if (!e || !e.id) continue;
      const weight = e.weight ?? 1;
      const fx = e.footprintX ?? 1;
      const fz = e.footprintZ ?? 1;
      if (weight <= 0 || fx <= 0 || fz <= 0) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      this.entries.push({ id: e.id, category: e.category || '', weight, footprintX: fx, footprintZ: fz, horror: e.horror ?? 0 });
    }
  }
  get totalWeight() {
    return this.entries.reduce((t, e) => t + e.weight, 0);
  }
  get(id) {
    return this.entries.find((e) => e.id === id) || null;
  }
  contains(id) {
    return this.get(id) !== null;
  }
  /** Weighted pick; roll in [0, totalWeight). */
  pickByWeight(roll) {
    for (const e of this.entries) {
      if (roll < e.weight) return e;
      roll -= e.weight;
    }
    return this.entries.length ? this.entries[this.entries.length - 1] : null;
  }
}

/** Returns [{id, x, z, sizeX, sizeZ}] with the same placement order as VillageLayoutGenerator.cs. */
export function generateLayout(catalog, width, depth, targetCount, seed) {
  const result = [];
  if (!catalog || catalog.entries.length === 0 || width <= 0 || depth <= 0 || targetCount <= 0) return result;
  const rng = new SeededRandom(seed);
  const occupied = new Uint8Array(width * depth);
  const total = catalog.totalWeight;
  const attempts = targetCount * 20;
  for (let i = 0; i < attempts && result.length < targetCount; i++) {
    const entry = catalog.pickByWeight(rng.next(total));
    const x = rng.next(width);
    const z = rng.next(depth);
    const sx = entry.footprintX;
    const sz = entry.footprintZ;
    if (!fits(occupied, width, depth, x, z, sx, sz)) continue;
    for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sz; dz++) occupied[(x + dx) * depth + (z + dz)] = 1;
    result.push({ id: entry.id, x, z, sizeX: sx, sizeZ: sz });
  }
  return result;
}

function fits(occ, w, d, x, z, sx, sz) {
  if (x + sx > w || z + sz > d) return false;
  for (let dx = 0; dx < sx; dx++) for (let dz = 0; dz < sz; dz++) if (occ[(x + dx) * d + (z + dz)]) return false;
  return true;
}

export class SanityModel {
  constructor(start = MAX_SANITY) {
    this.value = SanityModel.clamp(start);
  }
  apply(delta) {
    this.value = SanityModel.clamp(this.value + delta);
  }
  get dread() {
    return SanityModel.dreadFor(this.value);
  }
  static clamp(v) {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(MAX_SANITY, v));
  }
  /** Lower sanity means higher dread. */
  static dreadFor(sanity) {
    return Math.fround(1 - Math.fround(SanityModel.clamp(sanity) / MAX_SANITY));
  }
}

const CALM = 'The village sleeps beneath a pale moon.';
const UNEASY = 'Something watches from the windows of {0}.';
const DIRE = 'The stones of {0} whisper your name.';

export class StaticNarrationProvider {
  narrate(locationId, dread) {
    const d = Math.fround(dread);
    const pool = d < Math.fround(0.34) ? CALM : d < Math.fround(0.67) ? UNEASY : DIRE;
    return pool.replace('{0}', locationId ?? 'the village');
  }
}

/** Wraps a primary (possibly AI) provider; never throws and never returns blank text. */
export class SafeNarrationProvider {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback || new StaticNarrationProvider();
  }
  narrate(locationId, dread) {
    try {
      const text = this.primary ? this.primary.narrate(locationId, dread) : null;
      if (typeof text === 'string' && text.trim() !== '') return text;
    } catch {
      /* fall through to offline text */
    }
    return this.fallback.narrate(locationId, dread);
  }
}

/** Optional AI provider: POSTs {location, dread} to an endpoint, keeps the last good line. Wrap in Safe. */
export class HttpNarrationProvider {
  constructor(url, fetchImpl = globalThis.fetch) {
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.latest = new Map();
    this.pending = new Set();
  }
  narrate(locationId, dread) {
    const key = `${locationId}|${Math.floor(dread * 3)}`;
    if (!this.pending.has(key) && this.fetchImpl && this.url) {
      this.pending.add(key);
      this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ location: locationId, dread }),
      })
        .then((r) => r.json())
        .then((j) => { if (j && typeof j.text === 'string') this.latest.set(key, j.text); })
        .catch(() => {})
        .finally(() => this.pending.delete(key));
    }
    return this.latest.get(key) || '';
  }
}

/** Seed sharing helpers: #seed=1818&sanity=70 */
export function encodeHash(state) {
  return `#seed=${state.seed | 0}&sanity=${Math.round(state.sanity)}`;
}
export function decodeHash(hash, defaults = { seed: 1818, sanity: 100 }) {
  const out = { ...defaults };
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const seed = Number.parseInt(params.get('seed'), 10);
  if (Number.isFinite(seed)) out.seed = seed | 0;
  const sanity = Number.parseFloat(params.get('sanity'));
  if (Number.isFinite(sanity)) out.sanity = SanityModel.clamp(sanity);
  return out;
}
