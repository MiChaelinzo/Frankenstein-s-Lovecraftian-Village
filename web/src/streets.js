// JS port of Core/VillageStreets.cs: the street network (lanes, square, building frontage) derived from the grid size alone. Golden-checked through the layout.
// Core is the source of truth; keep the numbers identical to the C# file. Facing is quarter turns: 0 faces +z, 1 +x, 2 -z, 3 -x.
import { HOUSE_FOOTPRINT_MIN_CELLS } from './world-scale.js';

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
