// Round 26: the village society in the browser. Keeps the log of what the player did, turns it into trust and suspicion per villager (society.js, Core mirror),
// and the corruption stage of each villager for the current night, dread and ritual stage. It decides nothing itself: every number comes from society.js.
import { buildSociety, ACTION_IDS, ALL_VILLAGERS, CHAT_POLITE, SEEN_AT_RITUAL_SITE, NIGHT_INTRUSION, WARD_CREATURE_IN_VIEW, TIER_SUSPICIOUS, TIER_TRUSTING, dreadPermille } from './society.js';
import { landmarkAt } from './landmarks.js';
import { SOURCE_CHAT } from './investigation.js';
import { ROLE_IDS } from './villagers.js';

export const SOCIETY_SAVE_TAG = 'sc1', MAX_LOG = 150;
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
export function createSocietyController(deps) {
  const { state } = deps;
  let log = [], statements = null, built = null, builtStory = null, builtLayout = null, opinions = null, opinionsLen = -1, stageKey = '', stageList = [];
  const noted = new Set(); // witnessed actions already logged this night: `${night}:${kind}:${subject}`

  function society() {
    const story = deps.story ? deps.story() : null;
    if (!story) return null;
    if (story !== builtStory || state.layout !== builtLayout) { built = buildSociety(story, state.layout); builtStory = story; builtLayout = state.layout; opinions = null; stageKey = ''; }
    return built;
  }
  const night = () => state.night + 1;
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

  function currentOpinions() {
    const s = society();
    if (!s) return null;
    if (!opinions || opinionsLen !== log.length) { opinions = s.opinionsAfter(log); opinionsLen = log.length; }
    return opinions;
  }

  /** { tier, corruption } for villagers.js chat(), or null for someone outside the story roster. */
  function standing(index) {
    const s = society(), o = currentOpinions();
    if (!s || !o || index < 0 || index >= s.roster.length) return null;
    return s.standingOf(index, o, night(), state.sanity.dread, state.ritualStage);
  }

  function record(kind, subject) {
    if (!Number.isInteger(kind) || kind < 0 || kind >= ACTION_IDS.length || !Number.isInteger(subject)) return false;
    if (subject !== ALL_VILLAGERS && !(society() && subject >= 0 && subject < society().roster.length)) return false;
    log.push({ kind, subject });
    if (log.length > MAX_LOG) log.shift();
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
    stages, stageOf, standing, record, noteChat, watch, noteDoor, noteWard,
    /** Text of an authored statement (a lie or a chat statement) in a language, or ''. */
    statementText: (id, lang) => { const st = statements && statements.find(id); return st ? st.text[lang] || st.text.en : ''; },
    /** The authored chat statement a villager says in this chat, or null. */
    chatStatement(index, night1, result) {
      const s = society(), st = standing(index);
      return s && st ? authoredChatStatement(statements, ROLE_IDS[s.roster[index].role], night1, result, st.tier) : null;
    },
    log: () => log.slice(),
    snapshot: () => ({ society: serializeSocietyLog(log) }),
    restore(saved) { log = parseSocietyLog(saved && saved.society); noted.clear(); opinions = null; changed(); },
  };
}
