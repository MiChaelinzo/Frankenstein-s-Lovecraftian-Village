// JS port of Core/VillageDressing.cs: the seeded harbour quarter, market square and churchyard dressing. Golden-checked ("dressing").
// Core is the source of truth; keep the numbers and the order of rolls identical to the C# file.
import { SeededRandom } from './core.js';
import { OVERHANG_CLEARANCE } from './world-scale.js';
import { WORLD_MARGIN, groveCentre, cliffDir as landmarkCliffDir, cliffEndU, marshEndU } from './landmarks.js'; // a cycle with landmarks.js, used only inside functions
import { districtAt, districtPalette, paletteDensity } from './districts.js'; // a cycle with districts.js, used only inside functions
import { streetsEnabled, isStreetCell, isSquareCell, isBuilding, facingYaw, laneLines } from './streets.js';

export const CELL_M = 4, SHORE_INSET = 6, STRIP_DEPTH = 6;
export const SHORE_STAND_OFF = 0.6, HOUSE_SETBACK = 0.7, WALL_LANTERN_LIFT = 2.2, SQUARE_BENCH = 3.8, SQUARE_STALL = 3.4, SCATTER_PER_CELLS = 16;
export const DOOR_WALL_CLEARANCE = 0.15; // metres between a house wall and the back of the door bench, which stands in the setback inside its own cell. Mirrors VillageDressing.DoorWallClearance Mirrors VillageDressing.DoorWallClearance
export const DOOR_KINDS = ['', '', '', '', 'bench', '', '', '']; // a door prop stands in the setback between the wall and the cell edge, so only a bench is shallow enough; one house in eight keeps the CC0 bench triangles inside the frame budget. Mirrors VillageDressing.DoorKinds
export const ROCK_MIN_V = 0.9; // nearest a shore rock may stand to the coast road. Mirrors VillageDressing.RockMinV
/** Metres from the inn centre to its barrel: the inn half length (4.36 * INN_SCALE, 3.27) plus the barrel swept half length (0.96) plus the 0.3 m prop clearance. Mirrors VillageDressing.InnBarrelOffset. */
export const INN_BARREL_OFFSET = 4.7;
/** Metres a cottage keeps from the inn along the shore: inn half length (3.27) plus a cottage swept half length (2.5) plus a margin. Mirrors VillageDressing.InnClearance. */
export const INN_CLEARANCE = 6.4;
export const COAST_ROAD_V = -1, COTTAGE_V = -4.3, LAMP_V = -0.2, LAMP_SPACING = 9, MIN_SLOT_SPACING = 6, DOCK_CLEARANCE = 8.6, LIGHTHOUSE_CLEARANCE = 6.5, INN_SCALE = 0.75, CHAPEL_OFFSET = 8, CHAPEL_SCALE = 0.9, CHAPEL_CLEARANCE = 6.5, HILL_GRAVE_ROWS = 4;
export const RUT_LIFT = 0.07, LANE_POST_CELLS = 7, BOLLARD_SPACING = 8, BOLLARD_V = -0.2, FOREGROUND_ROLL_STREAM = 0x6f1c;
export const DRESSING_LAMP_KINDS = ['lamp', 'lamp_tall', 'lamp_double'];
export const LAMP_POLE_HALF = 0.12, LANE_POST_INSET = 0.2; // a lamp blocks walking only at its pole; lane posts stand this far inside the lane edge. Mirror VillageDressing

const FOOTPRINTS = {
  cottage_thatch: [2.25, 1.98, 4.6, true], cottage_tall: [1.9, 1.65, 6.9, true], inn: [4.36, 2.88, 4.9, true], chapel: [2.4, 2.76, 6.1, true],
  lighthouse: [2.2, 2.2, 10.2, true], market_stall: [1.3, 1.0, 2.5, true], crate_stack: [1.02, 0.57, 1.4, true], barrel: [0.88, 0.5, 0.93, true],
  gravestone: [0.45, 0.71, 1.38, false], gravestone_cross: [0.45, 0.9, 1.6, false], fence_iron: [1.5, 0.1, 1.52, false],
  well: [1.05, 0.95, 2.9, true], fence: [1.5, 0.24, 1.1, true], boat: [1.8, 0.78, 2.9, true], cart: [1.39, 0.66, 1.04, true], sack: [0.57, 0.52, 0.9, false],
  wall_low: [1.55, 0.25, 0.92, true], net: [1.35, 0.05, 1.9, false], bench: [0.75, 0.21, 1.05, false], sign: [0.52, 0.1, 2.46, false], wall_lantern: [0.13, 0.22, 0.5, false],
  tree: [0.95, 0.97, 6.0, true], bush: [1.07, 0.68, 0.8, false], reeds: [0.33, 0.34, 1.78, false], rock: [0.97, 0.73, 0.7, true], laundry_line: [2.05, 0.05, 2.3, false],
  grass_tuft: [0.19, 0.17, 0.52, false], stump: [0.48, 0.36, 0.48, true], log: [1.0, 0.27, 0.34, false], woodpile: [0.95, 0.6, 0.9, true], hedge: [1.4, 0.35, 1.45, true],
  picket_fence: [1.5, 0.06, 1.0, true], bollard: [0.15, 0.16, 0.78, true], rope_coil: [0.48, 0.36, 0.13, false], crop_row: [1.2, 0.78, 0.58, false], wheel_ruts: [1.6, 0.63, 0.02, false],
  tentacle_tree: [1.4, 1.62, 4.85, true], tentacle_sapling: [0.6, 0.75, 2.4, false], fungus_tall: [0.97, 0.78, 2.64, false], fungus_cluster: [0.58, 0.47, 0.58, false],
  fungus_shelf: [0.74, 0.61, 0.87, false], spire_horn: [1.01, 0.48, 4.85, true], spire_ribbed: [0.97, 0.7, 5.95, true],
  cliff_rock: [5.0, 4.48, 8.0, true], shipwreck: [5.13, 1.6, 5.5, true], abbey_arch: [2.49, 1.085, 5.6, false], abbey_wall: [2.6, 0.715, 3.6, true], abbey_pillar: [1.025, 0.825, 3.25, true],
  standing_stone: [0.65, 0.59, 3.58, true], ritual_circle: [3.2, 3.2, 0.11, false], catacomb_gate: [2.6, 1.81, 2.9, true],
  marsh_pool: [3.0, 2.85, 0.09, false], path_stone: [0.48, 0.36, 0.09, false], church_nave: [3.0, 5.9, 7.4, true], church_tower: [1.9, 1.9, 18.0, true],
};
/** Half extents at yaw 0, height and whether the kind blocks walking. Lamps (and unknown kinds) do not block. */
export function footprintOf(kind) {
  const f = FOOTPRINTS[kind] || [0.5, 0.26, 3.45, false];
  return { halfX: f[0], halfZ: f[1], height: f[2], solid: f[3] };
}
/** Trunk radius in metres of the tree kinds; only the trunk is solid, not the canopy. Mirrors VillageDressing.TryTrunkRadius. */
export const TRUNK_RADIUS = { tree: 0.35, tentacle_tree: 0.7 };
export const DRESSING_KINDS = Object.keys(FOOTPRINTS);

export const coastSideOf = (seed) => new SeededRandom(seed ^ 0x2f6b).next(3);
export const hiOf = (seed, gridW, gridD) => (coastSideOf(seed) === 2 ? gridW * CELL_M : gridD * CELL_M);
export function dockU(seed, gridW, gridD) { return 0 + (hiOf(seed, gridW, gridD) - 0) * (0.3 + new SeededRandom(seed ^ 0x51ed).next(40) / 100); }

export function churchRise(seed, gridW, gridD) {
  const side = coastSideOf(seed), east = side === 0 ? true : side === 1 ? false : (((seed ^ 0x3c3c) & 1) === 0);
  return { x: east ? gridW * CELL_M + 30 : -30, z: gridD * CELL_M * 0.35, faceX: east ? -1 : 1, hill: 9 };
}
/** Where the player may stand: the grid plus the 60 m world margin (out to the landmarks), and on the coast side out to the shore (less 0.6 m), so the coast road is walkable. Mirrors VillageDressing.WalkBounds. */
export function walkBounds(seed, gridW, gridD) {
  const b = { minX: -WORLD_MARGIN, maxX: gridW * CELL_M + WORLD_MARGIN, minZ: -WORLD_MARGIN, maxZ: gridD * CELL_M + WORLD_MARGIN };
  const shore = SHORE_INSET - SHORE_STAND_OFF, side = coastSideOf(seed);
  if (side === 0) b.minX = -shore; else if (side === 1) b.maxX = gridW * CELL_M + shore; else b.minZ = -shore;
  return b;
}
export function coastToWorldAt(seed, gridW, u, v) {
  const side = coastSideOf(seed);
  if (side === 0) return { x: -SHORE_INSET - v, z: u };
  if (side === 1) return { x: gridW * CELL_M + SHORE_INSET + v, z: u };
  return { x: u, z: -SHORE_INSET - v };
}
const seawardYaw = (seed) => { const s = coastSideOf(seed); return s === 0 ? -Math.PI / 2 : s === 1 ? Math.PI / 2 : Math.PI; };
export const alongShoreYaw = (seed) => (coastSideOf(seed) === 2 ? 0 : Math.PI / 2);
const cm = (rng, range) => rng.next(range) / 100;

/** True when the item's footprint, swept by its yaw, comes within `clearance` metres of any layout piece. */
export function overlapsLayout(item, layout, clearance) {
  if (!layout) return false;
  const f = footprintOf(item.kind), c = Math.abs(Math.cos(item.yaw)), s = Math.abs(Math.sin(item.yaw));
  const hx = (c * f.halfX + s * f.halfZ) * item.scale + clearance, hz = (s * f.halfX + c * f.halfZ) * item.scale + clearance;
  return layout.some((p) => item.x + hx > p.x * CELL_M && item.x - hx < (p.x + p.sizeX) * CELL_M && item.z + hz > p.z * CELL_M && item.z - hz < (p.z + p.sizeZ) * CELL_M);
}

const sweptHalf = (item) => {
  const f = footprintOf(item.kind), c = Math.abs(Math.cos(item.yaw)), s = Math.abs(Math.sin(item.yaw));
  return { hx: (c * f.halfX + s * f.halfZ) * item.scale, hz: (s * f.halfX + c * f.halfZ) * item.scale };
};
/** True when the item's swept footprint touches a street cell. */
export function touchesStreet(item, gridW, gridD) {
  const { hx, hz } = sweptHalf(item);
  const x0 = Math.floor((item.x - hx) / CELL_M), x1 = Math.floor((item.x + hx) / CELL_M), z0 = Math.floor((item.z - hz) / CELL_M), z1 = Math.floor((item.z + hz) / CELL_M);
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) if (isStreetCell(gridW, gridD, cx, cz)) return true;
  return false;
}
/** True when the item overlaps any ground level prop already placed (wall lanterns and the church rise are not on the ground plane). */
export function overlapsItems(item, items, clearance) {
  if (item.y > 0.01) return false;
  const a = sweptHalf(item);
  return items.some((o) => { if (o.y > 0.01) return false; const b = sweptHalf(o); return Math.abs(item.x - o.x) < a.hx + b.hx + clearance && Math.abs(item.z - o.z) < a.hz + b.hz + clearance; });
}
function tryAdd(items, item, layout, gridW, gridD, allowStreet) {
  if (item.x < 0.5 || item.z < 0.5 || item.x > gridW * CELL_M - 0.5 || item.z > gridD * CELL_M - 0.5) return false;
  if (overlapsLayout(item, layout, 0.3)) return false;
  if (!allowStreet && touchesStreet(item, gridW, gridD)) return false;
  if (overlapsItems(item, items, 0.15)) return false;
  items.push(item); return true;
}
function nearCottage(items, seed, gridW, u) {
  const w = coastToWorldAt(seed, gridW, u, COTTAGE_V);
  return items.some((o) => (o.kind === 'cottage_thatch' || o.kind === 'cottage_tall' || o.kind === 'inn') && Math.abs(o.x - w.x) < 3.5 && Math.abs(o.z - w.z) < 3.5);
}
/** The street face of one building: a wall lantern beside the door, door step clutter and a back yard item. */
function composeFrontage(items, p, layout, gridW, gridD, lantern, doorRoll, sideRoll, yardRoll) {
  const yaw = facingYaw(p.facing | 0), dirX = Math.sin(yaw), dirZ = Math.cos(yaw), sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
  const half = ((p.facing | 0) % 2 === 0 ? p.sizeZ : p.sizeX) * CELL_M / 2, cx = (p.x + p.sizeX / 2) * CELL_M, cz = (p.z + p.sizeZ / 2) * CELL_M;
  const wall = half - HOUSE_SETBACK, side = sideRoll < 50 ? -2.2 : 2.2;
  if (lantern < 70) {
    const lf = footprintOf('wall_lantern');
    items.push({ kind: 'wall_lantern', x: cx + dirX * (wall + lf.halfZ) - sideX * side * 0.75, y: WALL_LANTERN_LIFT, z: cz + dirZ * (wall + lf.halfZ) - sideZ * side * 0.75, yaw, scale: 1 });
  }
  const door = DOOR_KINDS[doorRoll];
  if (door) {
    const depth = wall + DOOR_WALL_CLEARANCE + footprintOf(door).halfZ;
    tryAdd(items, { kind: door, x: cx + dirX * depth + sideX * side, y: 0, z: cz + dirZ * depth + sideZ * side, yaw, scale: 1 }, layout.filter((q) => q.x !== p.x || q.z !== p.z), gridW, gridD, true); // the bench stands inside its own cell, so only the other pieces are obstacles
  }
  const yard = yardRoll < 25 ? 'fence' : yardRoll < 45 ? 'wall_low' : yardRoll < 60 ? 'laundry_line' : yardRoll < 75 ? 'bush' : yardRoll < 90 ? 'tree' : '';
  if (yard) {
    const back = half + 0.4 + footprintOf(yard).halfZ + (yard === 'tree' ? 0.6 : 0);
    tryAdd(items, { kind: yard, x: cx - dirX * back, y: 0, z: cz - dirZ * back, yaw, scale: 1 }, layout, gridW, gridD, false);
  }
}

/** Items { kind, x, y, z, yaw, scale } in metres. layout pieces are {id, x, z, sizeX, sizeZ}. */
export function composeDressing(seed, gridW, gridD, layout) {
  const items = [];
  if (gridW <= 0 || gridD <= 0) return items;
  const rng = new SeededRandom(seed ^ 0x4d52), lo = 0, hi = hiOf(seed, gridW, gridD), dU = dockU(seed, gridW, gridD), seaward = seawardYaw(seed), along = alongShoreYaw(seed);
  const addShore = (kind, u, v, yaw, scale) => { const w = coastToWorldAt(seed, gridW, u, v); items.push({ kind, x: w.x, y: 0, z: w.z, yaw, scale }); };

  const lightU = dU - lo > hi - dU ? lo + 6 : hi - 6;
  addShore('lighthouse', lightU, -4.2, seaward, 1);
  const chapelU = lightU < (lo + hi) / 2 ? lightU + CHAPEL_OFFSET : lightU - CHAPEL_OFFSET;
  addShore('chapel', chapelU, -4.2, seaward, CHAPEL_SCALE);

  const slots = [];
  for (let u = lo + 4; u < hi - 3; u += MIN_SLOT_SPACING + rng.next(15) / 10) slots.push([u, rng.next(3), cm(rng, 40) - 0.2, (rng.next(25) - 12) / 100]);
  const innSide = rng.next(2) === 0 ? -1 : 1;
  let innSlot = -1, best = Infinity;
  const blocked = (u) => Math.abs(u - dU) < DOCK_CLEARANCE || Math.abs(u - lightU) < LIGHTHOUSE_CLEARANCE || Math.abs(u - chapelU) < CHAPEL_CLEARANCE;
  slots.forEach((s, i) => { if (blocked(s[0])) return; const d = Math.abs(s[0] - (dU + innSide * 11)); if (d < best) { best = d; innSlot = i; } });
  slots.forEach((s, i) => {
    if (blocked(s[0]) || (innSlot >= 0 && i !== innSlot && Math.abs(s[0] - slots[innSlot][0]) < INN_CLEARANCE)) return;
    const kind = i === innSlot ? 'inn' : s[1] === 0 ? 'cottage_tall' : 'cottage_thatch';
    addShore(kind, s[0], i === innSlot ? -4.4 : COTTAGE_V + s[2], seaward + s[3], i === innSlot ? INN_SCALE : 1);
  });
  // The inn's barrel stands at one gable end, outside the inn's own footprint (round 23: the inn grew and the old offset put the barrel inside it): the first side that is free.
  if (innSlot >= 0) for (const side of [-1, 1]) {
    const w = coastToWorldAt(seed, gridW, slots[innSlot][0] + side * INN_BARREL_OFFSET, -3.4), barrel = { kind: 'barrel', x: w.x, y: 0, z: w.z, yaw: along + 0.2, scale: 1 };
    if (!overlapsItems(barrel, items, 0.3)) { items.push(barrel); break; }
  }

  addShore('crate_stack', dU - 2.7, -3 + cm(rng, 30) - 0.15, along, 1);
  addShore('barrel', dU + 2.6, -2.8, along + 0.4, 1);
  addShore('barrel', dU + 3.3, -4, along - 0.3, 1);
  addShore('crate_stack', dU - 3.9, -4.4, along + 0.15, 1);

  let lampIndex = 0;
  for (let u = lo + 4; u < hi - 2; u += LAMP_SPACING, lampIndex++) if (Math.abs(u - dU) > 2.6) addShore(DRESSING_LAMP_KINDS[lampIndex % 3], u, LAMP_V, seaward, 1);

  const rise = churchRise(seed, gridW, gridD);
  for (let col = 0; col < 2; col++) for (let row = 0; row < HILL_GRAVE_ROWS; row++) {
    const cross = rng.next(4) === 0, jx = cm(rng, 40) - 0.2, jz = cm(rng, 40) - 0.2, tilt = (rng.next(20) - 10) / 100;
    items.push({ kind: cross ? 'gravestone_cross' : 'gravestone', x: rise.x + rise.faceX * (4.2 + col * 1.5) + jx, y: rise.hill, z: rise.z - 4.5 + row * 1.8 + jz, yaw: rise.faceX * Math.PI / 2 + tilt, scale: 1 });
  }
  for (const dz of [-1.5, 1.5]) items.push({ kind: 'fence_iron', x: rise.x + rise.faceX * 6.3, y: rise.hill, z: rise.z + dz, yaw: Math.PI / 2, scale: 1 });

  const streets = streetsEnabled(gridW, gridD);
  const midX = streets ? (Math.floor(gridW / 2) + 0.5) * CELL_M : gridW * CELL_M / 2, midZ = streets ? (Math.floor(gridD / 2) + 0.5) * CELL_M : gridD * CELL_M / 2, stallYaw = cm(rng, 60) - 0.3;
  if (streets) {
    items.push({ kind: 'well', x: midX, y: 0, z: midZ, yaw: 0, scale: 1 });
    items.push({ kind: 'market_stall', x: midX + SQUARE_STALL, y: 0, z: midZ + SQUARE_STALL, yaw: stallYaw, scale: 1 });
    items.push({ kind: 'bench', x: midX - SQUARE_BENCH, y: 0, z: midZ, yaw: Math.PI / 2, scale: 1 });
    items.push({ kind: 'bench', x: midX, y: 0, z: midZ - SQUARE_BENCH, yaw: 0, scale: 1 });
    items.push({ kind: 'sign', x: midX - SQUARE_STALL - 1, y: 0, z: midZ + SQUARE_STALL + 1, yaw: Math.PI * 0.75, scale: 1 });
  } else {
    for (const s of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [4, 4], [-4, 4]]) {
      const stall = { kind: 'market_stall', x: midX + s[0], y: 0, z: midZ + s[1], yaw: stallYaw, scale: 1 };
      if (!overlapsLayout(stall, layout, 0.8)) { items.push(stall); break; }
    }
  }

  const church = layout ? layout.find((p) => p.id === 'church') : null;
  if (church) {
    const fy = facingYaw(church.facing | 0), dirX = Math.sin(fy), dirZ = Math.cos(fy), half = ((church.facing | 0) % 2 === 0 ? church.sizeZ : church.sizeX) * CELL_M / 2;
    const bx = (church.x + church.sizeX / 2) * CELL_M - dirX * (half + 2.6), bz = (church.z + church.sizeZ / 2) * CELL_M - dirZ * (half + 2.6), sideX = Math.cos(fy), sideZ = -Math.sin(fy);
    for (const dx of [-1.6, 1.6]) tryAdd(items, { kind: 'fence_iron', x: bx + sideX * dx, y: 0, z: bz + sideZ * dx, yaw: fy, scale: 1 }, layout, gridW, gridD, false);
    [-2.2, -0.5, 1.2, 2.9].forEach((off) => {
      const cross = rng.next(4) === 0, tilt = (rng.next(20) - 10) / 100;
      tryAdd(items, { kind: cross ? 'gravestone_cross' : 'gravestone', x: bx + dirX * 1.4 + sideX * off, y: 0, z: bz + dirZ * 1.4 + sideZ * off, yaw: fy + tilt, scale: 1 }, layout, gridW, gridD, false);
    });
  }

  if (layout) for (const p of layout) {
    if (!isBuilding(p.sizeX, p.sizeZ)) continue;
    const lantern = rng.next(100), doorRoll = rng.next(8), sideRoll = rng.next(100), yardRoll = rng.next(100);
    if (!streets) continue;
    composeFrontage(items, p, layout, gridW, gridD, lantern, doorRoll, sideRoll, yardRoll);
  }

  for (let i = 0; i < Math.floor(gridW * gridD / SCATTER_PER_CELLS); i++) {
    const kindRoll = rng.next(100), sx = rng.next(Math.trunc(gridW * CELL_M * 10)) / 10, sz = rng.next(Math.trunc(gridD * CELL_M * 10)) / 10, yaw = rng.next(628) / 100;
    const kind = kindRoll < 30 ? 'tree' : kindRoll < 70 ? 'bush' : kindRoll < 85 ? 'rock' : '';
    if (!kind) continue;
    tryAdd(items, { kind, x: sx, y: 0, z: sz, yaw, scale: 1 }, layout, gridW, gridD, false);
  }

  for (let i = 0; i < 2; i++) {
    const nu = lo + 6 + rng.next(Math.trunc(Math.max(1, hi - lo - 12))), roll = rng.next(100) / 100;
    if (Math.abs(nu - dU) > DOCK_CLEARANCE && Math.abs(nu - lightU) > LIGHTHOUSE_CLEARANCE && Math.abs(nu - chapelU) > CHAPEL_CLEARANCE && !nearCottage(items, seed, gridW, nu)) addShore('net', nu, -0.8, along + roll * 0.1, 1);
  }
  for (let i = 0; i < 2; i++) {
    const bu = lo + 8 + rng.next(Math.trunc(Math.max(1, hi - lo - 16))), tilt = (rng.next(40) - 20) / 100;
    if (Math.abs(bu - dU) > DOCK_CLEARANCE) addShore('boat', bu, 1.6, along + tilt, 0.8);
  }
  for (let i = 0; i < 6; i++) {
    const ru = lo + rng.next(Math.trunc(Math.max(1, hi - lo))), rv = 0.6 + rng.next(80) / 100, rr = rng.next(100);
    if (Math.abs(ru - dU) > 3) addShore(rr < 70 ? 'reeds' : 'rock', ru, rr < 70 ? rv : Math.max(rv, ROCK_MIN_V), rr / 10, 1);
  }
  composeDistricts(items, seed, gridW, gridD, layout);
  composeForeground(items, seed, gridW, gridD, layout, streets, dU, lightU, chapelU);
  return items;
}

/** Seed salt of the district palette's own roll stream. Mirrors VillageDressing.DistrictRollStream. */
export const DISTRICT_ROLL_STREAM = 0x4453;

/**
 * District palettes (mirrors VillageDressing.ComposeDistricts): every free yard cell may hold one prop from the palette of its district. Runs before the foreground
 * fill (the quarter's own props get the free yards first) with its own roll stream. Every cell rolls first, so the stream never depends on what is skipped.
 */
function composeDistricts(items, seed, gridW, gridD, layout) {
  const rng = new SeededRandom(seed ^ DISTRICT_ROLL_STREAM);
  for (let cx = 0; cx < gridW; cx++) for (let cz = 0; cz < gridD; cz++) {
    const chance = rng.next(100), pick = rng.next(100), yawRoll = rng.next(628), ox = 0.8 + rng.next(240) / 100, oz = 0.8 + rng.next(240) / 100;
    if (isStreetCell(gridW, gridD, cx, cz)) continue;
    const district = districtAt(seed, gridW, gridD, cx, cz);
    if (chance >= paletteDensity(district)) continue;
    const palette = districtPalette(district), kind = palette[Math.floor(pick * palette.length / 100)], f = footprintOf(kind);
    const yaw = f.halfX > 1.2 && f.halfZ < 0.4 ? (yawRoll % 2) * Math.PI / 2 : yawRoll / 100;
    tryAdd(items, { kind, x: cx * CELL_M + ox, y: 0, z: cz * CELL_M + oz, yaw, scale: 1 }, layout, gridW, gridD, false);
  }
}

/**
 * Foreground fill (mirrors VillageDressing.ComposeForeground): yard cell tufts, rocks, stumps, logs and bushes, lane edge weeds, wheel ruts and lamp posts on the lanes,
 * wall stacks and gardens at the buildings, a stack at each coast cottage and the harbour edge. Own roll stream, runs last; every cell, segment and building rolls first.
 */
function composeForeground(items, seed, gridW, gridD, layout, streets, dU, lightU, chapelU) {
  const rng = new SeededRandom(seed ^ FOREGROUND_ROLL_STREAM), along = alongShoreYaw(seed), hi = hiOf(seed, gridW, gridD);
  const cols = streets ? laneLines(gridW) : [], rows = streets ? laneLines(gridD) : [];
  const addShore = (kind, u, v, yaw, scale) => { const w = coastToWorldAt(seed, gridW, u, v); items.push({ kind, x: w.x, y: 0, z: w.z, yaw, scale }); };
  const add = (kind, x, z, yaw, allowStreet) => tryAdd(items, { kind, x, y: 0, z, yaw, scale: 1 }, layout, gridW, gridD, allowStreet);

  for (let cx = 0; cx < gridW; cx++) for (let cz = 0; cz < gridD; cz++) {
    const roll = rng.next(100), roll2 = rng.next(100), ox = 0.5 + rng.next(300) / 100, oz = 0.5 + rng.next(300) / 100, yaw = rng.next(628) / 100;
    if (streets && isStreetCell(gridW, gridD, cx, cz)) {
      if (isSquareCell(gridW, gridD, cx, cz)) continue;
      const edge = roll2 < 50 ? 0.55 : 3.45, column = cols.includes(cx);
      add('grass_tuft', column ? cx * CELL_M + edge : cx * CELL_M + ox, column ? cz * CELL_M + oz : cz * CELL_M + edge, yaw, true);
      continue;
    }
    const kind = roll < 24 ? 'grass_tuft' : roll < 30 ? 'rock' : roll < 37 ? 'stump' : roll < 43 ? 'log' : roll < 50 ? 'bush' : '';
    if (kind) add(kind, cx * CELL_M + ox, cz * CELL_M + oz, yaw, false);
  }

  if (streets) {
    let post = 0;
    for (let axis = 0; axis < 2; axis++) {
      const extent = axis === 0 ? gridD : gridW;
      for (const line of axis === 0 ? cols : rows) for (let c = 0; c < extent; c++) {
        const cx = axis === 0 ? line : c, cz = axis === 0 ? c : line, jitter = rng.next(40) / 100 - 0.2;
        if (isSquareCell(gridW, gridD, cx, cz) || (axis === 0 ? rows.includes(cz) : cols.includes(cx))) continue;
        const mx = (cx + 0.5) * CELL_M, mz = (cz + 0.5) * CELL_M;
        if (c % 6 === 0) items.push({ kind: 'wheel_ruts', x: axis === 0 ? mx + jitter : mx, y: RUT_LIFT, z: axis === 0 ? mz : mz + jitter, yaw: axis === 0 ? Math.PI / 2 : 0, scale: 1 });
        if (c % LANE_POST_CELLS === 3) {
          const side = (post % 2 === 0 ? -1 : 1) * (CELL_M / 2 - LANE_POST_INSET);
          add(DRESSING_LAMP_KINDS[post % 2], axis === 0 ? mx + side : mx, axis === 0 ? mz : mz + side, axis === 0 ? 0 : Math.PI / 2, true);
          post++;
        }
      }
    }
  }

  if (layout) for (const p of layout) {
    if (!isBuilding(p.sizeX, p.sizeZ)) continue;
    const gardenRoll = rng.next(100), wallRoll = rng.next(100), wallKind = rng.next(100), flip = rng.next(2);
    if (!streets) continue;
    const yaw = facingYaw(p.facing | 0), dirX = Math.sin(yaw), dirZ = Math.cos(yaw), sideX = Math.cos(yaw), sideZ = -Math.sin(yaw), odd = (p.facing | 0) % 2 !== 0;
    const half = (odd ? p.sizeX : p.sizeZ) * CELL_M / 2, halfWide = (odd ? p.sizeZ : p.sizeX) * CELL_M / 2, cx = (p.x + p.sizeX / 2) * CELL_M, cz = (p.z + p.sizeZ / 2) * CELL_M, sgn = flip === 0 ? -1 : 1;
    if (wallRoll < 70) {
      const kind = wallKind < 30 ? 'woodpile' : wallKind < 55 ? 'crate_stack' : wallKind < 75 ? 'sack' : wallKind < 90 ? 'cart' : 'log';
      const lateral = halfWide + 0.35 + footprintOf(kind).halfZ, slide = ((wallKind % 7) - 3) * 0.3;
      add(kind, cx + sideX * sgn * lateral + dirX * slide, cz + sideZ * sgn * lateral + dirZ * slide, yaw + Math.PI / 2, false);
    }
    if (gardenRoll < 60) {
      const slideG = sgn * 0.8, first = gardenRoll < 20 ? 'crop_row' : gardenRoll < 40 ? 'hedge' : 'picket_fence', back1 = half + 0.4 + footprintOf(first).halfZ + 1.2;
      add(first, cx - dirX * back1 + sideX * slideG, cz - dirZ * back1 + sideZ * slideG, yaw, false);
      const second = gardenRoll < 20 ? 'picket_fence' : gardenRoll < 40 ? 'grass_tuft' : 'bush', back2 = back1 + 1.8;
      add(second, cx - dirX * back2 + sideX * slideG, cz - dirZ * back2 + sideZ * slideG, yaw, false);
    }
  }

  const cottageCount = items.length;
  for (let i = 0; i < cottageCount; i++) {
    const c = items[i];
    if (c.kind !== 'cottage_thatch' && c.kind !== 'cottage_tall') continue;
    const sideRoll = rng.next(2), kindRoll = rng.next(100), kind = kindRoll < 40 ? 'woodpile' : kindRoll < 70 ? 'sack' : 'crate_stack';
    const dx = along === 0 ? 1 : 0, dz = along === 0 ? 0 : 1, off = (sideRoll === 0 ? -1 : 1) * (footprintOf(c.kind).halfX * c.scale + 0.15 + footprintOf(kind).halfX);
    const item = { kind, x: c.x + dx * off, y: 0, z: c.z + dz * off, yaw: along, scale: 1 };
    if (!overlapsItems(item, items, 0.1)) items.push(item);
  }

  for (let u = 3; u < hi - 2; u += BOLLARD_SPACING) if (Math.abs(u - dU) > 2.6) addShore('bollard', u, BOLLARD_V, along, 1);
  addShore('rope_coil', dU - 1.6, -1.5, along + 0.5, 1);
  addShore('rope_coil', dU + 1.7, -1.4, along - 0.3, 1);
  for (const du of [-6, 6]) if (dU + du > 4 && dU + du < hi - 4 && Math.abs(dU + du - lightU) > LIGHTHOUSE_CLEARANCE && Math.abs(dU + du - chapelU) > CHAPEL_CLEARANCE) addShore('net', dU + du, -0.8, along + 0.05, 1);
  addShore('boat', dU + 5.5, 2.6, along + 0.15, 0.7);
  addShore('boat', dU - 6, 3.2, along - 0.2, 0.7);
  for (let i = 0; i < 5; i++) {
    const ru = rng.next(Math.trunc(Math.max(1, hi))), rv = 0.4 + rng.next(100) / 100, ry = rng.next(628) / 100;
    if (Math.abs(ru - dU) > 3) addShore('reeds', ru, rv, ry, 1);
  }
}

/** Axis aligned collision boxes for the solid items, in the shape worldBoxes uses. */
export function dressingBoxes(items) {
  const out = [];
  for (const it of items) {
    if (DRESSING_LAMP_KINDS.includes(it.kind)) { const h = LAMP_POLE_HALF * it.scale + OVERHANG_CLEARANCE; out.push({ minX: it.x - h, maxX: it.x + h, minZ: it.z - h, maxZ: it.z + h, height: footprintOf(it.kind).height * it.scale }); continue; }
    const f = footprintOf(it.kind);
    if (!f.solid) continue;
    if (TRUNK_RADIUS[it.kind] !== undefined) { const h = TRUNK_RADIUS[it.kind] * it.scale + OVERHANG_CLEARANCE; out.push({ minX: it.x - h, maxX: it.x + h, minZ: it.z - h, maxZ: it.z + h, height: f.height * it.scale, round: true }); continue; }
    const c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw)), hx = (c * f.halfX + s * f.halfZ) * it.scale + OVERHANG_CLEARANCE, hz = (s * f.halfX + c * f.halfZ) * it.scale + OVERHANG_CLEARANCE;
    out.push({ minX: it.x - hx, maxX: it.x + hx, minZ: it.z - hz, maxZ: it.z + hz, height: f.height * it.scale });
  }
  return out;
}

/** Metres of the lighthouse along the shore: the end of the shore farther from the dock. Mirrors VillageDressing.LightU. */
export function lightU(seed, gridW, gridD) { const hi = hiOf(seed, gridW, gridD); return dockU(seed, gridW, gridD) > hi - dockU(seed, gridW, gridD) ? 6 : hi - 6; }

// ---------- Corruption growth: mirrors Core/CorruptionGrowth.cs (golden "corruption") ----------
export const CORRUPTION_LEVELS = 6, CORRUPTION_DREAD_WEIGHT = 0.75, CORRUPTION_NIGHT_WEIGHT = 0.25, CORRUPTION_FULL_NIGHT = 10;
export const CORRUPTION_FIRST_SCALE = 0.55, CORRUPTION_SCALE_STEP = 0.15, CORRUPTION_ROLL_STREAM = 0x7c0d;
const CLIFFS = [['spire_horn', 5, -3.4], ['spire_ribbed', 9, -3.8], ['spire_horn', 13, -3.2], ['tentacle_sapling', 7, -4.2], ['spire_ribbed', 16, -3.6]];
const MARSH = [['fungus_cluster', 4, -2.0], ['fungus_tall', 7, -3.2], ['fungus_cluster', 10, -1.0], ['tentacle_sapling', 13, -2.6], ['fungus_tall', 16, -1.4], ['fungus_cluster', 19, -3.5]];
const CHURCHYARD = [['fungus_shelf', 3.8, -6.6], ['tentacle_sapling', 5.2, 3.2], ['fungus_cluster', 6.6, -6.4], ['spire_horn', 7.0, 5.2], ['fungus_shelf', 7.4, -1.8], ['tentacle_sapling', 4.8, -7.2]];
const GROVE = [['tentacle_tree', 0, 4.5], ['tentacle_tree', 72, 5.5], ['tentacle_tree', 144, 4.8], ['tentacle_tree', 216, 5.8], ['tentacle_tree', 288, 5.0], ['fungus_shelf', 36, 3.0], ['fungus_shelf', 180, 3.4], ['fungus_tall', 108, 2.6]];

/** Growth level 0..6 from dread (0..1, NaN is 0) and the night number. Monotonic in both. */
export function corruptionLevel(dread, night) {
  const d = Number.isNaN(dread) ? 0 : Math.max(0, Math.min(1, dread)), n = Math.max(0, Math.min(1, (night - 1) / (CORRUPTION_FULL_NIGHT - 1)));
  return Math.min(CORRUPTION_LEVELS, Math.floor((CORRUPTION_DREAD_WEIGHT * d + CORRUPTION_NIGHT_WEIGHT * n) * CORRUPTION_LEVELS));
}
export const corruptionAppearLevel = (rank, total) => 1 + Math.floor((rank * CORRUPTION_LEVELS) / total);
export function corruptionScale(rank, total, level) {
  const appear = corruptionAppearLevel(rank, total);
  return level < appear ? 0 : Math.min(1, CORRUPTION_FIRST_SCALE + CORRUPTION_SCALE_STEP * (level - appear));
}
/** Every candidate at full size, ranked (first of each site, then second of each ...). Three rolls per candidate in table order. */
export function corruptionSites(seed, gridW, gridD) {
  const rng = new SeededRandom(seed ^ CORRUPTION_ROLL_STREAM), cliffDir = landmarkCliffDir(seed, gridW, gridD); // the anchors are the landmarks of landmarks.js
  const cliffEnd = cliffEndU(seed, gridW, gridD), marshEnd = marshEndU(seed, gridW, gridD), church = churchRise(seed, gridW, gridD), grove = groveCentre(seed, gridW, gridD);
  const roll = () => ({ jx: (rng.next(100) - 50) / 100, jz: (rng.next(100) - 50) / 100, yaw: rng.next(628) / 100 });
  const sites = [[], [], [], []];
  for (const [kind, a, b] of CLIFFS) { const r = roll(), p = coastToWorldAt(seed, gridW, cliffEnd + cliffDir * a + r.jx, b + r.jz); sites[0].push({ kind, x: p.x, y: 0, z: p.z, yaw: r.yaw, scale: 1 }); }
  for (const [kind, a, b] of MARSH) { const r = roll(), p = coastToWorldAt(seed, gridW, marshEnd - cliffDir * a + r.jx, b + r.jz); sites[1].push({ kind, x: p.x, y: 0, z: p.z, yaw: r.yaw, scale: 1 }); }
  for (const [kind, a, b] of CHURCHYARD) { const r = roll(); sites[2].push({ kind, x: church.x + church.faceX * a + r.jx * 0.5, y: church.hill, z: church.z + b + r.jz * 0.5, yaw: r.yaw, scale: 1 }); }
  for (const [kind, a, b] of GROVE) { const r = roll(), ang = (a * Math.PI) / 180; sites[3].push({ kind, x: grove.x + Math.cos(ang) * b + r.jx, y: 0, z: grove.z + Math.sin(ang) * b + r.jz, yaw: r.yaw, scale: 1 }); }
  const ranked = [];
  for (let i = 0; sites.some((l) => i < l.length); i++) for (const l of sites) if (i < l.length) ranked.push(l[i]);
  return ranked;
}
/** The corruption standing at a growth level: the ranked candidates that have appeared, each scaled (never above 1). */
export function growCorruption(seed, gridW, gridD, level) {
  const all = corruptionSites(seed, gridW, gridD), out = [];
  all.forEach((it, rank) => { const scale = corruptionScale(rank, all.length, level); if (scale > 0) out.push({ ...it, scale }); });
  return out;
}

// ---------- Plot edge corruption (round 25): mirrors CorruptionGrowth.GrowPlotEdge (golden "homestead"); it reuses the appear level and scale rules above ----------
export const PLOT_EDGE_YAW_STEP = 2.1;
const PLOT_EDGE = [['fungus_cluster', -3.8, 1.0], ['fungus_shelf', 3.9, 2.0], ['tentacle_sapling', -3.4, 4.8]];
/** The full size candidate spots of the plot edge as [side, forward] in the plot frame, in rank order. */
export const plotEdgeOffsets = () => PLOT_EDGE.map(([, a, b]) => [a, b]);
/** The plot edge corruption at a growth level. side and dir are the plot's unit axes in the world as [x, z]. */
export function growPlotEdge(originX, originZ, side, dir, level) {
  const out = [];
  PLOT_EDGE.forEach(([kind, a, b], rank) => {
    const scale = corruptionScale(rank, PLOT_EDGE.length, level);
    if (scale > 0) out.push({ kind, x: originX + side[0] * a + dir[0] * b, y: 0, z: originZ + side[1] * a + dir[1] * b, yaw: rank * PLOT_EDGE_YAW_STEP, scale });
  });
  return out;
}
