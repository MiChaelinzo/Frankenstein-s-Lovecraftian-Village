// Round 30 (spec 163): JS port of Core/MissingOutcomes.cs. Golden key "outcomes". Pure, no DOM, integer math only.
// The data file web/data/outcomes.json is a byte copy of Packages/.../Data/outcomes.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: exactly one outcome per missing person, weighted by the finished mythos run and by the leads the player has on that person.
import { SeededRandom } from './core.js';
import { SCALE, INDEX_STEP, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST } from './society.js';
import { mythosSchedule, inputAt, EVENT_COSMIC_OMEN } from './mythos.js';
import { render } from './village-story.js';
import { CLUE_ID_PREFIX } from './lore.js';
import { leadsFor } from './places.js';

export const OUTCOME_LANGUAGES = ['en', 'fr'];
export const OUTCOME_IDS = ['dead', 'escaped', 'recruited', 'transformed', 'hidden', 'displaced'];
export const [OUTCOME_DEAD, OUTCOME_ESCAPED, OUTCOME_RECRUITED, OUTCOME_TRANSFORMED, OUTCOME_HIDDEN, OUTCOME_DISPLACED] = [0, 1, 2, 3, 4, 5];
export const [REVEAL_NOTHING, REVEAL_TAKEN, REVEAL_OUTCOME] = [0, 1, 2];

export const OUTCOME_STREAM = 0x4f5554;
export const DEAD_BASE = 30, SURVIVAL_BASE = 15, RECRUITED_BASE = 10, RECRUITED_PER_CULTIST = 25, TRANSFORMED_PER_CORRUPTED = 20, TRANSFORMED_PER_CULTIST_FATE = 10, DISPLACED_PER_OMEN = 15, DISPLACED_OMEN_CAP = 4;
export const LEAD_STEP = 10, MAX_LEADS = 6, TAKEN_AT_LEADS = 1, OUTCOME_AT_LEADS = 4;
const ROLL_ORDER = [OUTCOME_ESCAPED, OUTCOME_HIDDEN, OUTCOME_DEAD, OUTCOME_RECRUITED, OUTCOME_TRANSFORMED, OUTCOME_DISPLACED];

const text = (o, owner) => {
  const t = {};
  for (const lang of OUTCOME_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`outcomes: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
};
const objects = (root, key) => {
  if (!Array.isArray(root[key])) throw new Error(`outcomes: missing ${key} array`);
  for (const item of root[key]) if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`outcomes: ${key} holds a non-object`);
  return root[key];
};
const str = (o, key, owner) => { if (typeof o[key] !== 'string' || !o[key]) throw new Error(`outcomes: ${owner} lacks ${key}`); return o[key]; };

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed or when a constraint excludes hidden. */
export function parseOutcomeLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('outcomes: root is not an object');
  if (!root.taken || typeof root.taken !== 'object') throw new Error('outcomes: missing taken object');
  const lib = { taken: text(root.taken, 'taken'), epitaphs: [], constraints: [], aftermath: null };
  if (root.aftermath !== undefined) {
    const a = root.aftermath;
    if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('outcomes: aftermath is not an object');
    const part = (key) => { if (!a[key] || typeof a[key] !== 'object') throw new Error(`outcomes: aftermath lacks ${key}`); return text(a[key], `aftermath ${key}`); };
    lib.aftermath = { planted: part('planted'), displaced: part('displaced'), reason: part('reason') };
  }
  const epitaphs = new Array(OUTCOME_IDS.length).fill(null);
  for (const o of objects(root, 'outcomes')) {
    const id = str(o, 'id', 'outcome'), k = OUTCOME_IDS.indexOf(id);
    if (k < 0) throw new Error(`outcomes: unknown outcome id ${id}`);
    if (epitaphs[k]) throw new Error(`outcomes: duplicate outcome id ${id}`);
    epitaphs[k] = text(o, `outcome ${id}`);
  }
  for (let k = 0; k < OUTCOME_IDS.length; k++) {
    if (!epitaphs[k]) throw new Error(`outcomes: lacks outcome ${OUTCOME_IDS[k]}`);
    lib.epitaphs.push(epitaphs[k]);
  }
  for (const o of objects(root, 'constraints')) {
    const c = { missing: str(o, 'missing', 'constraint'), basis: str(o, 'basis', 'constraint'), excludes: [] };
    if (lib.constraints.some((x) => x.missing === c.missing)) throw new Error(`outcomes: duplicate constraint for ${c.missing}`);
    if (!Array.isArray(o.excludes)) throw new Error(`outcomes: constraint ${c.missing} lacks excludes`);
    for (const item of o.excludes) {
      const k = OUTCOME_IDS.indexOf(item);
      if (k < 0) throw new Error(`outcomes: constraint ${c.missing} excludes unknown outcome`);
      if (k === OUTCOME_HIDDEN) throw new Error(`outcomes: constraint ${c.missing} must not exclude hidden`);
      c.excludes.push(k);
    }
    lib.constraints.push(c);
  }
  return lib;
}

// Round 34 (spec 170): Core MissingOutcomes aftermath. What a resolved outcome leaves behind: recruits feed the mythos run (cult joining, exposure) and plant a low reliability statement,
// displaced people are glimpsed briefly on a seeded part of the nights after they resolve and leave a statement that contradicts the kin or witness. Shown only from OUTCOME_AT_LEADS leads.
export const AFTERMATH_STREAM = 0x414654, FIRST_RESOLVE_NIGHT = 2, RESOLVE_NIGHT_SPAN = 4, SIGHTING_NIGHTS = 3, SIGHTING_OUT_OF = 2, RECRUITED_CAP = 3, PLANTED_RELIABILITY = 25, DISPLACED_RELIABILITY = 35, PLANTED_MINUTE_BASE = 1200, MINUTE_SPAN = 240;
export const AFTERMATH_PREFIX = 'aftermath:', AFTERMATH_PAIR_PREFIX = 'aftermath:contradiction:';
export const [AFTERMATH_PLANTED, AFTERMATH_DISPLACED] = [0, 1];

export const resolveNight = (seed, missingIndex) => FIRST_RESOLVE_NIGHT + new SeededRandom(seed ^ AFTERMATH_STREAM ^ Math.imul(missingIndex, INDEX_STEP)).next(RESOLVE_NIGHT_SPAN);
export const isAftermathActive = (seed, missingIndex, night) => night >= resolveNight(seed, missingIndex);
export function sightingOn(seed, missingIndex, night) {
  const resolve = resolveNight(seed, missingIndex);
  if (night < resolve || night >= resolve + SIGHTING_NIGHTS) return false;
  return new SeededRandom(seed ^ AFTERMATH_STREAM ^ Math.imul(missingIndex, INDEX_STEP) ^ (night * 131)).next(SIGHTING_OUT_OF) === 0;
}
/** Active recruits on each night 1..throughNight, for the mythos input recruitedByNight. Pass outcomes from a run without recruits. */
export function recruitedByNight(seed, outcomes, throughNight) {
  const counts = [];
  for (let night = 1; night <= Math.max(0, throughNight); night++) counts.push(Math.min(RECRUITED_CAP, outcomes.filter((o, k) => o === OUTCOME_RECRUITED && isAftermathActive(seed, k, night)).length));
  return counts;
}
/** The aftermath statements on a night: { id, missing, kind, text{en,fr}, night, minute, reliability, sighting } for each recruited or displaced person with at least OUTCOME_AT_LEADS leads. */
export function aftermathStatements(story, library, outcomes, leads, night) {
  const list = [];
  if (!library || !library.aftermath) return list;
  for (let k = 0; k < outcomes.length && k < story.missing.length; k++) {
    const planted = outcomes[k] === OUTCOME_RECRUITED, displaced = outcomes[k] === OUTCOME_DISPLACED;
    if ((!planted && !displaced) || !isAftermathActive(story.seed, k, night) || revealLevel(leads[k]) !== REVEAL_OUTCOME) continue;
    const src = planted ? library.aftermath.planted : library.aftermath.displaced, text = {};
    for (const lang of OUTCOME_LANGUAGES) text[lang] = render(src[lang], story.missingVars(story.missing[k], lang));
    list.push({ id: `${AFTERMATH_PREFIX}${planted ? 'planted' : 'displaced'}:${k}`, missing: k, kind: planted ? AFTERMATH_PLANTED : AFTERMATH_DISPLACED, text, night: resolveNight(story.seed, k),
      minute: PLANTED_MINUTE_BASE + new SeededRandom(story.seed ^ AFTERMATH_STREAM ^ Math.imul(k, INDEX_STEP) ^ 0x4d).next(MINUTE_SPAN), reliability: planted ? PLANTED_RELIABILITY : DISPLACED_RELIABILITY, sighting: displaced && sightingOn(story.seed, k, night) });
  }
  return list;
}

export const isSurvivable = (outcome) => outcome === OUTCOME_ESCAPED || outcome === OUTCOME_HIDDEN;

/** Weight of each outcome (indexed by outcome) for one missing person with the given number of leads. Hidden is always above 0. */
export function outcomeWeights(society, story, state, library, missingIndex, leads) {
  const w = new Array(OUTCOME_IDS.length).fill(0), m = story.missing[missingIndex];
  const nights = state ? state.nights.length : 0, night = Math.max(1, nights), schedule = mythosSchedule(night);
  const dread = inputAt(schedule.dreadPermille, night) / SCALE, ritual = inputAt(schedule.ritualStage, night);
  const last = state ? state.atNight(night) : null;
  w[OUTCOME_DEAD] = DEAD_BASE; w[OUTCOME_ESCAPED] = SURVIVAL_BASE; w[OUTCOME_HIDDEN] = SURVIVAL_BASE;
  let cultists = 0, corrupted = 0, fated = 0;
  for (const v of [m.kinIndex, m.witnessIndex]) {
    if (v < 0 || v >= society.roster.length) continue;
    if (last) for (const members of last.cultMembers) if (members.includes(v)) cultists++;
    if (society.corruptionAt(v, night, dread, ritual) >= CORRUPTION_CORRUPTED) corrupted++;
    if (society.fate[v] === CORRUPTION_CULTIST) fated++;
  }
  if (state && state.cults.length > 0) w[OUTCOME_RECRUITED] = RECRUITED_BASE + cultists * RECRUITED_PER_CULTIST;
  w[OUTCOME_TRANSFORMED] = corrupted * TRANSFORMED_PER_CORRUPTED + fated * TRANSFORMED_PER_CULTIST_FATE;
  let omens = 0;
  if (state) for (const n of state.nights) for (const e of n.events) if (e.kind === EVENT_COSMIC_OMEN) omens++;
  w[OUTCOME_DISPLACED] = Math.min(omens, DISPLACED_OMEN_CAP) * DISPLACED_PER_OMEN;
  const bonus = Math.max(0, Math.min(MAX_LEADS, leads)) * LEAD_STEP;
  w[OUTCOME_ESCAPED] += bonus; w[OUTCOME_HIDDEN] += bonus;
  const constraint = library ? library.constraints.find((c) => c.missing === m.id) : null;
  if (constraint) for (const x of constraint.excludes) w[x] = 0;
  return w;
}

/** The one outcome of missing person missingIndex given leads. */
export function resolveOutcome(society, story, state, library, missingIndex, leads) {
  const w = outcomeWeights(society, story, state, library, missingIndex, leads);
  let total = 0;
  for (const k of ROLL_ORDER) total += w[k];
  const roll = new SeededRandom(society.seed ^ OUTCOME_STREAM ^ Math.imul(missingIndex, INDEX_STEP)).next(SCALE);
  const target = Math.floor((roll * total) / SCALE);
  let cumulative = 0;
  for (const k of ROLL_ORDER) { cumulative += w[k]; if (target < cumulative) return k; }
  return OUTCOME_HIDDEN;
}

/** Leads on one missing person: page read, page found as a clue, kin met, witness met, up to 2 statements heard from kin or witness, and each found place lead whose trail ends at this person (Core CountLeads with places). */
export function countLeads(story, lore, evidence, missingIndex, places = null) {
  if (!evidence) return 0;
  const m = story.missing[missingIndex];
  let leads = 0;
  for (const book of lore.books) {
    if (book.missing !== m.id) continue;
    if (evidence.booksRead.has(book.id)) leads++;
    if (evidence.clueIds.has(CLUE_ID_PREFIX + book.id)) leads++;
  }
  if (m.kinIndex >= 0 && evidence.met.has(m.kinIndex)) leads++;
  if (m.witnessIndex >= 0 && evidence.met.has(m.witnessIndex)) leads++;
  const heard = evidence.heard.filter((h) => h.villager >= 0 && (h.villager === m.kinIndex || h.villager === m.witnessIndex)).length;
  return Math.min(MAX_LEADS, leads + Math.min(2, heard) + leadsFor(places, evidence.clueIds, story.seed, story.missing.length, missingIndex));
}

export const revealLevel = (leads) => (leads >= OUTCOME_AT_LEADS ? REVEAL_OUTCOME : leads >= TAKEN_AT_LEADS ? REVEAL_TAKEN : REVEAL_NOTHING);

/** What the board may show: nothing at 0 leads, only the taken line from 1, the epitaph from 4. Returns { level, text }. */
export function revealOutcome(story, library, outcome, missingIndex, leads, lang) {
  const level = revealLevel(leads);
  if (level === REVEAL_NOTHING) return { level, text: '' };
  const vars = story.missingVars(story.missing[missingIndex], lang);
  const t = level === REVEAL_TAKEN ? library.taken : library.epitaphs[outcome];
  return { level, text: render(t[lang] ?? t.en, vars) };
}
