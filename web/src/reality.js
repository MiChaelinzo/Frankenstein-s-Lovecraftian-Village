// Round 34 (spec 169): JS port of Core/RealityInstability.cs. Golden key "reality". Pure functions, no DOM, no saved state.
// The data file web/data/reality.json is a byte copy of Packages/.../Data/reality.json (tools/validate_repo.py and a test check it).
// PRESENTATION ONLY: nothing here touches a save, a clue, sanity, a Vigil rule or an ending, and the underlying data stays intact so the truth can always be shown. Below tier 3 nothing changes.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';

export const REALITY_LANGUAGES = ['en', 'fr'];
export const REALITY_NOTE_IDS = ['house', 'villager', 'board', 'identity', 'location'];
export const REALITY_MIN_ENTRIES = 4, REALITY_INSTABILITY_STREAM = 0x52454c, MAX_TIER = 5;
export const HOUSE_TIER = 3, VILLAGER_TIER = 4, BOARD_TIER = 5;
export const COLLAPSE_TIER = 5, COLLAPSE_ONSET_FLOOR = 2, COLLAPSE_ONSET_SPAN = 4, COLLAPSE_IDENTITY_STEPS = 2;
export const KIND_COLLAPSE_HOUSE = 6, KIND_COLLAPSE_VILLAGER = 7, KIND_COLLAPSE_IDENTITY = 8, KIND_COLLAPSE_PATH = 9, KIND_PHANTOM_SHAPE = 10;
/** The ids of the phantom paths a client can draw at tier 5, in a stable order. Mirrors RealityInstability.PhantomPathIds. */
export const PHANTOM_PATH_IDS = ['orchard_lane', 'tide_steps', 'bell_path', 'cellar_way', 'ridge_track'];
export const IDENTITY_TRUE = 0, IDENTITY_QUESTIONED = 1, IDENTITY_UNKNOWN = 2;
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
    case KIND_COLLAPSE_HOUSE: return t >= COLLAPSE_TIER ? 500 : 0;
    case KIND_COLLAPSE_VILLAGER: return t >= COLLAPSE_TIER ? 300 : 0;
    case KIND_COLLAPSE_IDENTITY: return t >= COLLAPSE_TIER ? 350 : 0;
    case KIND_COLLAPSE_PATH: return t >= COLLAPSE_TIER ? 400 : 0;
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

// Reality Collapse (spec 183): decided once per seed (night 0 stream); the night only decides whether the onset has passed. The true value is never changed.
const collapseOnset = (rng) => COLLAPSE_ONSET_FLOOR + rng.next(COLLAPSE_ONSET_SPAN);
/** Index into lib.houseNames of the name house `house` has drifted to from its onset night on, or -1 for the true name. */
export function realityCollapsedHouseName(lib, seed, night, tier, house) {
  const rng = rngFor(seed, 0, KIND_COLLAPSE_HOUSE, house);
  if (!hit(rng, KIND_COLLAPSE_HOUSE, tier)) return -1;
  const onset = collapseOnset(rng), name = rng.next(lib.houseNames.length);
  return night >= onset ? name : -1;
}
/** The villager index that never existed from its onset night on, or -1. At most one per seed. Needs at least two villagers. */
export function realityErasedVillager(seed, night, tier, count) {
  if (count < 2) return -1;
  const rng = rngFor(seed, 0, KIND_COLLAPSE_VILLAGER, 0);
  if (!hit(rng, KIND_COLLAPSE_VILLAGER, tier)) return -1;
  const onset = collapseOnset(rng), villager = rng.next(count);
  return night >= onset ? villager : -1;
}
/** 0 Name, 1 Name?, 2 Unknown plus the role: one step per night after the onset. */
export function realityIdentityStep(seed, night, tier, villager) {
  const rng = rngFor(seed, 0, KIND_COLLAPSE_IDENTITY, villager);
  if (!hit(rng, KIND_COLLAPSE_IDENTITY, tier)) return IDENTITY_TRUE;
  const onset = collapseOnset(rng);
  return night < onset ? IDENTITY_TRUE : Math.min(COLLAPSE_IDENTITY_STEPS, night - onset + 1);
}
/** Whether the phantom path pathId is drawn tonight: it appears on exactly one night (its onset) and is gone the next. False below tier 5. */
export function realityPhantomPathVisible(seed, night, tier, pathId) {
  const rng = rngFor(seed, 0, KIND_COLLAPSE_PATH, realitySubjectOf(pathId));
  return hit(rng, KIND_COLLAPSE_PATH, tier) && night === collapseOnset(rng);
}
/** Cells [[x, z], ...] of phantom path pathId on a gridW by gridD grid: two seed-chosen cells joined by one bend. Presentation only, never saved. Mirrors RealityInstability.PhantomPathCells. */
export function realityPhantomPathCells(seed, pathId, gridW, gridD) {
  const rng = rngFor(seed, 0, KIND_PHANTOM_SHAPE, realitySubjectOf(pathId));
  const ax = rng.next(Math.max(1, gridW)), az = rng.next(Math.max(1, gridD)), bx = rng.next(Math.max(1, gridW)), bz = rng.next(Math.max(1, gridD));
  return [[ax, az], [bx, az], [bx, bz]];
}

/**
 * The client side of the instability: one object the panels ask. deps: { lib() -> parsed library or null, seed(), night() (1-based), tier() (knowledge tier), lang(), reduced?() }.
 * truth is a session switch (never saved): while it is on every query answers "unaltered", so the player can always compare with the real data.
 * Horror intensity: optional deps.intensity() in per mille (500 gentle, 1000 standard, 1500 dread). Below 1000 the tier drops one step, so the mildest alterations are skipped, not softened; the badge still follows the real tier.
 */
export function createRealityView(deps) {
  let truth = false;
  // Horror Intensity below standard (per mille under 1000) drops the tier one step: the milder alterations are skipped, never softened. Standard and Dread are the same here.
  const shifted = (tier) => (view.intensity() < 1000 ? Math.max(0, tier - 1) : tier);
  const noted = new Set();
  const lib = () => deps.lib(), tier = () => (truth || !lib() ? 0 : shifted(deps.tier() | 0)), night = () => Math.max(1, deps.night()), t = (o) => o[deps.lang()] || o.en;
  const view = {
    intensity: () => (deps.intensity ? deps.intensity() : 1000),
    unreliable: () => !!lib() && realityUnreliable(deps.tier() | 0),
    active: () => realityUnreliable(tier()),
    truth: () => truth,
    setTruth(on) { truth = !!on; },
    houseName(house, trueName) {
      if (!lib()) return trueName;
      const k = realityHouseName(lib(), deps.seed(), night(), tier(), house), c = k < 0 ? realityCollapsedHouseName(lib(), deps.seed(), night(), tier(), house) : k;
      return c < 0 ? trueName : t(lib().houseNames[c]);
    },
    /** Collapse (tier 5): true when roster villager `index` never existed tonight. The list leaves the row out; the truth switch brings it back. */
    erased: (index, count) => realityErasedVillager(deps.seed(), night(), tier(), count) === index,
    /** Collapse identity step of a roster villager: 0 Name, 1 Name?, 2 Unknown plus the role. */
    identityStep: (index) => realityIdentityStep(deps.seed(), night(), tier(), index),
    /** Collapse (tier 5): whether the phantom path is drawn tonight. */
    phantomPath: (pathId) => realityPhantomPathVisible(deps.seed(), night(), tier(), pathId),
    /** Every phantom path drawn tonight as { id, cells }; empty below tier 5 and while the truth switch is on. Presentation only: never part of a save. */
    phantomPaths: (gridW, gridD) => PHANTOM_PATH_IDS.filter((id) => view.phantomPath(id)).map((id) => ({ id, cells: realityPhantomPathCells(deps.seed(), id, gridW, gridD) })),
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
