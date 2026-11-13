// JS port of Core/VillageDressing.cs: the seeded harbour quarter, market square and churchyard dressing. Golden-checked ("dressing").
// Core is the source of truth; keep the numbers and the order of rolls identical to the C# file.
import { SeededRandom } from './core.js';

export const CELL_M = 4, SHORE_INSET = 6, STRIP_DEPTH = 6;
export const COTTAGE_V = -3.9, LAMP_V = -0.9, LAMP_SPACING = 9, MIN_SLOT_SPACING = 6, DOCK_CLEARANCE = 7, LIGHTHOUSE_CLEARANCE = 6.5, INN_SCALE = 0.65, CHAPEL_OFFSET = 8, CHAPEL_SCALE = 0.8, CHAPEL_CLEARANCE = 5.5, HILL_GRAVE_ROWS = 4;
export const DRESSING_LAMP_KINDS = ['lamp', 'lamp_tall', 'lamp_double'];

const FOOTPRINTS = {
  cottage_thatch: [1.8, 1.82, 4.1, true], cottage_tall: [1.4, 1.4, 6.1, true], inn: [3.48, 3.58, 4.9, true], chapel: [2.0, 2.88, 6.1, true],
  lighthouse: [2.2, 2.2, 10.2, true], market_stall: [1.3, 1.0, 2.5, true], crate_stack: [1.02, 0.57, 1.4, true], barrel: [0.88, 0.5, 0.93, true],
  gravestone: [0.45, 0.71, 1.38, false], gravestone_cross: [0.45, 0.9, 1.6, false], fence_iron: [1.5, 0.1, 1.52, false],
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

/** Items { kind, x, y, z, yaw, scale } in metres. layout pieces are {id, x, z, sizeX, sizeZ}. */
export function composeDressing(seed, gridW, gridD, layout) {
  const items = [];
  if (gridW <= 0 || gridD <= 0) return items;
  const rng = new SeededRandom(seed ^ 0x4d52), lo = 0, hi = hiOf(seed, gridW, gridD), dU = dockU(seed, gridW, gridD), seaward = seawardYaw(seed), along = alongShoreYaw(seed);
  const addShore = (kind, u, v, yaw, scale) => { const w = coastToWorldAt(seed, gridW, u, v); items.push({ kind, x: w.x, y: 0, z: w.z, yaw, scale }); };

  const lightU = dU - lo > hi - dU ? lo + 6 : hi - 6;
  addShore('lighthouse', lightU, -3.2, seaward, 1);
  const chapelU = lightU < (lo + hi) / 2 ? lightU + CHAPEL_OFFSET : lightU - CHAPEL_OFFSET;
  addShore('chapel', chapelU, -3.5, seaward, CHAPEL_SCALE);

  const slots = [];
  for (let u = lo + 4; u < hi - 3; u += MIN_SLOT_SPACING + rng.next(15) / 10) slots.push([u, rng.next(3), cm(rng, 40) - 0.2, (rng.next(25) - 12) / 100]);
  const innSide = rng.next(2) === 0 ? -1 : 1;
  let innSlot = -1, best = Infinity;
  const blocked = (u) => Math.abs(u - dU) < DOCK_CLEARANCE || Math.abs(u - lightU) < LIGHTHOUSE_CLEARANCE || Math.abs(u - chapelU) < CHAPEL_CLEARANCE;
  slots.forEach((s, i) => { if (blocked(s[0])) return; const d = Math.abs(s[0] - (dU + innSide * 11)); if (d < best) { best = d; innSlot = i; } });
  slots.forEach((s, i) => {
    if (blocked(s[0])) return;
    const kind = i === innSlot ? 'inn' : s[1] === 0 ? 'cottage_tall' : 'cottage_thatch';
    addShore(kind, s[0], i === innSlot ? -3.7 : COTTAGE_V + s[2], seaward + s[3], i === innSlot ? INN_SCALE : 1);
    if (i === innSlot) addShore('barrel', s[0] - 3.1, -3.4, along + 0.2, 1);
  });

  addShore('crate_stack', dU - 2.7, -1.6 + cm(rng, 30) - 0.15, along, 1);
  addShore('barrel', dU + 2.6, -1.4, along + 0.4, 1);
  addShore('barrel', dU + 3.3, -2.5, along - 0.3, 1);
  addShore('crate_stack', dU - 3.4, -2.7, along + 0.15, 1);

  let lampIndex = 0;
  for (let u = lo + 4; u < hi - 2; u += LAMP_SPACING, lampIndex++) if (Math.abs(u - dU) > 2.6) addShore(DRESSING_LAMP_KINDS[lampIndex % 3], u, LAMP_V, seaward, 1);

  const rise = churchRise(seed, gridW, gridD);
  for (let col = 0; col < 2; col++) for (let row = 0; row < HILL_GRAVE_ROWS; row++) {
    const cross = rng.next(4) === 0, jx = cm(rng, 40) - 0.2, jz = cm(rng, 40) - 0.2, tilt = (rng.next(20) - 10) / 100;
    items.push({ kind: cross ? 'gravestone_cross' : 'gravestone', x: rise.x + rise.faceX * (4.2 + col * 1.5) + jx, y: rise.hill, z: rise.z - 4.5 + row * 1.8 + jz, yaw: rise.faceX * Math.PI / 2 + tilt, scale: 1 });
  }
  for (const dz of [-1.5, 1.5]) items.push({ kind: 'fence_iron', x: rise.x + rise.faceX * 6.3, y: rise.hill, z: rise.z + dz, yaw: Math.PI / 2, scale: 1 });

  const midX = gridW * CELL_M / 2, midZ = gridD * CELL_M / 2, stallYaw = cm(rng, 60) - 0.3;
  for (const s of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [4, 4], [-4, 4]]) {
    const stall = { kind: 'market_stall', x: midX + s[0], y: 0, z: midZ + s[1], yaw: stallYaw, scale: 1 };
    if (!overlapsLayout(stall, layout, 0.8)) { items.push(stall); break; }
  }

  const church = layout ? layout.find((p) => p.id === 'church') : null;
  if (church) {
    const gx = (church.x + church.sizeX / 2) * CELL_M, gz = (church.z + church.sizeZ) * CELL_M + 2.6;
    const tryAdd = (item) => {
      if (item.x < 0.5 || item.z < 0.5 || item.x > gridW * CELL_M - 0.5 || item.z > gridD * CELL_M - 0.5) return;
      if (!overlapsLayout(item, layout, 0.3)) items.push(item);
    };
    for (const dx of [-1.6, 1.6]) tryAdd({ kind: 'fence_iron', x: gx + dx, y: 0, z: gz, yaw: 0, scale: 1 });
    for (const off of [-2.2, -0.5, 1.2, 2.9]) {
      const cross = rng.next(4) === 0;
      tryAdd({ kind: cross ? 'gravestone_cross' : 'gravestone', x: gx + off, y: 0, z: gz - 1.4, yaw: Math.PI + (rng.next(20) - 10) / 100, scale: 1 });
    }
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
