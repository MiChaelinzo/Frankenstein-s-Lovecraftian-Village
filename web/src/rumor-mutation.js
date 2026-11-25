// Round 36 (spec 181): JS port of Core/RumorMutation.cs. Golden key "rumorMutation". Pure functions, no DOM, no saved state.
// The data file web/data/rumor-mutations.json is a byte copy of Packages/.../Data/rumor-mutations.json (tools/validate_repo.py and a test check it).
// PRESENTATION ONLY: the simulation and the saved state are untouched, and the true account stays recoverable at the knowledge tier gate.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';

export const RUMOR_MUTATION_LANGUAGES = ['en', 'fr'];
const SOURCE_IDS = ['secret', 'cosmic', 'missing']; // same order as mythos.js SOURCE_IDS; not imported because mythos.js imports this module
export const MUTATION_STREAM = 0x4d5554, CHAIN_SALT = 7919, MIN_STAGES = 3, MAX_KNOWLEDGE_TIER = 5;
export const NIGHT_STEP = 60, EXPOSURE_WEIGHT = 500, STAGE_SIZE = 300, JITTER_RANGE = 100, EXPOSURE_SCALE = 1000;

const localized = (d, owner) => {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`rumor-mutations: ${owner} holds a non-object`);
  const t = {};
  for (const lang of RUMOR_MUTATION_LANGUAGES) {
    if (typeof d[lang] !== 'string' || !d[lang].trim()) throw new Error(`rumor-mutations: ${owner} lacks ${lang} text`);
    t[lang] = d[lang];
  }
  return t;
};

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed, a chain has too few stages, a language is missing or two chains tell the same rumor. */
export function parseRumorMutationLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('rumor-mutations: root is not an object');
  if (!Number.isInteger(root.trueTier) || root.trueTier < 1 || root.trueTier > MAX_KNOWLEDGE_TIER) throw new Error(`rumor-mutations: trueTier must be between 1 and ${MAX_KNOWLEDGE_TIER}`);
  const trueLabel = localized(root.trueLabel, 'trueLabel');
  if (!Array.isArray(root.chains) || root.chains.length === 0) throw new Error('rumor-mutations: chains needs at least one entry');
  const seen = new Set();
  const chains = root.chains.map((o) => {
    if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id) throw new Error('rumor-mutations: a chain lacks an id');
    const source = SOURCE_IDS.indexOf(o.source);
    if (source < 0) throw new Error(`rumor-mutations: chain ${o.id} has an unknown source`);
    if (typeof o.ref !== 'string') throw new Error(`rumor-mutations: chain ${o.id} lacks ref`);
    const key = `${source}:${o.ref}`;
    if (seen.has(key)) throw new Error(`rumor-mutations: chain ${o.id} tells a rumor another chain tells`);
    seen.add(key);
    if (!Array.isArray(o.stages) || o.stages.length < MIN_STAGES) throw new Error(`rumor-mutations: chain ${o.id} needs at least ${MIN_STAGES} stages`);
    return { id: o.id, source, ref: o.ref, original: localized(o.original, `chain ${o.id} original`), stages: o.stages.map((s) => localized(s, `chain ${o.id} stage`)) };
  });
  return { trueTier: root.trueTier, trueLabel, chains };
}

/** The index of the chain that retells this rumor, or -1. */
export const rumorChainIndex = (lib, source, ref) => lib.chains.findIndex((c) => c.source === source && c.ref === ref);

/** The stage (index into the chain's stages) of a rumor told nightsSince nights after it began. Negative nights and exposure read as 0. Never exceeds the chain, never falls as nights pass. */
export function rumorStage(lib, chain, seed, rumorNight, nightsSince, exposure) {
  const jitter = new SeededRandom(seed ^ MUTATION_STREAM ^ Math.imul(rumorNight, INDEX_STEP) ^ Math.imul(chain, CHAIN_SALT)).next(JITTER_RANGE);
  const progress = Math.max(0, nightsSince) * NIGHT_STEP + Math.trunc(Math.min(Math.max(0, exposure), EXPOSURE_SCALE) * EXPOSURE_WEIGHT / EXPOSURE_SCALE) + jitter;
  return Math.min(lib.chains[chain].stages.length - 1, Math.trunc(progress / STAGE_SIZE));
}

/** The wording of a rumor that has a chain: the mutated stage, with the true account after the label at or above the gate tier. '' when no chain retells the rumor. */
export function rumorMutationText(lib, rumor, refId, seed, nightsSince, exposure, knowledgeTier, lang) {
  const chain = rumorChainIndex(lib, rumor.source, refId);
  if (chain < 0) return '';
  const c = lib.chains[chain], text = c.stages[rumorStage(lib, chain, seed, rumor.night, nightsSince, exposure)][lang] || c.stages[0].en;
  return knowledgeTier >= lib.trueTier ? `${text} ${lib.trueLabel[lang] || lib.trueLabel.en} ${c.original[lang] || c.original.en}` : text;
}

/** The highest exposure among the cult leaders at the end of a night (0 with none). */
export const rumorExposure = (night) => (night ? night.leaders.reduce((best, l) => Math.max(best, l.exposure), 0) : 0);
