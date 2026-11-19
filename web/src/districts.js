// JS port of Core/VillageDistricts.cs and VillageLayoutGenerator.GenerateCity: the district map of the city, the chunked layout, the district palettes.
// Core is the source of truth; keep the numbers and the order of rolls identical to the C# files. Golden-checked ("city").
import { SeededRandom, reserveStreets, fillRegion } from './core.js';
import { CELL_M, coastSideOf, dockU } from './dressing.js'; // a cycle with dressing.js, which is fine: both only use the other inside functions

export const DISTRICT = Object.freeze({ HARBOUR: 0, OLD_TOWN: 1, CHAPEL_HILL: 2, MARKET: 3, FISHERS_ROW: 4 });
export const DISTRICT_IDS = Object.freeze(['harbour', 'old_town', 'chapel_hill', 'market', 'fishers_row']);
export const CITY_GRID = 36, CITY_PIECES = 180, CHUNK_CELLS = 12, CHUNK_SEED_STEP = 0x2545;
export const MARKET_RADIUS = 4, CHAPEL_REACH = 8, COAST_BAND = 6, HARBOUR_HALF_SPAN = 7;

export const chunkCount = (extent) => (extent <= 0 ? 0 : Math.floor((extent + CHUNK_CELLS - 1) / CHUNK_CELLS));
export const chunkOf = (cell) => Math.floor(cell / CHUNK_CELLS);
export const chunkSeed = (seed, chunkIndex) => seed ^ (chunkIndex * CHUNK_SEED_STEP);

/** The district index of a cell. Priority: market, chapel hill, harbour, fishers' row, old town. */
export function districtAt(seed, gridW, gridD, x, z) {
  if (Math.abs(x - Math.floor(gridW / 2)) <= MARKET_RADIUS && Math.abs(z - Math.floor(gridD / 2)) <= MARKET_RADIUS) return DISTRICT.MARKET;
  const side = coastSideOf(seed), east = side === 0 ? true : side === 1 ? false : (((seed ^ 0x3c3c) & 1) === 0);
  const ax = east ? gridW - 1 : 0, az = Math.floor(gridD * CELL_M * 0.35 / CELL_M), dx = x - ax, dz = z - az;
  if (dx * dx + dz * dz <= CHAPEL_REACH * CHAPEL_REACH) return DISTRICT.CHAPEL_HILL;
  const depth = side === 0 ? x : side === 1 ? gridW - 1 - x : z;
  if (depth >= COAST_BAND) return DISTRICT.OLD_TOWN;
  const along = side === 2 ? x : z, dockCell = Math.floor(dockU(seed, gridW, gridD) / CELL_M);
  return Math.abs(along - dockCell) <= HARBOUR_HALF_SPAN ? DISTRICT.HARBOUR : DISTRICT.FISHERS_ROW;
}

/** The whole map, indexed x * gridD + z. */
export function districtMap(seed, gridW, gridD) {
  const map = new Uint8Array(Math.max(0, gridW) * Math.max(0, gridD));
  for (let x = 0; x < gridW; x++) for (let z = 0; z < gridD; z++) map[x * gridD + z] = districtAt(seed, gridW, gridD, x, z);
  return map;
}

// A repeated kind is weighted double. The CC0 barrel and bench are left out on purpose: their textured meshes cost 600 to 1500 triangles each.
const PALETTES = Object.freeze([
  Object.freeze(['crate_stack', 'rope_coil', 'sack', 'bollard', 'crate_stack']),
  Object.freeze(['hedge', 'wall_low', 'sign', 'picket_fence', 'bush']),
  Object.freeze(['gravestone', 'gravestone_cross', 'fence_iron', 'stump', 'bush']),
  Object.freeze(['market_stall', 'cart', 'crate_stack', 'sack', 'market_stall']),
  Object.freeze(['net', 'laundry_line', 'woodpile', 'rope_coil', 'sack']),
]);
export const districtPalette = (district) => PALETTES[district] || PALETTES[DISTRICT.OLD_TOWN];

const DENSITY = [40, 12, 30, 45, 35];
export const paletteDensity = (district) => (district >= 0 && district < DENSITY.length ? DENSITY[district] : 10);

/** Percent chance that a catalog piece is accepted when its roll lands in a district. */
export function pieceAffinity(district, pieceId) {
  const D = DISTRICT;
  switch (pieceId) {
    case 'church': return district === D.CHAPEL_HILL ? 100 : 25;
    case 'altar': return district === D.CHAPEL_HILL ? 100 : district === D.OLD_TOWN ? 60 : 20;
    case 'well': return district === D.MARKET ? 100 : district === D.OLD_TOWN ? 80 : district === D.CHAPEL_HILL ? 30 : 50;
    case 'house_b': return district === D.FISHERS_ROW ? 100 : district === D.HARBOUR ? 80 : district === D.OLD_TOWN ? 70 : 60;
    case 'dead_tree': return district === D.CHAPEL_HILL ? 100 : district === D.FISHERS_ROW ? 60 : 40;
    default: return district === D.OLD_TOWN || district === D.MARKET ? 100 : 90;
  }
}

/** The chunked, district-aware city layout (mirrors VillageLayoutGenerator.GenerateCity). */
export function generateCityLayout(catalog, width, depth, targetCount, seed) {
  const result = [];
  if (!catalog || catalog.entries.length === 0 || width <= 0 || depth <= 0 || targetCount <= 0) return result;
  const occupied = reserveStreets(width, depth), map = districtMap(seed, width, depth), taste = (x, z, id) => pieceAffinity(map[x * depth + z], id);
  const chunksX = chunkCount(width), chunksZ = chunkCount(depth), total = width * depth;
  let before = 0;
  for (let cz = 0; cz < chunksZ; cz++) for (let cx = 0; cx < chunksX; cx++) {
    const x0 = cx * CHUNK_CELLS, z0 = cz * CHUNK_CELLS, x1 = Math.min(width, x0 + CHUNK_CELLS), z1 = Math.min(depth, z0 + CHUNK_CELLS);
    const after = before + (x1 - x0) * (z1 - z0), target = Math.floor(targetCount * after / total) - Math.floor(targetCount * before / total);
    before = after;
    fillRegion(result, new SeededRandom(chunkSeed(seed, cz * chunksX + cx)), occupied, catalog, width, depth, [x0, z0, x1, z1], target, taste);
  }
  return result;
}

/** District name for a world position in metres; null outside the grid. */
export function districtAtWorld(seed, gridW, gridD, x, z) {
  const cx = Math.floor(x / CELL_M), cz = Math.floor(z / CELL_M);
  if (cx < 0 || cz < 0 || cx >= gridW || cz >= gridD) return null;
  return DISTRICT_IDS[districtAt(seed, gridW, gridD, cx, cz)];
}

/** Faint minimap ground tint per district, in DISTRICT order. Display only. */
export const DISTRICT_TINTS = Object.freeze(['#16242c', '#1a1a1e', '#221c24', '#262016', '#14221e']);

/**
 * Minimap labels: one per district, at the centre of its largest run of cells (the cell of the district nearest its centroid), in pixels of a size by size map.
 * Pure; app.js paints the translated names. The order is DISTRICT order.
 */
export function districtMinimapLabels(seed, gridW, gridD, size) {
  const map = districtMap(seed, gridW, gridD), sum = DISTRICT_IDS.map(() => [0, 0, 0]);
  for (let x = 0; x < gridW; x++) for (let z = 0; z < gridD; z++) { const s = sum[map[x * gridD + z]]; s[0] += x; s[1] += z; s[2]++; }
  const sx = size / Math.max(1, gridW), sz = size / Math.max(1, gridD), out = [];
  sum.forEach(([tx, tz, n], d) => {
    if (!n) return;
    const mx = tx / n, mz = tz / n;
    let best = null, bestD = Infinity;
    for (let x = 0; x < gridW; x++) for (let z = 0; z < gridD; z++) if (map[x * gridD + z] === d) { const dd = (x - mx) ** 2 + (z - mz) ** 2; if (dd < bestD) { bestD = dd; best = [x, z]; } }
    out.push({ id: DISTRICT_IDS[d], x: (best[0] + 0.5) * sx, y: (best[1] + 0.5) * sz });
  });
  return out;
}
