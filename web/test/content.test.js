// Round 37 (spec 179): authored content loader parity with Core/ContentLibrary.cs, errors that name file, item and field, and the byte copies of the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseContentLibrary, contentEventsFor, contentSignature } from '../src/content.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).content;
const web = (n) => readFileSync(join(root, 'web', 'data', 'content', n), 'utf8');
const lib = parseContentLibrary(web('quests.json'), web('rumors.json'), web('events.json'));

test('content matches the Core golden data', () => {
  assert.deepEqual(contentSignature(lib), golden.items);
  for (const [night, omen, ids] of golden.events) assert.equal(contentEventsFor(lib, night, omen).map((e) => e.id).join(','), ids, `night ${night} ${omen}`);
});

test('web/data/content files are byte copies of the package files', () => {
  for (const n of ['quests.json', 'rumors.json', 'events.json']) assert.equal(web(n), readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'content', n), 'utf8'));
});

test('absent files are empty lists and no library tells no events', () => {
  const none = parseContentLibrary(null, '', undefined);
  assert.deepEqual([none.quests, none.rumors, none.events], [[], [], []]);
  assert.deepEqual(contentEventsFor(null, 3, 'stars_wrong'), []);
  assert.deepEqual(contentEventsFor(lib, 3, ''), []);
});

test('malformed files throw naming the file, the item and the field', () => {
  const ev = (o) => JSON.stringify({ version: 1, events: [{ id: 'a', night: 3, condition: 'x', text: { en: 'a', fr: 'b' }, ...o }] });
  assert.throws(() => parseContentLibrary(null, null, JSON.stringify({ version: 2, events: [] })), /events\.json: field 'version': must be 1/);
  assert.throws(() => parseContentLibrary(null, null, ev({ night: 0 })), /event 'a': field 'night'/);
  assert.throws(() => parseContentLibrary(null, null, ev({ text: { en: 'a' } })), /event 'a': field 'text\.fr': missing or empty/);
  assert.throws(() => parseContentLibrary(null, null, JSON.stringify({ version: 1, events: [JSON.parse(ev({})).events[0], JSON.parse(ev({})).events[0]] })), /duplicate id/);
  assert.throws(() => parseContentLibrary(JSON.stringify({ version: 1, quests: [{ id: 'q', theory: ['a.b'], evidence: ['s'], conclusions: [{ theory: 'a.c', en: 'x', fr: 'y' }] }] }), null, null), /conclusions\.theory/);
  assert.throws(() => parseContentLibrary(null, JSON.stringify({ version: 1, rumors: [{ id: 'r', truth: 'yes', mutations: [{ en: 'x', fr: 'y' }] }] }), null), /rumor 'r': field 'truth'/);
  assert.throws(() => parseContentLibrary(null, JSON.stringify({ version: 1, rumors: [{ id: 'r', truth: true, mutations: [] }] }), null), /field 'mutations'/);
  for (const effects of [{ dread: 1.5 }, { dread: 101 }, { sanity: -101 }]) {
    assert.throws(() => parseContentLibrary(null, null, ev({ effects })), /event 'a': field 'effects\.(dread|sanity)': must be an integer within \+-100/);
  }
  assert.throws(() => parseContentLibrary(null, null, ev({ effects: { gold: 1 } })), /event 'a': field 'effects\.gold': unknown effect/);
});
