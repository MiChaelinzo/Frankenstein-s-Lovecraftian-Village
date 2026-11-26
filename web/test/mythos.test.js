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
  parseMythosLibrary, runMythos, buildMythosFeed, mythosStatements, mythosText, isDistorted, suspicionPressure, mythosSchedule, inputAt, rumorDelays, buildGraph, ID_PREFIX,
  EVENT_COSMIC_OMEN, MAX_CULTS,
} from '../src/mythos.js';
import { UNREACHABLE } from '../src/society.js';
import { serializeBoardEvidence, parseBoardEvidence } from '../src/board-ui.js';
import { chronicleModel } from '../src/chronicle-ui.js';

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

test('every mythos contradiction pairs a rumor with the secret or omen it distorts', () => {
  for (const seed of [1, 42, 1818]) {
    const w = worldOf(seed), feed = buildMythosFeed(mythos, run(w), golden.nights), board = buildBoard(w.story, lore, statements, hearAll(feed), null, feed);
    for (const c of board.contradictions.filter((x) => x.pairId.startsWith(ID_PREFIX))) {
      const [rumor, truth] = c.pairId.split('~');
      assert.match(rumor, /^mythos:rumor:\d+$/);
      assert.match(truth, /^mythos:(secret|omen):\d+$/);
      assert.deepEqual([c.cardA, c.cardB], [`event:${rumor}`, `event:${truth}`]);
    }
  }
});

test('the data parser names the offending field', () => {
  const data = JSON.parse(text('mythos.json'));
  assert.throws(() => parseMythosLibrary({ ...data, secrets: [{ id: 'x', en: 'a', fr: 'b' }] }), /pressure/);
  assert.throws(() => parseMythosLibrary({ ...data, cults: data.cults.slice(0, 1) }), /cults/);
  assert.throws(() => parseMythosLibrary({ ...data, cultLine: { en: 'x' } }), /cultLine lacks fr/);
});

test('heard mythos ids survive the save string and bad ones are dropped', () => {
  const e = emptyEvidence();
  e.heard.push({ villager: 4, statementId: 'mythos:secret:4', night: 5 }, { villager: 2, statementId: 'c_fisher_home', night: 1 });
  const saved = serializeBoardEvidence(e);
  assert.match(saved, /mythos\.secret\.4/);
  assert.deepEqual(parseBoardEvidence(saved).heard, e.heard);
  assert.equal(parseBoardEvidence('bd1;;;1:mythos.bogus.4:2,1:mythos:secret:4:2,1:mythos.secret.99999:2').heard.length, 0);
});

test('the replay schedule matches Core MythosInputs.Schedule', () => {
  const sch = mythosSchedule(7);
  assert.deepEqual(sch.dreadPermille, [100, 200, 300, 400, 500, 600, 700]);
  assert.deepEqual(sch.ritualStage, [0, 1, 2, 3, 4, 5, 5]);
  assert.deepEqual(mythosSchedule(12).dreadPermille.slice(9), [1000, 1000, 1000]);
  assert.deepEqual(mythosSchedule(0), { dreadPermille: [], ritualStage: [] });
});

test('everything heard on night N exists unchanged when the village is replayed for night N+1', () => {
  for (const seed of [1, 42, 1818]) {
    const w = worldOf(seed);
    for (let n = 1; n < 11; n++) {
      const a = mythosStatements(buildMythosFeed(mythos, runMythos(w.society, w.story, mythos, mythosSchedule(n), n), n));
      const b = mythosStatements(buildMythosFeed(mythos, runMythos(w.society, w.story, mythos, mythosSchedule(n + 1), n + 1), n + 1));
      for (const m of a) {
        const same = b.find((x) => x.id === m.id), where = `seed ${seed} night ${n} ${m.id}`;
        assert.ok(same, where);
        assert.deepEqual([same.kind, same.subject, same.night, same.minute], [m.kind, m.subject, m.night, m.minute], where);
        if (!m.rumor) continue;
        assert.deepEqual([same.rumor.origin, same.rumor.key], [m.rumor.origin, m.rumor.key], where);
        for (const h of m.rumor.holders) assert.ok(same.rumor.holders.some((x) => x.villager === h.villager && x.distortion === h.distortion && x.night === h.night), where);
      }
    }
  }
});

test('the chronicle lists only the mythos statements the player heard', () => {
  const w = worldOf(1818), feed = buildMythosFeed(mythos, run(w), golden.nights), all = mythosStatements(feed);
  const ctx = { night: 12, nights: 12, dread: 0.5, books: [], readIds: new Set(), heard: new Map(), landmarkName: () => '', mythos: feed };
  assert.equal(chronicleModel(w.story, 'en', { ...ctx, mythosHeard: new Map() }).mythos.length, 0);
  assert.equal(chronicleModel(w.story, 'en', ctx).mythos.length, 0);
  const one = all[all.length - 1], m = chronicleModel(w.story, 'en', { ...ctx, mythosHeard: new Map([[one.id, 0]]) }).mythos;
  assert.equal(m.length, 1);
  assert.equal(m[0].id, one.id);
  assert.ok(m[0].text.length > 0);
});

// Round 28: night tick records (spec 154a), golden key mythos.cities[].ticks.
import { buildNightTicks, nightTickAt, EVENT_CULT_FOUNDED, EVENT_CULT_JOINED, EVENT_RUMOR_STARTED, EVENT_SECRET_EXPOSED } from '../src/mythos.js';

test('night ticks match the C# golden records', () => {
  for (const c of golden.cities) {
    const ticks = buildNightTicks(run(worldOf(c.seed)), mythos);
    assert.deepEqual(ticks.map((t) => [t.night, t.cultGrowth, t.rumorsChanged, t.rumorsAdded, t.missingPersons, t.newMissingPerson, t.newOmen, t.realityShift, t.reality, t.secretDiscovered ? 1 : 0]), c.ticks, `ticks ${c.seed}`);
  }
});

test('a night tick equals the counts of its MythosNight and replay equals incremental', () => {
  for (const seed of [1, 42, 1818]) {
    const w = worldOf(seed), state = run(w), ticks = buildNightTicks(state, mythos);
    state.nights.forEach((n, i) => {
      const t = ticks[i];
      assert.equal(t.cultGrowth, n.events.filter((e) => e.kind === EVENT_CULT_FOUNDED || e.kind === EVENT_CULT_JOINED).length);
      assert.equal(t.rumorsAdded, n.events.filter((e) => e.kind === EVENT_RUMOR_STARTED).length);
      assert.equal(t.secretDiscovered, n.events.some((e) => e.kind === EVENT_SECRET_EXPOSED));
      assert.equal(t.newOmen, (n.events.find((e) => e.kind === EVENT_COSMIC_OMEN) || { key: '' }).key);
    });
    assert.deepEqual(buildNightTicks(run(w, 5), mythos), ticks.slice(0, 5));
    assert.deepEqual(buildNightTicks(run(w), mythos), ticks);
  }
});

test('night ticks differ between seeds, clamp the night and name an unknown omen', () => {
  const sigs = new Set([1, 42, 1818].map((s) => JSON.stringify(buildNightTicks(run(worldOf(s)), mythos))));
  assert.ok(sigs.size > 1);
  const state = run(worldOf(42));
  assert.equal(nightTickAt(state, mythos, -4).night, 1);
  assert.equal(nightTickAt(state, mythos, 999).night, golden.nights);
  assert.equal(nightTickAt({ nights: [] }, mythos, 3), null);
  assert.deepEqual(buildNightTicks(null, mythos), []);
  assert.ok(mythos.omens.some((o) => o.id === 'black_tide'));
  assert.throws(() => buildNightTicks({ nights: [{ night: 1, events: [{ kind: EVENT_COSMIC_OMEN, key: 'nope' }], rumors: [] }] }, mythos), /newOmen.*nope/);
});

test('the chronicle model carries the night tick of the current night', () => {
  const w = worldOf(42), feed = buildMythosFeed(mythos, run(w), golden.nights);
  const ctx = { night: 12, nights: 12, dread: 0.5, books: [], readIds: new Set(), heard: new Map(), landmarkName: () => '', mythos: feed };
  assert.equal(chronicleModel(w.story, 'en', ctx).tick.night, 12);
  assert.equal(chronicleModel(w.story, 'en', { ...ctx, mythos: null }).tick, null);
});

test('nightTickAt equals the matching record of a full build, is cached and clamps', () => {
  const state = run(worldOf(42)), all = buildNightTicks(state, mythos);
  all.forEach((t, i) => assert.deepEqual(nightTickAt(state, mythos, i + 1), t));
  assert.equal(nightTickAt(state, mythos, 3), nightTickAt(state, mythos, 3));
  assert.equal(nightTickAt(state, mythos, -4).night, 1);
  assert.equal(nightTickAt(state, mythos, all.length + 9).night, all.length);
  assert.ok(all.every((t) => t.newMissingPerson === 0 || t.newMissingPerson === 1));
});

// Round 36 (spec 176 part 2): cult leadership evolution. Golden key "leadership".
import { LEADER_CAUSES, LEADER_MAX, LEADER_REPLACED } from '../src/mythos.js';
const leadership = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).leadership;

test('leader events and per night leader rows match the C# golden', () => {
  assert.deepEqual(leadership.causes, LEADER_CAUSES);
  for (const c of leadership.cities) {
    const state = run(worldOf(c.seed), leadership.nights, mythosSchedule(leadership.nights));
    assert.deepEqual(state.nights.flatMap((n) => n.leaderEvents).map((e) => [e.night, e.kind, e.cult, e.leader, e.successor, e.cause]), c.events, `events ${c.seed}`);
    assert.deepEqual(state.nights.map((n) => n.leaders.map((l) => [l.leader, l.influence, l.recruits, l.exposure, l.exposed ? 1 : 0, l.vessel ? 1 : 0])), c.leaders, `leaders ${c.seed}`);
  }
});

test('every leader event has a stated cause, values stay bounded and seeds differ', () => {
  const sigs = new Set(), kinds = new Set();
  for (const seed of [1, 42, 1818, -7, 123456789, 7916, 15835, 23754]) {
    const w = worldOf(seed), state = run(w, leadership.nights, mythosSchedule(leadership.nights));
    for (const night of state.nights) {
      for (const e of night.leaderEvents) {
        assert.ok(LEADER_CAUSES.includes(e.cause), `cause ${e.cause}`);
        if (e.kind === LEADER_REPLACED) assert.ok(e.successor >= 0 && e.successor !== e.leader);
        kinds.add(e.kind);
      }
      for (const l of night.leaders) {
        assert.ok(l.influence >= 0 && l.influence <= LEADER_MAX && l.exposure >= 0 && l.exposure <= LEADER_MAX && l.recruits >= 0);
        if (l.leader >= 0) assert.ok(night.cultMembers[l.cult].includes(l.leader));
      }
    }
    sigs.add(JSON.stringify(state.nights.map((n) => [n.leaders, n.leaderEvents])));
  }
  assert.ok(sigs.size > 4);
  assert.ok(kinds.size >= 3);
});

test('night ticks carry the leader events of each night', () => {
  const state = run(worldOf(1818), leadership.nights, mythosSchedule(leadership.nights)), ticks = buildNightTicks(state, mythos);
  ticks.forEach((t, i) => assert.deepEqual(t.leaderEvents, state.nights[i].leaderEvents));
  assert.ok(ticks.some((t) => t.leaderEvents.length > 0));
});

// Round 37 (spec 179): authored events from Data/content are listed on their night, for a heard matching omen only.
import { parseContentLibrary } from '../src/content.js';
import { nightTickAt as tickAt, omenId as omenKey } from '../src/mythos.js';

test('the checked-in authored event is reachable in the five-night campaign and requires its heard omen', () => {
  const campaignNights = 5, w = worldOf(1818), feed = buildMythosFeed(mythos, run(w, campaignNights), campaignNights);
  const night = 3, omen = tickAt(feed.state, feed.library, night).newOmen;
  assert.equal(omen, 'stars_wrong', 'seed 1818 reaches the authored omen during the campaign');
  const checkedIn = parseContentLibrary(null, null, text('content/events.json'));
  const base = { night: campaignNights, nights: campaignNights, dread: 0.5, books: [], readIds: new Set(), heard: new Map(), landmarkName: () => '', mythos: feed };
  const heard = new Map([[omenKey(night), 0]]);
  const list = (content, mythosHeard) => chronicleModel(w.story, 'en', { ...base, content, mythosHeard }).authored;
  assert.deepEqual(list(checkedIn, heard), [{ id: 'wrong_stars_night_3', night, text: 'On the third night the constellations turn toward the village, though the clouds do not move.' }]);
  assert.deepEqual(list(checkedIn, new Map()), [], 'not heard, not told');
  const wrong = JSON.stringify({ version: 1, events: [{ id: 'wrong', night, condition: 'black_tide', text: { en: 'Wrong.', fr: 'Faux.' } }] });
  assert.deepEqual(list(parseContentLibrary(null, null, wrong), heard), [], 'another omen');
  assert.deepEqual(chronicleModel(w.story, 'en', { ...base, mythosHeard: heard }).authored, [], 'no content, no events');
});
