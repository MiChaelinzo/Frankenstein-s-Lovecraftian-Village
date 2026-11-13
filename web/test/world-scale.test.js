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
  assert.deepEqual([scale.EYE_HEIGHT, scale.PERSON_HEIGHT, scale.DOOR_HEIGHT, scale.EAVES_MIN, scale.EAVES_MAX, scale.LAMP_MIN, scale.LAMP_MAX, scale.TREE_MIN],
    [s.eyeHeight, s.personHeight, s.doorHeight, s.eavesMin, s.eavesMax, s.lampMin, s.lampMax, s.treeMin]);
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

test('fitScale never enlarges a mesh and one-cell houses keep their authored size', () => {
  const one = { x: 0, z: 0, sizeX: 1, sizeZ: 1 };
  for (const k of ['house_a', 'house_b', 'cottage_thatch', 'cottage_tall', 'well', 'dead_tree', 'altar']) {
    const s = fitScale(model(k), one, CELL);
    assert.ok(s <= scale.MAX_PLACE_SCALE + 1e-9, `${k} ${s}`);
  }
  assert.equal(fitScale(model('house_a'), one, CELL), 1);
  assert.equal(fitScale(model('house_b'), one, CELL), 1);
  assert.equal(fitScale(model('lamp'), { x: 0, z: 0, sizeX: 9, sizeZ: 9 }, CELL), 1);
});

test('placed doors are about 2 m and homes sit at single storey eaves', () => {
  const one = { x: 0, z: 0, sizeX: 1, sizeZ: 1 };
  for (const k of ['house_a', 'house_b', 'cottage_thatch', 'cottage_tall']) {
    const d = placedDoor(k, one);
    assert.ok(Math.abs(d - scale.DOOR_HEIGHT) <= 0.1, `${k} door ${d}`);
  }
  for (const k of ['inn', 'chapel', 'lighthouse']) assert.ok(Math.abs(placedDoor(k, { x: 0, z: 0, sizeX: 2, sizeZ: 2 }) - scale.DOOR_HEIGHT) <= 0.1, k);
  const walls = shapes.meshes.find((e) => e.id === 'house_a').parts.find((e) => e.name === 'walls');
  const eaves = walls.at[2] + walls.size[2];
  assert.ok(eaves >= scale.EAVES_MIN && eaves <= scale.EAVES_MAX, `eaves ${eaves}`);
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
