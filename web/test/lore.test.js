import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout } from '../src/core.js';
import { parseLoreLibrary, placeBooks, readBook, LORE_PLACES, bookText } from '../src/lore.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).lore;
const webText = readFileSync(join(root, 'web', 'data', 'lore_books.json'), 'utf8');
const lib = parseLoreLibrary(webText);
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);

test('drift: the web data file is a byte copy of the package data file', () => {
  assert.equal(webText, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'lore_books.json'), 'utf8'));
});

test('the library has 30 to 60 books in en and fr, every place and no em dash', () => {
  assert.ok(lib.books.length >= 30 && lib.books.length <= 60);
  for (const p of LORE_PLACES) assert.ok(lib.books.some((b) => b.place === p), p);
  for (const b of lib.books) for (const l of ['en', 'fr']) {
    assert.ok(b.titles[l].length > 0 && b.texts[l].length >= 80 && b.texts[l].length <= 400, `${b.id} ${l}`);
    assert.ok(!b.texts[l].includes('\u2014'));
  }
  assert.equal(bookText(lib.books[0], 'de'), lib.books[0].texts.en);
});

test('library digest matches C#', () => {
  assert.deepEqual(lib.books.map((b) => [b.id, b.place, b.sanity, b.clue ? 1 : 0]), golden.books);
});

test('placement matches C# for every golden village', () => {
  for (const v of golden.villages) {
    const layout = generateLayout(catalog, v.grid, v.grid, v.grid === 24 ? 40 : 20, v.seed);
    const placed = placeBooks(v.seed, v.grid, v.grid, layout, lib);
    assert.equal(placed.length, v.books.length, `count ${v.seed}/${v.grid}`);
    placed.forEach((p, i) => {
      const [id, place, x, z] = v.books[i];
      assert.equal(p.bookId, id); assert.equal(p.place, place);
      assert.ok(Math.abs(p.x - x) < 0.001 && Math.abs(p.z - z) < 0.001, `${v.seed}/${v.grid} ${id}`);
    });
    assert.deepEqual(placeBooks(v.seed, v.grid, v.grid, layout, lib), placed);
  }
});

test('malformed data is rejected with the book named', () => {
  assert.throws(() => parseLoreLibrary({ books: [{ id: 'x1', place: 'moon' }] }), /x1/);
  assert.throws(() => parseLoreLibrary({}), /books/);
});

test('reading applies effects once', () => {
  const clue = lib.books.find((b) => b.clue);
  assert.deepEqual(readBook(clue, false), { firstRead: true, sanityDelta: clue.sanity, yieldsClue: true, clueId: `book@${clue.id}` });
  assert.deepEqual(readBook(clue, true), { firstRead: false, sanityDelta: 0, yieldsClue: false, clueId: '' });
  assert.ok(lib.books.every((b) => b.sanity <= 0 && b.sanity >= -3));
});
