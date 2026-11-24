// Round 27: JS port of Core/MythosSimulation.cs and Core/MythosFeeds.cs (the Mythos Simulation Engine). Golden key "mythos". Pure, no DOM, integer math only.
// The data file web/data/mythos.json is a byte copy of Packages/.../Data/mythos.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: cults recruit corrupted villagers, secrets build exposure pressure, omens press on both, rumors travel the family and neighbour links.
import { SeededRandom } from './core.js';
import { TIER_SUSPICIOUS, TIER_TRUSTING, SCALE, MAX_RITUAL_STAGE, INDEX_STEP, FAMILY_DELAY, NEIGHBOUR_DELAY, CULT_AT, CORRUPTION_CULTIST, UNREACHABLE } from './society.js';
import { TIERS, STAGES, render } from './village-story.js';

export const MYTHOS_LANGUAGES = ['en', 'fr'];
export const SOURCE_IDS = ['secret', 'cosmic', 'missing'];
export const [SOURCE_SECRET, SOURCE_COSMIC, SOURCE_MISSING] = [0, 1, 2];
export const [EVENT_CULT_FOUNDED, EVENT_CULT_JOINED, EVENT_SECRET_EXPOSED, EVENT_RUMOR_STARTED, EVENT_COSMIC_OMEN] = [0, 1, 2, 3, 4];

export const CULT_STREAM = 0x43554c, FOUNDER_STREAM = 0x464f55, JOIN_STREAM = 0x4a4f4e, SECRET_STREAM = 0x534543, OMEN_STREAM = 0x4f4d4e, RUMOR_PICK_STREAM = 0x52504b, RUMOR_ORIGIN_STREAM = 0x524f52, DISTORT_STREAM = 0x444953;
export const MAX_CULTS = 3, SECRET_FREE_OUT_OF = 3, START_EXPOSURE_RANGE = 300, CULT_NEIGHBOUR_PRESSURE = 40;
export const EVENT_BASE_CHANCE = 150, EVENT_INTENSITY_DIVISOR = 2, RITUAL_INTENSITY_STEP = 100, JOIN_BOOST_MAX = 100, EXPOSURE_BOOST_MAX = 60, DISTORT_OUT_OF = 4;
const HOP_DISTORT_SALT = 7919;

export const ID_PREFIX = 'mythos:', SECRET_PREFIX = 'mythos:secret:', RUMOR_PREFIX = 'mythos:rumor:', OMEN_PREFIX = 'mythos:omen:', CULT_PREFIX = 'mythos:cult:';
export const SECRET_MINUTE = 1260, CULT_MINUTE = 1320, OMEN_MINUTE = 1380, RUMOR_MINUTE = 1200;
export const EXPOSED_SECRET_SUSPICION = 150, CULT_TIE_SUSPICION = 100;

export const secretId = (villager) => SECRET_PREFIX + villager;
export const rumorId = (night) => RUMOR_PREFIX + night;
export const omenId = (night) => OMEN_PREFIX + night;
export const cultId = (villager) => CULT_PREFIX + villager;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function text(o, owner) {
  const t = {};
  for (const lang of MYTHOS_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`mythos: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
}
const objects = (root, key) => {
  if (!Array.isArray(root[key])) throw new Error(`mythos: missing ${key} array`);
  for (const item of root[key]) if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`mythos: ${key} holds a non-object`);
  return root[key];
};
const child = (root, key) => { if (!root[key] || typeof root[key] !== 'object') throw new Error(`mythos: missing ${key} object`); return root[key]; };
const str = (o, key, owner) => { if (typeof o[key] !== 'string' || !o[key]) throw new Error(`mythos: ${owner} lacks ${key}`); return o[key]; };

function entries(root, key, withPressure) {
  const list = [];
  for (const o of objects(root, key)) {
    const e = { id: str(o, 'id', `${key} entry`), pressure: 0, text: null };
    e.text = text(o, `${key} ${e.id}`);
    if (withPressure) {
      if (typeof o.pressure !== 'number') throw new Error(`mythos: ${key} ${e.id} lacks pressure`);
      e.pressure = Math.trunc(o.pressure);
      if (e.pressure <= 0 || e.pressure > SCALE) throw new Error(`mythos: ${key} ${e.id} has pressure out of range`);
    }
    if (list.some((x) => x.id === e.id)) throw new Error(`mythos: duplicate ${key} id ${e.id}`);
    list.push(e);
  }
  return list;
}

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed. */
export function parseMythosLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('mythos: root is not an object');
  const lib = { cults: entries(root, 'cults', false), secrets: entries(root, 'secrets', true), omens: entries(root, 'omens', false), rumors: [], cultLine: text(child(root, 'cultLine'), 'cultLine'), contradictionReason: text(child(root, 'contradiction'), 'contradiction') };
  if (lib.cults.length < MAX_CULTS) throw new Error(`mythos: cults needs at least ${MAX_CULTS} entries`);
  if (!lib.secrets.length || !lib.omens.length) throw new Error('mythos: secrets and omens must not be empty');
  for (const o of objects(root, 'rumors')) {
    const source = SOURCE_IDS.indexOf(str(o, 'source', 'rumor'));
    if (source < 0) throw new Error('mythos: rumor has an unknown source');
    const line = { source, ref: typeof o.ref === 'string' ? o.ref : '', truth: false, text: text(o, `rumor ${SOURCE_IDS[source]}`) };
    if (typeof o.truth !== 'boolean') throw new Error(`mythos: rumor ${SOURCE_IDS[source]} lacks truth`);
    line.truth = o.truth;
    if (source === SOURCE_SECRET && !lib.secrets.some((s) => s.id === line.ref)) throw new Error(`mythos: rumor refers to unknown secret ${line.ref}`);
    if (source === SOURCE_COSMIC && !lib.omens.some((s) => s.id === line.ref)) throw new Error(`mythos: rumor refers to unknown omen ${line.ref}`);
    lib.rumors.push(line);
  }
  return lib;
}

export const DREAD_PER_NIGHT = 100;

/**
 * The fixed schedule a play session replays the village on (Core MythosInputs.Schedule): night k has dread 100 * k per mille (capped) and ritual stage k - 1 (capped).
 * It never reads live values, so a statement heard on night N is recomputed identically on every later night.
 */
export function mythosSchedule(nights) {
  const n = Math.max(0, nights | 0), dreadPermille = [], ritualStage = [];
  for (let k = 1; k <= n; k++) { dreadPermille.push(Math.min(SCALE, DREAD_PER_NIGHT * k)); ritualStage.push(Math.min(MAX_RITUAL_STAGE, k - 1)); }
  return { dreadPermille, ritualStage };
}

/** Value of a per night input array at a night: clamps the night, an empty or missing array reads 0. */
export function inputAt(values, night) {
  if (!values || values.length === 0) return 0;
  return values[Math.min(Math.max(night, 1), values.length) - 1];
}

export const rumorSourceKey = (source, refId) => `${SOURCE_IDS[source]}:${refId}`;

/** Family and nearest neighbour links as one undirected graph; each villager's links ordered by delay then index. */
export function buildGraph(society) {
  const n = society.roster.length, best = new Map();
  const add = (a, b, delay) => {
    if (a === b || a < 0 || b < 0) return;
    const key = a * n + b, existing = best.get(key);
    if (existing === undefined || delay < existing) best.set(key, delay);
  };
  for (let i = 0; i < n; i++) {
    for (const j of society.familyLinks[i]) { add(i, j, FAMILY_DELAY); add(j, i, FAMILY_DELAY); }
    add(i, society.neighbour[i], NEIGHBOUR_DELAY);
    add(society.neighbour[i], i, NEIGHBOUR_DELAY);
  }
  const neighbours = [], delays = [];
  for (let i = 0; i < n; i++) {
    const edges = [];
    for (let j = 0; j < n; j++) { const d = best.get(i * n + j); if (d !== undefined) edges.push([d, j]); }
    edges.sort((x, y) => (x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]));
    neighbours.push(edges.map((e) => e[1]));
    delays.push(edges.map((e) => e[0]));
  }
  return { neighbours, delays };
}

/** Nights of delay from the origin to each villager (UNREACHABLE when no chain of links reaches them). */
export function rumorDelays(graph, n, origin) {
  const delay = new Array(n).fill(UNREACHABLE);
  delay[origin] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      if (delay[i] === UNREACHABLE) continue;
      for (let k = 0; k < graph.neighbours[i].length; k++) {
        const j = graph.neighbours[i][k], d = delay[i] + graph.delays[i][k];
        if (d < delay[j]) { delay[j] = d; changed = true; }
      }
    }
  }
  return delay;
}

/** Whether the hop into villager `to` distorts rumor `id`. Decided by the receiver only. */
export const hopDistorts = (seed, id, to) => new SeededRandom(seed ^ DISTORT_STREAM ^ Math.imul(id, INDEX_STEP) ^ Math.imul(to, HOP_DISTORT_SALT)).next(DISTORT_OUT_OF) === 0;

/** Fills in the holders of a freshly born rumor for every villager the links reach. */
function spread(society, graph, rumor) {
  const n = society.roster.length, delay = rumorDelays(graph, n, rumor.origin), order = [];
  for (let i = 0; i < n; i++) if (delay[i] !== UNREACHABLE) order.push(i);
  order.sort((a, b) => (delay[a] !== delay[b] ? delay[a] - delay[b] : a - b));
  const distortion = new Array(n).fill(0);
  for (const i of order) {
    if (i !== rumor.origin) {
      let parent = -1;
      for (let k = 0; k < graph.neighbours[i].length && parent < 0; k++) {
        const j = graph.neighbours[i][k];
        if (delay[j] !== UNREACHABLE && delay[j] + graph.delays[i][k] === delay[i]) parent = j;
      }
      distortion[i] = distortion[parent] + (hopDistorts(society.seed, rumor.id, i) ? 1 : 0);
    }
    rumor.holders.push({ villager: i, distortion: distortion[i], night: rumor.night + delay[i], truth: distortion[i] === 0 });
  }
}

/** A copy of the rumor holding only the villagers who have heard it by `night`. */
function asOfNight(rumor, night) {
  return { ...rumor, holders: rumor.holders.filter((h) => h.night <= night) };
}

function foundCults(society, lib, state, cultOf) {
  const n = society.roster.length;
  const count = 1 + new SeededRandom(society.seed ^ CULT_STREAM).next(MAX_CULTS);
  const offset = new SeededRandom(society.seed ^ CULT_STREAM ^ INDEX_STEP).next(lib.cults.length);
  for (let c = 0; c < count && c < n; c++) {
    let founder = c === 0 ? society.patientZero : new SeededRandom(society.seed ^ FOUNDER_STREAM ^ Math.imul(c, INDEX_STEP)).next(n);
    while (cultOf[founder] >= 0) founder = (founder + 1) % n;
    const data = (offset + c) % lib.cults.length;
    state.cults.push({ dataIndex: data, id: lib.cults[data].id, founder });
    cultOf[founder] = c;
  }
}

function cultFor(society, state, graph, cultOf, villager) {
  for (const j of graph.neighbours[villager]) if (cultOf[j] >= 0) return cultOf[j];
  return new SeededRandom(society.seed ^ JOIN_STREAM ^ Math.imul(villager, INDEX_STEP)).next(state.cults.length);
}

function startRumor(society, story, lib, state, graph, night, dread, ritual, exposedTonight, omen) {
  const sources = [];
  for (const v of exposedTonight) sources.push({ source: SOURCE_SECRET, subject: v, key: rumorSourceKey(SOURCE_SECRET, lib.secrets[state.secretKind[v]].id) });
  if (omen >= 0) sources.push({ source: SOURCE_COSMIC, subject: omen, key: rumorSourceKey(SOURCE_COSMIC, lib.omens[omen].id) });
  for (let k = 0; k < story.missing.length; k++) sources.push({ source: SOURCE_MISSING, subject: k, key: rumorSourceKey(SOURCE_MISSING, '') });
  if (!sources.length) return null;
  const r = sources[new SeededRandom(society.seed ^ RUMOR_PICK_STREAM ^ Math.imul(night, INDEX_STEP)).next(sources.length)], n = society.roster.length;
  r.id = night;
  r.night = night;
  if (r.source === SOURCE_SECRET && graph.neighbours[r.subject].length > 0) r.origin = graph.neighbours[r.subject][0];
  else if (r.source === SOURCE_MISSING && story.missing[r.subject].witnessIndex >= 0) r.origin = story.missing[r.subject].witnessIndex;
  else r.origin = new SeededRandom(society.seed ^ RUMOR_ORIGIN_STREAM ^ Math.imul(night, INDEX_STEP)).next(n);
  r.tier = Math.min(TIERS - 1, Math.trunc((dread * TIERS) / (SCALE + 1)));
  r.stage = Math.min(STAGES - 1, Math.trunc((ritual * STAGES) / (MAX_RITUAL_STAGE + 1)));
  r.holders = [];
  spread(society, graph, r);
  return r;
}

function snapshot(state, cultOf, events, rumors, night, n) {
  const snap = { night, events, cultMembers: state.cults.map(() => []), exposed: [], rumors: [] };
  for (let i = 0; i < n; i++) {
    if (cultOf[i] >= 0) snap.cultMembers[cultOf[i]].push(i);
    if (state.exposedNight[i] > 0) snap.exposed.push(i);
  }
  for (const r of rumors) snap.rumors.push(asOfNight(r, night));
  return snap;
}

/**
 * Replays nights 1..throughNight with no hidden state. society comes from buildSociety, story from buildStory, inputs is { dreadPermille: [], ritualStage: [] }.
 * Returns { seed, cults, secretKind, exposedNight, nights, atNight(n) }.
 */
export function runMythos(society, story, lib, inputs, throughNight) {
  const n = society.roster.length;
  const state = { seed: society.seed, cults: [], secretKind: new Array(n).fill(0), exposedNight: new Array(n).fill(0), nights: [], atNight(night) { return this.nights.length === 0 ? null : this.nights[clamp(night, 1, this.nights.length) - 1]; } };
  if (n === 0) return state;
  const graph = buildGraph(society), meter = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const rng = new SeededRandom(society.seed ^ SECRET_STREAM ^ Math.imul(i, INDEX_STEP));
    state.secretKind[i] = rng.next(SECRET_FREE_OUT_OF) === 0 ? -1 : rng.next(lib.secrets.length);
    meter[i] = rng.next(START_EXPOSURE_RANGE);
  }
  const cultOf = new Array(n).fill(-1);
  foundCults(society, lib, state, cultOf);

  const rumors = [];
  let previousIntensity = 0;
  for (let night = 1; night <= throughNight; night++) {
    const dread = clamp(inputAt(inputs.dreadPermille, night), 0, SCALE), ritual = clamp(inputAt(inputs.ritualStage, night), 0, MAX_RITUAL_STAGE);
    const joinBoost = Math.trunc((previousIntensity * JOIN_BOOST_MAX) / SCALE), exposureBoost = Math.trunc((previousIntensity * EXPOSURE_BOOST_MAX) / SCALE);
    const events = [];
    if (night === 1) state.cults.forEach((c, index) => events.push({ kind: EVENT_CULT_FOUNDED, subject: c.founder, other: index, key: c.id, night }));

    const dreadFloat = dread / SCALE;
    for (let i = 0; i < n; i++) {
      if (cultOf[i] >= 0 || society.fate[i] !== CORRUPTION_CULTIST) continue;
      if (society.corruptionLevel(i, night, dreadFloat, ritual) < CULT_AT - joinBoost) continue;
      cultOf[i] = cultFor(society, state, graph, cultOf, i);
      events.push({ kind: EVENT_CULT_JOINED, subject: i, other: cultOf[i], key: state.cults[cultOf[i]].id, night });
    }

    const exposedTonight = [];
    for (let i = 0; i < n; i++) {
      if (state.secretKind[i] < 0 || state.exposedNight[i] > 0) continue;
      let pressure = lib.secrets[state.secretKind[i]].pressure + exposureBoost;
      for (const j of graph.neighbours[i]) {
        if (cultOf[j] >= 0) pressure += CULT_NEIGHBOUR_PRESSURE;
      }
      meter[i] += pressure;
      if (meter[i] < SCALE) continue;
      state.exposedNight[i] = night;
      exposedTonight.push(i);
      events.push({ kind: EVENT_SECRET_EXPOSED, subject: i, other: -1, key: lib.secrets[state.secretKind[i]].id, night });
    }

    let intensity = 0, omen = -1;
    const omenRoll = new SeededRandom(society.seed ^ OMEN_STREAM ^ Math.imul(night, INDEX_STEP)), candidate = clamp(dread + ritual * RITUAL_INTENSITY_STEP, 0, SCALE);
    if (omenRoll.next(SCALE) < EVENT_BASE_CHANCE + Math.trunc(candidate / EVENT_INTENSITY_DIVISOR)) {
      omen = omenRoll.next(lib.omens.length);
      intensity = candidate;
      events.push({ kind: EVENT_COSMIC_OMEN, subject: -1, other: omen, key: lib.omens[omen].id, night });
    }
    previousIntensity = intensity;

    const rumor = startRumor(society, story, lib, state, graph, night, dread, ritual, exposedTonight, omen);
    if (rumor) {
      rumors.push(rumor);
      events.push({ kind: EVENT_RUMOR_STARTED, subject: rumor.origin, other: rumor.subject, key: rumor.key, night });
    }
    state.nights.push(snapshot(state, cultOf, events, rumors, night, n));
  }
  return state;
}

/** The simulation as the board and chat see it: { library, state, night, current }. */
export const buildMythosFeed = (library, state, night) => ({ library, state, night, get current() { return state.atNight(night); } });

/** Every statement the mythos holds up to the feed night, in event order. */
export function mythosStatements(feed) {
  const list = [], current = feed.current;
  if (!current) return list;
  for (let night = 1; night <= current.night; night++)
    for (const e of feed.state.atNight(night).events) {
      switch (e.kind) {
        case EVENT_SECRET_EXPOSED: list.push({ id: secretId(e.subject), kind: e.kind, subject: e.subject, night: e.night, minute: SECRET_MINUTE, rumor: null }); break;
        case EVENT_COSMIC_OMEN: list.push({ id: omenId(e.night), kind: e.kind, subject: e.other, night: e.night, minute: OMEN_MINUTE, rumor: null }); break;
        case EVENT_CULT_FOUNDED:
        case EVENT_CULT_JOINED: list.push({ id: cultId(e.subject), kind: e.kind, subject: e.subject, night: e.night, minute: CULT_MINUTE, rumor: null }); break;
        default: {
          let rumor = null;
          for (const r of current.rumors) if (r.id === e.night) rumor = r;
          list.push({ id: rumorId(e.night), kind: e.kind, subject: e.other, night: e.night, minute: RUMOR_MINUTE, rumor });
        }
      }
    }
  return list;
}

/** Whether villager `speaker` passes this rumor on distorted. A villager who does not hold the rumor is not counted as distorting it. */
export function isDistorted(rumor, speaker) {
  if (!rumor) return false;
  const h = rumor.holders.find((x) => x.villager === speaker);
  return h ? !h.truth : false;
}

/** The statement a distorted rumor is contradicted by (the exposed secret or the omen it is about), or '' for a missing person rumor. */
export function truthStatementId(rumor) {
  if (rumor.source === SOURCE_SECRET) return secretId(rumor.subject);
  return rumor.source === SOURCE_COSMIC ? omenId(rumor.night) : '';
}

const pick = (t, lang) => t[lang] || t.en;

function cultDataIndexOf(feed, villager) {
  const current = feed.current;
  for (let c = 0; c < current.cultMembers.length; c++) if (current.cultMembers[c].includes(villager)) return feed.state.cults[c].dataIndex;
  return 0;
}

/** The line of a rumor: an authored line of its source and subject kind with the requested truth, picked by seed and night; else story.rumorText. */
export function mythosRumorText(feed, story, rumor, distorted, lang) {
  const lib = feed.library;
  const refId = rumor.source === SOURCE_SECRET ? lib.secrets[feed.state.secretKind[rumor.subject]].id : rumor.source === SOURCE_COSMIC ? lib.omens[rumor.subject].id : '';
  const eligible = lib.rumors.filter((l) => l.source === rumor.source && l.ref === refId && l.truth === !distorted);
  if (!eligible.length) return story.rumorText(rumor.night, rumor.stage, rumor.tier, lang);
  const line = eligible[new SeededRandom(story.seed ^ RUMOR_PICK_STREAM ^ Math.imul(rumor.night, INDEX_STEP)).next(eligible.length)];
  const vars = { village: story.villageName };
  if (rumor.source === SOURCE_SECRET) vars.name = story.roster[rumor.subject].name;
  if (rumor.source === SOURCE_MISSING) Object.assign(vars, story.missingVars(story.missing[rumor.subject], lang));
  return render(pick(line.text, lang), vars);
}

/** The wording of a statement. `distorted` only matters for rumors. */
export function mythosText(feed, story, s, distorted, lang) {
  const lib = feed.library, vars = { village: story.villageName };
  switch (s.kind) {
    case EVENT_SECRET_EXPOSED:
      vars.name = story.roster[s.subject].name;
      return render(pick(lib.secrets[feed.state.secretKind[s.subject]].text, lang), vars);
    case EVENT_COSMIC_OMEN: return render(pick(lib.omens[s.subject].text, lang), vars);
    case EVENT_CULT_FOUNDED:
    case EVENT_CULT_JOINED:
      vars.name = story.roster[s.subject].name;
      vars.cult = pick(lib.cults[cultDataIndexOf(feed, s.subject)].text, lang);
      return render(pick(lib.cultLine, lang), vars);
    default: return mythosRumorText(feed, story, s.rumor, distorted, lang);
  }
}

/** Extra suspicion (per mille) of each villager after a night: an exposed secret and a cult tie each add. */
export function suspicionPressure(night, villagers) {
  const pressure = new Array(villagers).fill(0);
  if (!night) return pressure;
  for (const v of night.exposed) if (v >= 0 && v < villagers) pressure[v] += EXPOSED_SECRET_SUSPICION;
  for (const members of night.cultMembers) for (const v of members) if (v >= 0 && v < villagers) pressure[v] += CULT_TIE_SUSPICION;
  return pressure;
}

// Round 28 (spec 154a): the night tick record. JS port of Core/NightTicks.cs. Every field is counted from the simulated nights, so replay equals incremental.
export const SECRET_SHIFT = 2, CULT_SHIFT = 1, OMEN_SHIFT = 3;

/** The record of every simulated night, in order: { night, cultGrowth, rumorsChanged, rumorsAdded, missingPersons, newMissingPerson, newOmen, realityShift, reality, secretDiscovered }. Throws naming newOmen on an unknown omen id. */
export function buildNightTicks(state, lib) {
  const list = [];
  if (!state || !lib) return list;
  let reality = 0;
  const seenMissing = new Set();
  for (const night of state.nights) {
    const rec = { night: night.night, cultGrowth: 0, rumorsChanged: 0, rumorsAdded: 0, missingPersons: 0, newMissingPerson: 0, newOmen: '', realityShift: 0, reality: 0, secretDiscovered: false };
    let exposedTonight = 0;
    for (const e of night.events) {
      if (e.kind === EVENT_CULT_FOUNDED || e.kind === EVENT_CULT_JOINED) rec.cultGrowth++;
      else if (e.kind === EVENT_RUMOR_STARTED) rec.rumorsAdded++;
      else if (e.kind === EVENT_SECRET_EXPOSED) { rec.secretDiscovered = true; exposedTonight++; }
      else if (e.kind === EVENT_COSMIC_OMEN) {
        if (!lib.omens.some((o) => o.id === e.key)) throw new Error(`mythos: night ${night.night} newOmen names unknown omen ${e.key}`);
        rec.newOmen = e.key;
      }
    }
    const before = seenMissing.size;
    for (const r of night.rumors) {
      if (r.source === SOURCE_MISSING) seenMissing.add(r.subject);
      if (r.night >= night.night) continue;
      for (const h of r.holders) if (h.night === night.night) rec.rumorsChanged++;
    }
    rec.missingPersons = seenMissing.size;
    rec.newMissingPerson = seenMissing.size - before;
    rec.realityShift = exposedTonight * SECRET_SHIFT + rec.cultGrowth * CULT_SHIFT + (rec.newOmen ? OMEN_SHIFT : 0);
    reality += rec.realityShift;
    rec.reality = reality;
    list.push(rec);
  }
  return list;
}

/** The record of one night; a night outside the simulated range clamps, null when nothing was simulated. */
const nightTickCache = new WeakMap();
export function nightTickAt(state, lib, night) {
  if (!state || !lib) return null;
  let hit = nightTickCache.get(state);
  if (!hit || hit.lib !== lib || hit.count !== state.nights.length) {
    hit = { lib, count: state.nights.length, all: buildNightTicks(state, lib) };
    nightTickCache.set(state, hit);
  }
  const all = hit.all;
  return all.length === 0 ? null : all[Math.min(Math.max(night, 1), all.length) - 1];
}

/**
 * Round 28: what a lucid villager can tell the player in a village chat (Core MythosChat.Lines), as [{ id, text }]: the newest rumor they hold, the truth behind it when they
 * started it, and a cult member among their links. Nothing for a suspicious, withheld or corrupted chat. `graph` is buildGraph(society), passed in so a caller can cache it.
 */
export function mythosChatLines(society, feed, story, graph, index, tier, night1, result, lang) {
  if (!society || !feed || !story || !result || !feed.current || index < 0 || index >= society.roster.length) return [];
  if (!result.available || result.behavior !== 0 || result.withheld || tier === TIER_SUSPICIOUS) return [];
  if (!(result.hintId === 'village' || (tier === TIER_TRUSTING && result.hintId))) return [];
  const all = mythosStatements(feed), ids = [];
  let rumor = null;
  for (const m of all) if (m.rumor && m.night <= night1 && m.rumor.holders.some((h) => h.villager === index)) rumor = m;
  if (rumor) { ids.push(rumor.id); const truth = rumor.rumor.origin === index ? truthStatementId(rumor.rumor) : ''; if (truth) ids.push(truth); }
  const members = new Set(feed.current.cultMembers.flat());
  const tie = (graph || buildGraph(society)).neighbours[index].find((j) => members.has(j) && all.some((m) => m.id === cultId(j)));
  if (tie !== undefined) ids.push(cultId(tie));
  const lines = [];
  for (const id of ids) {
    const m = all.find((x) => x.id === id);
    if (m) lines.push({ id, text: mythosText(feed, story, m, isDistorted(m.rumor, index), lang) });
  }
  return lines;
}
