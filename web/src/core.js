// Dependency-free JS port of Assets/Scripts/Core. Keep behavior identical to the C# source;
// test/parity.test.js checks it against test/golden.json emitted by the C# tests.

import { buildStory, OMENS as STORY_OMENS, tierForPercent as storyTier } from './story.js';

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
      this.entries.push({ id: e.id, category: e.category || '', weight, footprintX: fx, footprintZ: fz, horror: e.horror ?? 0, prefabHint: e.prefabHint || '' });
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

const ALIAS_GROUPS = [
  ['house', 'home', 'cottage', 'hut', 'cabin'],
  ['church', 'chapel', 'cathedral', 'temple'],
  ['well', 'fountain'],
  ['tree', 'dead', 'trunk', 'pinus'],
  ['altar', 'shrine'],
];

/** Port of PrefabNameMatcher.cs. Pure name matching used to bind catalog ids to prefab names. */
export const PrefabNameMatcher = (() => {
  const EXACT_SCORE = 1000;
  const TOKEN_SCORE = 10;
  const ALIAS_SCORE = 3;
  const isLetterOrDigit = (c) => /[\p{L}\p{Nd}]/u.test(c);
  const isUpper = (c) => /\p{Lu}/u.test(c);
  const isLower = (c) => /\p{Ll}/u.test(c);
  const isDigit = (c) => /\p{Nd}/u.test(c);

  /** Lowercase word tokens: splits on non-alphanumerics and camelCase, drops pure-number tokens. */
  function tokenize(name) {
    const tokens = [];
    if (!name) return tokens;
    let cur = '';
    let prev = ' ';
    const flush = () => {
      if (cur.length === 0) return;
      const t = cur;
      cur = '';
      if ([...t].some((ch) => !isDigit(ch))) tokens.push(t);
    };
    for (const c of name) {
      if (!isLetterOrDigit(c)) { flush(); prev = ' '; continue; }
      if (isUpper(c) && isLower(prev)) flush();
      else if (prev !== ' ' && isDigit(c) !== isDigit(prev)) flush();
      cur += c.toLowerCase();
      prev = c;
    }
    flush();
    return tokens;
  }

  const normalize = (name) => tokenize(name).join('_');

  /** Drops a leading 'sp' token and a trailing 'variant' token for partial scoring only. */
  function scoringTokens(tokens) {
    const r = tokens.slice();
    if (r.length > 1 && r[0] === 'sp') r.shift();
    if (r.length > 1 && r[r.length - 1] === 'variant') r.pop();
    return r;
  }

  const sameGroup = (x, y) => ALIAS_GROUPS.some((g) => g.includes(x) && g.includes(y));

  function score(id, candidate) {
    const a = tokenize(id);
    let b = tokenize(candidate);
    if (a.length === 0 || b.length === 0) return 0;
    if (a.join('_') === b.join('_')) return EXACT_SCORE;
    let total = 0;
    const seen = new Set();
    b = scoringTokens(b);
    for (const t of scoringTokens(a)) {
      if ([...t].length < 2) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      if (b.includes(t)) { total += TOKEN_SCORE; continue; }
      if (b.some((u) => sameGroup(t, u))) total += ALIAS_SCORE;
    }
    return total;
  }

  const ordinalLess = (x, y) => x < y;

  function best(id, candidates) {
    let bestName = null;
    let bestScore = 0;
    for (const c of candidates || []) {
      if (c === null || c === undefined) continue;
      const s = score(id, c);
      if (s <= 0) continue;
      if (s > bestScore || (s === bestScore && ordinalLess(c, bestName))) { bestName = c; bestScore = s; }
    }
    return bestName;
  }

  /** Candidate whose normalized name equals the normalized hint (ordinal-first), else best(id, candidates). */
  function resolve(id, hint, candidates) {
    if (!candidates) return null;
    const list = Array.from(candidates);
    if (hint) {
      const want = normalize(hint);
      let found = null;
      if (want.length > 0) {
        for (const c of list) {
          if (c === null || c === undefined || normalize(c) !== want) continue;
          if (found === null || ordinalLess(c, found)) found = c;
        }
      }
      if (found !== null) return found;
    }
    return best(id, list);
  }

  return { EXACT_SCORE, TOKEN_SCORE, ALIAS_SCORE, tokenize, normalize, score, best, resolve };
})();

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

// ---- Ritual chain (RitualChain.cs) ----

export const RITUAL_NAMES = ['The Rite of Drowned Bells', 'The Tallow Vigil', 'The Congregation of Salt', 'The Hollow Litany', 'The Unlit Procession', 'The Choir Beneath the Well'];
export const RITUAL_STAGE_NAMES = ['Whispers', 'Gathering', 'Offering', 'Vigil', 'Invocation', 'Opening', 'Communion', 'Ascension', 'Completion'];
export const RITUAL_SIGILS = ['eye', 'spiral', 'crown', 'tide', 'knot', 'star'];

/**
 * Returns { seed, name, stages: [{ index, nightNumber, name, sigil, dreadThresholdPercent, omenId, beatIndex }] }.
 * Imports story.js, which imports this module back; both only use each other inside functions, so the cycle is safe.
 */
export function generateRitual(campaign) {
  const ritual = { seed: 0, name: '', stages: [] };
  if (!campaign || !Array.isArray(campaign.nights)) return ritual;
  ritual.seed = campaign.seed | 0;
  const rng = new SeededRandom(ritual.seed ^ 0x2f6e2b1);
  ritual.name = RITUAL_NAMES[rng.next(RITUAL_NAMES.length)];
  const beats = buildStory(campaign);
  const n = campaign.nights.length;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const night = campaign.nights[i];
    let threshold = night.dreadTargetPercent - rng.next(3);
    if (threshold <= prev) threshold = prev + 1;
    if (threshold > 100) threshold = 100;
    prev = threshold;
    const nameIndex = n === 1 ? Math.floor(RITUAL_STAGE_NAMES.length / 2) : Math.floor((i * (RITUAL_STAGE_NAMES.length - 1)) / (n - 1));
    const sigil = RITUAL_SIGILS[rng.next(RITUAL_SIGILS.length)];
    let beatIndex = 0;
    let omenId = '0.0';
    for (let b = 0; b < beats.length; b++) {
      if (beats[b].nightNumber !== night.number || beats[b].kind !== 'omen') continue;
      beatIndex = b;
      const tier = storyTier(night.dreadTargetPercent);
      omenId = `${tier}.${Math.max(0, STORY_OMENS[tier].indexOf(beats[b].text))}`;
      break;
    }
    ritual.stages.push({ index: i, nightNumber: night.number, name: RITUAL_STAGE_NAMES[nameIndex], sigil, dreadThresholdPercent: threshold, omenId, beatIndex });
  }
  return ritual;
}

export function ritualStageForDread(ritual, dreadPercent) {
  let found = -1;
  if (!ritual) return found;
  for (let i = 0; i < ritual.stages.length; i++) if (ritual.stages[i].dreadThresholdPercent <= dreadPercent) found = i;
  return found;
}

/** Stage the night schedule expects (night N maps to stage N-1, clamped). -1 for no ritual or night below 1. */
export function scheduledStageForNight(ritual, nightNumber) {
  if (!ritual || !ritual.stages.length || nightNumber < 1) return -1;
  return Math.min(nightNumber, ritual.stages.length) - 1;
}

/** { scheduled, dreadReached, effective, pace }. The night sets a floor: effective is the larger of scheduled and dread-reached. */
export function ritualProgress(ritual, nightNumber, dreadPercent) {
  const scheduled = scheduledStageForNight(ritual, nightNumber);
  const dreadReached = ritualStageForDread(ritual, dreadPercent);
  return { scheduled, dreadReached, effective: Math.max(scheduled, dreadReached), pace: dreadReached < scheduled ? 'behind' : dreadReached > scheduled ? 'ahead' : 'on' };
}

export function describeRitualProgress(p) {
  return `scheduled ${p.scheduled} reached ${p.dreadReached} effective ${p.effective} ${p.pace}`;
}

/** Plain ritual save state, text form "ritual1;seed;night;stage" (RitualSaveState.cs). */
export function clampRitualSave(s, stageCount) {
  const count = Math.max(0, stageCount | 0);
  return {
    seed: s.seed | 0,
    nightNumber: count === 0 ? 1 : Math.max(1, Math.min(count, s.nightNumber | 0)),
    stage: Math.max(-1, Math.min(count - 1, s.stage | 0)),
  };
}
export function serializeRitualSave(s) { return `ritual1;${s.seed | 0};${s.nightNumber | 0};${s.stage | 0}`; }
export function parseRitualSave(text) {
  if (typeof text !== 'string') return null;
  const p = text.split(';');
  if (p.length !== 4 || p[0] !== 'ritual1' || !p.slice(1).every((x) => /^[+-]?\d+$/.test(x))) return null;
  const v = p.slice(1).map(Number);
  if (v.some((x) => x < -2147483648 || x > 2147483647)) return null;
  return { seed: v[0], nightNumber: v[1], stage: v[2] };
}

export function describeRitualStage(s) {
  return `Night ${s.nightNumber}: ${s.name} [${s.sigil}] at ${s.dreadThresholdPercent}% omen ${s.omenId} beat ${s.beatIndex}`;
}

// ---- DLNK adapter policy (DreadBuildingPolicy.cs) ----

export const DOOR_BEHAVIORS = ['Normal', 'Creak', 'Slam', 'Refuse'];
export const CAMERA_MODES = ['FirstPerson', 'ThirdPerson', 'TopDown'];
export const MAX_DETAIL = 3;

/** FNV-1a over UTF-16 code units, returned as a signed int32 like the C# version. */
export function stableHash(text) {
  let h = 2166136261;
  const s = text == null ? '' : String(text);
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}

/** Detail 0..3 (3 = full). Never rises as dread rises; each building decays after its own 0..2 tier delay. */
export function detailLevel(dread, buildingId, seed) {
  const tier = tierFor(dread);
  const delay = new SeededRandom((seed | 0) ^ stableHash(buildingId)).next(3);
  return Math.max(0, Math.min(MAX_DETAIL, MAX_DETAIL - Math.max(0, tier - delay)));
}

export function clampFloor(floor, floorCount) {
  if (floorCount <= 0) return 0;
  return Math.max(0, Math.min(floorCount - 1, floor | 0));
}

/** Top-down peel: floors up to the active one show, higher hide. Other modes show every floor. */
export function floorVisible(floor, activeFloor, floorCount, topDown) {
  if (floor < 0 || floor >= floorCount) return false;
  if (!topDown) return true;
  return floor <= clampFloor(activeFloor, floorCount);
}

/** Returns a DoorBehavior int (0 Normal, 1 Creak, 2 Slam, 3 Refuse). */
export function doorOmen(dread, buildingId, doorIndex, attempt, seed) {
  const tier = tierFor(dread);
  if (tier === 0) return 0;
  const mix = (Math.imul(seed | 0, 31) + stableHash(buildingId) + Math.imul(doorIndex | 0, 977) + Math.imul(attempt | 0, 7919)) | 0;
  const roll = new SeededRandom(mix).next(100);
  if (tier === 1) return roll < 30 ? 1 : 0;
  if (tier === 2) return roll < 25 ? 1 : roll < 45 ? 2 : 0;
  return roll < 20 ? 1 : roll < 40 ? 2 : roll < 70 ? 3 : 0;
}

/** Returns a CameraMode int (0 FirstPerson, 1 ThirdPerson, 2 TopDown). */
export function suggestedCamera(dread) {
  const tier = tierFor(dread);
  return tier === 0 ? 2 : tier === 1 ? 1 : 0;
}

export function allowedCamera(requested, dread) {
  return tierFor(dread) >= 3 && requested === 2 ? 0 : requested;
}

// ---- Investigator (Investigator.cs) ----

export const INVESTIGATOR_MAX_WAYPOINTS = 10;
export const INVESTIGATOR_RANGE = 2;
export const OMEN_SITE_IDS = ['altar', 'well', 'church', 'dead_tree'];

const siteCenter = (p) => ({ x: p.x + Math.trunc(p.sizeX / 2), z: p.z + Math.trunc(p.sizeZ / 2) });

export function buildInvestigatorRoute(layout, width, depth, rng) {
  const route = [];
  const count = Math.min(INVESTIGATOR_MAX_WAYPOINTS, layout.length);
  const used = new Array(layout.length).fill(false);
  const cur = rng.next(layout.length);
  used[cur] = true;
  const pos = siteCenter(layout[cur]);
  route.push({ x: pos.x, z: pos.z });
  const clamp = (c) => ({ x: Math.max(0, Math.min(width - 1, c.x)), z: Math.max(0, Math.min(depth - 1, c.z)) });
  for (let w = 1; w < count; w++) {
    let best = -1, bestDist = 2147483647;
    for (let i = 0; i < layout.length; i++) {
      if (used[i]) continue;
      const c = siteCenter(layout[i]);
      const d = Math.abs(c.x - pos.x) + Math.abs(c.z - pos.z);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) break;
    used[best] = true;
    const target = siteCenter(layout[best]);
    while (pos.x !== target.x) { pos.x += Math.sign(target.x - pos.x); route.push(clamp(pos)); }
    while (pos.z !== target.z) { pos.z += Math.sign(target.z - pos.z); route.push(clamp(pos)); }
  }
  return route;
}

/** One cell per step(); the first cell within range of each omen site yields a sanity hit. */
export class Investigator {
  constructor(layout, width, depth, seed) {
    this.rng = new SeededRandom(seed ^ 0x1abe11);
    this.route = [];
    this.tick = 0;
    this.sites = [];
    this.visited = [];
    if (!layout || !layout.length || !(width > 0) || !(depth > 0)) return;
    this.sites = layout.filter((p) => OMEN_SITE_IDS.includes(p.id));
    this.visited = this.sites.map(() => false);
    this.route = buildInvestigatorRoute(layout, width, depth, this.rng);
  }
  get finished() { return this.tick >= this.route.length; }
  get position() { return this.route.length ? this.route[Math.min(this.tick, this.route.length - 1)] : { x: 0, z: 0 }; }
  /** Returns a hit {tick, x, z, siteId, sanityLoss} or null. */
  step() {
    if (this.finished) return null;
    const cell = this.route[this.tick];
    const at = this.tick++;
    for (let i = 0; i < this.sites.length; i++) {
      if (this.visited[i]) continue;
      const c = siteCenter(this.sites[i]);
      if (Math.max(Math.abs(c.x - cell.x), Math.abs(c.z - cell.z)) > INVESTIGATOR_RANGE) continue;
      this.visited[i] = true;
      return { tick: at, x: cell.x, z: cell.z, siteId: this.sites[i].id, sanityLoss: 3 + this.rng.next(5) };
    }
    return null;
  }
}

export function simulateInvestigator(layout, width, depth, seed) {
  const inv = new Investigator(layout, width, depth, seed);
  const hits = [];
  while (!inv.finished) { const h = inv.step(); if (h) hits.push(h); }
  return hits;
}

export const describeInvestigatorHit = (h) => `tick ${h.tick} at ${h.x},${h.z} ${h.siteId} -${h.sanityLoss}`;
