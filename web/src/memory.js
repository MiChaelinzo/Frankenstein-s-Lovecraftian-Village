// Round 34 (spec 167): JS port of Core/VillagerMemoryModel.cs. Golden key "memory". Pure, no DOM, integer per mille arithmetic only.
// The data file web/data/memory.json is a byte copy of Packages/.../Data/memory.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: a villager's memory is an intensity per kind that decays by night but never reaches zero once touched.
import { SeededRandom } from './core.js';
import { INDEX_STEP, CHAT_POLITE, RETURN_ITEM, RETURN_JOURNAL, SEEN_NEAR_BODY, SEEN_AT_RITUAL_SITE, NIGHT_INTRUSION, WARD_CREATURE_IN_VIEW, FIGHT_CREATURE_IN_VIEW } from './society.js';

export const MEMORY_LANGUAGES = ['en', 'fr'];
export const MEMORY_KIND_IDS = ['accused', 'accusing', 'clue_found', 'rumor_heard', 'ritual_witnessed', 'family_lost', 'mythos_exposure', 'conversation'];
export const [KIND_ACCUSED, KIND_ACCUSING, KIND_CLUE_FOUND, KIND_RUMOR_HEARD, KIND_RITUAL_WITNESSED, KIND_FAMILY_LOST, KIND_MYTHOS_EXPOSURE, KIND_CONVERSATION] = [0, 1, 2, 3, 4, 5, 6, 7];
export const MEMORY_OUTCOME_IDS = ['none', 'forgive', 'paranoid', 'loyal', 'obsessed'];
export const [MEMORY_NONE, MEMORY_FORGIVE, MEMORY_PARANOID, MEMORY_LOYAL, MEMORY_OBSESSED] = [0, 1, 2, 3, 4];
export const LINE_IDS = ['forgive', 'paranoid', 'loyal', 'obsessed', 'faded'];
export const MIN_VARIANTS = 2;

export const MEMORY_SCALE = 1000, KIND_COUNT = 8, FLOOR_PERMILLE = 20, DECAY_KEEP_PERMILLE = 850, OUTCOME_AT = 150, MEMORY_STREAM = 0x4d454d, FAMILY_LOST_WEIGHT = 600;
/** Changes per mille at full strength per outcome: trust, fear, faith, loyalty, obsession. */
export const OUTCOME_EFFECTS = [[0, 0, 0, 0, 0], [100, -100, 0, 150, 0], [-150, 250, -50, -150, 50], [150, -50, 50, 250, 0], [-50, 50, 100, -100, 300]];
const TIE_ORDER = [MEMORY_PARANOID, MEMORY_OBSESSED, MEMORY_FORGIVE, MEMORY_LOYAL];
const ACTION_EVENTS = { [CHAT_POLITE]: [KIND_CONVERSATION, 300], [RETURN_ITEM]: [KIND_CONVERSATION, 500], [RETURN_JOURNAL]: [KIND_CONVERSATION, 600], [SEEN_NEAR_BODY]: [KIND_ACCUSED, 500], [SEEN_AT_RITUAL_SITE]: [KIND_RITUAL_WITNESSED, 600], [NIGHT_INTRUSION]: [KIND_ACCUSED, 400], [WARD_CREATURE_IN_VIEW]: [KIND_MYTHOS_EXPOSURE, 400], [FIGHT_CREATURE_IN_VIEW]: [KIND_MYTHOS_EXPOSURE, 500] };

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed, lacks a line id, has too few variants or lacks a language. */
export function parseMemoryLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('memory: root is not an object');
  if (!Array.isArray(root.lines)) throw new Error('memory: missing lines array');
  const groups = new Array(LINE_IDS.length).fill(null);
  for (const o of root.lines) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('memory: lines holds a non-object');
    const k = LINE_IDS.indexOf(o.id);
    if (k < 0) throw new Error(`memory: unknown line id ${o.id}`);
    if (groups[k]) throw new Error(`memory: duplicate line id ${o.id}`);
    if (!Array.isArray(o.variants) || o.variants.length < MIN_VARIANTS) throw new Error(`memory: line ${o.id} needs at least ${MIN_VARIANTS} variants`);
    groups[k] = o.variants.map((d) => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`memory: line ${o.id} holds a non-object variant`);
      const t = {};
      for (const lang of MEMORY_LANGUAGES) {
        if (typeof d[lang] !== 'string' || !d[lang].trim()) throw new Error(`memory: line ${o.id} lacks ${lang} text`);
        t[lang] = d[lang];
      }
      return t;
    });
  }
  for (let k = 0; k < LINE_IDS.length; k++) if (!groups[k]) throw new Error(`memory: lacks line id ${LINE_IDS[k]}`);
  return { variants: groups };
}

/** The memory event a society action leaves with the villager it was done to, or null. Mirror of VillagerMemoryModel.EventFor. */
export function eventFor(action, villager, night) {
  const entry = ACTION_EVENTS[action];
  if (!entry || !Number.isInteger(villager) || villager < 0) return null;
  return { night: Math.max(1, night), villager, kind: entry[0], subject: -1, weight: entry[1] };
}

/** The memories the village starts with: the kin of every missing person has lost family on night 1. Mirror of VillagerMemoryModel.BaselineEvents. */
export function baselineEvents(story) {
  const list = [];
  if (!story) return list;
  story.missing.forEach((m, k) => { if (m.kinIndex >= 0) list.push({ night: 1, villager: m.kinIndex, kind: KIND_FAMILY_LOST, subject: k, weight: FAMILY_LOST_WEIGHT }); });
  return list;
}

/** Trust after memory: a copy of opinions with each trust moved by its memory effect and clamped to 0..1000. Suspicion is untouched. */
export function trustAfter(opinions, effects) {
  const trust = opinions.trust.map((t, i) => (effects && i < effects.length ? Math.max(0, Math.min(MEMORY_SCALE, t + effects[i].trust)) : t));
  return { ...opinions, trust, suspicion: opinions.suspicion.slice() };
}

export function createMemory(villagerCount) {
  if (!Number.isInteger(villagerCount) || villagerCount < 0) throw new Error('memory: villagerCount must be a non-negative integer');
  const intensity = Array.from({ length: villagerCount }, () => new Array(KIND_COUNT).fill(0));
  const lastSubject = Array.from({ length: villagerCount }, () => new Array(KIND_COUNT).fill(-1));
  let night = 1;
  const inKind = (kind) => Number.isInteger(kind) && kind >= 0 && kind < KIND_COUNT;
  const inRoster = (v) => Number.isInteger(v) && v >= 0 && v < villagerCount;
  const m = {
    villagerCount,
    night: () => night,
    advanceTo(n) {
      while (night < n) {
        for (let i = 0; i < villagerCount; i++) for (let k = 0; k < KIND_COUNT; k++) if (intensity[i][k] > 0) intensity[i][k] = Math.max(FLOOR_PERMILLE, Math.trunc(intensity[i][k] * DECAY_KEEP_PERMILLE / MEMORY_SCALE));
        night++;
      }
    },
    /** Records { night, villager, kind, subject, weight }; false and no change for a villager or kind out of range or a weight under 1. */
    record(e) {
      if (!e || !inRoster(e.villager) || !inKind(e.kind) || !Number.isInteger(e.weight) || e.weight < 1) return false;
      m.advanceTo(Number.isInteger(e.night) ? e.night : night);
      intensity[e.villager][e.kind] = Math.max(FLOOR_PERMILLE, Math.min(MEMORY_SCALE, intensity[e.villager][e.kind] + Math.min(MEMORY_SCALE, e.weight)));
      lastSubject[e.villager][e.kind] = Number.isInteger(e.subject) ? e.subject : -1;
      return true;
    },
    intensityOf: (v, kind) => (inRoster(v) && inKind(kind) ? intensity[v][kind] : 0),
    lastSubjectOf: (v, kind) => (inRoster(v) && inKind(kind) ? lastSubject[v][kind] : -1),
    hasAnyMemory: (v) => inRoster(v) && intensity[v].some((x) => x > 0),
    /** Score per outcome (index = outcome id, index 0 always 0). */
    scoresOf(v) {
      const s = [0, 0, 0, 0, 0];
      if (!inRoster(v)) return s;
      const x = intensity[v], acc = x[KIND_ACCUSED], conv = x[KIND_CONVERSATION];
      s[MEMORY_PARANOID] = Math.max(0, acc - Math.trunc(conv / 2)) + Math.trunc(x[KIND_ACCUSING] / 2) + Math.trunc((x[KIND_RUMOR_HEARD] + x[KIND_MYTHOS_EXPOSURE]) / 2);
      s[MEMORY_OBSESSED] = Math.trunc((x[KIND_CLUE_FOUND] + x[KIND_RITUAL_WITNESSED] + x[KIND_MYTHOS_EXPOSURE]) / 2) + Math.trunc(x[KIND_FAMILY_LOST] / 4);
      s[MEMORY_FORGIVE] = Math.min(acc, conv);
      s[MEMORY_LOYAL] = Math.max(0, conv - 2 * acc) + Math.trunc(x[KIND_CLUE_FOUND] / 2);
      return s;
    },
    outcomeOf(v) {
      const s = m.scoresOf(v);
      let best = MEMORY_NONE, bestScore = OUTCOME_AT - 1;
      for (const o of TIE_ORDER) if (s[o] > bestScore) { best = o; bestScore = s[o]; }
      return best;
    },
    strengthOf(v) { const o = m.outcomeOf(v); return o === MEMORY_NONE ? 0 : Math.min(MEMORY_SCALE, m.scoresOf(v)[o]); },
    /** { trust, fear, faith, loyalty, obsession } per mille changes of one villager's memory. */
    effectOf(v) {
      const o = m.outcomeOf(v);
      if (o === MEMORY_NONE) return { trust: 0, fear: 0, faith: 0, loyalty: 0, obsession: 0 };
      const st = m.strengthOf(v), t = OUTCOME_EFFECTS[o], f = (x) => Math.trunc(x * st / MEMORY_SCALE);
      return { trust: f(t[0]), fear: f(t[1]), faith: f(t[2]), loyalty: f(t[3]), obsession: f(t[4]) };
    },
    effectsOfAll() { const all = []; for (let i = 0; i < villagerCount; i++) all.push(m.effectOf(i)); return all; },
    /** The authored line of what the villager remembers, '' when nothing. Seeded by seed, villager and night. */
    lineFor(lib, seed, v, nt, lang) {
      if (!lib || !m.hasAnyMemory(v)) return '';
      const o = m.outcomeOf(v), group = lib.variants[o === MEMORY_NONE ? LINE_IDS.length - 1 : o - 1];
      const pick = new SeededRandom(seed ^ MEMORY_STREAM ^ Math.imul(v, INDEX_STEP) ^ (nt * 31)).next(group.length);
      return group[pick][lang] || group[pick].en;
    },
  };
  return m;
}

/** The memory after an ordered log, advanced to the given night. */
export function replayMemory(villagerCount, log, night) {
  const m = createMemory(villagerCount);
  for (const e of log || []) m.record(e);
  m.advanceTo(night);
  return m;
}
