// Round 23: the wider world (landmarks, lit paths, church rise, lore spots) mirrors Core/VillageLandmarks.cs. Golden key "landmarks".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANDMARK_IDS, landmarkName, landmarks, landmarkAt, landmarkDressing, landmarkPaths, landmarkPathDressing, hillHeight, groundHeight, COLLISION_ONLY_KINDS } from '../src/landmarks.js';
import { walkBounds, footprintOf, DRESSING_KINDS } from '../src/dressing.js';
import { KINDS } from '../src/glb.js';
import { STRINGS as TEXT } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url)), golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).landmarks;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const sameItems = (items, rows, msg) => {
  assert.equal(items.length, rows.length, `${msg} count`);
  items.forEach((it, i) => { assert.equal(it.kind, rows[i][0], `${msg} ${i} kind`); [it.x, it.y, it.z, it.yaw, it.scale].forEach((v, j) => near(v, rows[i][j + 1], `${msg} ${i}.${j}`)); });
};

test('landmark names and ids match the C# golden and both languages are in the string table', () => {
  assert.deepEqual(golden.names.map((n) => n[0]), [...LANDMARK_IDS]);
  for (const [id, en, fr] of golden.names) {
    assert.equal(landmarkName(id, 'en'), en); assert.equal(landmarkName(id, 'fr'), fr);
    assert.equal(TEXT.en[`landmark.${id}`], en); assert.equal(TEXT.fr[`landmark.${id}`], fr);
  }
  assert.equal(landmarkName('nowhere', 'en'), '');
});

test('church rise heights match the C# golden', () => {
  for (const [dx, dz, h] of golden.hill) near(hillHeight(9, dx, dz), h, `hill ${dx},${dz}`);
});

test('landmarks, props, paths, lit stones and lamps, walk bounds and ground heights match the C# golden', () => {
  assert.equal(golden.worlds.length, 10);
  for (const w of golden.worlds) {
    const tag = `${w.seed}/${w.grid}`, marks = landmarks(w.seed, w.grid, w.grid);
    assert.equal(marks.length, w.marks.length);
    marks.forEach((m, i) => { assert.equal(m.id, w.marks[i][0]); near(m.x, w.marks[i][1], `${tag} ${m.id}.x`); near(m.z, w.marks[i][2], `${tag} ${m.id}.z`); near(m.radius, w.marks[i][3], `${tag} ${m.id}.r`); });
    const b = walkBounds(w.seed, w.grid, w.grid);
    [b.minX, b.maxX, b.minZ, b.maxZ].forEach((v, i) => near(v, w.bounds[i], `${tag} bounds ${i}`));
    sameItems(landmarkDressing(w.seed, w.grid, w.grid), w.props, `${tag} props`);
    sameItems(landmarkPathDressing(w.seed, w.grid, w.grid), w.lit, `${tag} lit`);
    const paths = landmarkPaths(w.seed, w.grid, w.grid);
    assert.equal(paths.length, w.paths.length);
    paths.forEach((p, i) => { assert.equal(p.target, w.paths[i][0]); assert.equal(p.points.length, w.paths[i].length - 1); p.points.forEach((pt, j) => { near(pt[0], w.paths[i][j + 1][0], `${tag} path ${i}.${j}.x`); near(pt[1], w.paths[i][j + 1][1], `${tag} path ${i}.${j}.z`); }); });
    marks.forEach((m, i) => assert.equal(landmarkAt(w.seed, w.grid, w.grid, m.x + 2, m.z - 1), w.at[i] || null));
  }
});

test('every landmark prop kind has a footprint and a mesh, except the collision only church boxes', () => {
  for (const seed of [1, 42, 1818]) for (const it of [...landmarkDressing(seed, 36, 36), ...landmarkPathDressing(seed, 36, 36)]) {
    assert.ok(DRESSING_KINDS.includes(it.kind) || it.kind === 'lamp', it.kind);
    if (COLLISION_ONLY_KINDS.includes(it.kind)) assert.ok(!KINDS.includes(it.kind) && footprintOf(it.kind).solid, it.kind);
    else assert.ok(KINDS.includes(it.kind), `${it.kind} has no mesh`);
  }
});

test('the explorer stands on the rise: flat ground off it, the summit height on top, never below the ground', () => {
  for (const seed of [1, 42, 1818]) {
    assert.equal(groundHeight(seed, 36, 36, -500, -500), 0);
    const church = landmarks(seed, 36, 36)[3];
    near(groundHeight(seed, 36, 36, church.x, church.z), 9, 'summit');
    for (let dx = -30; dx <= 30; dx += 3) for (let dz = -30; dz <= 30; dz += 3) assert.ok(groundHeight(seed, 36, 36, church.x + dx, church.z + dz) >= 0);
  }
});
