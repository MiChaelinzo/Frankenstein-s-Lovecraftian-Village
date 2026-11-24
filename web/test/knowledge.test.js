// Round 28: Forbidden Knowledge mirrors Core/KnowledgeModel.cs and the mythos chat moved into Core (MythosChat). Golden key "knowledge".
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
import { buildSociety, TIER_NEUTRAL, TIER_SUSPICIOUS, TIER_TRUSTING } from '../src/society.js';
import { parseMythosLibrary, runMythos, buildMythosFeed, mythosChatLines, mythosSchedule, buildGraph } from '../src/mythos.js';
import {
  parseKnowledgeLibrary, tierFor, createKnowledge, replayKnowledge, knowledgeFromSourceIds, benefitsAt, hasBenefit, knowledgeRumorText, realityDistortion, SOURCE_IDS, MAX_TIER,
} from '../src/knowledge.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const all = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const golden = all.knowledge, mythosGolden = all.mythos;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const know = parseKnowledgeLibrary(text('knowledge.json'));
const storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), mythos = parseMythosLibrary(text('mythos.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { story, society: buildSociety(story, layout) };
}

test('tiers, source points and benefits match the C# golden data', () => {
  assert.deepEqual(know.tiers.map((t) => [t.id, t.threshold, t.benefits]), golden.tiers);
  assert.deepEqual(know.sourcePoints, golden.sources);
  assert.equal(know.tiers.length, 6);
});

test('every rumor at every tier matches C# in both languages and the lighthouse example holds', () => {
  assert.deepEqual(know.rumors.map((r) => [r.id, [0, 1, 2, 3, 4, 5].map((t) => [knowledgeRumorText(know, r.id, t, 'en'), knowledgeRumorText(know, r.id, t, 'fr')])]), golden.rumors);
  assert.equal(knowledgeRumorText(know, 'lighthouse', 0, 'en'), 'The lighthouse is haunted.');
  assert.equal(knowledgeRumorText(know, 'lighthouse', 4, 'en'), 'The lighthouse beam is signaling something offshore.');
  assert.equal(knowledgeRumorText(know, 'lighthouse', 5, 'en'), 'The beam is synchronized with an entity beneath the bay.');
  assert.throws(() => knowledgeRumorText(know, 'nope', 0, 'en'), /rumors/);
});

test('reality distortion matches C#, is empty at tier 0 and bounded', () => {
  for (const [seed, nights] of golden.distortion) {
    nights.forEach((tiers, n) => tiers.forEach((expected, tier) => assert.deepEqual(realityDistortion(know, seed, n + 1, tier), expected, `seed ${seed} night ${n + 1} tier ${tier}`)));
  }
  for (const seed of [0, 1, -7, 2147483647, -2147483648]) for (let night = 1; night <= 12; night++) {
    assert.deepEqual(realityDistortion(know, seed, night, 0), []);
    for (let tier = 1; tier <= 7; tier++) {
      const a = realityDistortion(know, seed, night, tier);
      assert.ok(a.length >= 1 && a.length <= Math.min(tier, MAX_TIER));
      assert.equal(new Set(a).size, a.length);
    }
  }
});

test('thresholds, negative points, replay and unknown sources behave as in Core', () => {
  know.tiers.forEach((t, i) => { assert.equal(tierFor(know, t.threshold), i); if (i) assert.equal(tierFor(know, t.threshold - 1), i - 1); });
  assert.equal(tierFor(know, -50), 0);
  const k = createKnowledge(know);
  k.add(0, -999); k.add(1, 0);
  assert.equal(k.points, 0); assert.equal(k.tier, 0);
  const ids = ['journal', 'ritual', 'catacombs', 'cult_discovery', 'mythos_event', 'ruins', 'investigation', 'journal'], live = createKnowledge(know);
  ids.forEach((id, i) => { live.addSource(SOURCE_IDS.indexOf(id)); const r = knowledgeFromSourceIds(know, ids.slice(0, i + 1)); assert.equal(r.points, live.points); assert.equal(r.tier, live.tier); });
  assert.equal(replayKnowledge(know, live.log).points, live.points);
  assert.throws(() => knowledgeFromSourceIds(know, ['journal', 'tea_leaves']), /sources\[1\].*tea_leaves/);
  const bad = JSON.parse(text('knowledge.json')); bad.sources[4].id = 'sewers';
  assert.throws(() => parseKnowledgeLibrary(bad), /sources/);
  assert.throws(() => parseKnowledgeLibrary({ sources: [] }), /tiers/);
});

test('benefits accumulate and name every kind of unlock', () => {
  assert.deepEqual(benefitsAt(know, 0), []);
  for (let t = 1; t <= MAX_TIER; t++) assert.ok(benefitsAt(know, t).length > benefitsAt(know, t - 1).length);
  for (const kind of ['hidden_dialogue', 'secret_paths', 'hidden_cult_symbols', 'true_rumor_versions', 'dimensional_gateways', 'new_deduction']) assert.ok(benefitsAt(know, 99).some((b) => b.startsWith(kind)), kind);
  assert.ok(hasBenefit(know, 3, 'secret_paths')); assert.ok(!hasBenefit(know, 2, 'secret_paths'));
});

test('mythos chat lines match C# by trust tier and stay silent when the villager cannot tell', () => {
  const inputs = { dreadPermille: mythosGolden.dread, ritualStage: mythosGolden.ritual };
  const result = (hintId, extra = {}) => ({ available: true, behavior: 0, hintId, withheld: false, ...extra });
  for (const c of golden.chat) {
    const w = worldOf(c.seed), feed = buildMythosFeed(mythos, runMythos(w.society, w.story, mythos, inputs, mythosGolden.nights), mythosGolden.nights), graph = buildGraph(w.society);
    const rows = [];
    for (let i = 0; i < w.society.roster.length; i++) {
      const neutral = mythosChatLines(w.society, feed, w.story, graph, i, TIER_NEUTRAL, mythosGolden.nights, result('village'), 'en').map((l) => [l.id, l.text]);
      const trusting = mythosChatLines(w.society, feed, w.story, graph, i, TIER_TRUSTING, mythosGolden.nights, result('clues_seek'), 'fr').map((l) => [l.id, l.text]);
      if (neutral.length || trusting.length) rows.push([i, neutral, trusting]);
      assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, i, TIER_NEUTRAL, 12, result('clues_seek'), 'en'), []);
      assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, i, TIER_SUSPICIOUS, 12, result('village'), 'en'), []);
      assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, i, TIER_TRUSTING, 12, result('village', { withheld: true }), 'en'), []);
      assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, i, TIER_TRUSTING, 12, result('village', { behavior: 1 }), 'en'), []);
      assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, i, TIER_TRUSTING, 12, null, 'en'), []);
    }
    assert.deepEqual(rows, c.villagers, `chat ${c.seed}`);
    assert.deepEqual(mythosChatLines(w.society, feed, w.story, graph, -1, TIER_TRUSTING, 12, result('village'), 'en'), []);
    assert.deepEqual(mythosChatLines(null, feed, w.story, graph, 0, TIER_TRUSTING, 12, result('village'), 'en'), []);
  }
  assert.ok(golden.chat.some((c) => c.villagers.length > 0));
  assert.ok(typeof mythosSchedule === 'function');
});

test('en and fr knowledge texts are both authored for every entry', () => {
  for (const t of know.tiers) assert.ok(t.name.en && t.name.fr);
  for (const r of know.rumors) r.texts.forEach((x) => assert.ok(x.en && x.fr && x.en !== x.fr));
  for (const e of know.effects) assert.ok(e.text.en && e.text.fr && e.text.en !== e.text.fr);
});
