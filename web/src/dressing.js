// JS port of Core/VillageDressing.cs: the seeded harbour quarter, market square and churchyard dressing. Golden-checked ("dressing").
// Core is the source of truth; keep the numbers and the order of rolls identical to the C# file.
import { SeededRandom } from './core.js';
import { streetsEnabled, isStreetCell, isBuilding, facingYaw } from './streets.js';

export const CELL_M = 4, SHORE_INSET = 6, STRIP_DEPTH = 6;
export const SHORE_STAND_OFF = 0.6, EDGE_WALK_MARGIN = 2, HOUSE_SETBACK = 0.7, WALL_LANTERN_LIFT = 2.2, SQUARE_BENCH = 3.8, SQUARE_STALL = 3.4, SCATTER_PER_CELLS = 16;
export const DOOR_KINDS = ['', 'barrel', 'crate_stack', 'sack', 'bench', 'cart', 'barrel', 'sack'];
export const COTTAGE_V = -3.9, LAMP_V = -0.9, LAMP_SPACING = 9, MIN_SLOT_SPACING = 6, DOCK_CLEARANCE = 7, LIGHTHOUSE_CLEARANCE = 6.5, INN_SCALE = 0.65, CHAPEL_OFFSET = 8, CHAPEL_SCALE = 0.8, CHAPEL_CLEARANCE = 5.5, HILL_GRAVE_ROWS = 4;
export const DRESSING_LAMP_KINDS = ['lamp', 'lamp_tall', 'lamp_double'];

const FOOTPRINTS = {
  cottage_thatch: [1.8, 1.82, 4.1, true], cottage_tall: [1.4, 1.4, 6.1, true], inn: [3.48, 3.58, 4.9, true], chapel: [2.0, 2.88, 6.1, true],
  lighthouse: [2.2, 2.2, 10.2, true], market_stall: [1.3, 1.0, 2.5, true], crate_stack: [1.02, 0.57, 1.4, true], barrel: [0.88, 0.5, 0.93, true],
  gravestone: [0.45, 0.71, 1.38, false], gravestone_cross: [0.45, 0.9, 1.6, false], fence_iron: [1.5, 0.1, 1.52, false],
  well: [1.05, 0.95, 2.9, true], fence: [1.5, 0.24, 1.1, true], boat: [1.8, 0.78, 2.9, true], cart: [1.39, 0.66, 1.04, true], sack: [0.57, 0.52, 0.9, false],
  wall_low: [1.55, 0.25, 0.92, true], net: [1.35, 0.05, 1.9, false], bench: [0.75, 0.21, 1.05, false], sign: [0.52, 0.1, 2.46, false], wall_lantern: [0.13, 0.22, 0.5, false],
  tree: [0.95, 0.97, 6.0, true], bush: [1.07, 0.68, 0.8, false], reeds: [0.26, 0.31, 1.78, false], rock: [0.97, 0.73, 0.7, true], laundry_line: [2.05, 0.05, 2.3, false],
};
/** Half extents at yaw 0, height and whether the kind blocks walking. Lamps (and unknown kinds) do not block. */
export function footprintOf(kind) {
  const f = FOOTPRINTS[kind] || [0.5, 0.26, 3.45, false];
  return { halfX: f[0], halfZ: f[1], height: f[2], solid: f[3] };
}
export const DRESSING_KINDS = Object.keys(FOOTPRINTS);

const coastSideOf = (seed) => new SeededRandom(seed ^ 0x2f6b).next(3);
const hiOf = (seed, gridW, gridD) => (coastSideOf(seed) === 2 ? gridW * CELL_M : gridD * CELL_M);
export function dockU(seed, gridW, gridD) { return 0 + (hiOf(seed, gridW, gridD) - 0) * (0.3 + new SeededRandom(seed ^ 0x51ed).next(40) / 100); }

export function churchRise(seed, gridW, gridD) {
  const side = coastSideOf(seed), east = side === 0 ? true : side === 1 ? false : (((seed ^ 0x3c3c) & 1) === 0);
  return { x: east ? gridW * CELL_M + 30 : -30, z: gridD * CELL_M * 0.35, faceX: east ? -1 : 1, hill: 9 };
}
/** Where the player may stand: the grid plus a 2 m margin, and on the coast side out to the shore (less 0.6 m), so the coast road is walkable. Mirrors VillageDressing.WalkBounds. */
export function walkBounds(seed, gridW, gridD) {
  const b = { minX: -EDGE_WALK_MARGIN, maxX: gridW * CELL_M + EDGE_WALK_MARGIN, minZ: -EDGE_WALK_MARGIN, maxZ: gridD * CELL_M + EDGE_WALK_MARGIN };
  const shore = SHORE_INSET - SHORE_STAND_OFF, side = coastSideOf(seed);
  if (side === 0) b.minX = -shore; else if (side === 1) b.maxX = gridW * CELL_M + shore; else b.minZ = -shore;
  return b;
}
function coastToWorldAt(seed, gridW, u, v) {
  const side = coastSideOf(seed);
  if (side === 0) return { x: -SHORE_INSET - v, z: u };
  if (side === 1) return { x: gridW * CELL_M + SHORE_INSET + v, z: u };
  return { x: u, z: -SHORE_INSET - v };
}
const seawardYaw = (seed) => { const s = coastSideOf(seed); return s === 0 ? -Math.PI / 2 : s === 1 ? Math.PI / 2 : Math.PI; };
const alongShoreYaw = (seed) => (coastSideOf(seed) === 2 ? 0 : Math.PI / 2);
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
    const depth = wall + 0.1 + footprintOf(door).halfZ;
    tryAdd(items, { kind: door, x: cx + dirX * depth + sideX * side, y: 0, z: cz + dirZ * depth + sideZ * side, yaw, scale: 1 }, layout, gridW, gridD, true);
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
    if (blocked(s[0])) return;
    const kind = i === innSlot ? 'inn' : s[1] === 0 ? 'cottage_tall' : 'cottage_thatch';
    addShore(kind, s[0], i === innSlot ? -4 : COTTAGE_V + s[2], seaward + s[3], i === innSlot ? INN_SCALE : 1);
    if (i === innSlot) addShore('barrel', s[0] - 3.1, -3.4, along + 0.2, 1);
  });

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
    if (Math.abs(ru - dU) > 3) addShore(rr < 70 ? 'reeds' : 'rock', ru, rv, rr / 10, 1);
  }
  return items;
}

/** Axis aligned collision boxes for the solid items, in the shape worldBoxes uses. */
export function dressingBoxes(items) {
  const out = [];
  for (const it of items) {
    const f = footprintOf(it.kind);
    if (!f.solid) continue;
    const c = Math.abs(Math.cos(it.yaw)), s = Math.abs(Math.sin(it.yaw)), hx = (c * f.halfX + s * f.halfZ) * it.scale, hz = (s * f.halfX + c * f.halfZ) * it.scale;
    out.push({ minX: it.x - hx, maxX: it.x + hx, minZ: it.z - hz, maxZ: it.z + hz, height: f.height * it.scale });
  }
  return out;
}
