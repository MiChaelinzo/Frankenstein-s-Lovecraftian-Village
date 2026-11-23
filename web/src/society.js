// Round 26: JS port of Core/VillageSociety.cs (trust, suspicion and corruption spread). Golden key "society". Integer per mille arithmetic, so C# and JS agree exactly.
import { SeededRandom } from './core.js';

export const ACTION_IDS = ['chat_polite', 'return_item', 'return_journal', 'seen_near_body', 'seen_at_ritual_site', 'night_intrusion', 'ward_creature_in_view', 'fight_creature_in_view'];
export const [CHAT_POLITE, RETURN_ITEM, RETURN_JOURNAL, SEEN_NEAR_BODY, SEEN_AT_RITUAL_SITE, NIGHT_INTRUSION, WARD_CREATURE_IN_VIEW, FIGHT_CREATURE_IN_VIEW] = [0, 1, 2, 3, 4, 5, 6, 7];
export const TIER_NAMES = ['neutral', 'suspicious', 'trusting'];
export const [TIER_NEUTRAL, TIER_SUSPICIOUS, TIER_TRUSTING] = [0, 1, 2]; // neutral is 0 so a default standing changes nothing
export const CORRUPTION_NAMES = ['none', 'uneasy', 'corrupted', 'cultist', 'missing'];
export const [CORRUPTION_NONE, CORRUPTION_UNEASY, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST, CORRUPTION_MISSING] = [0, 1, 2, 3, 4];

export const SCALE = 1000, ALL_VILLAGERS = -1;
export const JITTER_STREAM = 0x4a4954, ZERO_STREAM = 0x5a4552, FATE_STREAM = 0x464154, CHAT_STREAM = 0x43485a, INDEX_STEP = 40503;
export const START_TRUST = [500, 300, 250, 150], JITTER_RANGE = 50;
export const ACTION_TRUST = [50, 150, 200, -50, -100, -150, 100, -50];
export const ACTION_SUSPICION = [-10, -30, -50, 250, 300, 200, -50, 100];
export const REPEAT_DECAY_STEP = 1, FAMILY_SHARE = 2, NEIGHBOUR_SHARE = 4, SUSPECT_GAIN_DIVISOR = 2;
export const SUSPICIOUS_AT = 500, TRUSTING_AT = 700;
export const DREAD_PRESSURE_DIVISOR = 2, NIGHT_PRESSURE = 60, RITUAL_PRESSURE = 100, MAX_RITUAL_STAGE = 5;
export const FAMILY_DELAY = 1, NEIGHBOUR_DELAY = 2, SPREAD_PENALTY = 80;
export const UNEASY_AT = 250, CORRUPTED_AT = 500, CULT_AT = 800, MISSING_FATE_OUT_OF = 3;
/** C# uses int.MaxValue; golden data writes -1 for it. */
export const UNREACHABLE = 2147483647;
export const LIE_STATEMENT_IDS = ['lie_saw_nothing', 'lie_was_asleep', 'lie_blame_neighbour', 'lie_not_me'];
export const LIE_OUT_OF = 2;

const clamp = (v) => Math.max(0, Math.min(SCALE, v));
const div = (a, b) => Math.trunc(a / b); // C# integer division

function nearestByHome(roster, layout, index) {
  const home = roster[index].homeIndex;
  if (!layout || home < 0 || home >= layout.length) return -1;
  let best = -1, bestD = Number.MAX_VALUE;
  const cx = (p) => p.x + p.sizeX / 2, cz = (p) => p.z + p.sizeZ / 2;
  for (let j = 0; j < roster.length; j++) {
    const h = roster[j].homeIndex;
    if (j === index || h < 0 || h >= layout.length) continue;
    const dx = cx(layout[home]) - cx(layout[h]), dz = cz(layout[home]) - cz(layout[h]), d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = j; }
  }
  return best;
}

/** Per mille of dread, rounded half up and clamped, with the C# float multiply. */
export function dreadPermille(dread) {
  if (typeof dread !== 'number' || Number.isNaN(dread)) return 0;
  return clamp(Math.floor(Math.fround(Math.fround(dread) * SCALE) + 0.5));
}

export function tierOf(trust, suspicion) {
  if (suspicion >= SUSPICIOUS_AT) return TIER_SUSPICIOUS;
  return trust >= TRUSTING_AT ? TIER_TRUSTING : TIER_NEUTRAL;
}

/** Uneasy at the window (1), corrupted facing the sea (2), cultist repeating the phrase (3), missing vanished (4). */
export const behaviorOfCorruption = (stage) => (stage === CORRUPTION_NONE ? 0 : stage);
export const combinedBehavior = (fromDread, stage) => Math.max(fromDread, behaviorOfCorruption(stage));
export const coldLine = (stage) => stage >= CORRUPTION_CORRUPTED;

/** What a suspicious villager does on a chat: '' to withhold, or an authored lie id. Mirror of VillageSociety.SuspiciousStatement. */
export function suspiciousStatement(seed, villagerIndex, night, topic) {
  const rng = new SeededRandom(seed ^ CHAT_STREAM ^ Math.imul(villagerIndex, INDEX_STEP) ^ Math.imul(night, 31) ^ Math.imul(topic + 1, 104729));
  if (rng.next(LIE_OUT_OF) !== 0) return '';
  return LIE_STATEMENT_IDS[rng.next(LIE_STATEMENT_IDS.length)];
}

/**
 * Builds the society of a village from a built story (village-story.js buildStory) and the layout: family links, nearest neighbour by home, patient zero,
 * spread delays and fates. Methods mirror VillageSociety: opinionsAfter(log), corruptionLevel, corruptionAt, standingOf.
 */
export function buildSociety(story, layout) {
  const roster = story.roster, n = roster.length, seed = story.seed;
  const familyLinks = Array.from({ length: n }, () => []);
  for (const fam of story.families) for (const a of fam.members) for (const b of fam.members) if (a !== b && a < n && b < n) familyLinks[a].push(b);
  for (const l of familyLinks) l.sort((x, y) => x - y);
  const neighbour = roster.map((_, i) => nearestByHome(roster, layout, i));
  const patientZero = n === 0 ? -1 : new SeededRandom(seed ^ ZERO_STREAM).next(n);
  const fate = roster.map((_, i) => (new SeededRandom(seed ^ FATE_STREAM ^ Math.imul(i, INDEX_STEP)).next(MISSING_FATE_OUT_OF) === 0 ? CORRUPTION_MISSING : CORRUPTION_CULTIST));
  const spreadDelay = new Array(n).fill(UNREACHABLE);
  if (patientZero >= 0) {
    spreadDelay[patientZero] = 0;
    const relax = (from, to, delay) => {
      if (spreadDelay[from] === UNREACHABLE || spreadDelay[from] + delay >= spreadDelay[to]) return false;
      spreadDelay[to] = spreadDelay[from] + delay;
      return true;
    };
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (spreadDelay[i] === UNREACHABLE) continue;
        for (const j of familyLinks[i]) changed = relax(i, j, FAMILY_DELAY) || changed;
        if (neighbour[i] >= 0) { changed = relax(i, neighbour[i], NEIGHBOUR_DELAY) || changed; changed = relax(neighbour[i], i, NEIGHBOUR_DELAY) || changed; }
      }
    }
  }

  const apply = (o, who, kind, divisor, share) => {
    let dt = div(ACTION_TRUST[kind], divisor * share);
    const ds = div(ACTION_SUSPICION[kind], divisor * share);
    if (dt > 0 && o.suspicion[who] >= SUSPICIOUS_AT) dt = div(dt, SUSPECT_GAIN_DIVISOR);
    o.trust[who] = clamp(o.trust[who] + dt);
    o.suspicion[who] = clamp(o.suspicion[who] + ds);
  };

  const society = {
    seed, roster, familyLinks, neighbour, patientZero, spreadDelay, fate,
    /** Trust and suspicion after an ordered log of { kind, subject }. Repeats count less; a trust gain is halved while already suspicious. */
    opinionsAfter(log, extraSuspicion = null) {
      const o = { trust: roster.map((v, i) => clamp(START_TRUST[v.disposition] + new SeededRandom(seed ^ JITTER_STREAM ^ Math.imul(i, INDEX_STEP)).next(2 * JITTER_RANGE + 1) - JITTER_RANGE)), suspicion: new Array(n).fill(0) };
      const repeats = new Map();
      for (const a of log || []) {
        const kind = a.kind;
        if (!Number.isInteger(kind) || kind < 0 || kind >= ACTION_TRUST.length) continue;
        const key = `${kind}:${a.subject}`, seen = repeats.get(key) || 0;
        repeats.set(key, seen + 1);
        const divisor = 1 + seen * REPEAT_DECAY_STEP;
        if (a.subject === ALL_VILLAGERS) { for (let i = 0; i < n; i++) apply(o, i, kind, divisor, 1); continue; }
        if (!Number.isInteger(a.subject) || a.subject < 0 || a.subject >= n) continue;
        apply(o, a.subject, kind, divisor, 1);
        for (const j of familyLinks[a.subject]) apply(o, j, kind, divisor, FAMILY_SHARE);
        const nb = neighbour[a.subject];
        if (nb >= 0 && !familyLinks[a.subject].includes(nb)) apply(o, nb, kind, divisor, NEIGHBOUR_SHARE);
      }
      // Round 27: extra suspicion per villager on top (mythos.js suspicionPressure). Null or short adds nothing, so the result equals the plain call.
      if (extraSuspicion) for (let i = 0; i < n && i < extraSuspicion.length; i++) o.suspicion[i] = clamp(o.suspicion[i] + extraSuspicion[i]);
      return o;
    },
    corruptionLevel(index, night, dread, ritualStage) {
      if (index < 0 || index >= n || spreadDelay[index] === UNREACHABLE) return 0;
      const nt = Math.max(1, night);
      if (nt < 1 + spreadDelay[index]) return 0;
      const rs = Math.max(0, Math.min(MAX_RITUAL_STAGE, ritualStage));
      return clamp(div(dreadPermille(dread), DREAD_PRESSURE_DIVISOR) + nt * NIGHT_PRESSURE + rs * RITUAL_PRESSURE - spreadDelay[index] * SPREAD_PENALTY);
    },
    corruptionAt(index, night, dread, ritualStage) {
      const level = society.corruptionLevel(index, night, dread, ritualStage);
      if (level >= CULT_AT) return fate[index];
      if (level >= CORRUPTED_AT) return CORRUPTION_CORRUPTED;
      return level >= UNEASY_AT ? CORRUPTION_UNEASY : CORRUPTION_NONE;
    },
    /** { tier, corruption } for villagers.js chat(). */
    standingOf(index, opinions, night, dread, ritualStage) {
      return { tier: tierOf(opinions.trust[index], opinions.suspicion[index]), corruption: society.corruptionAt(index, night, dread, ritualStage) };
    },
  };
  return society;
}
