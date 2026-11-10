import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimapModel, kindColor, kindLabel, OTHER_COLOR, KIND_COLORS } from '../src/minimap.js';

const layout = [
  { id: 'church', x: 2, z: 4, sizeX: 4, sizeZ: 3 }, { id: 'house_a', x: 10, z: 0, sizeX: 2, sizeZ: 2 },
  { id: 'house_a', x: 14, z: 6, sizeX: 2, sizeZ: 2 }, { id: 'mystery', x: 0, z: 0, sizeX: 0, sizeZ: 0 },
];
test('scales cells, counts legend, marks selection', () => {
  const m = minimapModel(layout, 24, 24, 120, layout[0]);
  assert.equal(m.cells.length, 4);
  assert.deepEqual([m.cells[0].x, m.cells[0].y, m.cells[0].w, m.cells[0].h], [10, 20, 20, 15]);
  assert.deepEqual(m.cells.map((c) => c.selected), [true, false, false, false]);
  assert.deepEqual(m.legend.map((l) => [l.id, l.count]), [['church', 1], ['house_a', 2], ['mystery', 1]]);
  assert.equal(m.cells[3].w, 1);
});
test('colors, labels, empty input', () => {
  assert.equal(kindColor('well'), KIND_COLORS.well);
  assert.equal(kindColor('zzz'), OTHER_COLOR);
  assert.equal(kindLabel('some_thing'), 'some thing');
  assert.deepEqual(minimapModel(null, 24, 24, 100, null).cells, []);
  assert.ok(minimapModel(layout, 24, 24, 100, null).cells.every((c) => !c.selected));
});
