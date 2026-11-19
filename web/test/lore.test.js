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

// ---- lore-ui controller with a minimal fake DOM ----
import { createLoreController } from '../src/lore-ui.js';
import { t } from '../src/i18n.js';

function fakeDom() {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', innerHTML: '', focus() {}, addEventListener() {} }); return els.get(id); };
  return { $: el, els };
}
function controller(seed = 1818) {
  const dom = fakeDom(), calls = { effects: [], journal: [], announce: [] };
  const state = { seed, layout: generateLayout(catalog, 24, 24, 40, seed) };
  const c = createLoreController({
    $: dom.$, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, announce: (x) => calls.announce.push(x),
    applyEffect: (r, b) => calls.effects.push([r, b.id]), journal: (x) => calls.journal.push(x),
  });
  c.setLibrary(webText);
  return { c, dom, calls, state };
}

test('reading a book once: dialog, journal, effect, codex list; again changes nothing', () => {
  const { c, dom, calls } = controller();
  const first = c.scene()[0];
  assert.equal(first.read, false);
  const r = c.readById(first.id);
  assert.equal(r.firstRead, true);
  assert.equal(dom.$('loreDialog').hidden, false);
  assert.equal(dom.$('loreText').textContent, bookText(lib.find(first.id), 'en'));
  assert.equal(calls.effects.length, 1); assert.equal(calls.journal.length, 1);
  assert.match(dom.$('loreList').innerHTML, new RegExp(lib.find(first.id).titles.en.split(' ')[0]));
  assert.equal(c.close(), true);
  const again = c.readById(first.id);
  assert.equal(again.firstRead, false);
  assert.equal(calls.effects.length, 1); assert.equal(calls.journal.length, 1);
  assert.equal(c.scene()[0].read, true);
});

test('snapshot and restore keep only valid ids of this village, a new seed clears them', () => {
  const { c, state } = controller();
  c.readById(c.scene()[1].id);
  const snap = c.snapshot();
  assert.equal(snap.lore.length, 1);
  c.restore({ lore: [...snap.lore, 'junk'] });
  assert.deepEqual(c.snapshot().lore, snap.lore);
  state.seed = 5; state.layout = generateLayout(catalog, 24, 24, 40, 5);
  assert.deepEqual(c.snapshot().lore, []);
});

test('readNext cycles through unread books, then rereads', () => {
  const { c } = controller();
  const n = c.scene().length, seen = new Set();
  for (let i = 0; i < n; i++) { c.readNext(); c.close(); seen.add(c.snapshot().lore.length); }
  assert.equal(c.snapshot().lore.length, n);
  assert.equal(c.readNext().firstRead, false);
});

test('lore strings exist in en and fr', async () => {
  const { STRINGS } = await import('../src/i18n.js');
  for (const k of ['view3d.prompt.book', 'view3d.prompt.bookread', 'lore.progress', 'lore.locked', 'lore.journal', 'lore.reread', 'lore.locked.journal', 'keys.lore', ...LORE_PLACES.map((p) => `lore.place.${p}`)]) {
    assert.ok(STRINGS.en[k] && STRINGS.fr[k], k);
  }
});
