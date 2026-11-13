// JS port of Core/VillagerRules.cs. Enums are the same integers as in C#. Wording lives in i18n.js (villager.*), never read by these rules.
import { SeededRandom, sanitizeDread, tierFor, villagerTalkCountsAsClue, InteractionRules } from './core.js';
import { phaseAt, isDaylight } from './clock.js';

export const ROLE_IDS = ['fisher', 'priest', 'innkeeper', 'lamplighter', 'lighthouse_keeper', 'widow', 'child'];
export const DISPOSITION_NAMES = ['kind', 'wary', 'haunted', 'closed'];
export const BEHAVIOR_NAMES = ['normal', 'at_window', 'facing_sea', 'repeating_phrase', 'vanished'];
export const BEHAVIOR_CAUSES = ['routine', 'watching_the_lights', 'the_tide_calls', 'the_name_in_the_water', 'taken_by_the_deep'];
export const PLACE_KIND_NAMES = ['home', 'workplace', 'square', 'shore', 'gone'];
export const ROLE_COUNT = 7;
export const LINE_VARIANTS = 2;
export const DAYLIGHT_RELIEF = 2;
export const FACING_SEA_DREAD = 0.5;
export const MAX_VISIBLE_SEVERITY = 3;
const [HOME, WORKPLACE, SQUARE, SHORE, GONE] = [0, 1, 2, 3, 4];

const FIRST_NAMES = ['Ansel', 'Brigid', 'Corwin', 'Dorcas', 'Edmund', 'Faye', 'Gideon', 'Hester', 'Ignatius', 'Jonah', 'Keziah', 'Lucan', 'Mirabel', 'Nehemiah'];
const LAST_NAMES = ['Marsh', 'Thorne', 'Grimsby', 'Wickham', 'Salter', 'Pike', 'Ashby', 'Crowe', 'Dunmore', 'Hallow', 'Reeve', 'Tallow'];
const DISPOSITIONS = [[1, 0], [0, 2], [0, 1], [1, 2], [2, 3], [2, 3], [0, 1]];
const WORK_PIECE_IDS = [[], ['church', 'altar'], ['house_a', 'house_b'], ['well'], [], ['dead_tree', 'altar'], []];
const ROUTINES = [
  [SHORE, SHORE, SQUARE, HOME], [WORKPLACE, WORKPLACE, WORKPLACE, HOME], [HOME, WORKPLACE, WORKPLACE, WORKPLACE],
  [WORKPLACE, HOME, SQUARE, WORKPLACE], [HOME, HOME, SHORE, SHORE], [HOME, WORKPLACE, HOME, HOME], [HOME, SQUARE, HOME, HOME],
];

const piecesWithPrefix = (layout, prefix) => layout.reduce((acc, p, i) => (p.id != null && p.id.startsWith(prefix) ? (acc.push(i), acc) : acc), []);
// Always consumes one roll so the stream does not depend on the layout contents.
function pick(candidates, rng) {
  const roll = rng.next(Math.max(1, candidates.length));
  return candidates.length === 0 ? -1 : candidates[roll];
}

/** layout pieces are {id, x, z, sizeX, sizeZ} as from generateLayout. Villager: {index, name, role, disposition, homeIndex, workIndex}. */
export function generateRoster(seed, layout) {
  const rng = new SeededRandom(seed ^ 0x7a11e6);
  const houses = piecesWithPrefix(layout, 'house');
  const all = layout.map((_, i) => i);
  const taken = new Set();
  const roster = [];
  for (let r = 0; r < ROLE_COUNT; r++) {
    let name;
    do { name = `${FIRST_NAMES[rng.next(FIRST_NAMES.length)]} ${LAST_NAMES[rng.next(LAST_NAMES.length)]}`; } while (taken.has(name));
    taken.add(name);
    const disposition = DISPOSITIONS[r][rng.next(2)];
    const homeIndex = pick(houses.length > 0 ? houses : all, rng);
    let workIndex = -1;
    if (r === 2) {
      const others = houses.filter((i) => i !== homeIndex);
      workIndex = pick(others.length > 0 ? others : houses, rng);
    } else {
      for (const id of WORK_PIECE_IDS[r]) {
        const matches = piecesWithPrefix(layout, id);
        if (matches.length === 0) continue;
        workIndex = pick(matches, rng);
        break;
      }
    }
    if (workIndex < 0) workIndex = homeIndex;
    roster.push({ index: r, name, role: r, disposition, homeIndex, workIndex });
  }
  return roster;
}

export const scheduledKind = (v, phase) => ROUTINES[v.role][phase];
const resolve = (v, kind) => ({ kind, pieceIndex: kind === HOME ? v.homeIndex : kind === WORKPLACE ? v.workIndex : -1 });
export const scheduledPlace = (v, tick) => resolve(v, scheduledKind(v, phaseAt(tick)));

export function dreadSeverity(dread) {
  const d = sanitizeDread(dread);
  const tier = tierFor(d);
  if (tier >= 3) return 4;
  if (tier >= 2) return 3;
  if (d >= FACING_SEA_DREAD) return 2;
  return tier >= 1 ? 1 : 0;
}

export function behaviorAt(v, tick, dread) {
  let s = dreadSeverity(dread);
  if (s >= 4) return 4;
  if (v.disposition === 2 && s > 0) s = Math.min(MAX_VISIBLE_SEVERITY, s + 1);
  if (isDaylight(phaseAt(tick))) s = Math.max(0, s - DAYLIGHT_RELIEF);
  return s;
}
export const causeOf = (behavior) => BEHAVIOR_CAUSES[behavior];

export function locationAt(v, tick, dread) {
  switch (behaviorAt(v, tick, dread)) {
    case 4: return { kind: GONE, pieceIndex: -1 };
    case 1: return resolve(v, HOME);
    case 2: return resolve(v, SHORE);
    default: return scheduledPlace(v, tick);
  }
}

/** Same shape as VillagerTalkResult in C#. No display text is read, so narrator or translated text cannot change it. */
export function talk(seed, v, tick, dread, campaign, night) {
  const behavior = behaviorAt(v, tick, dread);
  const result = { available: false, behavior, yieldsClue: false, clueId: '', sanityDelta: 0, lineVariant: 0, rumor: '' };
  if (behavior === 4) return result;
  result.available = true;
  result.yieldsClue = villagerTalkCountsAsClue(v.disposition, behavior);
  if (result.yieldsClue) result.clueId = `villager_${v.index}`;
  result.sanityDelta = InteractionRules.talkSanityDelta(behavior, result.yieldsClue);
  result.lineVariant = new SeededRandom(seed ^ (v.index * 7919) ^ (night * 31)).next(LINE_VARIANTS);
  if (campaign && campaign.nights.length > 0) {
    const n = Math.max(1, Math.min(campaign.nights.length, night));
    result.rumor = campaign.nights[n - 1].rumor;
  }
  return result;
}

/** Display line for a talk result: key picked from behavior and variant only. */
export function lineKey(v, behavior, lineVariant) {
  const id = ROLE_IDS[v.role];
  switch (behavior) {
    case 1: return 'villager.window';
    case 2: return 'villager.sea';
    case 3: return `villager.phrase.${id}`;
    case 4: return 'villager.gone';
    default: return `villager.greet.${id}.${lineVariant === 0 ? 0 : 1}`;
  }
}
