// Round 34 (spec 168): JS port of Core/ChronicleProse.cs. Golden key "chronicleProse". Pure, no DOM, no randomness beyond the seed.
// The data file web/data/chronicle.json is a byte copy of Packages/.../Data/chronicle.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: a sentence is written only for something the player learned (omen, cult tie, secret, disappearance, ending, mood of a villager met).
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';
import { render, stageOfNight } from './village-story.js';
import { nightTickAt, omenId, cultId, secretId, rumorId, EVENT_CULT_FOUNDED, EVENT_CULT_JOINED, EVENT_SECRET_EXPOSED, EVENT_COSMIC_OMEN, SOURCE_MISSING } from './mythos.js';
import { revealLevel, OUTCOME_IDS, REVEAL_NOTHING, REVEAL_OUTCOME } from './outcomes.js';
import { replayMemory, MEMORY_OUTCOME_IDS, MEMORY_NONE } from './memory.js';

export const CHRONICLE_LANGUAGES = ['en', 'fr'];
export const CHRONICLE_LINE_IDS = [
  'opener_early', 'opener_mid', 'opener_late',
  'omen_tide_wrong', 'omen_stars_wrong', 'omen_bell_unrung', 'omen_black_tide',
  'vanished', 'cult',
  'secret_debt', 'secret_affair', 'secret_forbidden_book', 'secret_witnessed_body', 'secret_cult_ties',
  'rumor',
  'memory_forgive', 'memory_paranoid', 'memory_loyal', 'memory_obsessed',
  'quiet_early', 'quiet_mid', 'quiet_late',
  'outcome_dead', 'outcome_escaped', 'outcome_recruited', 'outcome_transformed', 'outcome_hidden', 'outcome_displaced',
  'taken',
  'summary_open', 'summary_unknown', 'summary_cults', 'summary_omens', 'summary_close_low', 'summary_close_mid', 'summary_close_high',
];
export const CHRONICLE_MIN_VARIANTS = 4, ROLE_COUNT = 7;
export const CHRONICLE_STREAM = 0x43484e, SUMMARY_NIGHT = 0, LOW_LEARNED = 2, MID_LEARNED = 6, MEMORY_SALT = 0x4d4f4f;
const STAGE_IDS = ['early', 'mid', 'late'];

const localized = (d, owner) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`chronicle: ${owner} holds a non-object`);
  const t = {};
  for (const lang of CHRONICLE_LANGUAGES) {
    if (typeof d[lang] !== 'string' || !d[lang].trim()) throw new Error(`chronicle: ${owner} lacks ${lang} text`);
    t[lang] = d[lang];
  }
  return t;
};

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed, lacks a line id or role, has too few variants or lacks a language. */
export function parseChronicleLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('chronicle: root is not an object');
  if (!Array.isArray(root.roles) || root.roles.length !== ROLE_COUNT) throw new Error('chronicle: roles needs one title per villager role');
  const roles = root.roles.map((r) => localized(r, 'roles'));
  if (!Array.isArray(root.lines)) throw new Error('chronicle: missing lines array');
  const groups = new Array(CHRONICLE_LINE_IDS.length).fill(null);
  for (const o of root.lines) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('chronicle: lines holds a non-object');
    const k = CHRONICLE_LINE_IDS.indexOf(o.id);
    if (k < 0) throw new Error(`chronicle: unknown line id ${o.id}`);
    if (groups[k]) throw new Error(`chronicle: duplicate line id ${o.id}`);
    if (!Array.isArray(o.variants) || o.variants.length < CHRONICLE_MIN_VARIANTS) throw new Error(`chronicle: line ${o.id} needs at least ${CHRONICLE_MIN_VARIANTS} variants`);
    groups[k] = o.variants.map((d) => localized(d, `line ${o.id}`));
  }
  for (let k = 0; k < CHRONICLE_LINE_IDS.length; k++) if (!groups[k]) throw new Error(`chronicle: lacks line id ${CHRONICLE_LINE_IDS[k]}`);
  return { roles, variants: groups };
}

const capitalize = (s) => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));

/**
 * ctx: { prose (parsed library), story, mythos (mythos library), state (run), nights, outcomes (outcome id per missing person), leads (per missing person),
 * heard (Set of mythos statement ids), met (Set of roster indices), memoryLog (array or null) }.
 */
function pick(ctx, id, night, salt, lang, vars) {
  const k = CHRONICLE_LINE_IDS.indexOf(id);
  if (k < 0) return '';
  const group = ctx.prose.variants[k];
  const i = new SeededRandom(ctx.story.seed ^ CHRONICLE_STREAM ^ Math.imul(night, INDEX_STEP) ^ Math.imul(k, 131) ^ Math.imul(salt, 7919)).next(group.length);
  return capitalize(render(group[i][lang] || group[i].en, vars));
}

const whoOf = (ctx, v, lang) => { const p = ctx.story.roster[v]; return `${ctx.prose.roles[p.role][lang] || ctx.prose.roles[p.role].en} ${p.name}`; };
const baseVars = (ctx) => ({ village: ctx.story.villageName });
const stageId = (ctx, night) => STAGE_IDS[stageOfNight(night, ctx.nights)];
const simulated = (ctx, night) => !!ctx.state && !!ctx.mythos && night >= 1 && night <= ctx.state.nights.length;
const levelOf = (ctx, k) => revealLevel(k < ctx.leads.length ? ctx.leads[k] : 0);

function outcomeSentence(ctx, k, night, lang) {
  const vars = { ...ctx.story.missingVars(ctx.story.missing[k], lang), village: ctx.story.villageName };
  return pick(ctx, `outcome_${OUTCOME_IDS[ctx.outcomes[k]]}`, night, k, lang, vars);
}

function memorySentence(ctx, night, lang) {
  if (!ctx.memoryLog || !ctx.met || ctx.met.size === 0) return '';
  const model = replayMemory(ctx.story.roster.length, ctx.memoryLog, night), who = [];
  for (let v = 0; v < ctx.story.roster.length; v++) if (ctx.met.has(v) && model.outcomeOf(v) !== MEMORY_NONE) who.push(v);
  if (who.length === 0) return '';
  const chosen = who[new SeededRandom(ctx.story.seed ^ CHRONICLE_STREAM ^ Math.imul(night, INDEX_STEP) ^ MEMORY_SALT).next(who.length)];
  return pick(ctx, `memory_${MEMORY_OUTCOME_IDS[model.outcomeOf(chosen)]}`, night, chosen, lang, { ...baseVars(ctx), who: whoOf(ctx, chosen, lang) });
}

/** The sentences of one night, in the order they are told. Empty for a night that was not simulated. Never more than the player learned. */
export function nightSentences(ctx, night, lang) {
  const list = [];
  if (!simulated(ctx, night)) return list;
  const rec = nightTickAt(ctx.state, ctx.mythos, night), tonight = ctx.state.atNight(night), vars = baseVars(ctx);
  let told = 0;

  const omen = rec.newOmen.length > 0 && ctx.heard.has(omenId(night)) ? pick(ctx, `omen_${rec.newOmen}`, night, 0, lang, vars) : '';
  if (omen.length > 0) { list.push(omen); told++; } else list.push(pick(ctx, `opener_${stageId(ctx, night)}`, night, 0, lang, vars));

  if (rec.newMissingPerson > 0) {
    for (const r of tonight.rumors) {
      if (r.source !== SOURCE_MISSING || r.night !== night || r.subject < 0 || r.subject >= ctx.story.missing.length) continue;
      const level = levelOf(ctx, r.subject);
      if (!ctx.heard.has(rumorId(night)) && level === REVEAL_NOTHING) break;
      list.push(pick(ctx, 'vanished', night, r.subject, lang, ctx.story.missingVars(ctx.story.missing[r.subject], lang)));
      if (level === REVEAL_OUTCOME && r.subject < ctx.outcomes.length) list.push(outcomeSentence(ctx, r.subject, night, lang));
      told++;
      break;
    }
  }

  let cults = 0;
  for (const e of tonight.events) {
    if (e.kind !== EVENT_CULT_FOUNDED && e.kind !== EVENT_CULT_JOINED) continue;
    if (e.subject < 0 || e.subject >= ctx.story.roster.length || !ctx.heard.has(cultId(e.subject)) || cults >= 2) continue;
    const c = ctx.mythos.cults.find((x) => x.id === e.key);
    if (!c) continue;
    list.push(pick(ctx, 'cult', night, cults, lang, { ...vars, who: whoOf(ctx, e.subject, lang), cult: c.text[lang] || c.text.en }));
    cults++; told++;
  }

  for (const e of tonight.events) {
    if (e.kind !== EVENT_SECRET_EXPOSED || e.subject < 0 || e.subject >= ctx.story.roster.length || !ctx.heard.has(secretId(e.subject))) continue;
    const line = pick(ctx, `secret_${e.key}`, night, e.subject, lang, { ...vars, who: whoOf(ctx, e.subject, lang) });
    if (line.length === 0) continue;
    list.push(line); told++;
    break;
  }

  if (rec.rumorsChanged > 0) {
    for (const r of tonight.rumors) {
      if (r.night >= night || !ctx.heard.has(rumorId(r.night))) continue;
      if (!r.holders.some((h) => h.night === night && h.distortion > 0)) continue;
      list.push(pick(ctx, 'rumor', night, r.night, lang, vars)); told++;
      break;
    }
  }

  const mood = memorySentence(ctx, night, lang);
  if (mood.length > 0) { list.push(mood); told++; }
  if (told === 0) list.push(pick(ctx, `quiet_${stageId(ctx, night)}`, night, 0, lang, vars));
  return list;
}

/** The paragraph of one night: its sentences joined by a space. '' for a night that was not simulated. */
export const nightProse = (ctx, night, lang) => nightSentences(ctx, night, lang).join(' ');

/** The night by night chronicle, nights 1 to throughNight (at most the nights simulated), one paragraph each. */
export function chronicleProse(ctx, throughNight, lang) {
  const list = [];
  if (!ctx.state) return list;
  for (let night = 1; night <= Math.min(throughNight, ctx.state.nights.length); night++) list.push(nightProse(ctx, night, lang));
  return list;
}

/** The whole story for the ending: the fate of every missing person as far as the leads reveal, the cults and omens learned of, then a closing line chosen by how much was learned. */
export function summaryProse(ctx, throughNight, lang) {
  const vars = baseVars(ctx), parts = [pick(ctx, 'summary_open', SUMMARY_NIGHT, 0, lang, vars)];
  let learned = 0, unknown = 0;
  for (let k = 0; k < ctx.story.missing.length; k++) {
    const level = levelOf(ctx, k);
    if (level === REVEAL_NOTHING) { unknown++; continue; }
    learned++;
    if (level === REVEAL_OUTCOME && k < ctx.outcomes.length) parts.push(outcomeSentence(ctx, k, SUMMARY_NIGHT, lang));
    else parts.push(pick(ctx, 'taken', SUMMARY_NIGHT, k, lang, { ...ctx.story.missingVars(ctx.story.missing[k], lang), village: ctx.story.villageName }));
  }
  if (unknown > 0) parts.push(pick(ctx, 'summary_unknown', SUMMARY_NIGHT, 0, lang, { ...vars, count: String(unknown) }));
  const cultFolk = new Set();
  let omens = 0, secrets = 0;
  if (ctx.state) {
    for (let night = 1; night <= Math.min(throughNight, ctx.state.nights.length); night++) {
      for (const e of ctx.state.atNight(night).events) {
        if ((e.kind === EVENT_CULT_FOUNDED || e.kind === EVENT_CULT_JOINED) && ctx.heard.has(cultId(e.subject))) cultFolk.add(e.subject);
        if (e.kind === EVENT_COSMIC_OMEN && ctx.heard.has(omenId(night))) omens++;
        if (e.kind === EVENT_SECRET_EXPOSED && ctx.heard.has(secretId(e.subject))) secrets++;
      }
    }
  }
  if (cultFolk.size > 0) parts.push(pick(ctx, 'summary_cults', SUMMARY_NIGHT, 0, lang, { ...vars, count: String(cultFolk.size) }));
  if (omens > 0) parts.push(pick(ctx, 'summary_omens', SUMMARY_NIGHT, 0, lang, { ...vars, count: String(omens) }));
  learned += cultFolk.size + omens + secrets;
  parts.push(pick(ctx, `summary_close_${learned <= LOW_LEARNED ? 'low' : learned <= MID_LEARNED ? 'mid' : 'high'}`, SUMMARY_NIGHT, 0, lang, vars));
  return parts.join(' ');
}
