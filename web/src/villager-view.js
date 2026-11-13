// Where villagers stand and how they are listed. Pure: layout, clock tick and dread in, positions and rows out. No DOM, no randomness.
// Rules (who is where, how they behave) stay in villagers.js; this file only turns them into cell coordinates for 2D, 3D and the minimap.
import { ROLE_IDS, PLACE_KIND_NAMES, BEHAVIOR_NAMES, locationAt, behaviorAt, causeOf } from './villagers.js';
import { phaseAt, dayNumber, lanternsLit, PHASE_NAMES } from './clock.js';
import { coastSide } from './view3d-math.js';

export const SECONDS_PER_TICK = 1;        // session clock: one real second is one village minute (FEAT-006 owns the full day/night integration)
export const START_TICK = 0;              // a session starts at dawn
export const FRONT_OFFSET = 0.45;         // cells in front of a building's south wall
export const SQUARE_RADIUS = 1.6;         // cells; villagers in the square stand on a ring around the grid centre
export const SHORE_INSET = 0.6;           // cells from the grid edge on the coast side
export const TALK_PICK_HEIGHT = 1.0;      // metres; chest height for 3D picking
export const TALK_PICK_RADIUS = 0.7;      // metres
const HOME = 0, WORKPLACE = 1, SQUARE = 2, SHORE = 3, GONE = 4;

/** ?tick=N (query or hash) freezes the session clock at N for captures and tests. Null when absent or not an integer. */
export function parseTickParam(source) {
  const raw = new URLSearchParams(String(source || '').replace(/^[?#]/, '')).get('tick');
  return raw !== null && /^-?\d{1,9}$/.test(raw) ? Number(raw) : null;
}

/** Tick for the session: frozen when a tick was requested, else START_TICK plus whole elapsed village minutes. */
export function sessionTick(elapsedMs, frozenTick = null) {
  if (frozenTick !== null) return frozenTick;
  const ms = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  return START_TICK + Math.floor(ms / (SECONDS_PER_TICK * 1000));
}

const clampCell = (v, max) => Math.max(0.3, Math.min(max - 0.3, v));
// Direction as a yaw in radians: facing (sin yaw, cos yaw) in (x, z). Yaw PI faces north (-z), the front wall of a building.
const yawToward = (dx, dz) => Math.atan2(dx, dz);

function seaDirection(seed) {
  const side = coastSide(seed);
  return side === 0 ? [-1, 0] : side === 1 ? [1, 0] : [0, -1];
}

function standingPoint(v, kind, layout, gridW, gridD, seed) {
  const spread = ((v.index % 3) - 1) * 0.6;
  if (kind === HOME || kind === WORKPLACE) {
    const p = layout[kind === HOME ? v.homeIndex : v.workIndex];
    if (p) return { x: clampCell(p.x + p.sizeX / 2 + spread, gridW), z: clampCell(p.z + p.sizeZ + FRONT_OFFSET, gridD), faceDx: 0, faceDz: -1 };
  }
  if (kind === SHORE) {
    const [dx, dz] = seaDirection(seed), along = 0.2 + 0.6 * (v.index / 6);
    const x = dx === 0 ? gridW * along : dx < 0 ? SHORE_INSET : gridW - SHORE_INSET;
    const z = dz === 0 ? gridD * along : SHORE_INSET;
    return { x, z, faceDx: dx, faceDz: dz };
  }
  const angle = (v.index / 7) * Math.PI * 2; // the square, and the fallback when a piece is missing
  return { x: gridW / 2 + Math.cos(angle) * SQUARE_RADIUS, z: gridD / 2 + Math.sin(angle) * SQUARE_RADIUS, faceDx: -Math.cos(angle), faceDz: -Math.sin(angle) };
}

/**
 * One entry per villager, vanished ones included (gone: true, no position). x and z are cell coordinates; yaw faces as described above.
 * lantern is true when the carried lantern burns (not in daylight; the lamplighter always carries a lit one).
 */
export function villagerPlacements({ roster, layout, tick, dread, gridW, gridD, seed }) {
  const night = lanternsLit(tick);
  return roster.map((v) => {
    const behavior = behaviorAt(v, tick, dread), loc = locationAt(v, tick, dread), roleId = ROLE_IDS[v.role];
    const base = { index: v.index, name: v.name, role: v.role, roleId, behavior, behaviorName: BEHAVIOR_NAMES[behavior], cause: causeOf(behavior), placeKind: loc.kind, placeName: PLACE_KIND_NAMES[loc.kind] };
    if (loc.kind === GONE) return { ...base, gone: true, x: 0, z: 0, yaw: 0, lantern: false };
    const pt = standingPoint(v, loc.kind, layout, gridW, gridD, seed);
    return { ...base, gone: false, x: pt.x, z: pt.z, yaw: yawToward(pt.faceDx, pt.faceDz), lantern: night || v.role === 3 };
  });
}

/** Rows for the Who is where list: key parts only, the UI localizes them. */
export const whoIsWhereRows = (placements) => placements.map((p) => ({ index: p.index, name: p.name, roleKey: `villager.role.${p.roleId}`, whereKey: `villagerui.where.${p.placeName}`, gone: p.gone }));

/** Clock label parts: day number from 1 and the phase i18n key. */
export const clockParts = (tick) => ({ day: dayNumber(tick) + 1, phaseKey: `villagerui.phase.${PHASE_NAMES[phaseAt(tick)]}` });

/** Minimap markers in pixels for a size x size map. Vanished villagers have none. */
export function villagerMarkers(placements, gridW, gridD, size) {
  return placements.filter((p) => !p.gone).map((p) => ({ index: p.index, name: p.name, x: (p.x / Math.max(1, gridW)) * size, y: (p.z / Math.max(1, gridD)) * size }));
}

/** 3D scene entries (metres) for the renderer and the view ray picker. */
export function villagerScene(placements, cell) {
  return placements.filter((p) => !p.gone).map((p) => ({
    id: p.index, name: p.name, roleId: p.roleId, pos: [p.x * cell, TALK_PICK_HEIGHT, p.z * cell], yaw: p.yaw, lantern: p.lantern, behavior: p.behavior,
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
