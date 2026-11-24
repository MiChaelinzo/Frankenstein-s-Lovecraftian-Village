// Round 34 (spec 167): villager memory mirrors Core/VillagerMemoryModel.cs. Golden key "memory".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster, chat } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import { buildSociety, ALL_VILLAGERS, SEEN_NEAR_BODY, CHAT_POLITE } from '../src/society.js';
import {
  parseMemoryLibrary, createMemory, replayMemory, baselineEvents, eventFor, trustAfter, LINE_IDS, FLOOR_PERMILLE, OUTCOME_EFFECTS, KIND_COUNT,
  KIND_ACCUSED, KIND_ACCUSING, KIND_CLUE_FOUND, KIND_RUMOR_HEARD, KIND_RITUAL_WITNESSED, KIND_MYTHOS_EXPOSURE, KIND_CONVERSATION,
  MEMORY_NONE, MEMORY_FORGIVE, MEMORY_PARANOID, MEMORY_LOYAL, MEMORY_OBSESSED,
} from '../src/memory.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).memory;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), memLib = parseMemoryLibrary(text('memory.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const E = (night, villager, kind, weight, subject = -1) => ({ night, villager, kind, subject, weight });

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { story, roster, society: buildSociety(story, layout) };
}
// Mirror of VillagerMemoryTests.ScriptedLog.
const scriptedLog = (baseline) => [...baseline, E(2, 0, KIND_ACCUSED, 600), E(2, 1, KIND_CONVERSATION, 500), E(3, 1, KIND_ACCUSED, 300), E(3, 2, KIND_RITUAL_WITNESSED, 700), E(4, 3, KIND_CONVERSATION, 600),
  E(4, 3, KIND_CLUE_FOUND, 500), E(5, 4, KIND_MYTHOS_EXPOSURE, 800), E(5, 4, KIND_RUMOR_HEARD, 600), E(6, 5, KIND_ACCUSING, 800, 2)];

test('memory outcomes, effects, lines and axes match C# for every golden seed', () => {
  for (const c of golden.cities) {
    const w = worldOf(c.seed), baseline = baselineEvents(w.story), log = scriptedLog(baseline);
    assert.deepEqual(baseline.map((e) => [e.villager, e.subject, e.weight]), c.baseline);
    for (const n of c.nights) {
      const m = replayMemory(w.roster.length, log, n.night);
      const got = Array.from({ length: 6 }, (_, v) => { const ef = m.effectOf(v); return [m.outcomeOf(v), m.strengthOf(v), m.scoresOf(v).slice(1), [ef.trust, ef.fear, ef.faith, ef.loyalty, ef.obsession], m.lineFor(memLib, c.seed, v, n.night, 'en'), m.lineFor(memLib, c.seed, v, n.night, 'fr')]; });
      assert.deepEqual(got.map((g) => [g[0], g[1], [0, ...g[2]], g[3], g[4], g[5]]), n.people, `seed ${c.seed} night ${n.night}`);
    }
    const opinions = w.society.opinionsAfter([]), final = replayMemory(w.roster.length, log, 15), fx = final.effectsOfAll();
    const rows = (a) => Array.from({ length: 6 }, (_, v) => [a.fear[v], a.faith[v], a.loyalty[v], a.obsession[v]]);
    assert.deepEqual(rows(w.society.axesAfter(opinions, 15, 0.5, 2)), c.axesPlain);
    const adj = trustAfter(opinions, fx);
    assert.deepEqual(rows(w.society.axesAfter(adj, 15, 0.5, 2, fx)), c.axesMemory);
    assert.deepEqual(adj.trust.slice(0, 6), c.trustMemory);
  }
});

test('empty memory leaves society axes and trust identical', () => {
  const w = worldOf(42), o = w.society.opinionsAfter([]), none = createMemory(w.roster.length).effectsOfAll();
  assert.deepEqual(w.society.axesAfter(trustAfter(o, none), 7, 0.4, 2, none), w.society.axesAfter(o, 7, 0.4, 2));
  assert.deepEqual(w.society.axesAfter(o, 7, 0.4, 2, null), w.society.axesAfter(o, 7, 0.4, 2));
  assert.deepEqual(trustAfter(o, none).trust, o.trust);
});

test('replay equals incremental recording and memory never reaches zero', () => {
  const log = scriptedLog([]), inc = createMemory(8);
  for (const e of log) inc.record(e);
  inc.advanceTo(15);
  const rep = replayMemory(8, log, 15);
  for (let v = 0; v < 8; v++) for (let k = 0; k < KIND_COUNT; k++) { assert.equal(inc.intensityOf(v, k), rep.intensityOf(v, k)); assert.equal(inc.lastSubjectOf(v, k), rep.lastSubjectOf(v, k)); }
  for (let k = 0; k < KIND_COUNT; k++) {
    const m = createMemory(2);
    assert.ok(m.record(E(1, 1, k, 1)));
    assert.ok(m.intensityOf(1, k) >= FLOOR_PERMILLE);
    m.advanceTo(500);
    assert.equal(m.intensityOf(1, k), FLOOR_PERMILLE);
    assert.ok(m.hasAnyMemory(1) && !m.hasAnyMemory(0));
  }
});

test('invalid events are rejected and memory never runs backwards', () => {
  const m = createMemory(2);
  for (const bad of [E(1, -1, 0, 100), E(1, 2, 0, 100), E(1, 0, 99, 100), E(1, 0, 0, 0), null, E(1, 0.5, 0, 100)]) assert.equal(m.record(bad), false);
  assert.ok(!m.hasAnyMemory(0));
  m.advanceTo(5); m.advanceTo(2);
  assert.equal(m.night(), 5);
  assert.ok(m.record(E(1, 0, KIND_CONVERSATION, 400)));
  assert.equal(m.night(), 5);
});

test('an accused villager differs on day 2 and day 15, and kindness forgives', () => {
  const log = [E(2, 0, KIND_ACCUSED, 600)], early = replayMemory(3, log, 2), late = replayMemory(3, log, 15);
  assert.equal(early.outcomeOf(0), MEMORY_PARANOID);
  assert.equal(late.outcomeOf(0), MEMORY_NONE);
  assert.notDeepEqual(early.effectOf(0), late.effectOf(0));
  assert.notEqual(early.lineFor(memLib, 42, 0, 2, 'en'), late.lineFor(memLib, 42, 0, 15, 'en'));
  assert.notEqual(late.lineFor(memLib, 42, 0, 15, 'fr'), '');
  assert.equal(replayMemory(2, [E(1, 0, KIND_ACCUSED, 500), E(2, 0, KIND_CONVERSATION, 600), E(2, 0, KIND_CONVERSATION, 600)], 2).outcomeOf(0), MEMORY_FORGIVE);
  assert.equal(replayMemory(2, [E(1, 0, KIND_CONVERSATION, 700)], 1).outcomeOf(0), MEMORY_LOYAL);
  assert.equal(replayMemory(2, [E(1, 0, KIND_RITUAL_WITNESSED, 800)], 1).outcomeOf(0), MEMORY_OBSESSED);
  assert.equal(createMemory(2).lineFor(memLib, 1, 0, 3, 'en'), '');
});

test('action events and baseline are deterministic', () => {
  assert.deepEqual(eventFor(SEEN_NEAR_BODY, 3, 0), { night: 1, villager: 3, kind: KIND_ACCUSED, subject: -1, weight: 500 });
  assert.equal(eventFor(CHAT_POLITE, ALL_VILLAGERS, 2), null);
  assert.equal(eventFor(99, 0, 2), null);
  for (let a = 0; a < 8; a++) assert.ok(eventFor(a, 0, 2).weight >= 1);
  const w = worldOf(1);
  assert.deepEqual(baselineEvents(w.story), baselineEvents(w.story));
  assert.equal(baselineEvents(w.story).length, w.story.missing.filter((m) => m.kinIndex >= 0).length);
  assert.deepEqual(baselineEvents(null), []);
});

test('a paranoid memory withholds the chat hint and a loyal one strengthens it', () => {
  const w = worldOf(42), v = w.roster[0], plain = { tier: 0, corruption: 0, trust: 500, fear: 100, memory: 0 };
  const base = chat(42, v, 600, 0, 1, 0, 2, 1, 80, plain);
  assert.equal(base.memory, 0);
  if (!base.hintId) return;
  const p = chat(42, v, 600, 0, 1, 0, 2, 1, 80, { ...plain, memory: MEMORY_PARANOID });
  assert.ok(p.withheld && p.memoryWithheld && p.hintId === '' && !p.fearWithheld);
  const l = chat(42, v, 600, 0, 1, 0, 2, 1, 80, { ...plain, memory: MEMORY_LOYAL });
  assert.ok(l.strongHint && l.hintId === base.hintId && !l.withheld);
  assert.equal(chat(42, v, 600, 0, 1, 0, 2, 1, 80, { ...plain, memory: MEMORY_FORGIVE }).hintId, base.hintId);
});

test('data file parsing names the offending field and the shipped copy has no em dash', () => {
  const ok = JSON.parse(text('memory.json'));
  assert.equal(memLib.variants.length, LINE_IDS.length);
  assert.ok(!text('memory.json').includes('\u2014'));
  assert.throws(() => parseMemoryLibrary('{}'), /missing lines/);
  assert.throws(() => parseMemoryLibrary({ lines: [{ id: 'nope', variants: [] }] }), /unknown line id nope/);
  assert.throws(() => parseMemoryLibrary({ lines: [{ id: 'forgive', variants: [{ en: 'a', fr: 'b' }] }] }), /at least 2 variants/);
  assert.throws(() => parseMemoryLibrary({ lines: [{ id: 'forgive', variants: [{ en: 'a', fr: 'b' }, { en: 'a' }] }] }), /lacks fr text/);
  assert.throws(() => parseMemoryLibrary({ lines: ok.lines.slice(1) }), /lacks line id forgive/);
  assert.throws(() => parseMemoryLibrary({ lines: [ok.lines[0], ok.lines[0]] }), /duplicate line id/);
  assert.equal(OUTCOME_EFFECTS.length, 5);
});

import { serializeMemoryLog, parseMemoryLog, MAX_MEMORY_LOG } from '../src/society-ui.js';

test('the live memory log round trips and a damaged save loads item by item', () => {
  const log = [E(2, 0, KIND_ACCUSED, 600), E(3, 4, KIND_CONVERSATION, 300), E(9, 1, KIND_ACCUSING, 800, 12)];
  assert.deepEqual(parseMemoryLog(serializeMemoryLog(log)), log);
  assert.deepEqual(parseMemoryLog('mm1;2:0:0:600:-1,junk,0:1:1:5:-1,4:1:9:5:-1,4:1:1:0:-1,3:1:2:100:-1'), [E(2, 0, KIND_ACCUSED, 600), E(3, 1, KIND_CLUE_FOUND, 100)]);
  assert.deepEqual(parseMemoryLog('sc1;2:0:0:600:-1'), []);
  assert.deepEqual(parseMemoryLog(null), []);
  assert.equal(parseMemoryLog(`mm1;${'1:0:0:5:-1,'.repeat(MAX_MEMORY_LOG + 40)}`).length, MAX_MEMORY_LOG);
  assert.ok(serializeMemoryLog(Array.from({ length: MAX_MEMORY_LOG + 10 }, () => E(99, 99, 7, 1000, -1))).length <= 3500 + 4);
});
