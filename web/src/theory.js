// Round 30 (spec 162): JS port of Core/TheoryModel.cs. Golden key "theories". Pure, no DOM, integer math only.
// The data file web/data/theories.json is a byte copy of Packages/.../Data/theories.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: Theory, Evidence, Conclusion graded True, Partial or False; the state is a pure function of a choice log.
import { SCALE, CORRUPTION_UNEASY, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST } from './society.js';
import { mythosSchedule, inputAt, EVENT_COSMIC_OMEN } from './mythos.js';
import { resolveOutcome } from './outcomes.js';
import { render } from './village-story.js';
import { VIGIL_ENDING_IDS as ENDING_IDS } from './core.js';

export const THEORY_LANGUAGES = ['en', 'fr'];
export const KIND_IDS = ['missing', 'villager', 'omen'];
export const GRADE_IDS = ['true', 'partial', 'false'];
export const TIER_IDS = ['bare', 'doubtful', 'firm'];
export const VARIANT_IDS = ['unexplored', 'clear', 'misled', 'uncertain'];
export const [KIND_MISSING, KIND_VILLAGER, KIND_OMEN] = [0, 1, 2];
export const [GRADE_TRUE, GRADE_PARTIAL, GRADE_FALSE] = [0, 1, 2];
export const [TIER_BARE, TIER_DOUBTFUL, TIER_FIRM] = [0, 1, 2];
export const [VARIANT_UNEXPLORED, VARIANT_CLEAR, VARIANT_MISLED, VARIANT_UNCERTAIN] = [0, 1, 2, 3];
export const GRADING_GROUP = 'group', GRADING_ADJACENT = 'adjacent';
export const KIND_STEP = 10000, CHOICE_THEORY = 1, CHOICE_OPTION = 2, CHOICE_EVIDENCE = 3, CHOICE_CONCLUDE = 4;
export const MAX_EVIDENCE = 3, FIRM_BELIEF = 60;
export const KNOWLEDGE_TRUE = 6, KNOWLEDGE_PARTIAL = 3, KNOWLEDGE_FALSE = 1, WRONG_VILLAGER_TRUST = 5;
export const LOG_PREFIX = 'th1;';

export const choice = (kind, value) => kind * KIND_STEP + value;

const text = (o, owner) => {
  const t = {};
  for (const lang of THEORY_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`theories: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
};
const objects = (o, key) => {
  if (!Array.isArray(o[key])) throw new Error(`theories: missing ${key} array`);
  for (const item of o[key]) if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`theories: ${key} holds a non-object`);
  return o[key];
};
const str = (o, key, owner) => { if (typeof o[key] !== 'string' || !o[key]) throw new Error(`theories: ${owner} lacks ${key}`); return o[key]; };
const int = (o, key, owner) => { if (typeof o[key] !== 'number') throw new Error(`theories: ${owner} lacks ${key}`); return Math.trunc(o[key]); };

/** The integer grading rule: equal is True, near is Partial (same group, or one rung apart for 'adjacent'), else False. */
export function gradeTheory(template, truth, pick) {
  if (pick === truth) return GRADE_TRUE;
  const a = template.options[truth].group, b = template.options[pick].group;
  const near = template.grading === GRADING_ADJACENT ? Math.abs(a - b) === 1 : a === b;
  return near ? GRADE_PARTIAL : GRADE_FALSE;
}

/** Parses the data file (object or text). Throws an Error naming the offending field. */
export function parseTheoryLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('theories: root is not an object');
  const lib = { templates: [], verdicts: [], epilogues: [] };
  for (const o of objects(root, 'templates')) {
    const t = { id: str(o, 'id', 'template'), grading: str(o, 'grading', 'template'), options: [] };
    const kind = KIND_IDS.indexOf(str(o, 'kind', `template ${t.id}`));
    if (kind < 0) throw new Error(`theories: template ${t.id} has unknown kind`);
    t.kind = kind;
    if (t.grading !== GRADING_GROUP && t.grading !== GRADING_ADJACENT) throw new Error(`theories: template ${t.id} has unknown grading`);
    if (lib.templates.some((x) => x.kind === kind)) throw new Error(`theories: two templates of kind ${KIND_IDS[kind]}`);
    t.question = text(o, `template ${t.id}`);
    for (const oo of objects(o, 'options')) {
      const opt = { id: str(oo, 'id', `option of ${t.id}`), group: int(oo, 'group', `option of ${t.id}`), text: text(oo, `option ${t.id}`) };
      if (t.options.some((x) => x.id === opt.id)) throw new Error(`theories: template ${t.id} repeats option ${opt.id}`);
      t.options.push(opt);
    }
    for (let truth = 0; truth < t.options.length; truth++) {
      let partial = false, wrong = false;
      for (let pick = 0; pick < t.options.length; pick++) {
        if (pick === truth) continue;
        if (gradeTheory(t, truth, pick) === GRADE_PARTIAL) partial = true; else wrong = true;
      }
      if (!partial || !wrong) throw new Error(`theories: template ${t.id} option ${t.options[truth].id} cannot be the truth with a Partial and a False answer both reachable`);
    }
    lib.templates.push(t);
  }
  if (lib.templates.length !== KIND_IDS.length) throw new Error('theories: needs one template per kind');
  for (const o of objects(root, 'verdicts')) {
    const g = GRADE_IDS.indexOf(str(o, 'grade', 'verdict')), ti = TIER_IDS.indexOf(str(o, 'tier', 'verdict'));
    if (g < 0 || ti < 0) throw new Error('theories: verdict has unknown grade or tier');
    if (lib.verdicts.some((v) => v.grade === g && v.tier === ti)) throw new Error(`theories: duplicate verdict ${GRADE_IDS[g]}/${TIER_IDS[ti]}`);
    lib.verdicts.push({ grade: g, tier: ti, text: text(o, `verdict ${GRADE_IDS[g]}/${TIER_IDS[ti]}`) });
  }
  if (lib.verdicts.length !== GRADE_IDS.length * TIER_IDS.length) throw new Error('theories: verdicts must cover every grade and tier');
  for (const o of objects(root, 'epilogues')) {
    const ending = str(o, 'ending', 'epilogue'), v = VARIANT_IDS.indexOf(str(o, 'variant', 'epilogue'));
    if (!ENDING_IDS.includes(ending)) throw new Error(`theories: epilogue names unknown ending ${ending}`);
    if (v < 1) throw new Error(`theories: epilogue ${ending} has unknown variant`);
    if (lib.epilogues.some((e) => e.ending === ending && e.variant === v)) throw new Error(`theories: duplicate epilogue ${ending}/${VARIANT_IDS[v]}`);
    lib.epilogues.push({ ending, variant: v, text: text(o, `epilogue ${ending}`) });
  }
  if (lib.epilogues.length !== ENDING_IDS.length * (VARIANT_IDS.length - 1)) throw new Error('theories: epilogues must cover every ending and variant');
  return lib;
}

export const templateOf = (library, kind) => library.templates.find((t) => t.kind === kind) || null;

/** Option index of the villager template: 0 untouched, 1 uneasy, 2 corrupted, 3 sworn (in a cult on the last night, or fated Cultist stage). */
export function villagerTruth(society, state, villager) {
  const night = Math.max(1, state ? state.nights.length : 0), schedule = mythosSchedule(night);
  const dread = inputAt(schedule.dreadPermille, night) / SCALE, ritual = inputAt(schedule.ritualStage, night);
  const last = state ? state.atNight(night) : null;
  if (last) for (const members of last.cultMembers) if (members.includes(villager)) return 3;
  const stage = society.corruptionAt(villager, night, dread, ritual);
  if (stage === CORRUPTION_CULTIST) return 3;
  if (stage >= CORRUPTION_CORRUPTED) return 2;
  return stage === CORRUPTION_UNEASY ? 1 : 0;
}

/** The questions of a village: one per missing person, one per cult founder or kin of a missing person (ascending roster index), the first omen of the run. Items { kind, subject, truth }. */
export function theoryInstances(society, story, state, library, outcomes) {
  const list = [];
  for (let k = 0; k < story.missing.length; k++) list.push({ kind: KIND_MISSING, subject: k, truth: resolveOutcome(society, story, state, outcomes, k, 0) });
  const subjects = new Set();
  if (state) for (const c of state.cults) subjects.add(c.founder);
  for (const m of story.missing) if (m.kinIndex >= 0) subjects.add(m.kinIndex);
  for (const v of [...subjects].sort((a, b) => a - b)) if (v >= 0 && v < society.roster.length) list.push({ kind: KIND_VILLAGER, subject: v, truth: villagerTruth(society, state, v) });
  if (state) {
    outer: for (const n of state.nights) for (const e of n.events) if (e.kind === EVENT_COSMIC_OMEN) { list.push({ kind: KIND_OMEN, subject: n.night, truth: e.other }); break outer; }
  }
  return list;
}

export const tierOf = (count, averageBelief) => (count === 0 ? TIER_BARE : averageBelief >= FIRM_BELIEF ? TIER_FIRM : TIER_DOUBTFUL);

/**
 * The state after a choice log. beliefs is a Map from statement library index to Belief of every revealed statement.
 * Illegal entries are counted in rejected and skipped. conclusions is an array sorted by instance.
 */
export function replayTheories(library, instances, beliefs, log) {
  const s = { current: -1, currentOption: -1, currentEvidence: [], conclusions: new Map(), rejected: 0 };
  for (const entry of log) {
    const kind = Math.trunc(entry / KIND_STEP), value = entry % KIND_STEP;
    let ok = false;
    if (Number.isInteger(entry) && entry >= 0) {
      if (kind === CHOICE_THEORY && value < instances.length) { s.current = value; s.currentOption = -1; s.currentEvidence = []; ok = true; }
      else if (kind === CHOICE_OPTION && s.current >= 0 && value < templateOf(library, instances[s.current].kind).options.length) { s.currentOption = value; ok = true; }
      else if (kind === CHOICE_EVIDENCE && s.current >= 0 && beliefs.has(value)) {
        const at = s.currentEvidence.indexOf(value);
        if (at >= 0) { s.currentEvidence.splice(at, 1); ok = true; } else if (s.currentEvidence.length < MAX_EVIDENCE) { s.currentEvidence.push(value); ok = true; }
      } else if (kind === CHOICE_CONCLUDE && value === 0 && s.current >= 0 && s.currentOption >= 0) {
        const inst = instances[s.current], evidence = [...s.currentEvidence].sort((a, b) => a - b);
        let total = 0;
        for (const e of evidence) total += beliefs.get(e);
        const averageBelief = evidence.length === 0 ? 0 : Math.trunc(total / evidence.length);
        s.conclusions.set(s.current, { instance: s.current, option: s.currentOption, grade: gradeTheory(templateOf(library, inst.kind), inst.truth, s.currentOption), evidence, averageBelief, tier: tierOf(evidence.length, averageBelief) });
        s.current = -1; s.currentOption = -1; s.currentEvidence = []; ok = true;
      }
    }
    if (!ok) s.rejected++;
  }
  s.list = [...s.conclusions.values()].sort((a, b) => a.instance - b.instance);
  return s;
}

export const countGrade = (state, grade) => state.list.filter((c) => c.grade === grade).length;
export const theoryKnowledge = (state) => countGrade(state, GRADE_TRUE) * KNOWLEDGE_TRUE + countGrade(state, GRADE_PARTIAL) * KNOWLEDGE_PARTIAL + countGrade(state, GRADE_FALSE) * KNOWLEDGE_FALSE;
export const theoryTrustLost = (instances, state) => state.list.filter((c) => c.grade === GRADE_FALSE && instances[c.instance].kind === KIND_VILLAGER).length * WRONG_VILLAGER_TRUST;

/** Every legal next log entry. Never empty with at least one instance, so there is no dead end. */
export function legalChoices(library, instances, beliefs, state) {
  const list = instances.map((_, i) => choice(CHOICE_THEORY, i));
  if (state.current >= 0) {
    const options = templateOf(library, instances[state.current].kind).options.length;
    for (let o = 0; o < options; o++) list.push(choice(CHOICE_OPTION, o));
    for (const k of [...beliefs.keys()].sort((a, b) => a - b)) if (state.currentEvidence.includes(k) || state.currentEvidence.length < MAX_EVIDENCE) list.push(choice(CHOICE_EVIDENCE, k));
    if (state.currentOption >= 0) list.push(choice(CHOICE_CONCLUDE, 0));
  }
  return list;
}

/** Unexplored with no conclusion, Misled when more than half are False, Clear when at least half are True, else Uncertain. Independent of the vigil. */
export function epilogueVariant(state) {
  const n = state.list.length;
  if (n === 0) return VARIANT_UNEXPLORED;
  if (countGrade(state, GRADE_FALSE) * 2 > n) return VARIANT_MISLED;
  if (countGrade(state, GRADE_TRUE) * 2 >= n) return VARIANT_CLEAR;
  return VARIANT_UNCERTAIN;
}

/** The extra epilogue line of an ending for a variant, '' for Unexplored. The ending itself is still chosen by vigil.js endingFor. */
export function epilogueText(library, endingId, variant, lang) {
  const e = library.epilogues.find((x) => x.ending === endingId && x.variant === variant);
  return e ? (e.text[lang] ?? e.text.en) : '';
}
export function verdictText(library, grade, tier, lang) {
  const v = library.verdicts.find((x) => x.grade === grade && x.tier === tier);
  return v ? (v.text[lang] ?? v.text.en) : '';
}

function varsOf(society, story, inst, lang) {
  if (inst.kind === KIND_MISSING) return story.missingVars(story.missing[inst.subject], lang);
  if (inst.kind === KIND_VILLAGER) return story.villagerVars(society.roster[inst.subject], lang);
  return { village: story.villageName, night: String(inst.subject) };
}
export const theoryQuestion = (library, society, story, inst, lang) => { const t = templateOf(library, inst.kind).question; return render(t[lang] ?? t.en, varsOf(society, story, inst, lang)); };
export const theoryOptionText = (library, society, story, inst, option, lang) => { const t = templateOf(library, inst.kind).options[option].text; return render(t[lang] ?? t.en, varsOf(society, story, inst, lang)); };

export const serializeTheoryLog = (log) => LOG_PREFIX + log.join(',');
/** Entries of a saved log text; anything malformed gives an empty log. */
export function parseTheoryLog(input) {
  if (typeof input !== 'string' || !input.startsWith(LOG_PREFIX)) return [];
  const body = input.slice(LOG_PREFIX.length);
  if (body === '') return [];
  const log = [];
  for (const part of body.split(',')) {
    if (!/^[0-9]{1,9}$/.test(part)) return [];
    log.push(Number(part));
  }
  return log;
}
