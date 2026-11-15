import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as scale from '../src/world-scale.js';
import { buildShapeModel } from '../src/shapes.js';
import { fitScale, loadGlbBuffer } from '../src/glb.js';
import { CELL, EYE_HEIGHT } from '../src/view3d-math.js';
import { VILLAGER_HEIGHT_SCALE } from '../src/view3d.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const shapes = JSON.parse(readFileSync(join(web, 'data', 'village_shapes.json'), 'utf8'));
const model = (k) => buildShapeModel(shapes, k);
const top = (k) => model(k).bounds.max[1];
const placedDoor = (k, piece) => {
  const m = model(k), s = fitScale(m, piece, CELL), p = shapes.meshes.find((e) => e.id === k).parts.find((e) => e.name === 'door');
  return p.size[2] * s;
};

test('web constants equal the scale block of the shapes data (and so Core WorldScale.cs, which a dotnet test checks)', () => {
  const s = shapes.scale;
  assert.deepEqual([scale.EYE_HEIGHT, scale.PERSON_HEIGHT, scale.DOOR_HEIGHT, scale.EAVES_MIN, scale.EAVES_MAX, scale.LAMP_MIN, scale.LAMP_MAX, scale.TREE_MIN,
    scale.STOREY_HEIGHT, scale.HOUSE_STOREYS, scale.RIDGE_MIN, scale.RIDGE_MAX, scale.HOUSE_FOOTPRINT_MIN_CELLS],
    [s.eyeHeight, s.personHeight, s.doorHeight, s.eavesMin, s.eavesMax, s.lampMin, s.lampMax, s.treeMin,
      s.storeyHeight, s.houseStoreys, s.ridgeMin, s.ridgeMax, s.houseFootprintMinCells]);
  assert.equal(EYE_HEIGHT, scale.EYE_HEIGHT);
});

test('a villager is a regular person: 1.7 m placed unscaled, taller than the eye, shorter than a door', () => {
  const h = top('villager') * VILLAGER_HEIGHT_SCALE;
  assert.ok(Math.abs(h - scale.PERSON_HEIGHT) <= 0.05, `villager ${h} m`);
  assert.ok(h > scale.EYE_HEIGHT && h < scale.DOOR_HEIGHT);
});

test('door height over eye height stays in a believable ratio', () => {
  const r = scale.DOOR_HEIGHT / scale.EYE_HEIGHT;
  assert.ok(r > 1.15 && r < 1.4, `ratio ${r}`);
});

test('fitScale never enlarges a mesh and houses keep their authored size on their catalog footprint', () => {
  const one = { x: 0, z: 0, sizeX: 1, sizeZ: 1 };
  for (const k of ['house_a', 'house_b', 'cottage_thatch', 'cottage_tall', 'well', 'dead_tree', 'altar']) {
    const s = fitScale(model(k), one, CELL);
    assert.ok(s <= scale.MAX_PLACE_SCALE + 1e-9, `${k} ${s}`);
  }
  const cat = JSON.parse(readFileSync(join(web, 'data', 'village_catalog.json'), 'utf8')).entries;
  for (const k of ['house_a', 'house_b']) {
    const e = cat.find((c) => c.id === k);
    assert.equal(fitScale(model(k), { x: 0, z: 0, sizeX: e.footprintX, sizeZ: e.footprintZ }, CELL), 1, k);
  }
  assert.equal(fitScale(model('lamp'), { x: 0, z: 0, sizeX: 9, sizeZ: 9 }, CELL), 1);
});

test('placed doors are about 2 m', () => {
  const one = { x: 0, z: 0, sizeX: 1, sizeZ: 1 };
  const foot = { house_a: { x: 0, z: 0, sizeX: 2, sizeZ: 2 }, house_b: { x: 0, z: 0, sizeX: 3, sizeZ: 2 }, cottage_thatch: { x: 0, z: 0, sizeX: 2, sizeZ: 2 }, cottage_tall: { x: 0, z: 0, sizeX: 2, sizeZ: 2 } }; // round 22: the coast cottages are 4.5 m wide, wider than one cell
  for (const k of ['house_a', 'house_b', 'cottage_thatch', 'cottage_tall']) {
    const d = placedDoor(k, foot[k] || one);
    assert.ok(Math.abs(d - scale.DOOR_HEIGHT) <= 0.1, `${k} door ${d}`);
  }
  for (const k of ['inn', 'chapel', 'lighthouse']) assert.ok(Math.abs(placedDoor(k, { x: 0, z: 0, sizeX: k === 'inn' ? 3 : 2, sizeZ: k === 'inn' ? 3 : 2 }) - scale.DOOR_HEIGHT) <= 0.1, k);
});

test('village houses are real buildings: multi-storey, ridge 6 to 10 m, at least 3x a person, on a multi-cell footprint', () => {
  const cat = JSON.parse(readFileSync(join(web, 'data', 'village_catalog.json'), 'utf8')).entries;
  for (const k of ['house_a', 'house_b']) {
    const m = model(k), e = cat.find((c) => c.id === k), parts = shapes.meshes.find((x) => x.id === k).parts;
    const ridge = top(k);
    assert.ok(ridge >= scale.RIDGE_MIN && ridge <= scale.RIDGE_MAX, `${k} ridge ${ridge}`);
    assert.ok(ridge >= 3 * scale.PERSON_HEIGHT, `${k} is ${ridge / scale.PERSON_HEIGHT} persons tall`);
    assert.ok(e.footprintX >= scale.HOUSE_FOOTPRINT_MIN_CELLS && e.footprintZ >= scale.HOUSE_FOOTPRINT_MIN_CELLS, `${k} footprint`);
    const ground = parts.find((p) => p.name === 'ground'), upper = parts.find((p) => p.name === 'upper');
    assert.ok(Math.abs(upper.at[2] + upper.size[2] - scale.HOUSE_STOREYS * scale.STOREY_HEIGHT) <= 0.5, `${k} eaves`);
    assert.ok(upper.size[1] > ground.size[1], `${k} upper floor overhangs`);
    assert.ok(parts.filter((p) => p.material === 'glow').length >= 6, `${k} windows`);
    assert.ok(parts.some((p) => p.material === 'glow' && p.at[2] >= upper.at[2]), `${k} lit upper windows`);
    assert.ok(parts.some((p) => p.name.startsWith('chimney')), `${k} chimney`);
    assert.ok(m.bounds.max[0] - m.bounds.min[0] <= e.footprintX * CELL * 0.9 + 1e-6);
  }
});

test('lamp posts stand 3 to 3.6 m, trees are taller than people, wells are low', () => {
  for (const k of ['lamp', 'lamp_double']) assert.ok(top(k) >= scale.LAMP_MIN && top(k) <= scale.LAMP_MAX, `${k} ${top(k)}`);
  assert.ok(top('dead_tree') >= scale.TREE_MIN && top('dead_tree') > scale.PERSON_HEIGHT * 2);
  assert.ok(top('well') < 3.2);
});

test('the lamp GLB equals the shapes data height', () => {
  const g = loadGlbBuffer(readFileSync(join(web, 'assets', 'meshes', 'house_a.glb')));
  assert.ok(Math.abs(g.bounds.max[1] - top('house_a')) < 1e-3);
});

test('every mesh is within its believable real-world height range (propHeights in the shapes data)', () => {
  const ranges = shapes.propHeights;
  for (const m of shapes.meshes) {
    const r = ranges[m.id];
    assert.ok(Array.isArray(r) && r[0] < r[1], `no range for ${m.id}`);
    const h = top(m.id);
    assert.ok(h >= r[0] - 1e-9 && h <= r[1] + 1e-9, `${m.id} is ${h} m, expected ${r[0]} to ${r[1]}`);
  }
  for (const id of Object.keys(ranges)) if (id !== 'comment') assert.ok(shapes.meshes.some((m) => m.id === id), `range for unknown mesh ${id}`);
});

test('props that sit in the street are smaller than a person or a door, and houses dwarf them', () => {
  for (const k of ['barrel', 'bench', 'sack', 'crate_stack', 'cart', 'bush', 'rock']) assert.ok(top(k) < scale.DOOR_HEIGHT, k);
  assert.ok(top('house_a') >= 3 * scale.PERSON_HEIGHT);
});
