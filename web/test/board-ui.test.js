// Round 26: investigation board panel (board-ui.js) with a fake DOM, as the lore-ui and homestead-ui tests do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import { parseLoreLibrary } from '../src/lore.js';
import { emptyEvidence, CARD_SUSPECT, CARD_EVENT } from '../src/investigation.js';
import { createBoardController, layoutBoard, neighbourCard, visibleCards, serializeBoardEvidence, parseBoardEvidence, BOARD_KEY, CARD_W } from '../src/board-ui.js';
import { parseSession } from '../src/session.js';
import { t, STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), lore = parseLoreLibrary(text('lore_books.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const SEED = 42;
const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, SEED), roster = generateRoster(SEED, layout);
const story = buildStory(lib, SEED, layout, roster, assignNames(nameLib, SEED, CITY_GRID, CITY_GRID, layout), generateCampaign(SEED, 5).villageName);
const keeperJournal = lore.books.find((b) => b.role === 'lighthouse_keeper').id;

function fakeNode(tag) {
  const n = { tag, attrs: {}, children: [], handlers: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, hidden: false, textContent: '', focused: 0 };
  n.setAttribute = (k, v) => { n.attrs[k] = String(v); }; n.getAttribute = (k) => n.attrs[k];
  n.append = (...c) => { n.children.push(...c); }; n.replaceChildren = () => { n.children = []; };
  n.addEventListener = (type, fn) => { (n.handlers[type] ||= []).push(fn); };
  n.focus = () => { env.active = n; };
  return n;
}
const env = { active: null };

function make({ reduced = false, read = [] } = {}) {
  const ids = ['boardPanel', 'boardCards', 'boardLines', 'boardTimeline', 'boardNote', 'boardLive', 'boardDetail', 'boardClose', 'boardToggle', 'boardWrap'];
  const els = Object.fromEntries(ids.map((id) => [id, fakeNode('div')]));
  els.boardPanel.hidden = true;
  const keyTarget = fakeNode('window'), booksRead = new Set(read), announced = [];
  const doc = { createElement: (tag) => fakeNode(tag), createElementNS: (ns, tag) => fakeNode(tag) };
  const board = createBoardController({
    $: (id) => els[id] || null, doc, tr: (k, p) => t(k, 'en', p), lang: 'en', state: { seed: SEED, nameLib }, story: () => story,
    lore: { library: () => lore, readIds: () => booksRead }, keyTarget, announce: (x) => announced.push(x), activeElement: () => env.active, reduceMotion: reduced,
  });
  board.setStatements(text('statements.json'));
  const press = (key, extra = {}) => { const e = { key, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra }; for (const h of keyTarget.handlers.keydown || []) h(e); return e; };
  return { board, els, press, booksRead, announced };
}
const cardIds = (els) => els.boardCards.children.map((c) => c.attrs['data-card']);

test('the board key is a punctuation key that no letter shortcut uses', () => {
  assert.equal(BOARD_KEY, ';');
  const app = readFileSync(join(here, '..', 'src', 'app.js'), 'utf8');
  assert.equal([...app.matchAll(/case ';'/g)].length, 0);
});

test('layout puts one column per card type and arrows move between cards', () => {
  const cards = [{ kind: 0, id: 'a' }, { kind: 0, id: 'b' }, { kind: 2, id: 'c' }, { kind: 4, id: 'd' }, { kind: 4, id: 'e' }, { kind: 4, id: 'f' }];
  const l = layoutBoard(cards);
  assert.deepEqual(l.order, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(l.slots.get('c').x - l.slots.get('a').x > CARD_W, true);
  assert.equal(neighbourCard(l, 'a', 'down'), 'b'); assert.equal(neighbourCard(l, 'b', 'down'), null); assert.equal(neighbourCard(l, 'a', 'up'), null);
  assert.equal(neighbourCard(l, 'b', 'right'), 'c'); assert.equal(neighbourCard(l, 'c', 'right'), 'd'); assert.equal(neighbourCard(l, 'e', 'left'), 'c'); assert.equal(neighbourCard(l, 'a', 'left'), null);
  assert.equal(neighbourCard(l, 'zz', 'down'), 'a');
});

test('only revealed cards and suspect or victim shells are shown', () => {
  const shown = visibleCards([{ kind: CARD_SUSPECT, revealed: false }, { kind: 2, revealed: false }, { kind: CARD_EVENT, revealed: true }]);
  assert.equal(shown.length, 2);
});

test('evidence save strings round trip and junk is dropped item by item', () => {
  const e = emptyEvidence(); e.met.add(3); e.met.add(1); e.clueIds.add('book@b39'); e.heard.push({ villager: 2, statementId: 'lie_not_me', night: 2 });
  const s = serializeBoardEvidence(e), back = parseBoardEvidence(s);
  assert.equal(s, 'bd1;1,3;book@b39;2:lie_not_me:2');
  assert.deepEqual([...back.met], [1, 3]); assert.deepEqual([...back.clueIds], ['book@b39']); assert.deepEqual(back.heard, e.heard);
  const bad = parseBoardEvidence('bd1;x,-1,999,4;<b>,ok;2:Bad Id:2,2:lie_not_me:99,1:lie_not_me:3,1:lie_not_me:4');
  assert.deepEqual([...bad.met], [4]); assert.deepEqual([...bad.clueIds], ['ok']); assert.deepEqual(bad.heard, [{ villager: 1, statementId: 'lie_not_me', night: 3 }]);
  for (const x of [null, 5, 'nope', 'bd1;1']) assert.equal(parseBoardEvidence(x).met.size, 0);
  assert.equal(parseSession({ seed: 1, sanity: 5, board: s }).board, s);
});

test('open shows cards, focuses the first, arrows move, Enter inspects, Escape closes and returns focus', () => {
  const { board, els, press } = make();
  const opener = fakeNode('button'); env.active = opener;
  assert.equal(board.open(), true);
  assert.equal(els.boardPanel.hidden, false);
  const ids = cardIds(els); assert.ok(ids.length > 0);
  assert.equal(env.active.attrs['data-card'], ids[0]);
  assert.equal(env.active.attrs.tabindex, '0');
  const down = press('ArrowDown'); assert.equal(down.stopped, true);
  assert.equal(env.active.attrs['data-card'], ids[1]);
  press('ArrowRight');
  assert.notEqual(env.active.attrs['data-card'], ids[1]);
  press('Enter');
  assert.ok(els.boardDetail.textContent.length > 0);
  const esc = press('Escape');
  assert.equal(esc.stopped, true); assert.equal(els.boardPanel.hidden, true); assert.equal(env.active, opener); assert.equal(board.isOpen(), false);
});

test('Tab is trapped inside the panel and the key closes an open board', () => {
  const { board, els, press } = make();
  board.open();
  const total = els.boardCards.children.length + 1;
  const seen = new Set();
  for (let i = 0; i < total; i++) { press('Tab'); seen.add(env.active); }
  assert.equal(seen.size, total);
  assert.equal(env.active, els.boardCards.children[0]); // wrapped around to the first
  press('Tab', { shiftKey: true }); assert.equal(env.active, els.boardClose);
  press(BOARD_KEY); assert.equal(board.isOpen(), false);
});

test('a new link is announced in the live region; a contradiction is announced when both statements are known', () => {
  const { board, els, press, booksRead, announced } = make();
  board.noteMet(0);
  assert.match(els.boardLive.textContent, /New string/);
  assert.ok(announced.length > 0);
  booksRead.add(keeperJournal); board.noteClue('book@b01'); // journal statement known
  assert.ok(!/Contradiction/.test(els.boardLive.textContent));
  board.noteChat(3, { lieStatementId: 'lie_was_asleep' }, 3);
  assert.match(els.boardLive.textContent, /Contradiction: /);
  const m = board.model();
  assert.ok(m.contradictions.some((c) => c.pairId === 'walker_on_cliff'));
  board.open();
  assert.ok(els.boardCards.children.some((c) => /board-contradiction/.test(c.attrs.class)));
  assert.ok(els.boardLines.children.some((c) => c.attrs.class === 'board-contradiction-string'));
  assert.ok(els.boardTimeline.children.length >= 2);
  press('Escape');
});

test('strings animate only when motion is allowed', () => {
  for (const reduced of [false, true]) {
    const { board, els } = make({ reduced });
    board.noteMet(0); board.noteMet(1); board.open();
    const strings = els.boardLines.children.filter((c) => /board-string/.test(c.attrs.class || ''));
    assert.ok(strings.length > 0);
    assert.equal(strings.every((c) => /board-draw/.test(c.attrs.class)), !reduced);
  }
  const css = readFileSync(join(here, '..', 'style.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.board-draw \{ animation: none/);
  assert.match(css, /html\.reduced \.board-draw/);
  assert.match(css, /html\.hc \.board-card/);
});

test('nothing is drawn while the board is closed, and a restored save is not announced again', () => {
  const { board, els } = make({ read: [keeperJournal] });
  board.noteMet(0); board.noteMet(1);
  assert.equal(els.boardCards.children.length, 0);
  assert.equal(els.boardLines.children.length, 0);
  const snap = board.snapshot();
  const again = make({ read: [keeperJournal] });
  again.board.restore(snap);
  assert.equal(again.els.boardLive.textContent, '');
  assert.deepEqual([...again.board.evidence().met], [0, 1]);
});

test('en and fr board strings exist, match placeholders and carry no em dash', () => {
  const keys = Object.keys(STRINGS.en).filter((k) => /^(board\.|btn\.board|touch\.board|tour\.board|keys\.board)/.test(k));
  assert.ok(keys.length >= 20);
  for (const k of keys) {
    assert.ok(STRINGS.fr[k], `fr ${k}`);
    assert.deepEqual((STRINGS.en[k].match(/\{\w+\}/g) || []).sort(), (STRINGS.fr[k].match(/\{\w+\}/g) || []).sort(), k);
    assert.ok(!STRINGS.en[k].includes('\u2014') && !STRINGS.fr[k].includes('\u2014'), k);
  }
});

test('the board note and the contradiction badge use singular and plural forms in en and fr', () => {
  assert.equal(t('board.contradictions.one', 'en', { n: 1 }), '1 contradiction');
  assert.equal(t('board.contradictions.other', 'en', { n: 2 }), '2 contradictions');
  assert.equal(t('board.strings.one', 'fr', { n: 1 }), '1 fil tendu');
  assert.equal(t('board.strings.other', 'fr', { n: 7 }), '7 fils tendus');
  assert.match(t('board.note', 'en', { s: '7 strings', c: '1 contradiction' }), /7 strings drawn, 1 contradiction\./);
  assert.ok(t('board.contradiction.label', 'fr') !== 'board.contradiction.label');
});
