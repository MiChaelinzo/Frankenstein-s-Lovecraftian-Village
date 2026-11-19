// Round 24: the narrative layer mirrors Core/VillageStory.cs. Golden key "story".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES, DISTRICT_IDS } from '../src/districts.js';
import { LANDMARK_IDS } from '../src/landmarks.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { parseLoreLibrary, placeBooks } from '../src/lore.js';
import { generateRoster, chat } from '../src/villagers.js';
import { parseStoryLibrary, buildStory, render, stageOfNight, surnameOf, STAGES, TIERS } from '../src/village-story.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).story;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), lore = parseLoreLibrary(text('lore_books.json')), nameLib = parseNameLibrary(text('names.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);

function storyOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { layout, roster, story };
}

test('drift: the web data file is a byte copy of the package data file', () => {
  assert.equal(text('story.json'), readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'story.json'), 'utf8'));
});

test('the data is complete in both languages and has no em dash', () => {
  assert.equal(lib.families.length, 12);
  for (const id of DISTRICT_IDS) assert.ok(lib.districts[id], id);
  for (const id of LANDMARK_IDS) assert.ok(lib.legends.some((l) => l.id === id), id);
  assert.equal(lib.missing.length, 5);
  for (let b = 0; b < STAGES; b++) for (let t = 0; t < TIERS; t++) assert.ok(lib.rumors.filter((r) => r.band === b && r.tier === t).length >= 2, `${b}/${t}`);
  assert.ok(!text('story.json').includes('\u2014') && !text('lore_books.json').includes('\u2014'));
});

test('families, owners, missing persons, journals, gossip, rumors and placement match C# for every golden seed', () => {
  for (const c of golden.cities) {
    const { layout, roster, story } = storyOf(c.seed);
    assert.equal(generateCampaign(c.seed, 5).villageName, c.village);
    assert.deepEqual(generateCampaign(c.seed, 5).nights.map((n) => n.stage), c.stages, `stages ${c.seed}`);
    assert.deepEqual(story.families.map((f) => [f.surname, f.members, f.homePiece]), c.families, `families ${c.seed}`);
    assert.deepEqual(story.owners, c.owners, `owners ${c.seed}`);
    assert.deepEqual(story.missing.map((m) => [m.id, m.familyIndex, m.kinIndex, m.witnessIndex]), c.missing, `missing ${c.seed}`);
    const books = lore.books.filter((b) => b.role || (b.missing && story.hasMissing(b.missing)))
      .map((b) => [b.id, story.journalOwner(b), story.bookTitle(b, 'en'), story.bookText(b, 'en'), story.bookTitle(b, 'fr'), story.bookText(b, 'fr')]);
    assert.deepEqual(books, c.books, `books ${c.seed}`);
    const gossip = [];
    for (const v of roster) for (let night = 1; night <= 5; night++) {
      const stage = stageOfNight(night, 5), tier = (v.index + night) % TIERS, g = story.gossipFor(v, night, stage);
      gossip.push([v.index, night, tier, g.kind, g.subject, g.stage, g.variant, story.gossipText(g, v, night, tier, 'en'), story.gossipText(g, v, night, tier, 'fr')]);
    }
    assert.deepEqual(gossip, c.gossip, `gossip ${c.seed}`);
    const rumors = [];
    for (let night = 1; night <= 5; night++) for (let tier = 0; tier < TIERS; tier++) rumors.push([night, tier, story.rumorText(night, stageOfNight(night, 5), tier, 'en'), story.rumorText(night, stageOfNight(night, 5), tier, 'fr')]);
    assert.deepEqual(rumors, c.rumors, `rumors ${c.seed}`);
    const placed = placeBooks(c.seed, CITY_GRID, CITY_GRID, layout, lore, story).map((p) => [p.bookId, p.place, p.x, p.z]);
    assert.equal(placed.length, c.placed.length, `placed count ${c.seed}`);
    placed.forEach((p, i) => { assert.equal(p[0], c.placed[i][0]); assert.equal(p[1], c.placed[i][1]); assert.ok(Math.abs(p[2] - c.placed[i][2]) < 0.001 && Math.abs(p[3] - c.placed[i][3]) < 0.001, `${c.seed} ${p[0]}`); });
  }
});

test('without a story there are no journals or missing pages; with one every villager has a journal and every missing person a page', () => {
  const { layout, roster, story } = storyOf(1818);
  const plain = placeBooks(1818, CITY_GRID, CITY_GRID, layout, lore);
  assert.ok(!plain.some((p) => p.place === 'journal' || lore.find(p.bookId).missing));
  const told = placeBooks(1818, CITY_GRID, CITY_GRID, layout, lore, story);
  assert.equal(told.filter((p) => p.place === 'journal').length, roster.length);
  for (const m of story.missing) assert.ok(told.some((p) => lore.find(p.bookId).missing === m.id), m.id);
});

test('every villager lives in a named house owned by their family, with a neighbour who is someone else', () => {
  for (const seed of [1, 42, 1818, 7]) {
    const { roster, story } = storyOf(seed);
    for (const v of roster) {
      const fam = story.families.find((f) => f.members.includes(v.index));
      assert.equal(fam.surname, surnameOf(v.name));
      assert.equal(story.owners[fam.homePiece], fam.surnameIndex);
      assert.notEqual(story.neighbourOf(v.index), v.index);
      assert.ok(story.villagerVars(v, 'en').home.length > 0);
    }
    assert.equal(story.missing.length, 3);
  }
});

test('rumors change by tier and stage, render keeps unknown keys, and chat topic 3 is the village topic', () => {
  const { roster, story } = storyOf(1);
  assert.equal(new Set([0, 1, 2, 3].map((t) => story.rumorText(3, 1, t, 'en'))).size, 4);
  assert.equal(new Set([0, 1, 2].map((s) => story.rumorText(3, s, 2, 'en'))).size, 3);
  assert.equal(render('x {a} y {c} {', { a: '{b}', b: 'B' }), 'x {b} y {c} {');
  assert.equal(chat(1, roster[0], 600, 0, 1, 3, 0, 0, 80).hintId, 'village');
});

// ---- UI: chronicle model, village chat topic and the lore list ----
import { chronicleModel, createChronicleController } from '../src/chronicle-ui.js';
import { createVillagerController } from '../src/villager-ui.js';
import { createLoreController } from '../src/lore-ui.js';
import { SanityModel } from '../src/core.js';
import { t } from '../src/i18n.js';

function fakeDoc() {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, textContent: '', hidden: true, innerHTML: '', focus() {}, addEventListener() {}, setAttribute() {} }); return els.get(id); };
  return { $: el, els };
}

test('chronicle model counts what the player learned of each missing person and shows a rumor for the night', () => {
  const { story } = storyOf(1818), m0 = story.missing[0];
  const base = { night: 2, nights: 5, dread: 0.3, books: lore.books, readIds: new Set(), heard: new Map(), landmarkName: (id) => id };
  const none = chronicleModel(story, 'en', base);
  assert.deepEqual(none.missing.map((m) => m.told), [0, 0, 0]);
  assert.equal(none.families.length, story.families.length);
  assert.equal(none.histories.length, 5); assert.equal(none.legends.length, 10);
  assert.ok(none.rumor.length > 20);
  const page = lore.books.find((b) => b.missing === m0.id);
  const some = chronicleModel(story, 'fr', { ...base, readIds: new Set([page.id]), heard: new Map([[m0.id, 1]]) });
  assert.equal(some.missing[0].told, 2);
  assert.ok(some.missing[0].line.length > 20 && !some.missing[0].line.includes('{'));
  assert.notEqual(chronicleModel(story, 'en', { ...base, dread: 0.95 }).rumor, none.rumor);
});

test('the village chat topic speaks the Core story line and reports a missing person to the chronicle', () => {
  const seed = 1818, { layout, roster, story } = storyOf(seed), { $, els } = fakeDoc(), heard = [];
  const state = { seed, layout, sanity: new SanityModel(90), campaign: generateCampaign(seed), night: 1, villagers: [] };
  layout.forEach((p, i) => { p.names = story.names[i]; });
  const ctl = createVillagerController({
    $, tr: (k, v) => t(k, 'en', v), lang: 'en', state, gridW: CITY_GRID, gridD: CITY_GRID, tickNow: () => 300, chatNeeds: () => ({ cluesLeft: 2, lampsLeft: 1, sanity: 80 }), announce: () => {},
    applyEffect: () => {}, story: () => story, onGossip: (id, stage) => heard.push([id, stage]),
  });
  ctl.refresh();
  const v = roster.find((r) => state.villagers.find((p) => p.index === r.index && !p.gone) && story.missing.some((m) => m.kinIndex === r.index || m.witnessIndex === r.index));
  assert.ok(v, 'somebody present knows a missing person');
  let result;
  for (let i = 0; i < 4; i++) result = ctl.chatWith(v.index);
  assert.equal(result.hintId, 'village');
  const g = story.gossipFor(v, 2, stageOfNight(2, 5));
  assert.equal(els.get('villagerLine').textContent, story.gossipText(g, v, 2, 3, 'en'), 'tier 3 at dread 0.9');
  assert.equal(g.kind, 2);
  assert.deepEqual(heard, [[story.missing[g.subject].id, g.stage]]);
  assert.match(els.get('villagerRole').textContent, /, of /);
});

test('the lore list shows journals as locked at the owner house until read', () => {
  const seed = 1818, { layout, story } = storyOf(seed), { $, els } = fakeDoc(), read = [];
  const state = { seed, layout, sanity: new SanityModel(50), campaign: generateCampaign(seed), night: 0 };
  const c = createLoreController({ $, tr: (k, v) => t(k, 'en', v), lang: 'en', state, gridW: CITY_GRID, gridD: CITY_GRID, announce() {}, applyEffect: (r, b) => read.push(b.id), journal() {}, story: () => story });
  c.setLibrary(lore.books ? JSON.parse(text('lore_books.json')) : null);
  const journals = c.scene().filter((s) => /^j\d\d$/.test(s.id));
  assert.equal(journals.length, 7);
  assert.match(els.get('loreList').innerHTML, /A journal waits at /);
  c.readById(journals[0].id);
  assert.match(els.get('loreText').textContent, /\S/);
  assert.ok(!els.get('loreText').textContent.includes('{'));
  assert.deepEqual(read, [journals[0].id]);
  assert.ok(c.readIds().has(journals[0].id));
});

test('the chronicle panel renders sections and escapes text; without a story it shows the empty note', () => {
  const { story } = storyOf(1818), { $, els } = fakeDoc();
  const state = { seed: 1818, layout: [] };
  let current = story;
  const c = createChronicleController({ $, tr: (k, v) => t(k, 'en', v), lang: 'en', state, story: () => current, lore: { library: () => lore, readIds: () => new Set() }, night: () => 1, nights: () => 5, dread: () => 0.1, landmarkName: (id) => id });
  c.setPanel(true);
  const html = els.get('chronicleBody').innerHTML;
  for (const needle of ['data-missing=', 'data-family=', 'data-district="harbour"', 'data-legend="cliffs"', 'chronicle-rumor']) assert.ok(html.includes(needle), needle);
  current = null; c.render();
  assert.match(els.get('chronicleBody').innerHTML, /still blank/);
});
