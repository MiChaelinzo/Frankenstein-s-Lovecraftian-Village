// Round 36 (spec 181): rumor mutation parity with Core/RumorMutation.cs plus monotonicity, determinism, knowledge tier gating, en/fr text and the data copy check.
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
import { buildSociety, TIER_NEUTRAL } from '../src/society.js';
import { parseMythosLibrary, runMythos, buildMythosFeed, mythosChatLines, buildGraph } from '../src/mythos.js';
import { parseRumorMutationLibrary, rumorChainIndex, rumorStage, rumorMutationText, EXPOSURE_SCALE } from '../src/rumor-mutation.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).rumorMutation, mythosGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).mythos;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseRumorMutationLibrary(text('rumor-mutations.json'));
const SEEDS = [0, 1, 42, 1818, -7, 123456789, 2147483647, -2147483648], MAX_NIGHTS = 12;

test('every stage matches the Core golden data', () => {
  assert.equal(lib.trueTier, golden.trueTier);
  assert.equal(golden.stages.length, lib.chains.length);
  golden.stages.forEach(([id, ...rows], c) => {
    assert.equal(lib.chains[c].id, id);
    for (const [seed, rn, ex, stages] of rows) assert.deepEqual(Array.from({ length: MAX_NIGHTS + 1 }, (_, n) => rumorStage(lib, c, seed, rn, n, ex)), stages, `${id} seed ${seed} night ${rn} exposure ${ex}`);
  });
});

test('stage texts and the gated true account match the golden texts in en and fr', () => {
  golden.texts.forEach(([id, stages, tiers], c) => {
    const ch = lib.chains[c];
    assert.equal(ch.id, id);
    assert.deepEqual(ch.stages.map((s) => [s.en, s.fr]), stages);
    const rumor = { source: ch.source, night: 1 };
    assert.deepEqual(tiers.map((_, t) => [rumorMutationText(lib, rumor, ch.ref, 1, MAX_NIGHTS, EXPOSURE_SCALE, t, 'en'), rumorMutationText(lib, rumor, ch.ref, 1, MAX_NIGHTS, EXPOSURE_SCALE, t, 'fr')]), tiers);
  });
});

test('chat lines with mutation match Core at knowledge tiers 0 (en) and 4 (fr) and differ from the unmutated lines', () => {
  const storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), mythos = parseMythosLibrary(text('mythos.json'));
  const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
  const inputs = { dreadPermille: mythosGolden.dread, ritualStage: mythosGolden.ritual }, about = { available: true, behavior: 0, hintId: 'village', withheld: false };
  let mutated = 0;
  for (const city of golden.chat) {
    const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, city.seed), roster = generateRoster(city.seed, layout);
    const story = buildStory(storyLib, city.seed, layout, roster, assignNames(nameLib, city.seed, CITY_GRID, CITY_GRID, layout), generateCampaign(city.seed, 5).villageName);
    const society = buildSociety(story, layout), graph = buildGraph(society), n = mythosGolden.nights;
    const feed = buildMythosFeed(mythos, runMythos(society, story, mythos, inputs, n), n);
    const rows = [];
    for (let i = 0; i < society.roster.length; i++) {
      const low = mythosChatLines(society, feed, story, graph, i, TIER_NEUTRAL, n, about, 'en', lib, 0).map((l) => [l.id, l.text]);
      const high = mythosChatLines(society, feed, story, graph, i, TIER_NEUTRAL, n, about, 'fr', lib, 4).map((l) => [l.id, l.text]);
      const plain = mythosChatLines(society, feed, story, graph, i, TIER_NEUTRAL, n, about, 'en');
      assert.deepEqual(plain.map((l) => l.id), low.map((l) => l[0]));
      plain.forEach((l, k) => { if (l.text !== low[k][1]) mutated++; });
      if (low.length || high.length) rows.push([i, low, high]);
    }
    assert.deepEqual(rows, city.villagers, `seed ${city.seed}`);
  }
  assert.ok(mutated > 0);
});

test('stage is deterministic, bounded by the chain and never falls as nights pass or exposure rises', () => {
  for (let c = 0; c < lib.chains.length; c++) for (const seed of SEEDS) for (const rn of [1, 5]) for (const ex of [0, 500, 1000]) {
    let previous = 0;
    for (let n = 0; n <= MAX_NIGHTS; n++) {
      const stage = rumorStage(lib, c, seed, rn, n, ex);
      assert.equal(stage, rumorStage(lib, c, seed, rn, n, ex));
      assert.ok(stage >= previous && stage < lib.chains[c].stages.length);
      previous = stage;
    }
  }
  for (const seed of SEEDS) for (let n = 0; n <= MAX_NIGHTS; n++) {
    let previous = 0;
    for (let ex = 0; ex <= EXPOSURE_SCALE; ex += 100) { const stage = rumorStage(lib, 0, seed, 1, n, ex); assert.ok(stage >= previous); previous = stage; }
  }
  assert.equal(rumorStage(lib, 0, 1, 1, -5, -50), rumorStage(lib, 0, 1, 1, 0, 0));
});

test('twelve nights reach the beneath-the-sea stage under high exposure and not under none', () => {
  const c = lib.chains.findIndex((x) => x.id === 'lighthouse'), last = lib.chains[c].stages.length - 1;
  assert.equal(last, 3);
  assert.match(lib.chains[c].stages[last].en, /beneath the sea/);
  for (const seed of SEEDS) for (const rn of [1, 5]) {
    assert.equal(rumorStage(lib, c, seed, rn, MAX_NIGHTS, EXPOSURE_SCALE), last);
    assert.ok(rumorStage(lib, c, seed, rn, MAX_NIGHTS, 0) < last);
  }
});

test('the true account shows alongside only from the gate tier, in en and fr', () => {
  const ch = lib.chains.find((x) => x.id === 'lighthouse'), rumor = { source: ch.source, night: 1 };
  for (const lang of ['en', 'fr']) for (let tier = 0; tier <= 5; tier++) {
    const t = rumorMutationText(lib, rumor, ch.ref, 1, MAX_NIGHTS, EXPOSURE_SCALE, tier, lang);
    assert.ok(t.includes(ch.stages[ch.stages.length - 1][lang]));
    assert.equal(t.includes(ch.original[lang]), tier >= lib.trueTier);
    assert.equal(t.includes(lib.trueLabel[lang]), tier >= lib.trueTier);
  }
  assert.equal(rumorMutationText(lib, { source: 0, night: 1 }, 'debt', 1, 5, 500, 5, 'en'), '');
});

test('malformed data is rejected and the Data copy is byte identical', () => {
  const good = text('rumor-mutations.json');
  assert.throws(() => parseRumorMutationLibrary('[]'), /root/);
  assert.throws(() => parseRumorMutationLibrary(good.replace('"trueTier": 3', '"trueTier": 9')), /trueTier/);
  assert.throws(() => parseRumorMutationLibrary(good.replace('"source": "cosmic"', '"source": "nowhere"')), /unknown source/);
  assert.throws(() => parseRumorMutationLibrary({ trueTier: 3, trueLabel: { en: 'a', fr: 'b' }, chains: [] }), /chains/);
  assert.equal(good, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'rumor-mutations.json'), 'utf8'));
});

// Round 37 (spec 181): one source of the current rumor text, identical on board cards, the chronicle and the chat; the true account appears from knowledge tier 3.
test('board card, chronicle line and chat line tell the same rumor text and the true account starts at tier 3', async () => {
  const { cardTitle, CARD_EVENT } = await import('../src/investigation.js');
  const { chronicleModel } = await import('../src/chronicle-ui.js');
  const { mythosStatements, mythosCurrentText, mythosRumorRef } = await import('../src/mythos.js');
  const storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), mythos = parseMythosLibrary(text('mythos.json'));
  const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
  const inputs = { dreadPermille: mythosGolden.dread, ritualStage: mythosGolden.ritual }, about = { available: true, behavior: 0, hintId: 'village', withheld: false };
  let compared = 0, withTrue = 0;
  for (const seed of [1, 42, 1818]) {
    const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
    const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
    const society = buildSociety(story, layout), graph = buildGraph(society), n = mythosGolden.nights;
    const feed = buildMythosFeed(mythos, runMythos(society, story, mythos, inputs, n), n);
    for (const tier of [0, lib.trueTier - 1, lib.trueTier, 5]) {
      const telling = { library: lib, night: n, knowledgeTier: tier };
      const statements = mythosStatements(feed).filter((s) => s.rumor && rumorChainIndex(lib, s.rumor.source, mythosRumorRef(feed, s.rumor)) >= 0);
      const heard = new Map(statements.map((s) => [s.id, s.rumor.holders.length ? s.rumor.holders[0].villager : 0]));
      const model = chronicleModel(story, 'en', { night: n, nights: 5, dread: 0.5, books: [], readIds: new Set(), heard: new Map(), landmarkName: () => '', mythos: feed, mythosHeard: heard, knowledge: { tier, name: 'x', effects: [] }, evolution: { reputation: [], mutations: lib, beats: [] }, theories: [] });
      for (const s of statements) {
        const distorted = false, card = { kind: CARD_EVENT, id: `event:${s.id}`, key: s.id, invalidated: distorted };
        const board = cardTitle(card, story, null, null, null, 'en', feed, null, null, telling), current = mythosCurrentText(feed, story, s, distorted, 'en', telling);
        const speaker = heard.get(s.id), chat = society.roster[speaker] ? mythosChatLines(society, feed, story, graph, speaker, TIER_NEUTRAL, n, about, 'en', lib, tier).find((l) => l.id === s.id) : null;
        assert.equal(board, current);
        assert.equal(model.mythos.find((m) => m.id === s.id).text, mythosCurrentText(feed, story, s, model.mythos.find((m) => m.id === s.id).distorted, 'en', telling));
        if (chat && !model.mythos.find((m) => m.id === s.id).distorted) assert.equal(chat.text, board);
        assert.equal(board.includes(lib.trueLabel.en), tier >= lib.trueTier);
        compared += 1; if (board.includes(lib.trueLabel.en)) withTrue += 1;
      }
    }
  }
  assert.ok(compared > 0 && withTrue > 0);
});
