import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout, pickScene, normalizeScene, sceneFromUrl, kindCounts, sceneLabel, unclassifiedShare, slugify, MAX_SCENE_OBJECTS } from '../src/dlnk-layout.js';

const obj = (kind, x, z, extra = {}) => ({ name: `${kind}00`, kind, x, z, y: 0, rotY: 0, scale: 1, ...extra });
const good = {
  version: 1,
  scenes: {
    'coast-scene': { title: 'Coast Scene', total: 3, objects: [obj('house_a', 0, 0), obj('church', 100, 50), obj('rock', 50, 100)] },
    'myst-village': { title: 'Myst Village', objects: [obj('tree', -5, 5)] },
  },
};

test('validateLayout accepts a synthetic layout', () => {
  const v = validateLayout(good);
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.scenes).sort(), ['coast-scene', 'myst-village']);
  assert.equal(v.scenes['myst-village'].total, 1);
});

test('validateLayout rejects malformed layouts', () => {
  assert.equal(validateLayout(null).ok, false);
  assert.equal(validateLayout({}).ok, false);
  assert.equal(validateLayout({ version: 2, scenes: good.scenes }).errors[0], 'unsupported layout version');
  assert.equal(validateLayout({ version: 1, scenes: [] }).ok, false);
  assert.equal(validateLayout({ version: 1, scenes: { 'Bad Name!': good.scenes['coast-scene'] } }).ok, false);
  assert.equal(validateLayout({ version: 1, scenes: { a: { objects: 'x' } } }).ok, false);
  assert.equal(validateLayout({ version: 1, scenes: { a: { objects: [obj('house_a', NaN, 0)] } } }).ok, false);
});

test('validateLayout drops bad objects and keeps good ones', () => {
  const j = { version: 1, scenes: { a: { objects: [obj('rock', 1, 1), obj('dragon', 1, 1), obj('rock', 1, 1, { scale: 0 }), null, obj('rock', Infinity, 0), obj('rock', 2, 2)] } } };
  const v = validateLayout(j);
  assert.equal(v.ok, true);
  assert.equal(v.scenes.a.objects.length, 2);
  assert.ok(v.errors.some((e) => e.includes('dropped 4')));
});

test('validateLayout caps objects per scene', () => {
  const many = Array.from({ length: MAX_SCENE_OBJECTS + 50 }, (_, i) => obj('rock', i, i));
  assert.equal(validateLayout({ version: 1, scenes: { a: { objects: many } } }).scenes.a.objects.length, MAX_SCENE_OBJECTS);
});

test('pickScene finds by slug, prefix, title and returns null otherwise', () => {
  const { scenes } = validateLayout(good);
  assert.equal(pickScene(scenes, 'coast-scene'), 'coast-scene');
  assert.equal(pickScene(scenes, 'Coast Scene'), 'coast-scene');
  assert.equal(pickScene(scenes, 'myst'), 'myst-village');
  assert.equal(pickScene(scenes, 'nope'), null);
  assert.equal(pickScene(scenes, ''), null);
  assert.equal(pickScene({}, 'x'), null);
  assert.equal(slugify('  A b_C '), 'a-b-c');
});

test('normalizeScene fits the grid, keeps aspect and is deterministic', () => {
  const { scenes } = validateLayout(good);
  const a = normalizeScene(scenes['coast-scene'], 24, 24);
  const b = normalizeScene(scenes['coast-scene'], 24, 24);
  assert.deepEqual(a, b);
  for (const it of a) { assert.ok(it.gx >= 0 && it.gx <= 24 && it.gz >= 0 && it.gz <= 24); }
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].depth <= a[i].depth);
  const church = a.find((x) => x.kind === 'church');
  assert.ok(church.size > a.find((x) => x.kind === 'rock').size);
});

test('normalizeScene handles a single object and identical positions', () => {
  const one = normalizeScene({ objects: [obj('tree', 5, 5), obj('tree', 5, 5)] }, 24, 24);
  assert.equal(one.length, 2);
  assert.ok(one.every((x) => Number.isFinite(x.gx) && Number.isFinite(x.gz)));
  assert.deepEqual(one.map((x) => x.i), [0, 1]);
});

test('sceneFromUrl, kindCounts, sceneLabel', () => {
  assert.equal(sceneFromUrl('?pack=1&scene=coast-scene', ''), 'coast-scene');
  assert.equal(sceneFromUrl('?pack=1', '#scene=x'), 'x');
  assert.equal(sceneFromUrl('', ''), '');
  const { scenes } = validateLayout(good);
  assert.deepEqual(kindCounts(scenes['coast-scene']), { house_a: 1, church: 1, rock: 1 });
  assert.equal(sceneLabel('coast-scene', scenes['coast-scene']), 'DLNK scene: Coast Scene (3 objects)');
});

test('unclassifiedShare and sceneLabel report the generic share instead of hiding it', () => {
  const scene = { title: 'T', total: 4, objects: [obj('rock', 0, 0), obj('generic', 1, 1), obj('generic', 2, 2), obj('prop', 3, 3)] };
  assert.deepEqual(unclassifiedShare(scene), { count: 2, percent: 50 });
  assert.equal(sceneLabel('t', scene), 'DLNK scene: T (4 objects), 2 unclassified (50%) as hollow rings');
  assert.deepEqual(unclassifiedShare({ objects: [] }), { count: 0, percent: 0 });
});

test('validateLayout accepts the effect and prop kinds', () => {
  const v = validateLayout({ version: 1, scenes: { a: { objects: [obj('effect', 0, 0), obj('prop', 1, 1)] } } });
  assert.equal(v.scenes.a.objects.length, 2);
});
