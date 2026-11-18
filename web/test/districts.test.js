// The city (round 23): districts, the chunked layout and the district palettes, checked against the C# golden ("city") and for their invariants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout } from '../src/core.js';
import { generateCityLayout, districtAt, districtMap, districtAtWorld, districtPalette, chunkOf, chunkCount, DISTRICT, DISTRICT_IDS, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { composeDressing, footprintOf, CELL_M, coastSideOf, dockU } from '../src/dressing.js';
import { isStreetCell, isSquareCell, facingFor, isBuilding, laneLines } from '../src/streets.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).city;
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
const G = CITY_GRID;

test('district maps and city layouts match the C# golden', () => {
  assert.ok(golden.length >= 20);
  for (const w of golden) {
    const map = districtMap(w.seed, w.grid, w.grid);
    w.districts.forEach((row, z) => [...row].forEach((ch, x) => assert.equal(map[x * w.grid + z], Number(ch), `${w.seed}/${w.grid} cell ${x},${z}`)));
    const l = generateCityLayout(catalog, w.grid, w.grid, w.count, w.seed);
    assert.deepEqual(l.map((p) => [p.id, p.x, p.z, p.sizeX, p.sizeZ, p.facing]), w.pieces, `${w.seed}/${w.grid}`);
  }
});

test('every city has all five districts, the square is market and the coast band is harbour or fishers row', () => {
  for (const seed of [1, 42, -7, 1818, 7, 2024]) {
    const map = districtMap(seed, G, G), side = coastSideOf(seed);
    assert.equal(new Set(map).size, DISTRICT_IDS.length);
    for (let x = 0; x < G; x++) for (let z = 0; z < G; z++) {
      const d = map[x * G + z];
      if (isSquareCell(G, G, x, z)) assert.equal(d, DISTRICT.MARKET);
      if (d === DISTRICT.HARBOUR || d === DISTRICT.FISHERS_ROW) assert.ok((side === 0 ? x : side === 1 ? G - 1 - x : z) < 6);
    }
    assert.equal(districtAtWorld(seed, G, G, -1, 5), null);
    assert.equal(districtAtWorld(seed, G, G, (Math.floor(G / 2) + 0.5) * CELL_M, (Math.floor(G / 2) + 0.5) * CELL_M), 'market');
  }
});

test('the city layout is bigger than the old village and keeps every layout guarantee, chunk by chunk', () => {
  assert.equal(chunkCount(G), 3);
  assert.ok(laneLines(G).length > laneLines(24).length, 'more streets');
  for (const seed of [1818, 42, -7]) {
    const l = generateCityLayout(catalog, G, G, CITY_PIECES, seed), old = generateLayout(catalog, 24, 24, 80, seed);
    assert.ok(l.length > 2 * old.length && l.filter((p) => isBuilding(p.sizeX, p.sizeZ)).length > old.filter((p) => isBuilding(p.sizeX, p.sizeZ)).length);
    const occ = new Set();
    for (const p of l) {
      assert.ok(catalog.contains(p.id) && p.x >= 0 && p.z >= 0 && p.x + p.sizeX <= G && p.z + p.sizeZ <= G);
      assert.equal(chunkOf(p.x), chunkOf(p.x + p.sizeX - 1)); assert.equal(chunkOf(p.z), chunkOf(p.z + p.sizeZ - 1));
      for (let dx = 0; dx < p.sizeX; dx++) for (let dz = 0; dz < p.sizeZ; dz++) {
        const k = `${p.x + dx},${p.z + dz}`;
        assert.ok(!occ.has(k) && !isStreetCell(G, G, p.x + dx, p.z + dz)); occ.add(k);
      }
      if (isBuilding(p.sizeX, p.sizeZ)) assert.equal(p.facing, facingFor(G, G, p.x, p.z, p.sizeX, p.sizeZ));
    }
  }
});

test('district palettes dress the yards: stalls in the market, nets on the coast band, all with measured footprints', () => {
  for (const d of Object.values(DISTRICT)) for (const k of districtPalette(d)) assert.ok(footprintOf(k).height !== 3.45, k);
  for (const seed of [1818, 42, -7]) {
    const items = composeDressing(seed, G, G, generateCityLayout(catalog, G, G, CITY_PIECES, seed));
    const inGrid = (it) => it.y === 0 && it.x > 0 && it.z > 0 && it.x < G * CELL_M && it.z < G * CELL_M;
    const at = (it) => districtAt(seed, G, G, Math.floor(it.x / CELL_M), Math.floor(it.z / CELL_M));
    assert.ok(items.filter((it) => it.kind === 'market_stall' && inGrid(it) && at(it) === DISTRICT.MARKET).length >= 2, `seed ${seed}: market stalls`);
    assert.ok(items.some((it) => it.kind === 'net' && inGrid(it)), `seed ${seed}: a net in the yards`);
    assert.ok(!items.some((it) => inGrid(it) && at(it) === DISTRICT.OLD_TOWN && it.kind === 'market_stall' && Math.abs(it.x - (Math.floor(G / 2) + 0.5) * CELL_M) > 30), 'no stalls deep in the old town');
  }
  assert.ok(dockU(1818, G, G) > 0);
});

test('HUD and minimap: every district has an English and a French name, and one minimap label inside the map', async () => {
  const { STRINGS } = await import('../src/i18n.js');
  const { districtMinimapLabels } = await import('../src/districts.js');
  for (const id of DISTRICT_IDS) for (const lang of ['en', 'fr']) assert.ok(STRINGS[lang][`district.${id}`], `${lang} district.${id}`);
  assert.notEqual(STRINGS.fr['district.harbour'], STRINGS.en['district.harbour']);
  for (const seed of [1818, 42, -7]) {
    const labels = districtMinimapLabels(seed, G, G, 168);
    assert.deepEqual(labels.map((l) => l.id).sort(), [...DISTRICT_IDS].sort());
    for (const l of labels) { assert.ok(l.x > 0 && l.x < 168 && l.y > 0 && l.y < 168); assert.equal(districtAtWorld(seed, G, G, l.x / 168 * G * CELL_M, l.y / 168 * G * CELL_M), l.id); }
  }
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8'), app = readFileSync(join(here, '..', 'src', 'app.js'), 'utf8');
  assert.match(html, /id="districtChip"[^>]*data-i18n-aria="district.aria"[^>]*hidden/);
  assert.match(app, /tr\(`district\.\$\{id\}`\)/);
});
