// Round 24: the name rule mirrors Core/VillageNames.cs. Golden key "names".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { LANDMARK_IDS } from '../src/landmarks.js';
import { parseNameLibrary, assignNames, landmarkTitle, nameText } from '../src/names.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).names;
const webText = readFileSync(join(root, 'web', 'data', 'names.json'), 'utf8');
const lib = parseNameLibrary(webText);
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);

test('drift: the web data file is a byte copy of the package data file', () => {
  assert.equal(webText, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'names.json'), 'utf8'));
});

test('every catalog kind and landmark has words, in both languages, with no em dash', () => {
  for (const e of catalog.entries) assert.ok(lib.kinds[e.id], e.id);
  for (const id of LANDMARK_IDS) assert.ok(lib.landmarks[id], id);
  assert.ok(!webText.includes('\u2014'));
});

test('city names match C# for every golden seed, in en and fr, and are unique', () => {
  for (const c of golden.cities) {
    const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, c.seed);
    const names = assignNames(lib, c.seed, CITY_GRID, CITY_GRID, layout);
    assert.deepEqual(names.map((n) => (n ? n.en : '')), c.en, `en ${c.seed}`);
    assert.deepEqual(names.map((n) => (n ? n.fr : '')), c.fr, `fr ${c.seed}`);
    assert.equal(new Set(c.en).size, c.en.length, `unique ${c.seed}`);
    assert.deepEqual(LANDMARK_IDS.map((id) => { const n = landmarkTitle(lib, c.seed, id); return [n.en, n.fr]; }), c.landmarks, `landmarks ${c.seed}`);
  }
});

test('the sample names exist and unknown things are handled', () => {
  const all = Object.values(lib.kinds).flatMap((k) => [...Object.values(k.districts).flat(), ...k.any]).map((n) => n.en);
  for (const want of ["Widow's Rest", 'Blackwater Cottage', 'Crowmere Hall', "The Lantern's End", 'St. Velor Chapel', 'Hollowmere Well', "Fisherman's Watch", 'The Drowned Gull Inn']) assert.ok(all.includes(want), want);
  assert.equal(landmarkTitle(lib, 1, 'nowhere'), null);
  assert.equal(assignNames(lib, 1, 36, 36, [{ id: 'mystery', x: 1, z: 1 }])[0], null);
  assert.equal(nameText({ en: 'A', fr: 'B' }, 'fr'), 'B');
  assert.equal(nameText({ en: 'A', fr: 'B' }, 'de'), 'A');
  assert.equal(nameText(null, 'en'), '');
});

test('an exhausted kind numbers its names and stays unique', () => {
  const layout = Array.from({ length: 400 }, (_, i) => ({ id: 'well', x: i % 36, z: Math.floor(i / 36) % 36 }));
  const names = assignNames(lib, 5, 36, 36, layout).map((n) => n.en);
  assert.equal(new Set(names).size, 400);
  assert.ok(names.some((n) => n.endsWith(' 2')));
});

test('malformed data names the part', () => {
  assert.throws(() => parseNameLibrary({}), /missing kinds/);
  assert.throws(() => parseNameLibrary({ kinds: { well: { districts: {}, any: [], prefixes: [{ en: 'A', fr: 'A' }], forms: [{ en: '{p} Well', fr: 'Puits' }] } }, landmarks: {} }), /well form lacks/);
});
