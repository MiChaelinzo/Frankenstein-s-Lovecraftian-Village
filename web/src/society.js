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
// Round 29 trust network axes (Core VillageSociety.AxesAfter): Fear, Faith, Loyalty, Obsession, each 0..1000.
export const FEAR_STREAM = 0x464541, FAITH_STREAM = 0x464149, LOYALTY_STREAM = 0x4c4f59, OBSESSION_STREAM = 0x4f4253;
export const AXIS_JITTER = 50, OBSESSION_SPREAD = 150;
export const FEAR_BASE = [100, 250, 400, 200], FAITH_BASE = [200, 250, 450, 300];
export const FEAR_DREAD_DIVISOR = 3, FEAR_RITUAL_STEP = 40, FEAR_CORRUPTION_DIVISOR = 5, FAITH_RITUAL_STEP = 60, FAITH_CORRUPTION_DIVISOR = 2;
export const LOYALTY_BASE = 300, LOYALTY_FAMILY_STEP = 100, LOYALTY_FAMILY_CAP = 3, LOYALTY_OPINION_DIVISOR = 4;
export const OBSESSION_NIGHT_STEP = 40, OBSESSION_HAUNTED_BONUS = 150, OBSESSION_DREAD_DIVISOR = 4, DISPOSITION_HAUNTED = 2;
/** Fear at least this and above trust: too terrified to talk. */
export const TERRIFIED_AT = 800;
// Round 36 reputation propagation (Core VillageSociety.ReputationEffectsAfter, spec 176).
export const EFFECT_TRUSTED = 0, EFFECT_ACCUSED = 1, EFFECT_NAMES = ['trusted', 'accused'];
export const MAX_REPUTATION_HOPS = 2, HOP_DECAY_DIVISOR = 2, MAX_EFFECT_STRENGTH = 500, PROPAGATED_CAP_PER_VILLAGER = 300, PROPAGATED_CAP_PER_NIGHT = 600;
export const AXIS_NAMES = ['fear', 'faith', 'loyalty', 'obsession'];

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

/** True when fear is high and above trust: the villager may trust you and still refuse to talk. Mirror of VillageSociety.FearWithholds. */
export const fearWithholds = (trust, fear) => fear >= TERRIFIED_AT && fear > trust;

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
    /** Villagers one link away (family and nearest neighbour, both ways), ascending, no duplicates. */
    linkedTo(index) {
      const set = new Set(familyLinks[index]);
      if (neighbour[index] >= 0) set.add(neighbour[index]);
      for (let j = 0; j < n; j++) if (neighbour[j] === index) set.add(j);
      set.delete(index);
      return [...set].sort((x, y) => x - y);
    },
    /**
     * Round 36: explicit effect records { source, target, kind, effect, hop, strength, night } of an ordered log; nights[i] is the night of log[i] (null or short means 0).
     * Mirror of VillageSociety.ReputationEffectsAfter: origin record at hop 0, breadth first along linkedTo to MAX_REPUTATION_HOPS, halved per hop, each villager once per origin event,
     * per villager and per night caps on propagated strength. Does not change opinionsAfter.
     */
    reputationEffectsAfter(log, nights = null) {
      const result = [];
      if (!log) return result;
      const repeats = new Map(), received = new Array(n).fill(0), perNight = new Map();
      for (let k = 0; k < log.length; k++) {
        const a = log[k], kind = a.kind;
        if (!Number.isInteger(kind) || kind < 0 || kind >= ACTION_TRUST.length) continue;
        const key = `${kind}:${a.subject}`, seen = repeats.get(key) || 0;
        repeats.set(key, seen + 1);
        const night = nights && k < nights.length ? nights[k] : 0, net = ACTION_TRUST[kind] - ACTION_SUSPICION[kind];
        const effect = net < 0 ? EFFECT_ACCUSED : EFFECT_TRUSTED, origin = Math.min(MAX_EFFECT_STRENGTH, div(Math.abs(net), 1 + seen * REPEAT_DECAY_STEP));
        if (a.subject === ALL_VILLAGERS) { if (origin > 0) for (let i = 0; i < n; i++) result.push({ source: i, target: i, kind, effect, hop: 0, strength: origin, night }); continue; }
        if (!Number.isInteger(a.subject) || a.subject < 0 || a.subject >= n) continue;
        if (origin > 0) result.push({ source: a.subject, target: a.subject, kind, effect, hop: 0, strength: origin, night });
        const visited = new Set([a.subject]);
        let frontier = [a.subject];
        for (let hop = 1; hop <= MAX_REPUTATION_HOPS && frontier.length > 0; hop++) {
          let strength = origin;
          for (let h = 0; h < hop; h++) strength = div(strength, HOP_DECAY_DIVISOR);
          const next = [];
          for (const from of frontier) for (const to of society.linkedTo(from)) {
            if (visited.has(to)) continue;
            visited.add(to); next.push(to);
            const used = perNight.get(night) || 0, give = Math.min(strength, PROPAGATED_CAP_PER_VILLAGER - received[to], PROPAGATED_CAP_PER_NIGHT - used);
            if (give <= 0) continue;
            received[to] += give; perNight.set(night, used + give);
            result.push({ source: a.subject, target: to, kind, effect, hop, strength: give, night });
          }
          frontier = next;
        }
      }
      return result;
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
    /** Round 29: { fear, faith, loyalty, obsession } arrays (0..1000) for the opinions, night (1-based), dread and ritual stage. Additive; mirrors VillageSociety.AxesAfter. */
    axesAfter(opinions, night, dread, ritualStage, memory = null) {
      const dp = dreadPermille(dread), nt = Math.max(1, night), rs = Math.max(0, Math.min(MAX_RITUAL_STAGE, ritualStage));
      const jitter = (stream, i) => new SeededRandom(seed ^ stream ^ Math.imul(i, INDEX_STEP)).next(2 * AXIS_JITTER + 1) - AXIS_JITTER;
      const a = { fear: [], faith: [], loyalty: [], obsession: [] };
      for (let i = 0; i < n; i++) {
        const disp = roster[i].disposition, corruption = society.corruptionLevel(i, nt, dread, rs);
        a.fear.push(clamp(FEAR_BASE[disp] + jitter(FEAR_STREAM, i) + div(dp, FEAR_DREAD_DIVISOR) + rs * FEAR_RITUAL_STEP + div(corruption, FEAR_CORRUPTION_DIVISOR)));
        a.faith.push(clamp(FAITH_BASE[disp] + jitter(FAITH_STREAM, i) + rs * FAITH_RITUAL_STEP + div(corruption, FAITH_CORRUPTION_DIVISOR)));
        a.loyalty.push(clamp(LOYALTY_BASE + Math.min(familyLinks[i].length, LOYALTY_FAMILY_CAP) * LOYALTY_FAMILY_STEP + div(opinions.trust[i], LOYALTY_OPINION_DIVISOR) - div(opinions.suspicion[i], LOYALTY_OPINION_DIVISOR) + jitter(LOYALTY_STREAM, i)));
        a.obsession.push(clamp(new SeededRandom(seed ^ OBSESSION_STREAM ^ Math.imul(i, INDEX_STEP)).next(OBSESSION_SPREAD + 1) + nt * OBSESSION_NIGHT_STEP + (disp === DISPOSITION_HAUNTED ? OBSESSION_HAUNTED_BONUS : 0) + div(dp, OBSESSION_DREAD_DIVISOR)));
      }
      // Round 34: what each villager remembers (memory.js effectsOfAll) added on top and clamped. Null or short adds nothing, so the result equals the plain call.
      if (memory) for (let i = 0; i < n && i < memory.length; i++) {
        a.fear[i] = clamp(a.fear[i] + memory[i].fear); a.faith[i] = clamp(a.faith[i] + memory[i].faith);
        a.loyalty[i] = clamp(a.loyalty[i] + memory[i].loyalty); a.obsession[i] = clamp(a.obsession[i] + memory[i].obsession);
      }
      return a;
    },
    /** standingOf plus { trust, fear } so chat() can withhold from a terrified villager. */
    standingWithAxes(index, opinions, axes, night, dread, ritualStage, memory = 0) {
      return { ...society.standingOf(index, opinions, night, dread, ritualStage), trust: opinions.trust[index], fear: axes.fear[index], memory };
    },
  };
  return society;
}
