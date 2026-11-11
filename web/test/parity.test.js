import { buildStory } from '../src/story.js';
import { creatureOrder, codexEntries, unlockedIds, CREATURE_COUNT, OMEN_TIERS } from '../src/codex.js';
import { ACHIEVEMENTS, JOURNAL_KINDS, earnedIds, journalCompletion, newStats } from '../src/achievements.js';
import { dailyKey, seedFromKey } from '../src/daily.js';
import { floorCountFor } from '../src/building.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SeededRandom, PrefabCatalog, generateLayout, SanityModel, StaticNarrationProvider,
  DreadEventTracker, eventToString, buildVillageReport, reportToMarkdown, reportToJson, generateCampaign, PrefabNameMatcher,
  generateRitual, Investigator, simulateInvestigator, describeInvestigatorHit, describeRitualStage, ritualProgress, describeRitualProgress,
  stableHash, detailLevel, clampFloor, floorVisible, doorOmen, suggestedCamera, allowedCamera,
} from '../src/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const catalogJson = JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8'));
const unityCatalogJson = JSON.parse(readFileSync(join(here, '..', '..', 'Assets', 'Data', 'village_catalog.json'), 'utf8'));
const catalog = new PrefabCatalog(catalogJson.entries);

test('web catalog copy is identical to the Unity catalog', () => {
  assert.deepEqual(catalogJson, unityCatalogJson);
});

test('SeededRandom matches C# xorshift32', () => {
  for (const g of golden.rng) {
    const r = new SeededRandom(g.seed);
    assert.deepEqual(g.uints.map(() => r.nextUInt()), g.uints, `uints seed ${g.seed}`);
    const r2 = new SeededRandom(g.seed);
    assert.deepEqual(g.next10.map(() => r2.next(10)), g.next10, `next10 seed ${g.seed}`);
  }
});

test('layouts match C# VillageLayoutGenerator exactly', () => {
  assert.ok(golden.layouts.length > 0);
  for (const g of golden.layouts) {
    const actual = generateLayout(catalog, g.width, g.depth, g.count, g.seed).map((p) => [p.id, p.x, p.z, p.sizeX, p.sizeZ]);
    assert.deepEqual(actual, g.pieces, `seed ${g.seed} ${g.width}x${g.depth}x${g.count}`);
  }
});

test('narration and dread match C#', () => {
  const s = new StaticNarrationProvider();
  for (const n of golden.narration) assert.equal(s.narrate(n.location, n.dread), n.text);
  for (const [sanity, dread] of golden.dread) assert.equal(SanityModel.dreadFor(sanity), dread);
});

test('dread event sequences match C#', () => {
  assert.ok(golden.events.length > 0);
  for (const g of golden.events) {
    const t = new DreadEventTracker();
    const actual = g.dreads.map((d) => t.update(typeof d === 'string' ? Number(d) : d).map(eventToString));
    assert.deepEqual(actual, g.events, `dreads ${g.dreads}`);
  }
});

test('village reports match C# byte for byte', () => {
  assert.ok(golden.reports.length > 0);
  for (const g of golden.reports) {
    const layout = generateLayout(catalog, 24, 24, 40, g.seed);
    const report = buildVillageReport(catalog, layout, 24, 24, g.seed, g.dread);
    assert.equal(reportToMarkdown(report), g.markdown, `markdown seed ${g.seed} dread ${g.dread}`);
    assert.equal(reportToJson(report), g.json, `json seed ${g.seed} dread ${g.dread}`);
  }
});

test('campaigns match C# CampaignGenerator exactly', () => {
  assert.ok(golden.campaigns.length > 0);
  for (const g of golden.campaigns) {
    const c = generateCampaign(g.seed, g.requested);
    assert.equal(c.villageName, g.villageName, `name seed ${g.seed}`);
    const actual = c.nights.map((n) => [n.number, n.title, n.dreadTargetPercent, n.sanityStart, n.sky, n.weather, n.rumor, n.lore]);
    assert.deepEqual(actual, g.nights, `seed ${g.seed} nights ${g.requested}`);
  }
});

test('story beats match C# StorySequencer exactly', () => {
  assert.ok(golden.stories.length > 0);
  for (const g of golden.stories) {
    const beats = buildStory(generateCampaign(g.seed, g.requested));
    const actual = beats.map((b) => [b.index, b.nightNumber, b.kind, b.text, b.dreadPercent, b.sky, b.weather, b.durationMs]);
    assert.deepEqual(actual, g.beats, `seed ${g.seed} nights ${g.requested}`);
  }
});

test('ritual chains match C# RitualChain exactly', () => {
  assert.ok(golden.rituals.length > 0);
  for (const g of golden.rituals) {
    const r = generateRitual(generateCampaign(g.seed, g.requested));
    assert.equal(r.name, g.name, `name seed ${g.seed}`);
    assert.deepEqual(r.stages.map(describeRitualStage), g.stages, `seed ${g.seed} nights ${g.requested}`);
    const prog = [];
    for (let night = 0; night <= r.stages.length + 1; night++) for (const d of [0, 25, 50, 80, 100]) prog.push(describeRitualProgress(ritualProgress(r, night, d)));
    assert.deepEqual(prog, g.progress, `progress seed ${g.seed} nights ${g.requested}`);
  }
});

test('prefab name matcher scores and resolves match C# exactly', () => {
  assert.ok(golden.matcher.scores.length > 0);
  for (const [id, name, expected] of golden.matcher.scores) {
    assert.equal(PrefabNameMatcher.score(id, name), expected, `${id} vs ${name}`);
  }
  const names = [...new Set(golden.matcher.scores.map((s) => s[1]))];
  assert.ok(golden.matcher.resolves.length > 0);
  for (const [id, hint, expected] of golden.matcher.resolves) {
    assert.equal(PrefabNameMatcher.resolve(id, hint, names), expected, `${id} hint ${hint}`);
  }
});

test('house_b never matches a single-letter variant suffix', () => {
  assert.equal(PrefabNameMatcher.score('house_b', 'CandleHolderWall00b Variant'), 0);
  assert.equal(PrefabNameMatcher.resolve('house_b', 'CoastalHouse00', ['Barrel00b Variant', 'CoastalHouse00']), 'CoastalHouse00');
  for (const e of catalogJson.entries) assert.ok(e.prefabHint && e.prefabHint.length > 0, e.id);
});

test('DLNK building policy matches C# DreadBuildingPolicy exactly', () => {
  const b = golden.buildings;
  assert.ok(b.hashes.length > 0 && b.detail.length > 0 && b.doors.length > 0 && b.cameras.length > 0 && b.floors.length > 0);
  for (const [text, h] of b.hashes) assert.equal(stableHash(text), h, `hash ${text}`);
  for (const [seed, id, dread, level] of b.detail) assert.equal(detailLevel(dread, id, seed), level, `detail ${seed} ${id} ${dread}`);
  for (const [seed, dread, door, list] of b.doors) {
    assert.deepEqual(list.map((_, a) => doorOmen(dread, 'church', door, a, seed)), list, `doors ${seed} ${dread} ${door}`);
  }
  for (const [dread, suggested, ...allowed] of b.cameras) {
    assert.equal(suggestedCamera(dread), suggested, `suggested ${dread}`);
    assert.deepEqual([0, 1, 2].map((m) => allowedCamera(m, dread)), allowed, `allowed ${dread}`);
  }
  for (const [count, active, clamped, vis] of b.floors) {
    assert.equal(clampFloor(active, count), clamped);
    assert.deepEqual(vis.map((_, f) => (floorVisible(f, active, count, true) ? 1 : 0)), vis);
  }
});

test('investigator routes and sanity hits match C# exactly', () => {
  assert.ok(golden.investigators.length > 0);
  for (const g of golden.investigators) {
    const layout = generateLayout(catalog, 24, 24, 40, g.seed);
    const inv = new Investigator(layout, 24, 24, g.seed);
    assert.equal(inv.route.length, g.length, `length seed ${g.seed}`);
    assert.deepEqual(inv.route.map((c) => [c.x, c.z]), g.cells, `route seed ${g.seed}`);
    assert.deepEqual(simulateInvestigator(layout, 24, 24, g.seed).map(describeInvestigatorHit), g.hits, `hits seed ${g.seed}`);
  }
});

test('sanity action costs and drain rate match C# SanityModel', () => {
  assert.deepEqual(
    [SanityModel.FOCUS_COST, SanityModel.WHISPER_COST, SanityModel.CHURCH_COST, SanityModel.CANDLE_RESTORE, SanityModel.DRAIN_PER_SECOND],
    golden.sanityRules);
});

test('floor counts match C# DreadBuildingPolicy.FloorCountFor', () => {
  assert.ok(golden.buildings.floorCounts.length > 0);
  for (const [id, roll, roll2, count] of golden.buildings.floorCounts) assert.equal(floorCountFor(id, roll, roll2), count, `${id} ${roll} ${roll2}`);
});

test('codex entries, creature order and unlocks match C# CodexModel', () => {
  assert.equal(CREATURE_COUNT, 9);
  assert.equal(OMEN_TIERS, 3);
  assert.ok(golden.codex.length > 0);
  for (const g of golden.codex) {
    const ritual = generateRitual(generateCampaign(g.seed, g.requested));
    assert.deepEqual(creatureOrder(ritual.seed), g.order, `order seed ${g.seed}`);
    const entries = codexEntries(ritual).map((e) => (e.kind === 'stage' ? [e.id, 'stage', e.creature, e.sigil, e.stageName, e.night] : [e.id, 'omen', e.tier]));
    assert.deepEqual(entries, g.entries, `entries seed ${g.seed} nights ${g.requested}`);
    for (const [stage, tier, ids] of g.unlocked) assert.deepEqual(unlockedIds(ritual, stage, tier), ids, `unlocked ${g.seed} ${stage} ${tier}`);
  }
});

test('achievement predicates and journal completion match C# AchievementRules', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => a.id), ['whisper', 'listener', 'doors', 'nights', 'journal', 'abyss', 'ritual', 'codexhalf', 'codexfull', 'wanderer']);
  assert.ok(golden.achievements.length > 0);
  for (const g of golden.achievements) {
    const [whispers, listens, doors, nightsVisited, nightsTotal, mask, tier, stage, stageCount, codexCount, codexTotal, done] = g.stats;
    const kinds = new Set(JOURNAL_KINDS.filter((_, k) => mask & (1 << k)));
    if (mask & 16) kinds.add('unrelated');
    const stats = { ...newStats(), whispers, listens, doors, nightsVisited, nightsTotal, kinds, tier, stage, stageCount, codexCount, codexTotal, investigatorDone: done === 1 };
    assert.deepEqual(earnedIds(stats), g.earned, JSON.stringify(g.stats));
    const c = journalCompletion(kinds);
    assert.deepEqual([c.seen, c.total, c.percent], g.completion, JSON.stringify(g.stats));
  }
});

test('daily key and seed match C# DailySeed', () => {
  assert.ok(golden.daily.keys.length > 0 && golden.daily.seeds.length > 0);
  for (const [iso, key] of golden.daily.keys) assert.equal(dailyKey(new Date(iso)), key, iso);
  for (const [key, seed] of golden.daily.seeds) assert.equal(seedFromKey(key), seed, JSON.stringify(key));
});
