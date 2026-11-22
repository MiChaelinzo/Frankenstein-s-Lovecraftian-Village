// Round 26: the investigation board mirrors Core/InvestigationModel.cs. Golden key "investigation".
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
import { LIE_STATEMENT_IDS, CORRUPTION_CORRUPTED, CORRUPTION_UNEASY } from '../src/society.js';
import {
  parseStatementLibrary, emptyEvidence, buildBoard, orderTimeline, cardTitle, SOURCE_IDS, LINK_VILLAGER_HOME, LINK_VILLAGER_JOURNAL, suspectId, eventId, STATEMENT_LANGUAGES,
} from '../src/investigation.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).investigation;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), lore = parseLoreLibrary(text('lore_books.json')), statements = parseStatementLibrary(text('statements.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);

function storyOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  return buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
}

function richEvidence() {
  const e = emptyEvidence();
  for (const i of [0, 1, 2, 3, 4]) e.met.add(i);
  for (const b of ['j01', 'j02', 'j05', 'p01', 'b26', 'b39', 'b01']) e.booksRead.add(b);
  e.clueIds.add('book@b39'); e.clueIds.add('item@lantern');
  e.heard.push({ villager: 0, statementId: 'c_fisher_home', night: 1 }, { villager: 3, statementId: 'lie_was_asleep', night: 3 }, { villager: 1, statementId: 'c_priest_empty', night: 4 }, { villager: 2, statementId: 'lie_not_me', night: 2 });
  return e;
}

const flat = (board) => ({
  cards: board.cards.map((c) => [c.kind, c.id, c.revealed ? 1 : 0, c.invalidated ? 1 : 0]),
  links: board.links.map((l) => [l.kind, l.from, l.to, l.revealed ? 1 : 0]),
  contradictions: board.contradictions.map((c) => [c.pairId, c.cardA, c.cardB]),
  timeline: board.timeline.map((t) => [t.statementId, t.villager, t.night, t.minute]),
});

test('board cards, links, contradictions and timeline match C# for every golden seed and scenario', () => {
  for (const c of golden.cities) {
    const story = storyOf(c.seed), stages = new Array(story.roster.length).fill(0);
    stages[1] = CORRUPTION_CORRUPTED;
    [emptyEvidence(), richEvidence()].forEach((e, s) => {
      const g = c.scenarios[s], got = flat(buildBoard(story, lore, statements, e, stages));
      assert.deepEqual(got.cards, g.cards, `cards ${c.seed} ${s}`);
      assert.deepEqual(got.links, g.links, `links ${c.seed} ${s}`);
      assert.deepEqual(got.contradictions, g.contradictions, `contradictions ${c.seed} ${s}`);
      assert.deepEqual(got.timeline, g.timeline, `timeline ${c.seed} ${s}`);
    });
  }
});

test('nothing is revealed without evidence; evidence reveals its own links', () => {
  const story = storyOf(42), b0 = buildBoard(story, lore, statements, emptyEvidence());
  assert.ok(!b0.links.some((l) => l.revealed) && !b0.cards.some((c) => c.revealed));
  assert.equal(b0.contradictions.length + b0.timeline.length, 0);
  const e = emptyEvidence(); e.met.add(0); e.booksRead.add('j01');
  const b1 = buildBoard(story, lore, statements, e);
  assert.ok(b1.links.some((l) => l.kind === LINK_VILLAGER_HOME && l.from === suspectId(0) && l.revealed));
  assert.ok(!b1.links.some((l) => l.kind === LINK_VILLAGER_HOME && l.from === suspectId(1) && l.revealed));
  assert.equal(b1.links.filter((l) => l.kind === LINK_VILLAGER_JOURNAL && l.revealed).length, 1);
});

test('contradictions need both statements and come only from authored pairs; corruption pair needs the stage', () => {
  const story = storyOf(42), e = emptyEvidence(); e.booksRead.add('j01');
  assert.equal(buildBoard(story, lore, statements, e).contradictions.length, 0);
  e.heard.push({ villager: 0, statementId: 'c_fisher_home', night: 1 });
  const c = buildBoard(story, lore, statements, e).contradictions;
  assert.deepEqual(c.map((x) => [x.pairId, x.cardA, x.cardB]), [['fisher_night_out', eventId('j_fisher_out'), eventId('c_fisher_home')]]);
  const e2 = emptyEvidence(); e2.booksRead.add('j02'); e2.heard.push({ villager: 1, statementId: 'c_priest_empty', night: 4 });
  const stages = new Array(story.roster.length).fill(0);
  const has = () => buildBoard(story, lore, statements, e2, stages).contradictions.some((x) => x.pairId === 'priest_pews');
  assert.equal(has(), false);
  stages[1] = CORRUPTION_UNEASY; assert.equal(has(), false);
  stages[1] = CORRUPTION_CORRUPTED; assert.equal(has(), true);
});

test('timeline order: night, minute, id, villager, independent of input order', () => {
  const ev = [{ statementId: 'b', villager: 2, night: 2, minute: 100 }, { statementId: 'a', villager: 5, night: 2, minute: 100 }, { statementId: 'z', villager: 1, night: 1, minute: 900 },
    { statementId: 'a', villager: 3, night: 2, minute: 100 }, { statementId: 'c', villager: 0, night: 2, minute: 50 }];
  const out = orderTimeline(ev);
  assert.deepEqual(out.map((t) => t.statementId + t.villager), ['z1', 'c0', 'a3', 'a5', 'b2']);
  assert.deepEqual(orderTimeline(ev.slice().reverse()), out);
});

test('statement data: en and fr, lies authored, refs exist, no em dash, byte copy of the package file', () => {
  assert.ok(!text('statements.json').includes('\u2014'));
  assert.equal(text('statements.json'), readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'statements.json'), 'utf8'));
  for (const s of statements.statements) {
    for (const lang of STATEMENT_LANGUAGES) assert.ok(s.text[lang].length > 0);
    if (SOURCE_IDS[s.source] === 'lore') assert.ok(lore.find(s.ref), s.id);
  }
  for (const id of LIE_STATEMENT_IDS) {
    const s = statements.find(id);
    assert.ok(s && s.source === 0 && s.role === '', id);
    assert.ok(statements.contradictions.some((c) => c.a === id || c.b === id), id);
  }
  assert.throws(() => parseStatementLibrary({ statements: [{ id: 'x', source: 'dream' }], contradictions: [] }), /unknown source/);
});

test('every card has a title in both languages', () => {
  const story = storyOf(42), board = buildBoard(story, lore, statements, richEvidence());
  for (const c of board.cards) for (const lang of STATEMENT_LANGUAGES) assert.ok(cardTitle(c, story, lore, statements, nameLib, lang).length > 0, `${c.id} ${lang}`);
});
