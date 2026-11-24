// Round 34 (spec 170): missing person aftermath and source reliability mirror Core. Golden key "aftermath".
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
import { buildSociety } from '../src/society.js';
import { baseReliability, reliabilityScore, SOURCE_CHAT, SOURCE_JOURNAL, SOURCE_LORE, SOURCE_CLUE } from '../src/investigation.js';
import { parseMythosLibrary, runMythos } from '../src/mythos.js';
import { parseOutcomeLibrary, OUTCOME_RECRUITED, OUTCOME_DISPLACED, OUTCOME_DEAD, MAX_LEADS, OUTCOME_AT_LEADS, resolveNight, sightingOn, recruitedByNight, aftermathStatements, SIGHTING_NIGHTS } from '../src/outcomes.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')), ga = golden.aftermath, gm = golden.mythos;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json'));
const mythos = parseMythosLibrary(text('mythos.json')), outcomes = parseOutcomeLibrary(text('outcomes.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { story, society: buildSociety(story, layout), roster };
}
test('reliability table matches C# over source, corruption, memory and displaced contradiction', () => {
  const got = [];
  for (const source of [SOURCE_CHAT, SOURCE_JOURNAL, SOURCE_LORE, SOURCE_CLUE]) for (const corrupted of [false, true]) for (let memory = 0; memory <= 4; memory++) for (const displaced of [false, true]) got.push(reliabilityScore(baseReliability(source), corrupted, memory, displaced));
  assert.deepEqual(got, ga.table);
});

test('aftermath nights, sightings, recruits, mythos with recruits and statements match C#', () => {
  for (const c of ga.cities) {
    const { story, society } = worldOf(c.seed), forced = c.forced;
    assert.deepEqual(recruitedByNight(story.seed, forced, gm.nights), c.recruited, `recruited ${c.seed}`);
    const inputs = { dreadPermille: gm.dread, ritualStage: gm.ritual, recruitedByNight: c.recruited }, state = runMythos(society, story, mythos, inputs, gm.nights);
    assert.deepEqual(state.nights.map((n) => [...n.cultMembers.map((m) => m.length), n.events.length]), c.mythos, `mythos ${c.seed}`);
    assert.deepEqual(story.missing.map((_, k) => [resolveNight(story.seed, k), Array.from({ length: 8 }, (_, i) => (sightingOn(story.seed, k, i + 1) ? '1' : '0')).join('')]), c.resolve, `resolve ${c.seed}`);
    const got = aftermathStatements(story, outcomes, forced, forced.map(() => MAX_LEADS), 8).map((a) => [a.id, a.kind, a.night, a.minute, a.reliability, a.sighting ? 1 : 0, a.text.en, a.text.fr]);
    assert.deepEqual(got, c.statements, `statements ${c.seed}`);
  }
});

test('mythos without recruits is unchanged by an empty or absent recruitedByNight', () => {
  const { story, society } = worldOf(1), plain = { dreadPermille: gm.dread, ritualStage: gm.ritual };
  const sig = (s) => JSON.stringify(s.nights.map((n) => [n.cultMembers, n.events.map((e) => [e.kind, e.subject, e.other])]));
  assert.equal(sig(runMythos(society, story, mythos, { ...plain, recruitedByNight: new Array(gm.nights).fill(0) }, gm.nights)), sig(runMythos(society, story, mythos, plain, gm.nights)));
});

test('aftermath waits for its night and for four leads, and only recruited or displaced leave any', () => {
  const { story } = worldOf(1), forced = story.missing.map((_, k) => [OUTCOME_RECRUITED, OUTCOME_DISPLACED, OUTCOME_DEAD][k % 3]), full = forced.map(() => MAX_LEADS);
  assert.equal(aftermathStatements(story, outcomes, forced, full, 1).length, 0);
  assert.equal(aftermathStatements(story, outcomes, forced, forced.map(() => OUTCOME_AT_LEADS - 1), 12).length, 0);
  assert.equal(aftermathStatements(story, outcomes, forced, full, 12).length, forced.filter((o) => o !== OUTCOME_DEAD).length);
  for (let n = 1; n <= 20; n++) if (n < resolveNight(story.seed, 0) || n >= resolveNight(story.seed, 0) + SIGHTING_NIGHTS) assert.equal(sightingOn(story.seed, 0, n), false);
});
