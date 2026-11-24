// Round 31 (spec 164): the place model and the Abandoned Manor mirror Core/VillagePlaces.cs. Golden key "villagePlaces".
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
import { parseStatementLibrary, emptyEvidence, knowledgeSources, buildBoard, cardTitle, LINK_CLUE_SUBJECT } from '../src/investigation.js';
import { parseKnowledgeLibrary, benefitsAt } from '../src/knowledge.js';
import { countLeads } from '../src/outcomes.js';
import {
  parsePlaceLibrary, findPlace, placePlace, buildPlacement, checkPlacement, inBounds, overlappingLandmark, overlapsCity, roundTrip, enterPlace, leavePlace, EXIT_DOOR, EXIT_TUNNEL,
  triangles, withinBudget, placeDressing, placeParts, discoveryPoint, tunnelOpen, trailMissing, pointInBounds, TIERS, MANOR, FOREST,
  lanternPoints, huntingTrail, trailDressing, revealed, LANTERN_GAP, LANTERN_REACH, TRAIL_SPACING, MAX_TRAIL_LENGTH,
} from '../src/places.js';
import { footprintOf } from '../src/dressing.js';
import { tierSettings } from '../src/quality.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).villagePlaces;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parsePlaceLibrary(text('places.json')), manor = findPlace(lib, MANOR), forest = findPlace(lib, FOREST);
const seeds = Array.from({ length: 80 }, (_, i) => i - 20).concat([1818, 123456789, 2147483647, -2147483648]);

test('the web data copy is a byte copy of the package data', () => {
  assert.equal(text('places.json'), readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'places.json'), 'utf8'));
});

test('placements, entrance, door, hatch, tunnel exit and dressing match C# for every golden world', () => {
  for (const w of golden.worlds) {
    const placed = [];
    for (const e of w.places) {
      const p = placePlace(findPlace(lib, e.id), w.seed, w.grid, w.grid, placed);
      placed.push(p);
      assert.deepEqual([p.x, p.z], e.at); assert.deepEqual([p.faceX + 0, p.faceZ + 0], e.face);
      assert.deepEqual(p.entrance.map((v) => v + 0), e.entrance); assert.deepEqual(p.door.map((v) => v + 0), e.door);
      assert.deepEqual(p.hatch.map((v) => v + 0), e.hatch); assert.deepEqual(p.tunnelExit, e.tunnelExit);
      assert.deepEqual(findPlace(lib, e.id).discoveries.map((d) => discoveryPoint(p, d).map((v) => v + 0)), e.discoveries);
      assert.deepEqual(placeDressing(findPlace(lib, e.id), p).map((i) => [i.kind, i.x + 0, i.z + 0, i.yaw]), e.dressing);
      assert.deepEqual(lanternPoints(findPlace(lib, e.id), p).map((pt) => pt.map((v) => v + 0)), e.lanterns);
      assert.deepEqual(trailDressing(findPlace(lib, e.id), p, w.seed, w.grid, w.grid).map((i) => [i.kind, i.x + 0, i.z + 0, i.yaw]), e.trail);
    }
  }
});

test('triangle counts, the tunnel gate and the trails match C#', () => {
  for (const row of golden.tiers) {
    const d = findPlace(lib, row[0]);
    for (let t = 0; t < TIERS; t++) { assert.equal(triangles(d, t), row[1 + t * 2]); assert.equal(d.budget[t], row[2 + t * 2]); }
  }
  const know = parseKnowledgeLibrary(text('knowledge.json'));
  assert.deepEqual(golden.tunnel, [0, 1, 2, 3, 4, 5].map((t) => (tunnelOpen(manor, benefitsAt(know, t)) ? 1 : 0)));
  for (const [id, seed, n, who] of golden.trails) assert.equal(trailMissing(seed, id, n), who);
});

test('every placement is in bounds, clear of landmarks, the city and each other, has a way back and stays in budget', () => {
  for (const seed of seeds) for (const grid of [24, CITY_GRID]) {
    const standing = [];
    for (const data of lib.places) { const q = placePlace(data, seed, grid, grid, standing); assert.equal(checkPlacement(data, q, seed, grid, grid, standing), ''); standing.push(q); }
    const p = placePlace(manor, seed, grid, grid);
    assert.ok(inBounds(p, seed, grid, grid)); assert.equal(overlappingLandmark(p, seed, grid, grid), null); assert.ok(!overlapsCity(p, grid, grid));
    assert.ok(roundTrip(p)); assert.equal(checkPlacement(manor, p, seed, grid, grid), '');
    assert.deepEqual(leavePlace(p, EXIT_DOOR), p.entrance); assert.deepEqual(enterPlace(p), p.door);
    assert.ok(pointInBounds(seed, grid, grid, leavePlace(p, EXIT_TUNNEL)[0], leavePlace(p, EXIT_TUNNEL)[1]));
    for (const it of placeDressing(manor, p)) assert.ok(Math.hypot(it.x - p.x, it.z - p.z) <= p.radius);
  }
  for (let t = 0; t < TIERS; t++) assert.ok(withinBudget(manor, t));
});

test('placement is deterministic and varies with the seed', () => {
  const seen = new Set();
  for (const seed of seeds) { const a = placePlace(manor, seed, 24, 24), b = placePlace(manor, seed, 24, 24); assert.deepEqual(a, b); seen.add(`${a.x},${a.z}`); }
  assert.ok(seen.size > 10);
});

test('checkPlacement names each failure', () => {
  const seed = 42, grid = CITY_GRID, good = placePlace(manor, seed, grid, grid);
  assert.equal(checkPlacement(manor, buildPlacement(manor, seed, grid, grid, 500, 500, 0, 1), seed, grid, grid), 'out of bounds');
  assert.equal(checkPlacement(manor, buildPlacement(manor, seed, grid, grid, 60, 60, 0, 1), seed, grid, grid), 'overlaps the city');
  assert.equal(checkPlacement(manor, good, seed, grid, grid, [{ ...good, id: 'other' }]), 'overlaps place other');
  const noWay = { ...good, door: good.entrance };
  assert.equal(checkPlacement(manor, noWay, seed, grid, grid), 'no way back');
  assert.throws(() => placePlace({ ...manor, radius: 400 }, 1, 24, 24), /fits nowhere/);
});

test('procedural parts honour the tier and the budget', () => {
  const p = placePlace(manor, 1, 24, 24);
  const counts = [0, 1, 2].map((t) => placeParts(manor, p, t).length);
  assert.ok(counts[0] > 0 && counts[0] <= counts[1] && counts[1] <= counts[2]);
  for (const t of [0, 1, 2]) assert.equal(placeParts(manor, p, t).reduce((n, part) => n + (part.taper > 0 ? 10 : 8), 0), triangles(manor, t));
  assert.equal(tierSettings('low').detail, 0); assert.equal(tierSettings('high').detail, 2);
  for (const it of placeDressing(manor, p)) assert.ok(footprintOf(it.kind));
});

test('parse rejects malformed data naming the field', () => {
  const raw = text('places.json');
  assert.throws(() => parsePlaceLibrary('[]'), /root/);
  assert.throws(() => parsePlaceLibrary({ places: [] }), /must not be empty/);
  assert.throws(() => parsePlaceLibrary(raw.replace('"anchor": "abbey"', '"anchor": "nowhere"')), /anchor/);
  assert.throws(() => parsePlaceLibrary(raw.replace('"source": "ruins"', '"source": "bogus"')), /knowledge source/);
  assert.throws(() => parsePlaceLibrary(raw.replace('"fr": "Le manoir abandonne"', '"fr": ""')), /fr/);
  assert.throws(() => parsePlaceLibrary(raw.replace('"x": -3.1', '"x": -30.1')), /outside its room/);
  assert.throws(() => parsePlaceLibrary(raw.replace('place@manor_archives', 'manor_archives')), /clue/);
});

test('place clues earn ruins and cult_discovery, lead on one missing person, and reach the board and theory evidence', () => {
  const statements = parseStatementLibrary(text('statements.json')), lore = parseLoreLibrary(text('lore_books.json')), storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json'));
  const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
  const e = emptyEvidence(); e.clueIds.add('place@manor_archives'); e.clueIds.add('place@manor_cult_records'); e.clueIds.add('book@b39');
  assert.deepEqual(knowledgeSources(e, lib).sort(), ['cult_discovery', 'investigation', 'ruins']);
  assert.deepEqual(knowledgeSources(e), ['investigation', 'investigation', 'investigation']);
  for (const seed of [1, 42, 1818, -7]) {
    const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
    const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
    const target = trailMissing(seed, MANOR, story.missing.length), only = emptyEvidence(); only.clueIds.add('place@manor_cult_records');
    for (let k = 0; k < story.missing.length; k++) assert.equal(countLeads(story, lore, only, k, lib), countLeads(story, lore, only, k) + (k === target ? 1 : 0));
    for (const d of manor.discoveries) {
      const st = statements.statements.find((x) => x.id === d.statement);
      assert.ok(st && st.ref === d.clue);
      const ev = emptyEvidence(); ev.clueIds.add(d.clue);
      const board = buildBoard(story, lore, statements, ev, null, null, 0, lib), card = board.cards.find((c) => c.id === `clue:${d.clue}`);
      assert.ok(card && card.revealed);
      assert.equal(cardTitle(card, story, lore, statements, null, 'en', null, lib), d.title.en);
      assert.ok(board.links.some((l) => l.kind === LINK_CLUE_SUBJECT && l.from === card.id && l.to === `location:landmark:${manor.anchor}`));
      assert.ok(board.scores.some((s) => s.statementId === d.statement));
    }
  }
});

test('forest lantern markers lead back to the entrance and pass every discovery', () => {
  assert.equal(manor.lanterns.length, 0);
  assert.ok(forest.lanterns.length >= 4);
  for (const seed of seeds) {
    const grid = CITY_GRID, p = placePlace(forest, seed, grid, grid), lanterns = lanternPoints(forest, p);
    for (let i = 1; i < lanterns.length; i++) assert.ok(Math.hypot(lanterns[i][0] - lanterns[i - 1][0], lanterns[i][1] - lanterns[i - 1][1]) <= LANTERN_GAP + 1e-9);
    const last = lanterns[lanterns.length - 1];
    assert.ok(Math.hypot(last[0] - p.entrance[0], last[1] - p.entrance[1]) <= LANTERN_GAP + 1e-9);
    for (const d of forest.discoveries) { const at = discoveryPoint(p, d); assert.ok(lanterns.some((l) => Math.hypot(l[0] - at[0], l[1] - at[1]) <= LANTERN_REACH)); }
    for (const l of lanterns) assert.ok(pointInBounds(seed, grid, grid, l[0], l[1]));
    assert.deepEqual(leavePlace(p, EXIT_DOOR), p.entrance);
  }
  assert.equal(forest.parts.filter((x) => x.glow > 0 && x.id.startsWith('lantern_glass_')).length, forest.lanterns.length);
});

test('forest hunting trail runs from the lit paths to the entrance inside the world and the manor has none', () => {
  assert.deepEqual(huntingTrail(manor, placePlace(manor, 1, 24, 24), 1, 24, 24), []);
  let nonEmpty = 0;
  for (const seed of seeds) for (const grid of [24, CITY_GRID]) {
    const p = placePlace(forest, seed, grid, grid), pts = huntingTrail(forest, p, seed, grid, grid);
    assert.ok(pts.length <= Math.floor(MAX_TRAIL_LENGTH / TRAIL_SPACING) + 1);
    for (const pt of pts) assert.ok(pointInBounds(seed, grid, grid, pt[0], pt[1]));
    if (pts.length) { nonEmpty++; const l = pts[pts.length - 1]; assert.ok(Math.hypot(l[0] - p.entrance[0], l[1] - p.entrance[1]) <= TRAIL_SPACING * 1.5 + 1e-9); }
    assert.equal(trailDressing(forest, p, seed, grid, grid).length, pts.length);
  }
  assert.ok(nonEmpty > 0);
});

test('the hidden hollow is revealed only by the missing person trail clue; forest clues earn ritual, investigation and cult_discovery', () => {
  const hollow = forest.discoveries.find((d) => d.id === 'hidden_hollow');
  assert.equal(hollow.requires, 'place@forest_trail');
  assert.ok(!revealed(hollow, null) && !revealed(hollow, new Set(['place@forest_ritual_circle'])) && revealed(hollow, new Set(['place@forest_trail'])));
  assert.ok(forest.discoveries.filter((d) => d !== hollow).every((d) => revealed(d, null)));
  assert.throws(() => parsePlaceLibrary(text('places.json').replace('"requires": "place@forest_trail"', '"requires": "place@nowhere"')), /requires/);
  const e = emptyEvidence(); e.clueIds.add('place@forest_ritual_circle'); e.clueIds.add('place@forest_trail'); e.clueIds.add('place@forest_hollow');
  assert.deepEqual(knowledgeSources(e, lib).sort(), ['cult_discovery', 'investigation', 'ritual']);
  const statements = parseStatementLibrary(text('statements.json'));
  for (const d of forest.discoveries) { const st = statements.statements.find((x) => x.id === d.statement); assert.ok(st && st.ref === d.clue); }
});

test('the forest trail is a lead on exactly one missing person chosen by the seed', () => {
  const lore = parseLoreLibrary(text('lore_books.json')), storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json'));
  const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
  for (const seed of [1, 42, 1818, -7]) {
    const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
    const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
    const target = trailMissing(seed, FOREST, story.missing.length), only = emptyEvidence(); only.clueIds.add('place@forest_trail');
    for (let k = 0; k < story.missing.length; k++) assert.equal(countLeads(story, lore, only, k, lib), countLeads(story, lore, only, k) + (k === target ? 1 : 0));
  }
});
