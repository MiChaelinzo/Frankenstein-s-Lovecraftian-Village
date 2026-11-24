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

// Round 28: Evidence -> Confidence -> Belief -> Knowledge-Revealed Truth. Golden key "knowledgeInvestigation".
import { knowledgeSources, beliefScore, defaultConfidence, SOURCE_JOURNAL } from '../src/investigation.js';
import { parseKnowledgeLibrary, knowledgeFromSourceIds } from '../src/knowledge.js';
const synergyGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).knowledgeInvestigation;
function synergyEvidence() {
  const e = richEvidence();
  e.met.add(5); e.booksRead.add('j03'); e.heard.push({ villager: 5, statementId: 'c_innkeeper_bell', night: 2 });
  return e;
}

test('contradictions, resolutions and scores per knowledge tier match C#', () => {
  const know = parseKnowledgeLibrary(text('knowledge.json')), sources = knowledgeSources(synergyEvidence());
  assert.deepEqual(sources, synergyGolden.sources);
  const k = knowledgeFromSourceIds(know, sources);
  assert.equal(k.points, synergyGolden.points);
  assert.equal(k.tier, synergyGolden.tier);
  for (const c of synergyGolden.cities) {
    const story = storyOf(c.seed), stages = new Array(story.roster.length).fill(0);
    stages[1] = CORRUPTION_CORRUPTED;
    c.tiers.forEach((g, tier) => {
      const b = buildBoard(story, lore, statements, synergyEvidence(), stages, null, tier);
      assert.deepEqual(b.contradictions.map((x) => x.pairId), g.contradictions, `contradictions ${c.seed} ${tier}`);
      assert.deepEqual(b.resolutions.map((x) => x.pairId), g.resolutions, `resolutions ${c.seed} ${tier}`);
      assert.deepEqual(b.scores.map((x) => [x.statementId, x.confidence, x.belief]), g.scores, `scores ${c.seed} ${tier}`);
    });
  }
});

test('the Lucan example: contradiction below knowledge 4, resolved at 4 and 5, 78 and 91 percent', () => {
  const lucan = parseStatementLibrary({
    statements: [
      { id: 'w_abbey', source: 'chat', confidence: 78, place: 'abbey', night: 2, minute: 1200, en: 'Lucan was at the Abbey.', fr: "Lucan etait a l'abbaye." },
      { id: 'j_home', source: 'chat', confidence: 91, place: 'home', night: 3, minute: 1200, en: 'Lucan was at home.', fr: 'Lucan etait chez lui.' },
    ],
    contradictions: [{ id: 'lucan', a: 'w_abbey', b: 'j_home', needs: 'none', resolvesAt: 4, en: 'Two places at once.', fr: 'Deux lieux a la fois.' }],
  });
  const e = emptyEvidence();
  e.heard.push({ villager: 0, statementId: 'w_abbey', night: 2 }, { villager: 1, statementId: 'j_home', night: 3 });
  const story = storyOf(42);
  for (let tier = 0; tier <= 5; tier++) {
    const b = buildBoard(story, lore, lucan, e, null, null, tier);
    assert.equal(b.contradictions.length, tier < 4 ? 1 : 0, `tier ${tier}`);
    assert.equal(b.resolutions.length, tier < 4 ? 0 : 1, `tier ${tier}`);
  }
  assert.deepEqual(buildBoard(story, lore, lucan, e).scores.map((s) => s.confidence), [78, 91]);
});

test('knowledge 0 leaves the board as it was, belief drops for a corrupted speaker, bad resolution data is named', () => {
  const story = storyOf(42), e = synergyEvidence();
  assert.deepEqual(flat(buildBoard(story, lore, statements, e, null, null, 0)), flat(buildBoard(story, lore, statements, e)));
  assert.equal(beliefScore(78, true), 48); assert.equal(beliefScore(10, true), 0); assert.equal(beliefScore(91, false), 91);
  assert.equal(defaultConfidence(SOURCE_JOURNAL), 80);
  const base = { statements: [{ id: 'a', source: 'chat', night: 2, minute: 0, en: 'x', fr: 'x' }, { id: 'b', source: 'chat', night: 2, minute: 0, en: 'x', fr: 'x' }], contradictions: [{ id: 'c', a: 'a', b: 'b', needs: 'none', resolvesAt: 4, en: 'x', fr: 'x' }] };
  assert.throws(() => parseStatementLibrary(base), /different nights/);
  base.statements[0].night = 1; base.statements[0].confidence = 180;
  assert.throws(() => parseStatementLibrary(base), /confidence/);
});

test('journal ids count as knowledge sources only with ASCII digits (Core parity)', () => {
  const e = richEvidence();
  e.booksRead.clear(); e.clueIds.clear(); e.heard.length = 0;
  for (const id of ['j07', 'j\u0663\u0664', 'j0\uFF15']) e.booksRead.add(id);
  assert.deepEqual(knowledgeSources(e), ['journal']);
});

// Round 34 (spec 170): board reliabilities and aftermath contradictions per golden seed. Golden key "aftermath".
import { parseOutcomeLibrary, aftermathStatements, MAX_LEADS } from '../src/outcomes.js';
const aftermathGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).aftermath;
test('board reliabilities and aftermath contradictions match C# for every golden seed', () => {
  const outcomes = parseOutcomeLibrary(text('outcomes.json'));
  for (const c of aftermathGolden.cities) {
    const story = storyOf(c.seed), ev = synergyEvidence();
    for (let k = 0; k < story.missing.length; k++) {
      const m = story.missing[k];
      for (const b of lore.books.filter((x) => x.missing === m.id)) { ev.booksRead.add(b.id); ev.clueIds.add(`book@${b.id}`); }
      if (m.kinIndex >= 0) { ev.met.add(m.kinIndex); for (const [id, night] of [['lie_not_me', 1], ['lie_saw_nothing', 2]]) if (!ev.heard.some((y) => y.statementId === id)) ev.heard.push({ villager: m.kinIndex, statementId: id, night }); }
      if (m.witnessIndex >= 0) ev.met.add(m.witnessIndex);
    }
    const memory = new Array(story.roster.length).fill(0);
    memory[1] = 2; memory[2] = 4;
    const after = aftermathStatements(story, outcomes, c.forced, c.forced.map(() => MAX_LEADS), 8), b = buildBoard(story, lore, statements, ev, null, null, 0, null, memory, after);
    assert.deepEqual(b.reliabilities.map((r) => [r.statementId, r.reliability]), c.reliabilities, `reliabilities ${c.seed}`);
    assert.deepEqual(b.contradictions.map((x) => x.pairId), c.contradictions, `contradictions ${c.seed}`);
  }
});
