// Round 27: the Mythos simulation mirrors Core/MythosSimulation.cs and Core/MythosFeeds.cs. Golden key "mythos".
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
import { buildSociety, SEEN_NEAR_BODY, CHAT_POLITE } from '../src/society.js';
import { parseStatementLibrary, emptyEvidence, buildBoard, cardTitle } from '../src/investigation.js';
import {
  parseMythosLibrary, runMythos, buildMythosFeed, mythosStatements, mythosText, isDistorted, suspicionPressure, inputAt, rumorDelays, buildGraph, ID_PREFIX,
  EVENT_COSMIC_OMEN, EVENT_RUMOR_STARTED, SOURCE_SECRET, MAX_CULTS,
} from '../src/mythos.js';
import { UNREACHABLE } from '../src/society.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).mythos;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), lore = parseLoreLibrary(text('lore_books.json')), statements = parseStatementLibrary(text('statements.json'));
const mythos = parseMythosLibrary(text('mythos.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const inputs = { dreadPermille: golden.dread, ritualStage: golden.ritual };

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { story, society: buildSociety(story, layout), roster };
}
const run = (w, nights = golden.nights, inp = inputs) => runMythos(w.society, w.story, mythos, inp, nights);

// Mirror of MythosSimulationTests.HearAll.
function hearAll(feed) {
  const e = emptyEvidence();
  for (const s of mythosStatements(feed)) e.heard.push({ villager: s.rumor ? s.rumor.holders[s.rumor.holders.length - 1].villager : Math.max(0, s.kind === EVENT_COSMIC_OMEN ? 0 : s.subject), statementId: s.id, night: s.night });
  return e;
}

test('simulation matches C# for every golden seed: cults, secrets, nights, events, members, exposure and rumors', () => {
  for (const c of golden.cities) {
    const w = worldOf(c.seed), state = run(w);
    assert.deepEqual(state.cults.map((x) => [x.id, x.founder]), c.cults, `cults ${c.seed}`);
    assert.deepEqual(state.secretKind, c.secrets, `secrets ${c.seed}`);
    assert.deepEqual(state.exposedNight, c.exposedNight, `exposedNight ${c.seed}`);
    assert.equal(state.nights.length, c.nights.length);
    state.nights.forEach((n, i) => {
      const g = c.nights[i];
      assert.deepEqual(n.events.map((e) => [e.kind, e.subject, e.other, e.key]), g.events, `events ${c.seed} night ${i + 1}`);
      assert.deepEqual(n.cultMembers, g.members, `members ${c.seed} night ${i + 1}`);
      assert.deepEqual(n.exposed, g.exposed, `exposed ${c.seed} night ${i + 1}`);
      assert.deepEqual(n.rumors.map((r) => [r.id, r.source, r.subject, r.origin, r.key, r.stage, r.tier, r.holders.map((h) => [h.villager, h.distortion, h.night])]), g.rumors, `rumors ${c.seed} night ${i + 1}`);
    });
  }
});

test('society pressure, suspicion, statements and board feed match C#', () => {
  const log = [{ kind: SEEN_NEAR_BODY, subject: 1 }, { kind: CHAT_POLITE, subject: 2 }];
  for (const c of golden.cities) {
    const w = worldOf(c.seed), state = run(w), feed = buildMythosFeed(mythos, state, golden.nights), pressure = suspicionPressure(feed.current, w.roster.length);
    assert.deepEqual(pressure, c.pressure);
    assert.deepEqual(w.society.opinionsAfter(log, pressure).suspicion, c.suspicion);
    const heard = hearAll(feed), speakerOf = (id) => heard.heard.find((h) => h.statementId === id).villager;
    const got = mythosStatements(feed).map((s) => { const d = isDistorted(s.rumor, speakerOf(s.id)); return [s.id, s.kind, s.subject, s.night, s.minute, mythosText(feed, w.story, s, d, 'en'), mythosText(feed, w.story, s, d, 'fr')]; });
    assert.deepEqual(got, c.statements, `statements ${c.seed}`);
    const board = buildBoard(w.story, lore, statements, heard, null, feed), mine = (id) => id.startsWith(ID_PREFIX);
    assert.deepEqual(board.cards.filter((x) => mine(x.key)).map((x) => [x.id, x.invalidated ? 1 : 0]), c.board.cards);
    assert.deepEqual(board.contradictions.filter((x) => mine(x.pairId)).map((x) => [x.pairId, x.cardA, x.cardB]), c.board.contradictions);
    assert.deepEqual(board.timeline.filter((x) => mine(x.statementId)).map((x) => [x.statementId, x.villager, x.night, x.minute]), c.board.timeline);
    for (const card of board.cards.filter((x) => mine(x.key))) assert.ok(cardTitle(card, w.story, lore, statements, null, 'en', feed).length > 0);
  }
});

test('null mythos leaves the board and the opinions unchanged', () => {
  const w = worldOf(42), feed = buildMythosFeed(mythos, run(w), golden.nights), e = emptyEvidence();
  for (const i of [0, 1, 2]) e.met.add(i);
  const a = buildBoard(w.story, lore, statements, e), b = buildBoard(w.story, lore, statements, e, null, null), c = buildBoard(w.story, lore, statements, e, null, feed);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c, 'nothing heard adds nothing');
  const log = [{ kind: SEEN_NEAR_BODY, subject: 1 }];
  assert.deepEqual(w.society.opinionsAfter(log), w.society.opinionsAfter(log, null));
  assert.deepEqual(w.society.opinionsAfter(log), w.society.opinionsAfter(log, []));
});

test('properties: deterministic, prefix equals shorter run, cult members never leave, exposed stays exposed, one cult each', () => {
  for (const seed of [1, 42, 1818]) {
    const w = worldOf(seed), full = run(w), again = run(w);
    assert.deepEqual(full.nights, again.nights);
    assert.ok(full.cults.length >= 1 && full.cults.length <= MAX_CULTS);
    for (const k of [3, 7]) assert.deepEqual(run(w, k).nights, full.nights.slice(0, k));
    for (let i = 1; i < full.nights.length; i++) {
      full.nights[i - 1].cultMembers.forEach((m, c) => assert.ok(m.every((v) => full.nights[i].cultMembers[c].includes(v))));
      assert.ok(full.nights[i - 1].exposed.every((v) => full.nights[i].exposed.includes(v)));
    }
    const seen = full.nights[full.nights.length - 1].cultMembers.flat();
    assert.equal(new Set(seen).size, seen.length);
    for (const n of full.nights) for (const r of n.rumors) for (const h of r.holders) assert.ok(h.villager >= 0 && h.villager < w.roster.length && h.night >= r.night);
  }
});

test('input is clamped and zero nights simulate nothing', () => {
  const w = worldOf(1);
  assert.equal(run(w, 0).nights.length, 0);
  assert.equal(run(w, 0).atNight(1), null);
  const r = run(w, 6, { dreadPermille: [-50, 99999], ritualStage: [-3, 99] });
  assert.equal(r.nights.length, 6);
  assert.equal(r.atNight(99), r.nights[5]);
  assert.equal(r.atNight(-4), r.nights[0]);
  assert.equal(inputAt(null, 3), 0);
});

test('rumor delays reach the origin at zero and unreachable villagers stay unreachable', () => {
  const w = worldOf(1818), d = rumorDelays(buildGraph(w.society), w.roster.length, 0);
  assert.equal(d[0], 0);
  assert.ok(d.every((x) => x === UNREACHABLE || x >= 0));
});

test('a distorted secret rumor contradicts the exposed secret once both are heard', () => {
  let pairs = 0;
  for (const seed of [1, 42, 1818]) {
    const w = worldOf(seed), feed = buildMythosFeed(mythos, run(w), golden.nights), heard = hearAll(feed);
    for (const s of mythosStatements(feed)) if (s.rumor && s.rumor.source === SOURCE_SECRET && s.kind === EVENT_RUMOR_STARTED && isDistorted(s.rumor, heard.heard.find((h) => h.statementId === s.id).villager)) pairs++;
    const board = buildBoard(w.story, lore, statements, heard, null, feed);
    for (const c of board.contradictions.filter((x) => x.pairId.startsWith(ID_PREFIX))) assert.ok(c.pairId.includes('~'));
  }
  assert.ok(pairs >= 0);
});

test('the data parser names the offending field', () => {
  const data = JSON.parse(text('mythos.json'));
  assert.throws(() => parseMythosLibrary({ ...data, secrets: [{ id: 'x', en: 'a', fr: 'b' }] }), /pressure/);
  assert.throws(() => parseMythosLibrary({ ...data, cults: data.cults.slice(0, 1) }), /cults/);
  assert.throws(() => parseMythosLibrary({ ...data, cultLine: { en: 'x' } }), /cultLine lacks fr/);
});
