// Round 34 (spec 169): JS port of Core/RealityInstability.cs. Golden key "reality". Pure functions, no DOM, no saved state.
// The data file web/data/reality.json is a byte copy of Packages/.../Data/reality.json (tools/validate_repo.py and a test check it).
// PRESENTATION ONLY: nothing here touches a save, a clue, sanity, a Vigil rule or an ending, and the underlying data stays intact so the truth can always be shown. Below tier 3 nothing changes.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';

export const REALITY_LANGUAGES = ['en', 'fr'];
export const REALITY_NOTE_IDS = ['house', 'villager', 'board', 'identity', 'location'];
export const REALITY_MIN_ENTRIES = 4, REALITY_INSTABILITY_STREAM = 0x52454c, MAX_TIER = 5;
export const HOUSE_TIER = 3, VILLAGER_TIER = 4, BOARD_TIER = 5;
export const KIND_HOUSE = 1, KIND_FALSE_VILLAGER = 2, KIND_CONTRADICTION = 3, KIND_IDENTITY = 4, KIND_LOCATION = 5;

const localized = (d, owner) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`reality: ${owner} holds a non-object`);
  const t = {};
  for (const lang of REALITY_LANGUAGES) {
    if (typeof d[lang] !== 'string' || !d[lang].trim()) throw new Error(`reality: ${owner} lacks ${lang} text`);
    t[lang] = d[lang];
  }
  return t;
};
const pool = (root, field) => {
  if (!Array.isArray(root[field]) || root[field].length < REALITY_MIN_ENTRIES) throw new Error(`reality: ${field} needs at least ${REALITY_MIN_ENTRIES} entries`);
  return root[field].map((d) => localized(d, field));
};

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed, has too few entries, lacks a note id or lacks a language. */
export function parseRealityLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('reality: root is not an object');
  const houseNames = pool(root, 'houseNames'), falseVillagers = pool(root, 'falseVillagers'), locationLooks = pool(root, 'locationLooks');
  if (!Array.isArray(root.notes) || root.notes.length !== REALITY_NOTE_IDS.length) throw new Error('reality: notes needs one entry per note id');
  const notes = root.notes.map((o, i) => {
    if (!o || o.id !== REALITY_NOTE_IDS[i]) throw new Error(`reality: notes entry ${i} must have id ${REALITY_NOTE_IDS[i]}`);
    return localized(o, `notes ${REALITY_NOTE_IDS[i]}`);
  });
  return { houseNames, falseVillagers, locationLooks, notes };
}

/** Whether the badge "reality unreliable" shows at this knowledge tier. */
export const realityUnreliable = (tier) => tier >= HOUSE_TIER;

/** Chance per mille that one subject of a kind is altered at a tier; 0 below the kind's tier. */
export function realityChance(kind, tier) {
  const t = Math.min(tier, MAX_TIER);
  switch (kind) {
    case KIND_HOUSE: return t >= HOUSE_TIER ? 250 + 150 * (t - HOUSE_TIER) : 0;
    case KIND_FALSE_VILLAGER: return t >= VILLAGER_TIER ? 600 + 200 * (t - VILLAGER_TIER) : 0;
    case KIND_CONTRADICTION: return t >= BOARD_TIER ? 500 : 0;
    case KIND_IDENTITY: return t >= BOARD_TIER ? 350 : 0;
    case KIND_LOCATION: return t >= BOARD_TIER ? 400 : 0;
    default: return 0;
  }
}

/** 32 bit FNV-1a of the id, masked non-negative: the subject number of a string id. */
export function realitySubjectOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h & 0x7fffffff;
}

const rngFor = (seed, night, kind, subject) => new SeededRandom(seed ^ REALITY_INSTABILITY_STREAM ^ Math.imul(night, INDEX_STEP) ^ Math.imul(kind, 0x9e37) ^ Math.imul(subject, 0x2545));
const hit = (rng, kind, tier) => { const c = realityChance(kind, tier); return c > 0 && rng.next(1000) < c; };

/** Index into lib.houseNames of the wrong name house number `house` carries tonight, or -1 for its true name. */
export function realityHouseName(lib, seed, night, tier, house) {
  const rng = rngFor(seed, night, KIND_HOUSE, house);
  return hit(rng, KIND_HOUSE, tier) ? rng.next(lib.houseNames.length) : -1;
}
/** Index into lib.falseVillagers of the false villager in the square tonight, or -1. At most one per night. */
export function realityFalseVillager(lib, seed, night, tier) {
  const rng = rngFor(seed, night, KIND_FALSE_VILLAGER, 0);
  return hit(rng, KIND_FALSE_VILLAGER, tier) ? rng.next(lib.falseVillagers.length) : -1;
}
/** Whether the board hides the contradiction pairId tonight. The evidence behind it is never hidden. */
export const realityContradictionHidden = (seed, night, tier, pairId) => hit(rngFor(seed, night, KIND_CONTRADICTION, realitySubjectOf(pairId)), KIND_CONTRADICTION, tier);
/** The villager index whose name `villager` is shown under tonight (never its own), or -1. Needs at least two villagers. */
export function realityBlurredIdentity(seed, night, tier, villager, count) {
  if (count < 2) return -1;
  const rng = rngFor(seed, night, KIND_IDENTITY, villager);
  if (!hit(rng, KIND_IDENTITY, tier)) return -1;
  const other = rng.next(count - 1);
  return other >= villager ? other + 1 : other;
}
/** Index into lib.locationLooks of the small change added to the description of place placeId tonight, or -1. */
export function realityLocationLook(lib, seed, night, tier, placeId) {
  const rng = rngFor(seed, night, KIND_LOCATION, realitySubjectOf(placeId));
  return hit(rng, KIND_LOCATION, tier) ? rng.next(lib.locationLooks.length) : -1;
}

/**
 * The client side of the instability: one object the panels ask. deps: { lib() -> parsed library or null, seed(), night() (1-based), tier() (knowledge tier), lang(), reduced?() }.
 * truth is a session switch (never saved): while it is on every query answers "unaltered", so the player can always compare with the real data.
 * Horror intensity hook: intensity() returns 1000 per mille today; a future horror intensity setting scales it (below 1000 the alterations would be skipped, not softened).
 */
export function createRealityView(deps) {
  let truth = false;
  const noted = new Set();
  const lib = () => deps.lib(), tier = () => (truth || !lib() ? 0 : deps.tier() | 0), night = () => Math.max(1, deps.night()), t = (o) => o[deps.lang()] || o.en;
  const view = {
    intensity: () => 1000,
    unreliable: () => !!lib() && realityUnreliable(deps.tier() | 0),
    active: () => realityUnreliable(tier()),
    truth: () => truth,
    setTruth(on) { truth = !!on; },
    houseName(house, trueName) { const k = lib() ? realityHouseName(lib(), deps.seed(), night(), tier(), house) : -1; return k < 0 ? trueName : t(lib().houseNames[k]); },
    falseVillager() { const k = lib() ? realityFalseVillager(lib(), deps.seed(), night(), tier()) : -1; return k < 0 ? null : t(lib().falseVillagers[k]); },
    contradictionHidden: (pairId) => realityContradictionHidden(deps.seed(), night(), tier(), pairId),
    /** The name shown for roster villager `index`: another villager's name when blurred, else its own. */
    shownName(index, names) { const k = realityBlurredIdentity(deps.seed(), night(), tier(), index, names.length); return k < 0 ? names[index] : names[k]; },
    isBlurred: (index, count) => realityBlurredIdentity(deps.seed(), night(), tier(), index, count) >= 0,
    /** The place description with the night's small change added, or the true text. */
    placeLabel(placeId, trueLabel) { const k = lib() ? realityLocationLook(lib(), deps.seed(), night(), tier(), placeId) : -1; return k < 0 ? trueLabel : `${trueLabel} (${t(lib().locationLooks[k])})`; },
    /** The diegetic journal note for a kind, once per night and kind; '' when already written or when no library is loaded. */
    noteOnce(noteId) {
      if (!lib()) return '';
      const key = `${deps.seed()}:${night()}:${noteId}`;
      if (noted.has(key)) return '';
      noted.add(key);
      return t(lib().notes[REALITY_NOTE_IDS.indexOf(noteId)]);
    },
  };
  return view;
}
