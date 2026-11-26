// Round 26: the village society in the browser. Keeps the log of what the player did, turns it into trust and suspicion per villager (society.js, Core mirror),
// and the corruption stage of each villager for the current night, dread and ritual stage. It decides nothing itself: every number comes from society.js.
import { buildSociety, ACTION_IDS, ALL_VILLAGERS, CHAT_POLITE, SEEN_AT_RITUAL_SITE, NIGHT_INTRUSION, WARD_CREATURE_IN_VIEW, TIER_SUSPICIOUS, TIER_TRUSTING, dreadPermille } from './society.js';
import { landmarkAt } from './landmarks.js';
import { SOURCE_CHAT } from './investigation.js';
import { ROLE_IDS } from './villagers.js';
import { parseMemoryLibrary, replayMemory, baselineEvents, eventFor, trustAfter, KIND_RUMOR_HEARD, MEMORY_NONE } from './memory.js';
import { parseRumorMutationLibrary } from './rumor-mutation.js';
import { parseMythosLibrary, runMythos, buildMythosFeed, buildGraph, mythosChatLines, suspicionPressure, mythosSchedule } from './mythos.js';

export const SOCIETY_SAVE_TAG = 'sc1', MAX_LOG = 150;
export const MEMORY_SAVE_TAG = 'mm1', MAX_MEMORY_LOG = 150, RUMOR_MEMORY_WEIGHT = 300;
const MEMORY_ENTRY_RE = /^(\d{1,3}):(\d{1,3}):(\d):(\d{1,4}):(-?\d{1,3})$/;

/** Compact memory save string: mm1;night:villager:kind:weight:subject,... Oldest entries go first when over MAX_MEMORY_LOG. The baseline is rebuilt from the story, never saved. */
export const serializeMemoryLog = (log) => `${MEMORY_SAVE_TAG};${log.slice(-MAX_MEMORY_LOG).map((e) => `${e.night}:${e.villager}:${e.kind}:${e.weight}:${e.subject}`).join(',')}`;

/** Parses a memory save string item by item; anything malformed or out of range is dropped, so an old or edited save loads as an empty or shorter log. */
export function parseMemoryLog(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  const [tag, body = ''] = text.split(';');
  if (tag !== MEMORY_SAVE_TAG) return out;
  for (const item of body.split(',')) {
    const m = MEMORY_ENTRY_RE.exec(item);
    if (!m) continue;
    const e = { night: Number(m[1]), villager: Number(m[2]), kind: Number(m[3]), weight: Number(m[4]), subject: Number(m[5]) };
    if (e.night >= 1 && e.kind < 8 && e.weight >= 1 && e.weight <= 1000 && out.length < MAX_MEMORY_LOG) out.push(e);
  }
  return out;
}
export const WITNESS_RADIUS_M = 14;     // a villager this close (metres) sees what the player does
export const NIGHT_PHASE = 3;            // clock.js phase index of the night
const SAVE_ENTRY_RE = /^(\d{1,2}):(-?\d{1,3})$/;

/** Compact save string: sc1;kind:subject,kind:subject. Oldest entries go first when the log is over MAX_LOG. */
export const serializeSocietyLog = (log) => `${SOCIETY_SAVE_TAG};${log.slice(-MAX_LOG).map((a) => `${a.kind}:${a.subject}`).join(',')}`;

/** Parses a save string item by item; anything malformed is dropped, so an old or edited save loads as an empty or shorter log. */
export function parseSocietyLog(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  const [tag, body = ''] = text.split(';');
  if (tag !== SOCIETY_SAVE_TAG) return out;
  for (const item of body.split(',')) {
    const m = SAVE_ENTRY_RE.exec(item);
    if (!m) continue;
    const kind = Number(m[1]), subject = Number(m[2]);
    if (kind < ACTION_IDS.length && out.length < MAX_LOG) out.push({ kind, subject });
  }
  return out;
}

/**
 * The authored chat statement (statements.json, source chat) a lucid villager can be heard saying: the villager's role, and the statement's night reached.
 * Only a village-story chat (topic 3) reveals it, or any lucid chat with a trusting villager; a suspicious or withheld chat reveals none. Deterministic: no randomness.
 */
export function authoredChatStatement(statements, roleId, night, result, tier) {
  if (!statements || !result || !result.available || result.behavior !== 0 || result.withheld || tier === TIER_SUSPICIOUS) return null;
  if (!(result.hintId === 'village' || (tier === TIER_TRUSTING && result.hintId))) return null;
  return statements.statements.find((s) => s.source === SOURCE_CHAT && s.role === roleId && s.night >= 1 && s.night <= night) || null;
}

/** Index of the nearest villager (scene entries { id, pos }) within WITNESS_RADIUS_M of a point in metres, or -1. Ties go to the earlier entry (roster order). */
export function nearestWitness(scene, x, z) {
  let best = -1, bestD = WITNESS_RADIUS_M;
  for (const v of scene || []) { const d = Math.hypot(v.pos[0] - x, v.pos[2] - z); if (d < bestD) { best = v.id; bestD = d; } }
  return best;
}

/**
 * deps: { state (seed, layout, sanity, night 0-based, ritualStage), story() -> village story or null, gridW, gridD, cell, onChange?() }
 * Trust and corruption are ignored when there is no story (no society to build).
 */
export const BAR_KEYS = ['trust', 'fear', 'faith', 'loyalty', 'obsession', 'corruption'];
export const CORRUPTION_BAR_STEP = 250; // corruption stage 0..4 shown on the same 0..1000 scale as the other bars

/** The six bars of one villager as [{ key, value }] (0..1000): trust, the four Round 29 axes and the corruption stage. Null when any part is missing (townsfolk outside the story roster). */
export function barRows(trust, axes, stage) {
  if (!Number.isFinite(trust) || !axes) return null;
  const values = { trust, fear: axes.fear, faith: axes.faith, loyalty: axes.loyalty, obsession: axes.obsession, corruption: Math.max(0, stage | 0) * CORRUPTION_BAR_STEP };
  return BAR_KEYS.map((key) => ({ key, value: values[key] }));
}

export function createSocietyController(deps) {
  const { state } = deps;
  let log = [], logNights = [], rumorMutations = null, mythosLib = null, mythosCache = null, mythosKey = '', graph = null, opinionsKey = '', statements = null, built = null, builtStory = null, builtLayout = null, opinions = null, opinionsLen = -1, axesKey = '', axesCache = null, lostApplied = 0, finalKey = '', finalState = null, stageKey = '', stageList = [];
  let memoryLib = null, memoryLog = [], adjusted = null, adjustedFor = null, adjustedKey = '', memoryKeyOf = '', memoryCache = null, memoryEdits = 0, opinionsVersion = 0; // opinionsVersion counts recomputations: the log length stays at its cap and lost trust is not in the key
  const noted = new Set(); // witnessed actions already logged this night: `${night}:${kind}:${subject}`
  let seenSeed = null;
  /** A new village (another seed) starts with no action log and no memories, like the board and the theories. Called before any read or write of the logs. */
  function ensureSeed() {
    if (seenSeed === state.seed) return;
    seenSeed = state.seed; log = []; logNights = []; memoryLog = []; memoryEdits += 1; memoryKeyOf = ''; noted.clear(); opinions = null; adjusted = null;
  }

  function society() {
    ensureSeed();
    const story = deps.story ? deps.story() : null;
    if (!story) return null;
    if (story !== builtStory || state.layout !== builtLayout) { built = buildSociety(story, state.layout); builtStory = story; builtLayout = state.layout; opinions = null; stageKey = ''; mythosKey = ''; graph = null; }
    return built;
  }
  const night = () => state.night + 1;
  const TRUST_UNIT = 10; // a theory's trust cost is in points of 100; opinions run 0..1000
  const changed = () => deps.onChange?.();

  /** Corruption stage of each roster index for the current night, dread and ritual stage; empty without a society. Cached per (night, dread, ritual stage). */
  function stages() {
    const s = society();
    if (!s) return [];
    const key = `${night()}|${dreadPermille(state.sanity.dread)}|${state.ritualStage}|${s.roster.length}`;
    if (key !== stageKey) { stageKey = key; stageList = s.roster.map((_, i) => s.corruptionAt(i, night(), state.sanity.dread, state.ritualStage)); }
    return stageList;
  }
  /** Stage of one roster index; 0 for townsfolk beyond the story roster. */
  const stageOf = (index) => stages()[index] || 0;

  /** The mythos feed (Core MythosSimulation mirror) for the current night, or null without a society or data. Replayed on the fixed Core schedule (mythosSchedule), so it changes only with the night and what was heard stays true. */
  function mythosFeed() {
    const s = society();
    if (!s || !mythosLib || !s.roster.length) return null;
    const recruited = deps.recruitedByNight ? deps.recruitedByNight(night()) : null; // Round 34 (spec 170): aftermath of recruited missing persons, null until known
    const key = `${state.seed}|${night()}|${s.roster.length}${recruited ? `|${recruited.join('.')}` : ''}`;
    if (key !== mythosKey) { mythosKey = key; const inputs = mythosSchedule(night()); if (recruited) inputs.recruitedByNight = recruited; mythosCache = buildMythosFeed(mythosLib, runMythos(s, deps.story(), mythosLib, inputs, night()), night()); }
    return mythosCache;
  }

  function currentOpinions() {
    const s = society();
    if (!s) return null;
    const feed = mythosFeed(), key = feed ? mythosKey : '';
    const lost = Math.max(0, deps.trustLost ? deps.trustLost() | 0 : 0) * TRUST_UNIT;
    if (!opinions || opinionsLen !== log.length || opinionsKey !== key || lostApplied !== lost) {
      opinions = s.opinionsAfter(log, feed ? suspicionPressure(feed.current, s.roster.length) : null, logNights); opinionsLen = log.length; opinionsKey = key; lostApplied = lost; opinionsVersion += 1;
      if (lost > 0) opinions = { ...opinions, trust: opinions.trust.map((t) => Math.max(0, t - lost)) }; // wrong theories about villagers cost trust (Core TheoryRules.TrustLost, whole points of 0..100)
    }
    return opinions;
  }

  /**
   * What a lucid villager can tell the player in a village chat, as [{ id, text }] mythos statements (ids as in mythos.js): the newest rumor they hold, the truth behind it when they
   * started it, and a cult member among their links. Nothing for a suspicious, withheld or corrupted chat, so the player only learns what a villager could honestly say.
   */
  function mythosChat(index, night1, result, lang) {
    const s = society(), feed = mythosFeed(), st = standing(index);
    if (!s || !feed || !st) return [];
    if (!graph) graph = buildGraph(s);
    const lines = mythosChatLines(s, feed, deps.story(), graph, index, st.tier, night1, result, lang, rumorMutations, deps.knowledgeTier ? deps.knowledgeTier() : 0);
    const noteKey = `${night1}:rumor:${index}`;
    if (lines.length && !noted.has(noteKey)) { noted.add(noteKey); remember({ night: night1, villager: index, kind: KIND_RUMOR_HEARD, subject: -1, weight: RUMOR_MEMORY_WEIGHT }); changed(); } // a rumor told to the player was heard by the villager first
    return lines;
  }

  /** Round 34: what every villager remembers (memory.js replay of the story baseline and the live events) at the current night; null without a society. Cached per recorded event counter, night and roster. */
  function memory() {
    const s = society();
    if (!s) return null;
    const key = `${memoryEdits}|${night()}|${s.roster.length}|${state.seed}`;
    if (key !== memoryKeyOf) { memoryKeyOf = key; memoryCache = replayMemory(s.roster.length, [...baselineEvents(deps.story()), ...memoryLog], night()); }
    return memoryCache;
  }
  /** Opinions with what each villager remembers added to their trust (memory.js trustAfter). Identical to currentOpinions() while nobody remembers anything strongly. */
  function adjustedOpinions() {
    const o = currentOpinions(), m = memory();
    if (!o || !m) return o;
    if (adjustedFor !== o || adjustedKey !== memoryKeyOf) { adjustedFor = o; adjustedKey = memoryKeyOf; adjusted = trustAfter(o, m.effectsOfAll()); }
    return adjusted;
  }

  /** Round 29: Fear, Faith, Loyalty and Obsession of the whole roster for the current night, dread and ritual stage; null without a society. Cached per opinions, night, dread and ritual stage. */
  function axesList() {
    const s = society(), o = adjustedOpinions();
    if (!s || !o) return null;
    const key = `${opinionsVersion}|${opinionsKey}|${memoryKeyOf}|${night()}|${dreadPermille(state.sanity.dread)}|${state.ritualStage}|${s.roster.length}`;
    if (key !== axesKey) { axesKey = key; axesCache = s.axesAfter(o, night(), state.sanity.dread, state.ritualStage, memory().effectsOfAll()); }
    return axesCache;
  }
  /** { fear, faith, loyalty, obsession } (0..1000) of one villager, or null for someone outside the story roster. */
  function axes(index) {
    const a = axesList();
    if (!a || index < 0 || index >= a.fear.length) return null;
    return { fear: a.fear[index], faith: a.faith[index], loyalty: a.loyalty[index], obsession: a.obsession[index] };
  }

  /** { tier, corruption, trust, fear } for villagers.js chat(), or null for someone outside the story roster. Fear above trust makes chat withhold (Core FearWithholds). */
  function standing(index) {
    const s = society(), o = adjustedOpinions(), a = axesList();
    if (!s || !o || !a || index < 0 || index >= s.roster.length) return null;
    return s.standingWithAxes(index, o, a, night(), state.sanity.dread, state.ritualStage, memory().outcomeOf(index));
  }

  /** Adds one live memory event (Core VillagerMemoryModel.Record) and drops the oldest past MAX_MEMORY_LOG. */
  function remember(ev) { memoryEdits += 1; memoryLog.push(ev); /* the counter, not the length, keys the cache: the length stays at the cap */ if (memoryLog.length > MAX_MEMORY_LOG) memoryLog.shift(); }

  function record(kind, subject) {
    ensureSeed(); // an ALL_VILLAGERS action skips society() below, so reset a stale log here first
    if (!Number.isInteger(kind) || kind < 0 || kind >= ACTION_IDS.length || !Number.isInteger(subject)) return false;
    if (subject !== ALL_VILLAGERS && !(society() && subject >= 0 && subject < society().roster.length)) return false;
    log.push({ kind, subject }); logNights.push(night()); // session only: the saved log keeps no nights
    if (log.length > MAX_LOG) { log.shift(); logNights.shift(); }
    const ev = eventFor(kind, subject, night());
    if (ev) remember(ev);
    opinions = null; changed();
    return true;
  }
  /** Once per night per kind and subject, for actions a watcher could otherwise log every second. */
  function recordOnce(kind, subject) {
    const key = `${night()}:${kind}:${subject}`;
    if (noted.has(key)) return false;
    if (!record(kind, subject)) return false;
    noted.add(key); return true;
  }

  /** A chat that reached the villager: polite words, counted by the model with its repeat decay. */
  function noteChat(index, result) { if (result && result.available) record(CHAT_POLITE, index); }
  /** Player metres position and the villager scene (3D only): the ritual site seen by a villager. */
  function watch(player, scene) {
    if (!player || !Number.isFinite(player.x) || !deps.story || !deps.story()) return;
    const witness = nearestWitness(scene, player.x, player.z);
    if (witness < 0 || witness >= (society() ? society().roster.length : 0)) return;
    if (landmarkAt(state.seed, deps.gridW, deps.gridD, player.x / deps.cell, player.z / deps.cell) === 'ritual_site') recordOnce(SEEN_AT_RITUAL_SITE, witness);
  }
  /** A door tried at night: the owner of that house knows. pieceIndex is the layout index of the door's building; phase the clock phase. */
  function noteDoor(pieceIndex, phase) {
    const s = society();
    if (!s || phase !== NIGHT_PHASE) return;
    const owner = s.roster.findIndex((v) => v.homeIndex === pieceIndex);
    if (owner >= 0) recordOnce(NIGHT_INTRUSION, owner);
  }
  /** A ward laid with a villager in view (3D, player metres position). */
  function noteWard(player, scene) {
    if (!player || !Number.isFinite(player.x)) return;
    const witness = nearestWitness(scene, player.x, player.z);
    if (witness >= 0) recordOnce(WARD_CREATURE_IN_VIEW, witness);
  }

  return {
    setStatements(lib) { statements = lib || null; },
    /** Loads data/mythos.json (object); without it the village has no background simulation and every mythos method returns nothing. */
    setMythos(json) { mythosLib = json ? parseMythosLibrary(json) : null; mythosKey = ''; finalKey = ''; opinions = null; },
    /** Round 36 (spec 181): loads data/rumor-mutations.json (object); without it rumors are told unmutated. */
    /** The parsed rumor mutation library or null, for the chronicle's drift sentences. */
    rumorMutationLibrary: () => rumorMutations,
    setRumorMutations(json) { rumorMutations = json ? parseRumorMutationLibrary(json) : null; },
    /** Loads data/memory.json (object); without it villagers still remember (effects apply) but say no memory line. */
    setMemory(json) { memoryLib = json ? parseMemoryLibrary(json) : null; },
    /** What a villager says because of what they remember in a language, '' when nothing or no data. */
    /** Round 34: the story baseline plus the live events, the log the generated chronicle replays; null without a story. */
    /** Counts every change of the memory log, for panels that redraw on it (the log length stops growing at its cap). */
    memoryVersion: () => { ensureSeed(); return memoryEdits; },
    memoryEvents() { ensureSeed(); const s = deps.story(); return s ? [...baselineEvents(s), ...memoryLog] : null; },
    memoryLine(index, night1, lang) { const m = memory(); return m && memoryLib ? m.lineFor(memoryLib, state.seed, index, night1, lang) : ''; },
    /** Memory outcome id of a villager (memory.js MEMORY_OUTCOME_IDS index); MEMORY_NONE without a society. */
    memoryOutcome(index) { const m = memory(); return m ? m.outcomeOf(index) : MEMORY_NONE; },
    /** Round 36 (spec 176): the effect records of everything the player did (society.js reputationEffectsAfter), for the chronicle and UI; empty without a society. */
    reputationEffects() { const s = society(); return s ? s.reputationEffectsAfter(log, logNights) : []; },
    /** Round 36: the effects one villager holds against or for the player, strongest first; [] without a society. */
    reputationOf(index) { const s = society(); return (s ? s.reputationEffectsAfter(log, logNights) : []).filter((e) => e.target === index).sort((a, b) => b.strength - a.strength || a.hop - b.hop); },
    mythosFeed, mythosChat, mythosKey: () => { mythosFeed(); return mythosKey; },
    stages, stageOf, standing, axes, record,
    /** The six bars (trust, fear, faith, loyalty, obsession, corruption) of a villager, or null. */
    bars(index) { const st = standing(index); return st ? barRows(st.trust, axes(index), stageOf(index)) : null; },
    /** The built VillageSociety (Core mirror) or null without a story. */
    villageSociety: society,
    /** Mythos state replayed through the last night (ground truth for theories); null without data or a society. */
    mythosFinal(nights) {
      const s = society();
      if (!s || !mythosLib || !s.roster.length) return null;
      const n = Math.max(1, nights | 0), key = `${state.seed}|${n}|${s.roster.length}`;
      if (key !== finalKey) { finalKey = key; finalState = runMythos(s, deps.story(), mythosLib, mythosSchedule(n), n); }
      return finalState;
    }, noteChat, watch, noteDoor, noteWard,
    /** Text of an authored statement (a lie or a chat statement) in a language, or ''. */
    statementText: (id, lang) => { const st = statements && statements.find(id); return st ? st.text[lang] || st.text.en : ''; },
    /** The authored chat statement a villager says in this chat, or null. */
    chatStatement(index, night1, result) {
      const s = society(), st = standing(index);
      return s && st ? authoredChatStatement(statements, ROLE_IDS[s.roster[index].role], night1, result, st.tier) : null;
    },
    log: () => { ensureSeed(); return log.slice(); },
    snapshot: () => { ensureSeed(); return { society: serializeSocietyLog(log), memory: serializeMemoryLog(memoryLog) }; },
    restore(saved) { ensureSeed(); log = parseSocietyLog(saved && saved.society); logNights = log.map(() => 0); /* restored actions have no known night */ memoryLog = parseMemoryLog(saved && saved.memory); memoryEdits += 1; memoryKeyOf = ''; noted.clear(); opinions = null; changed(); },
  };
}
