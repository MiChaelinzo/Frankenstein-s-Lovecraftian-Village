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

// ---- Dread threshold events (DreadEvents.cs) ----

const f = Math.fround;
export const DREAD_THRESHOLDS = {
  names: ['Uneasy', 'Dire', 'Abyss'],
  values: [f(0.34), f(0.67), f(0.9)],
  hysteresis: f(0.05),
  tierNames: ['Calm', 'Uneasy', 'Dire', 'Abyss'],
};

/** NaN and infinities become 0; everything else is clamped to [0,1] as float32. */
export function sanitizeDread(dread) {
  const d = f(dread);
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.min(1, d));
}

export function tierFor(dread) {
  const d = sanitizeDread(dread);
  let tier = 0;
  while (tier < DREAD_THRESHOLDS.values.length && d >= DREAD_THRESHOLDS.values[tier]) tier++;
  return tier;
}

function fallingLevel(index) {
  return f(DREAD_THRESHOLDS.values[index] - DREAD_THRESHOLDS.hysteresis);
}

/** Rising fires at the threshold, falling only below threshold minus hysteresis. Events are {name, rising, tier}. */
export class DreadEventTracker {
  constructor() {
    this.tier = 0;
  }
  update(dread) {
    const events = [];
    const d = sanitizeDread(dread);
    const { names, values } = DREAD_THRESHOLDS;
    while (this.tier < values.length && d >= values[this.tier]) {
      this.tier++;
      events.push({ name: names[this.tier - 1], rising: true, tier: this.tier });
    }
    while (this.tier > 0 && d < fallingLevel(this.tier - 1)) {
      this.tier--;
      events.push({ name: names[this.tier], rising: false, tier: this.tier });
    }
    return events;
  }
}

/** Stable text form, same as DreadEvent.ToString() in C#: "Uneasy+1". */
export function eventToString(e) {
  return `${e.name}${e.rising ? '+' : '-'}${e.tier}`;
}

// ---- Village report (VillageReport.cs) ----

const OMENS = [
  'The bells ring, though no one has climbed the tower.',
  'Every window faces the well.',
  'Smoke rises from chimneys that were never lit.',
  'The crows have stopped leaving.',
  'Something counts the houses at night.',
  'The stitched streets remember their old shapes.',
];

/** Same inputs as VillageReport.Build: layout is the generateLayout() result. */
export function buildVillageReport(catalog, pieces, width, depth, seed, dread) {
  const d = sanitizeDread(dread);
  const r = {
    seed: seed | 0, width, depth, pieces: 0, cellsUsed: 0,
    dreadPercent: Math.floor(f(f(d * 100) + 0.5)),
    tier: DREAD_THRESHOLDS.tierNames[tierFor(d)],
    totalHorror: 0, averageHorrorX100: 0,
    byId: [], byCategory: [], landmarks: [],
    omen: OMENS[new SeededRandom(seed).next(OMENS.length)],
  };
  const idCounts = new Map();
  const catCounts = new Map();
  for (const p of pieces || []) {
    const e = catalog ? catalog.get(p.id) : null;
    if (!e) continue;
    r.pieces++;
    r.cellsUsed += p.sizeX * p.sizeZ;
    r.totalHorror += e.horror;
    idCounts.set(e.id, (idCounts.get(e.id) || 0) + 1);
    catCounts.set(e.category, (catCounts.get(e.category) || 0) + 1);
    if (e.category === 'Landmark') r.landmarks.push({ id: e.id, x: p.x, z: p.z });
  }
  const seenCats = new Set();
  for (const e of catalog ? catalog.entries : []) {
    if (idCounts.has(e.id)) r.byId.push([e.id, idCounts.get(e.id)]);
    if (catCounts.has(e.category) && !seenCats.has(e.category)) {
      seenCats.add(e.category);
      r.byCategory.push([e.category, catCounts.get(e.category)]);
    }
  }
  if (r.pieces > 0) r.averageHorrorX100 = Math.floor((r.totalHorror * 100 + Math.floor(r.pieces / 2)) / r.pieces);
  return r;
}

function avg(x100) {
  return `${Math.floor(x100 / 100)}.${String(x100 % 100).padStart(2, '0')}`;
}

export function reportToMarkdown(r) {
  const lines = (list, fmt) => (list.length ? list.map(fmt).join('') : '- none\n');
  return (
    '# Village Report\n\n' +
    `- Seed: ${r.seed}\n- Grid: ${r.width} x ${r.depth}\n- Pieces: ${r.pieces}\n` +
    `- Cells used: ${r.cellsUsed} of ${r.width * r.depth}\n- Dread: ${r.dreadPercent}% (${r.tier})\n` +
    `- Total horror: ${r.totalHorror}\n- Average horror: ${avg(r.averageHorrorX100)}\n\n` +
    '## Pieces by id\n\n' + lines(r.byId, ([k, v]) => `- ${k}: ${v}\n`) +
    '\n## Pieces by category\n\n' + lines(r.byCategory, ([k, v]) => `- ${k}: ${v}\n`) +
    '\n## Landmarks\n\n' + lines(r.landmarks, (l) => `- ${l.id} at (${l.x}, ${l.z})\n`) +
    `\n> ${r.omen}\n`
  );
}

function jsonObject(list) {
  if (!list.length) return '{}';
  return `{ ${list.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} }`;
}

export function reportToJson(r) {
  const landmarks = r.landmarks.map((l) => `{ "id": ${JSON.stringify(l.id)}, "x": ${l.x}, "z": ${l.z} }`).join(', ');
  return (
    '{\n' +
    `  "seed": ${r.seed},\n  "width": ${r.width},\n  "depth": ${r.depth},\n  "pieces": ${r.pieces},\n` +
    `  "cellsUsed": ${r.cellsUsed},\n  "dreadPercent": ${r.dreadPercent},\n  "tier": ${JSON.stringify(r.tier)},\n` +
    `  "totalHorror": ${r.totalHorror},\n  "averageHorror": ${avg(r.averageHorrorX100)},\n` +
    `  "byId": ${jsonObject(r.byId)},\n  "byCategory": ${jsonObject(r.byCategory)},\n` +
    `  "landmarks": [${landmarks}],\n  "omen": ${JSON.stringify(r.omen)}\n}\n`
  );
}

// ---- Campaign generator (CampaignGenerator.cs) ----

export const CAMPAIGN_MIN_NIGHTS = 1;
export const CAMPAIGN_MAX_NIGHTS = 9;
export const CAMPAIGN_DEFAULT_NIGHTS = 5;

const NAME_PREFIX = ['Black', 'Ash', 'Gull', 'Drowned', 'Hollow', 'Marrow', 'Salt', 'Pale', 'Grey', 'Weeping', 'Tallow', 'Brine'];
const NAME_SUFFIX = ['wick', 'moor', 'haven', 'mere', 'holm', 'ford', 'cliff', 'by', 'stead', 'combe'];
const CAMPAIGN_TITLES = [
  ['The Quiet Arrival', 'Lanterns on the Quay', "A Stranger's Welcome", 'Salt on the Doorstep', 'The First Bell', 'Mist Over the Marsh'],
  ['What the Well Remembers', 'The Counting of Houses', 'Footsteps in the Nave', 'Tide Without a Moon', 'The Stitched Streets', 'Candles Gone Green'],
  ['The Eye Opens', 'Nothing Answers the Bell', 'The Drowned Congregation', 'When the Sea Walks', 'The Last Lantern', 'Beneath the Altar'],
];
const RUMOR_WHO = ['The ferryman', 'An old widow', "The sexton's boy", 'A tinker passing through', 'The night watchman', 'A fisher with no catch'];
const RUMOR_WHAT = ['swears the church bell rings itself', 'says the well has begun to hum', 'saw every window turn toward the sea', 'heard the tide counting under the floor', 'found wet footprints leading up from the harbor', 'claims the crows have started to pray'];
const RUMOR_WHEN = ['just after dusk.', 'when the fog came in.', 'three nights running.', 'and will not say more.', 'though nobody believes it yet.', 'and has not slept since.'];
const CAMPAIGN_LORE = [
  ['The founders stitched the first houses from driftwood and a bargain nobody wrote down.', 'Every hearth in the village was lit from one flame, carried in a jar from the shore.', 'The lighthouse keeper stopped logging ships long before the ships stopped coming.'],
  ['The altar predates the church. The church was built so that something would have a roof.', 'The well is deeper than the hill is tall, and the water rises when the bells are silent.', 'Those who walk the lantern route at night never agree on how many of them there were.'],
  ['The sea is not retreating. It is waiting for the village to finish its sentence.', 'The thing under the tower has been patient since before names, and the patience is wearing thin.', 'By the final night the houses face the water, and the water faces back.'],
];
const WEATHERS = ['clear', 'rain', 'fog'];

export function clampNights(nights) {
  const n = Number.isFinite(nights) ? Math.trunc(nights) : CAMPAIGN_DEFAULT_NIGHTS;
  return Math.max(CAMPAIGN_MIN_NIGHTS, Math.min(CAMPAIGN_MAX_NIGHTS, n));
}

/** Returns { seed, villageName, nights: [{ number, title, dreadTargetPercent, sanityStart, sky, weather, rumor, lore }] }. */
export function generateCampaign(seed, nights = CAMPAIGN_DEFAULT_NIGHTS) {
  nights = clampNights(nights);
  seed |= 0;
  const rng = new SeededRandom(seed ^ 0x5bd1e995);
  const villageName = NAME_PREFIX[rng.next(NAME_PREFIX.length)] + NAME_SUFFIX[rng.next(NAME_SUFFIX.length)];
  const used = CAMPAIGN_TITLES.map((t) => t.map(() => false));
  const out = [];
  let prev = 0;
  for (let i = 0; i < nights; i++) {
    const stage = nights === 1 ? 1 : Math.floor((i * 3) / nights);
    const baseTarget = nights === 1 ? 50 : 10 + Math.floor((80 * i) / (nights - 1));
    let target = baseTarget + rng.next(7) - 3;
    if (target < 5) target = 5;
    if (target <= prev) target = prev + 1;
    if (target > 100) target = 100;
    prev = target;

    const free = used[stage].filter((u) => !u).length;
    let pick = rng.next(free);
    let idx = 0;
    for (let k = 0; k < used[stage].length; k++) {
      if (used[stage][k]) continue;
      if (pick === 0) { idx = k; break; }
      pick--;
    }
    used[stage][idx] = true;

    const sky = stage === 0 ? 'dusk' : stage === 1 ? 'night' : 'witching';
    const weather = WEATHERS[rng.next(WEATHERS.length)];
    const rumor = `${RUMOR_WHO[rng.next(RUMOR_WHO.length)]} ${RUMOR_WHAT[rng.next(RUMOR_WHAT.length)]} ${RUMOR_WHEN[rng.next(RUMOR_WHEN.length)]}`;
    const lore = CAMPAIGN_LORE[stage][rng.next(CAMPAIGN_LORE[stage].length)];
    out.push({ number: i + 1, title: CAMPAIGN_TITLES[stage][idx], dreadTargetPercent: target, sanityStart: 100 - target, sky, weather, rumor, lore });
  }
  return { seed, villageName, nights: out };
}
