// Where villagers stand and how they are listed. Pure: layout, clock tick and dread in, positions and rows out. No DOM, no randomness.
// Rules (who is where, how they behave) stay in villagers.js; this file only turns them into cell coordinates for 2D, 3D and the minimap.
import { ROLE_IDS, PLACE_KIND_NAMES, BEHAVIOR_NAMES, locationAt, behaviorAt, causeOf, carriesLitLantern, stopAt, placeOfStop } from './villagers.js';
import { phaseAt, dayNumber, lanternsLit, wrapTick, phaseStart, MINUTES_PER_DAY, PHASE_NAMES, SESSION_START_TICK } from './clock.js';
import { coastSide } from './view3d-math.js';

import { streetsEnabled, facingDx, facingDz, laneRoute } from './streets.js';
export const SECONDS_PER_TICK = 1;        // session clock: one real second is one village minute
export const START_TICK = SESSION_START_TICK; // a session starts at the heart of dusk (Core GameClock.SessionStartTick)
export const FRONT_OFFSET = 0.45;         // cells in front of a building's south wall
export const SQUARE_RADIUS = 1.6;
export const STREET_SQUARE_RADIUS = 1.4;  // cells; the ring in the cobbled square of a village with streets         // cells; villagers in the square stand on a ring around the grid centre
export const SHORE_INSET = 0.6;           // cells from the grid edge on the coast side
export const TALK_PICK_HEIGHT = 1.0;      // metres; chest height for 3D picking
export const TALK_PICK_RADIUS = 0.7;      // metres
const HOME = 0, WORKPLACE = 1, SQUARE = 2, SHORE = 3, GONE = 4;

/** ?tick=N (query or hash) freezes the session clock at N for captures and tests. Null when absent or not an integer. */
export function parseTickParam(source) {
  const raw = new URLSearchParams(String(source || '').replace(/^[?#]/, '')).get('tick');
  return raw !== null && /^-?\d{1,9}$/.test(raw) ? Number(raw) : null;
}

/** Tick for the session: frozen when a tick was requested, else START_TICK plus whole elapsed village minutes. skipMinutes is the part of the day Endure ran forward. */
export function sessionTick(elapsedMs, frozenTick = null, skipMinutes = 0) {
  const skip = Number.isFinite(skipMinutes) ? Math.round(skipMinutes) : 0;
  if (frozenTick !== null) return frozenTick + skip;
  const ms = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return START_TICK + Math.floor(ms / (SECONDS_PER_TICK * 1000)) + skip;
}
/** The same clock with the fraction of the current minute, so the sky drifts smoothly between whole ticks (display only; rules use sessionTick). */
export function sessionTickExact(elapsedMs, frozenTick = null, skipMinutes = 0) {
  if (frozenTick !== null) return sessionTick(elapsedMs, frozenTick, skipMinutes);
  const ms = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return START_TICK + ms / (SECONDS_PER_TICK * 1000) + (Number.isFinite(skipMinutes) ? skipMinutes : 0);
}

const clampCell = (v, max) => Math.max(0.3, Math.min(max - 0.3, v));
// Direction as a yaw in radians: facing (sin yaw, cos yaw) in (x, z). Yaw PI faces north (-z), the front wall of a building.
const yawToward = (dx, dz) => Math.atan2(dx, dz);

function seaDirection(seed) {
  const side = coastSide(seed);
  return side === 0 ? [-1, 0] : side === 1 ? [1, 0] : [0, -1];
}

/** Mirror of Core VillagerRules.StandPoint (golden-checked in web/test/villagers.test.js). */
export function standingPoint(v, kind, layout, gridW, gridD, seed) {
  const spread = ((v.index % 3) - 1) * 0.6;
  if (kind === HOME || kind === WORKPLACE) {
    const p = layout[kind === HOME ? v.homeIndex : v.workIndex];
    if (p) {
      const dx = facingDx(p.facing | 0), dz = facingDz(p.facing | 0), halfAlong = (dx !== 0 ? p.sizeX : p.sizeZ) / 2;
      return { x: clampCell(p.x + p.sizeX / 2 + dx * (halfAlong + FRONT_OFFSET) + dz * spread, gridW), z: clampCell(p.z + p.sizeZ / 2 + dz * (halfAlong + FRONT_OFFSET) - dx * spread, gridD), faceDx: 0 - dx, faceDz: 0 - dz };
    }
  }
  if (kind === SHORE) {
    const [dx, dz] = seaDirection(seed), along = 0.2 + 0.6 * (v.index / 6);
    const x = dx === 0 ? gridW * along : dx < 0 ? SHORE_INSET : gridW - SHORE_INSET;
    const z = dz === 0 ? gridD * along : SHORE_INSET;
    return { x, z, faceDx: dx, faceDz: dz };
  }
  const angle = (v.index / 7) * Math.PI * 2; // the square, and the fallback when a piece is missing
  const ring = streetsEnabled(gridW, gridD) ? STREET_SQUARE_RADIUS : SQUARE_RADIUS, shift = streetsEnabled(gridW, gridD) ? 0.5 : 0;
  return { x: gridW / 2 + shift + Math.cos(angle) * ring, z: gridD / 2 + shift + Math.sin(angle) * ring, faceDx: 0 - Math.cos(angle), faceDz: 0 - Math.sin(angle) }; // as in Core: never -0
}

// ---------- walking and doors (mirror of VillagerRules.StopPoint and PresenceAt) ----------
export const WALK_MINUTES = 40, SLEEP_MINUTE = 180, DOOR_FADE_MINUTES = 6, DOOR_FADE_FRACTION = 0.1, PATROL_RADIUS = 2.6, PATROL_MINUTES = 90;
const [STOP_HOME, STOP_WORKPLACE, STOP_INN, STOP_CHAPEL, STOP_PATROL] = [0, 1, 4, 5, 6];
const isDoor = (kind) => kind === STOP_HOME || kind === STOP_WORKPLACE || kind === STOP_INN || kind === STOP_CHAPEL;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sameStop = (a, b) => a.kind === b.kind && a.owner === b.owner;

/** Point of a stop at an exact tick (only the patrol moves). Inn and chapel stand at the owner's workplace, spread by this villager's index. */
export function stopPoint(roster, v, stop, tick, layout, gridW, gridD, seed) {
  if (stop.kind === STOP_PATROL) {
    const lap = tick / PATROL_MINUTES, angle = (lap - Math.floor(lap)) * Math.PI * 2, shift = streetsEnabled(gridW, gridD) ? 0.5 : 0;
    return { x: gridW / 2 + shift + Math.cos(angle) * PATROL_RADIUS, z: gridD / 2 + shift + Math.sin(angle) * PATROL_RADIUS, faceDx: 0 - Math.sin(angle), faceDz: Math.cos(angle) };
  }
  if (stop.kind === STOP_INN || stop.kind === STOP_CHAPEL) {
    const owner = roster && stop.owner >= 0 && stop.owner < roster.length ? roster[stop.owner] : v;
    return standingPoint({ index: v.index, homeIndex: owner.workIndex, workIndex: owner.workIndex }, WORKPLACE, layout, gridW, gridD, seed);
  }
  return standingPoint(v, stop.kind, layout, gridW, gridD, seed);
}

/**
 * Where a villager is at an exact tick: { gone, walking, indoors, stop, placeKind, x, z, faceDx, faceDz, stride, fade }.
 * A change of stop starts a WALK_MINUTES walk along the lane route (streets.js laneRoute; x then z without streets); leaving a door fades in over the first tenth;
 * at home villagers go indoors SLEEP_MINUTE minutes into the night and come out at dawn. Mirror of VillagerRules.PresenceAt.
 */
export function presenceAt(roster, v, tick, dread, layout, gridW, gridD, seed, stage = 0) {
  const t0 = Math.floor(tick);
  if (behaviorAt(v, t0, dread, stage) === 4) return { gone: true, walking: false, indoors: false, stop: SQUARE, placeKind: GONE, x: 0, z: 0, faceDx: 0, faceDz: 0, stride: 0, fade: 1 };
  const cur = stopAt(roster, v, t0, dread, stage), pt = stopPoint(roster, v, cur, tick, layout, gridW, gridD, seed);
  const out = { gone: false, walking: false, indoors: false, stop: cur.kind, placeKind: placeOfStop(cur.kind), x: pt.x, z: pt.z, faceDx: pt.faceDx, faceDz: pt.faceDz, stride: 0, fade: 1 };
  for (let k = 0; k < WALK_MINUTES; k++) {
    const changeTick = t0 - k, before = stopAt(roster, v, changeTick - 1, dread, stage);
    if (sameStop(before, stopAt(roster, v, changeTick, dread, stage))) continue;
    const progress = (tick - changeTick) / WALK_MINUTES, from = stopPoint(roster, v, before, changeTick - 1, layout, gridW, gridD, seed);
    const route = laneRoute(from.x, from.z, pt.x, pt.z, gridW, gridD, layout);
    let total = 0;
    for (let i = 1; i < route.length; i++) total += Math.abs(route[i][0] - route[i - 1][0]) + Math.abs(route[i][1] - route[i - 1][1]);
    if (total < 1e-9) break;
    const s = progress * total;
    let left = s;
    out.walking = true; out.stride = s;
    for (let i = 1; i < route.length; i++) {
      const sx = route[i][0] - route[i - 1][0], sz = route[i][1] - route[i - 1][1], len = Math.abs(sx) + Math.abs(sz);
      if (left >= len && i < route.length - 1) { left -= len; continue; }
      const step = Math.min(left, len);
      out.x = route[i - 1][0] + Math.sign(sx) * step; out.z = route[i - 1][1] + Math.sign(sz) * step; out.faceDx = Math.sign(sx); out.faceDz = Math.sign(sz);
      break;
    }
    if (isDoor(before.kind)) out.fade = Math.min(out.fade, clamp01(progress / DOOR_FADE_FRACTION));
    out.indoors = out.fade < 0.02;
    return out;
  }
  if (cur.kind === STOP_HOME) {
    const wrapped = tick - Math.floor(tick / MINUTES_PER_DAY) * MINUTES_PER_DAY, nightMinute = wrapped - phaseStart(3);
    if (nightMinute >= SLEEP_MINUTE) out.fade = clamp01(1 - (nightMinute - SLEEP_MINUTE) / DOOR_FADE_MINUTES);
    else if (wrapped < DOOR_FADE_MINUTES) out.fade = clamp01(wrapped / DOOR_FADE_MINUTES);
  }
  out.indoors = out.fade < 0.02;
  return out;
}

/**
 * One entry per villager, vanished ones included (gone: true, no position). x and z are cell coordinates; yaw faces as described above.
 * tick may be fractional (smooth walking). indoors: behind a door, listed but not drawn; walking, stride (cells walked) and fade (0 through the door, 1 in view) drive the 3D figure.
 * lantern is true when the carried lantern burns (not in daylight; the lamplighter always carries a lit one).
 */
export function villagerPlacements({ roster, layout, tick, dread, gridW, gridD, seed, stageOf = null }) {
  const whole = Math.floor(tick);
  return roster.map((v) => {
    const stage = stageOf ? stageOf(v.index) | 0 : 0, behavior = behaviorAt(v, whole, dread, stage), pr = presenceAt(roster, v, tick, dread, layout, gridW, gridD, seed, stage), roleId = ROLE_IDS[v.role];
    const base = { index: v.index, corruption: stage, name: v.name, role: v.role, roleId, behavior, behaviorName: BEHAVIOR_NAMES[behavior], cause: causeOf(behavior), placeKind: pr.placeKind, placeName: PLACE_KIND_NAMES[pr.placeKind] };
    if (pr.gone) return { ...base, gone: true, indoors: false, walking: false, fade: 1, stride: 0, x: 0, z: 0, yaw: 0, lantern: false };
    return { ...base, gone: false, indoors: pr.indoors, walking: pr.walking, fade: pr.fade, stride: pr.stride, x: pr.x, z: pr.z, yaw: yawToward(pr.faceDx, pr.faceDz), lantern: carriesLitLantern(v, whole) };
  });
}

/** Rows for the Who is where list: key parts only, the UI localizes them. */
export const whoIsWhereRows = (placements) => placements.map((p) => ({ index: p.index, name: p.name, roleKey: `villager.role.${p.roleId}`, whereKey: `villagerui.where.${p.placeName}`, gone: p.gone }));

/** Clock label parts: day number from 1 and the phase i18n key. */
export const clockParts = (tick) => ({ day: dayNumber(tick) + 1, phaseKey: `villagerui.phase.${PHASE_NAMES[phaseAt(tick)]}` });

/** Minimap markers in pixels for a size x size map. Vanished villagers have none. */
export function villagerMarkers(placements, gridW, gridD, size) {
  return placements.filter((p) => !p.gone && !p.indoors).map((p) => ({ index: p.index, name: p.name, x: (p.x / Math.max(1, gridW)) * size, y: (p.z / Math.max(1, gridD)) * size }));
}

/** 3D scene entries (metres) for the renderer and the view ray picker. */
export function villagerScene(placements, cell) {
  return placements.filter((p) => !p.gone && !p.indoors).map((p) => ({
    id: p.index, name: p.name, roleId: p.roleId, pos: [p.x * cell, TALK_PICK_HEIGHT, p.z * cell], yaw: p.yaw, lantern: p.lantern, behavior: p.behavior, corruption: p.corruption | 0, walking: !!p.walking, stride: (p.stride || 0) * cell, fade: p.fade ?? 1,
  }));
}

/** Nearest villager to a point (metres, ground plane) within range. Ties go to the lower index. Null when none. */
export function nearestVillager(scene, x, z, range) {
  let best = null;
  for (const v of scene) {
    const d = Math.hypot(v.pos[0] - x, v.pos[2] - z);
    if (d <= range && (!best || d < best.distance)) best = { id: v.id, distance: d };
  }
  return best;
}

/** The village day as a 24 hour clock: dawn starts at 04:00, so day is 08:00 to 18:00, dusk 18:00 to 22:00 and night 22:00 to 04:00. */
export function clockTime(tick) {
  const m = (wrapTick(tick) + 240) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** What the HUD clock chip shows for a tick: day number, 24 hour time, phase name key, the phase for styling and whether lanterns burn (clock.js, Core mirror). */
export const clockChipModel = (tick) => ({ day: dayNumber(tick) + 1, time: clockTime(tick), phaseKey: `villagerui.phase.${PHASE_NAMES[phaseAt(tick)]}`, phase: PHASE_NAMES[phaseAt(tick)], lanterns: lanternsLit(tick) });
