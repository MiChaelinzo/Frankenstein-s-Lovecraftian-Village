// Round 28 (spec 158): Forbidden Knowledge. JS port of Core/KnowledgeModel.cs. Golden key "knowledge". Pure, no DOM, integer math only.
// The data file web/data/knowledge.json is a byte copy of Packages/.../Data/knowledge.json (tools/validate_repo.py and a test check it).
// Knowledge is independent of sanity, and its reality cost is presentation only: nothing here changes a Vigil rule, an ending or any other Core output.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';

export const KNOWLEDGE_LANGUAGES = ['en', 'fr'];
export const TIER_COUNT = 6, MAX_TIER = TIER_COUNT - 1;
export const SOURCE_IDS = ['journal', 'ritual', 'investigation', 'ruins', 'catacombs', 'mythos_event', 'cult_discovery'];
export const REALITY_STREAM = 0x4b4e57;

function text(o, owner) {
  const t = {};
  for (const lang of KNOWLEDGE_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`knowledge: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
}
function str(o, key, owner) {
  if (typeof o[key] !== 'string' || !o[key]) throw new Error(`knowledge: ${owner} lacks ${key}`);
  return o[key];
}
function int(o, key, owner) {
  if (typeof o[key] !== 'number') throw new Error(`knowledge: ${owner} lacks ${key}`);
  return Math.trunc(o[key]);
}
function objects(o, key) {
  if (!Array.isArray(o[key])) throw new Error(`knowledge: missing ${key} array`);
  for (const item of o[key]) if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`knowledge: ${key} holds a non-object`);
  return o[key];
}

/** Parses data/knowledge.json (text or object). Throws an Error naming the offending field; an unknown source id names sources. */
export function parseKnowledgeLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('knowledge: root is not an object');
  const lib = { tiers: [], sourcePoints: SOURCE_IDS.map(() => 0), rumors: [], effects: [] };
  for (const o of objects(root, 'tiers')) {
    const t = { id: str(o, 'id', 'tier'), threshold: int(o, 'threshold', 'tier'), name: text(o, 'tier'), benefits: [] };
    if (!Array.isArray(o.benefits)) throw new Error(`knowledge: tier ${t.id} lacks benefits`);
    for (const b of o.benefits) { if (typeof b !== 'string' || !b) throw new Error(`knowledge: tier ${t.id} has an empty benefit`); t.benefits.push(b); }
    lib.tiers.push(t);
  }
  if (lib.tiers.length !== TIER_COUNT) throw new Error(`knowledge: tiers needs exactly ${TIER_COUNT} entries`);
  if (lib.tiers[0].threshold !== 0) throw new Error('knowledge: tiers[0] threshold must be 0');
  for (let i = 1; i < lib.tiers.length; i++) if (lib.tiers[i].threshold <= lib.tiers[i - 1].threshold) throw new Error(`knowledge: tiers thresholds must strictly increase at ${lib.tiers[i].id}`);
  const seen = new Set();
  for (const o of objects(root, 'sources')) {
    const id = str(o, 'id', 'source'), index = SOURCE_IDS.indexOf(id);
    if (index < 0) throw new Error(`knowledge: sources has unknown source ${id}`);
    if (seen.has(id)) throw new Error(`knowledge: sources lists ${id} twice`);
    seen.add(id);
    const points = int(o, 'points', `source ${id}`);
    if (points <= 0) throw new Error(`knowledge: source ${id} points must be above 0`);
    lib.sourcePoints[index] = points;
  }
  if (seen.size !== SOURCE_IDS.length) throw new Error(`knowledge: sources must list all ${SOURCE_IDS.length} sources`);
  for (const o of objects(root, 'rumors')) {
    const r = { id: str(o, 'id', 'rumor'), tiers: [], texts: [] };
    for (const v of objects(o, 'versions')) {
      const tier = int(v, 'tier', `rumor ${r.id}`);
      if (tier < 0 || tier > MAX_TIER) throw new Error(`knowledge: rumor ${r.id} has tier out of range`);
      if (r.tiers.length && tier <= r.tiers[r.tiers.length - 1]) throw new Error(`knowledge: rumor ${r.id} versions must rise in tier`);
      r.tiers.push(tier); r.texts.push(text(v, `rumor ${r.id}`));
    }
    if (!r.tiers.length || r.tiers[0] !== 0) throw new Error(`knowledge: rumor ${r.id} needs a tier 0 version`);
    lib.rumors.push(r);
  }
  if (lib.rumors.length < 4) throw new Error('knowledge: rumors needs at least 4 entries');
  for (const o of objects(root, 'effects')) {
    const e = { id: str(o, 'id', 'effect'), minTier: int(o, 'minTier', 'effect'), text: text(o, 'effect') };
    if (e.minTier < 1 || e.minTier > MAX_TIER) throw new Error(`knowledge: effect ${e.id} minTier out of range`);
    lib.effects.push(e);
  }
  if (!lib.effects.length) throw new Error('knowledge: effects must not be empty');
  return lib;
}

/** The highest tier whose threshold the points reach. Negative points read as 0. */
export function tierFor(lib, points) {
  let tier = 0;
  for (let i = 1; i < lib.tiers.length; i++) if (points >= lib.tiers[i].threshold) tier = i;
  return tier;
}

/** What the player knows: a log of { source, points } gains folded into points. Independent of sanity. Negative points read as 0. */
export function createKnowledge(lib) {
  const log = [];
  let points = 0;
  const add = (source, pts) => { const p = Math.max(0, Math.trunc(pts)); log.push({ source, points: p }); points += p; };
  return {
    log, add,
    addSource(source) { add(source, lib.sourcePoints[source]); },
    get points() { return points; },
    get tier() { return tierFor(lib, points); },
  };
}

/** The state after replaying a gain log; equals adding the same gains one by one. */
export function replayKnowledge(lib, gains) {
  const k = createKnowledge(lib);
  for (const g of gains) k.add(g.source, g.points);
  return k;
}

/** A state from source ids, each worth its default points. An unknown id throws naming sources[i]. */
export function knowledgeFromSourceIds(lib, ids) {
  const k = createKnowledge(lib);
  ids.forEach((id, i) => {
    const index = SOURCE_IDS.indexOf(id);
    if (index < 0) throw new Error(`knowledge: sources[${i}] has unknown source ${id}`);
    k.addSource(index);
  });
  return k;
}

/** Every benefit id unlocked at the tier (clamped), lowest tier first. */
export function benefitsAt(lib, tier) {
  const out = [], top = Math.max(0, Math.min(tier, MAX_TIER));
  for (let i = 0; i <= top; i++) out.push(...lib.tiers[i].benefits);
  return out;
}
export const hasBenefit = (lib, tier, benefit) => benefitsAt(lib, tier).includes(benefit);

/** The rumor as told to a player of this tier: the version with the highest tier not above it. */
export function knowledgeRumorText(lib, rumorId, tier, lang) {
  const r = lib.rumors.find((x) => x.id === rumorId);
  if (!r) throw new Error(`knowledge: rumors has no rumor ${rumorId}`);
  let pick = 0;
  r.tiers.forEach((t, i) => { if (t <= tier) pick = i; });
  return r.texts[pick][lang] || r.texts[pick][KNOWLEDGE_LANGUAGES[0]];
}

/** Reality effect ids shown on a night at a tier (Core RealityDistortion.For): none at tier 0, else up to tier distinct effects in a seed-driven order. Presentation only. */
export function realityDistortion(lib, seed, night, tier) {
  const out = [];
  if (tier <= 0) return out;
  const t = Math.min(tier, MAX_TIER), eligible = lib.effects.filter((e) => e.minTier <= t).map((e) => e.id);
  const rng = new SeededRandom(seed ^ REALITY_STREAM ^ Math.imul(night, INDEX_STEP));
  const count = Math.min(t, eligible.length);
  for (let i = 0; i < count; i++) {
    const j = i + rng.next(eligible.length - i);
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    out.push(eligible[i]);
  }
  return out;
}
