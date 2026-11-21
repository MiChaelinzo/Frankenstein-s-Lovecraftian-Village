// JS port of Core/VillageStreets.cs: the street network (lanes, square, building frontage) derived from the grid size alone. Golden-checked through the layout.
// Core is the source of truth; keep the numbers identical to the C# file. Facing is quarter turns: 0 faces +z, 1 +x, 2 -z, 3 -x.
import { HOUSE_FOOTPRINT_MIN_CELLS } from './world-scale.js';
import { SeededRandom } from './core.js'; // a cycle with core.js, which is fine: both only use the other inside functions
import { lanternsLit } from './clock.js';
import { CELL_M } from './dressing.js'; // cell size, as VillageDressing.Cell in Core; a cycle with dressing.js, used only inside functions

export const STREET_MIN_GRID = 16, LANE_SPACING = 6, LANE_EDGE_MARGIN = 3, SQUARE_RADIUS = 1;

export const streetsEnabled = (gridW, gridD) => gridW >= STREET_MIN_GRID && gridD >= STREET_MIN_GRID;

/** Cell indices of the lanes across an extent of that many cells, ascending (columns for gridW, rows for gridD). */
export function laneLines(extent) {
  const lines = [];
  if (extent < STREET_MIN_GRID) return lines;
  for (let c = Math.floor(extent / 2) % LANE_SPACING; c < extent; c += LANE_SPACING) if (c >= LANE_EDGE_MARGIN && c <= extent - 1 - LANE_EDGE_MARGIN) lines.push(c);
  return lines;
}

export function isSquareCell(gridW, gridD, x, z) {
  return streetsEnabled(gridW, gridD) && Math.abs(x - Math.floor(gridW / 2)) <= SQUARE_RADIUS && Math.abs(z - Math.floor(gridD / 2)) <= SQUARE_RADIUS;
}

export function isStreetCell(gridW, gridD, x, z) {
  if (!streetsEnabled(gridW, gridD) || x < 0 || z < 0 || x >= gridW || z >= gridD) return false;
  return laneLines(gridW).includes(x) || laneLines(gridD).includes(z) || isSquareCell(gridW, gridD, x, z);
}

/** True for a footprint that is a building and so has to front a street. */
export const isBuilding = (sizeX, sizeZ) => sizeX >= HOUSE_FOOTPRINT_MIN_CELLS && sizeZ >= HOUSE_FOOTPRINT_MIN_CELLS;

const sideTouches = (gridW, gridD, from, fixed, length, alongX) => {
  for (let i = 0; i < length; i++) if (alongX ? isStreetCell(gridW, gridD, from + i, fixed) : isStreetCell(gridW, gridD, fixed, from + i)) return true;
  return false;
};

/** Facing of a building footprint toward the first street side it touches, or -1 when it touches none. Non square footprints face along z only. */
export function facingFor(gridW, gridD, x, z, sizeX, sizeZ) {
  if (!streetsEnabled(gridW, gridD)) return 0;
  if (sideTouches(gridW, gridD, x, z + sizeZ, sizeX, true)) return 0;
  if (sideTouches(gridW, gridD, x, z - 1, sizeX, true)) return 2;
  if (sizeX !== sizeZ) return -1;
  if (sideTouches(gridW, gridD, z, x + sizeX, sizeZ, false)) return 1;
  if (sideTouches(gridW, gridD, z, x - 1, sizeZ, false)) return 3;
  return -1;
}

export const facingYaw = (facing) => (facing * Math.PI) / 2;

/** Rectangles [x0, z0, x1, z1] in metres: every lane across the whole grid, then the square. */
export function streetSurfaces(gridW, gridD, cell) {
  if (!streetsEnabled(gridW, gridD)) return [];
  const rects = [];
  for (const c of laneLines(gridW)) rects.push([c * cell, 0, (c + 1) * cell, gridD * cell]);
  for (const r of laneLines(gridD)) rects.push([0, r * cell, gridW * cell, (r + 1) * cell]);
  const mx = Math.floor(gridW / 2), mz = Math.floor(gridD / 2);
  rects.push([(mx - SQUARE_RADIUS) * cell, (mz - SQUARE_RADIUS) * cell, (mx + SQUARE_RADIUS + 1) * cell, (mz + SQUARE_RADIUS + 1) * cell]);
  return rects;
}

export const FACING_DX = [0, 1, 0, -1], FACING_DZ = [1, 0, -1, 0];
/** Unit direction of a facing, exact (no trigonometry), as in Core. */
export const facingDx = (facing) => FACING_DX[((facing % 4) + 4) % 4];
export const facingDz = (facing) => FACING_DZ[((facing % 4) + 4) % 4];

// ---------- lane routes (mirror of VillageStreets.LaneRoute): villagers walk lane centre lines, so a walk never crosses a building ----------
const BOX_SLACK = 1e-6, EPS = 1e-9;

/** True when the straight leg crosses no building box of the layout, ignoring a box the leg starts inside. Mirror of VillageStreets.LegIsClear. */
export function legIsClear(x0, z0, x1, z1, layout) {
  if (!layout) return true;
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
  for (const p of layout) {
    if (!isBuilding(p.sizeX, p.sizeZ)) continue;
    if (x0 > p.x + BOX_SLACK && x0 < p.x + p.sizeX - BOX_SLACK && z0 > p.z + BOX_SLACK && z0 < p.z + p.sizeZ - BOX_SLACK) continue;
    if (maxX > p.x + BOX_SLACK && minX < p.x + p.sizeX - BOX_SLACK && maxZ > p.z + BOX_SLACK && minZ < p.z + p.sizeZ - BOX_SLACK) return false;
  }
  return true;
}

// Moves a point onto a lane centre line: the nearest row or column centre on either side whose step crosses no building (ties: row, lower side); the nearest when all are blocked.
function anchor(x, z, cols, rows, layout) {
  let best = null, bestDist = Infinity, fallback = { x, z, onRow: true }, fallbackDist = Infinity;
  for (let pass = 0; pass < 4; pass++) {
    const row = pass < 2, lower = pass % 2 === 0, lanes = row ? rows : cols, v = row ? z : x;
    let target = NaN;
    for (const lane of lanes) {
      const c = lane + 0.5;
      if (lower && c <= v + EPS) target = c;
      if (!lower && c >= v - EPS) { target = c; break; }
    }
    if (Number.isNaN(target)) continue;
    const dist = Math.abs(target - v), cx = row ? x : target, cz = row ? target : z;
    if (dist < fallbackDist - EPS) { fallbackDist = dist; fallback = { x: cx, z: cz, onRow: row }; }
    if (dist < bestDist - EPS && legIsClear(x, z, cx, cz, layout)) { bestDist = dist; best = { x: cx, z: cz, onRow: row }; }
  }
  return best || fallback;
}

function bestCrossing(lanes, a, b) {
  let best = lanes[0] + 0.5, bestCost = Infinity;
  for (const lane of lanes) {
    const c = lane + 0.5, cost = Math.abs(a - c) + Math.abs(b - c);
    if (cost < bestCost - EPS) { bestCost = cost; best = c; }
  }
  return best;
}

/** Waypoints [[x, z], ...] in cells from one point to another along the lanes; the old x then z walk without streets. Mirror of VillageStreets.LaneRoute. */
export function laneRoute(fromX, fromZ, toX, toZ, gridW, gridD, layout) {
  const route = [[fromX, fromZ]];
  const add = (x, z) => { const l = route[route.length - 1]; if (Math.abs(l[0] - x) > EPS || Math.abs(l[1] - z) > EPS) route.push([x, z]); };
  if (!streetsEnabled(gridW, gridD)) { add(toX, fromZ); add(toX, toZ); return route; }
  const cols = laneLines(gridW), rows = laneLines(gridD), a = anchor(fromX, fromZ, cols, rows, layout), b = anchor(toX, toZ, cols, rows, layout);
  add(a.x, a.z);
  if (a.onRow && b.onRow) {
    if (Math.abs(a.z - b.z) > EPS) { const cross = bestCrossing(cols, a.x, b.x); add(cross, a.z); add(cross, b.z); }
  } else if (!a.onRow && !b.onRow) {
    if (Math.abs(a.x - b.x) > EPS) { const cross = bestCrossing(rows, a.z, b.z); add(a.x, cross); add(b.x, cross); }
  } else if (a.onRow) add(b.x, a.z);
  else add(a.x, b.z);
  add(b.x, b.z); add(toX, toZ);
  return route;
}

// ---------- street walkers: display-only townsfolk pacing the lanes (no talk, no clue, no sanity effect). Mirrors VillageStreets.Walkers ----------
export const WELL_DEFLECT_LATERAL = 2, WELL_DEFLECT_RADIUS = 2.6;
/** Lateral offset of a main lane walker distanceToWell metres from the well: normal far away, WELL_DEFLECT_LATERAL at the well, cos squared between. Mirrors VillageStreets.WellDeflected. */
export function wellDeflected(lateral, distanceToWell) {
  if (distanceToWell >= WELL_DEFLECT_RADIUS) return lateral;
  const b = Math.cos(Math.PI / 2 * distanceToWell / WELL_DEFLECT_RADIUS);
  return (lateral < 0 ? -1 : 1) * (WALKER_LATERAL + (WELL_DEFLECT_LATERAL - WALKER_LATERAL) * b * b);
}
export const WALKER_SPEED_MIN = 0.8, WALKER_END_PAD = 3, WALKER_LATERAL = 1.2, MAIN_LANE_WALKERS = 3, SIDE_LANE_WALKERS = 2, DREAD_THINNING = 0.9;

/** [{ id, x, z, yaw, lantern }] in metres at a clock tick (fractional allowed) and dread 0..1. Every walker rolls first and is then hidden by dread, so the roster never shifts. */
export function streetWalkers(seed, gridW, gridD, tick, dread) {
  const walkers = [];
  if (!streetsEnabled(gridW, gridD)) return walkers;
  const rng = new SeededRandom(seed ^ 0x5742), visible = Math.floor((1 - DREAD_THINNING * Math.max(0, Math.min(1, dread))) * 100), lantern = lanternsLit(Math.floor(tick));
  let id = 0;
  for (let axis = 0; axis < 2; axis++) {
    const extent = axis === 0 ? gridW : gridD, across = axis === 0 ? gridD : gridW, length = across * CELL_M - 2 * WALKER_END_PAD;
    for (const line of laneLines(extent)) {
      const count = line === Math.floor(extent / 2) ? MAIN_LANE_WALKERS : SIDE_LANE_WALKERS;
      for (let k = 0; k < count; k++, id++) {
        const phase = rng.next(1000) / 1000, speed = WALKER_SPEED_MIN + rng.next(50) / 100, baseLateral = rng.next(2) === 0 ? -WALKER_LATERAL : WALKER_LATERAL, keep = rng.next(100);
        if (keep >= visible) continue;
        let d = phase * 2 * length + speed * tick;
        d -= 2 * length * Math.floor(d / (2 * length));
        const forward = d < length, along = WALKER_END_PAD + (forward ? d : 2 * length - d);
        const lateral = line === Math.floor(extent / 2) ? wellDeflected(baseLateral, Math.abs(along - (Math.floor(across / 2) + 0.5) * CELL_M)) : baseLateral, centre = (line + 0.5) * CELL_M + lateral;
        walkers.push({ id, x: axis === 0 ? centre : along, z: axis === 0 ? along : centre, lantern, yaw: axis === 0 ? (forward ? 0 : Math.PI) : (forward ? Math.PI / 2 : -Math.PI / 2) });
      }
    }
  }
  return walkers;
}
