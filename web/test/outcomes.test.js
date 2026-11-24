// Round 30 (spec 163): missing person outcomes mirror Core/MissingOutcomes.cs. Golden key "outcomes".
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
import { buildSociety } from '../src/society.js';
import { parseStatementLibrary, emptyEvidence } from '../src/investigation.js';
import { parseMythosLibrary, runMythos } from '../src/mythos.js';
import {
  parseOutcomeLibrary, OUTCOME_IDS, OUTCOME_RECRUITED, OUTCOME_HIDDEN, MAX_LEADS, OUTCOME_AT_LEADS, TAKEN_AT_LEADS,
  outcomeWeights, resolveOutcome, countLeads, revealOutcome, isSurvivable, REVEAL_NOTHING, REVEAL_TAKEN, REVEAL_OUTCOME,
} from '../src/outcomes.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const gm = golden.mythos, go = golden.outcomes;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), lore = parseLoreLibrary(text('lore_books.json')), statements = parseStatementLibrary(text('statements.json'));
const mythos = parseMythosLibrary(text('mythos.json')), outcomes = parseOutcomeLibrary(text('outcomes.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const inputs = { dreadPermille: gm.dread, ritualStage: gm.ritual };

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  const society = buildSociety(story, layout);
  return { story, society, state: runMythos(society, story, mythos, inputs, gm.nights) };
}

// Mirror of MissingOutcomesTests.FullEvidence.
function fullEvidence(story, k) {
  const e = emptyEvidence(), m = story.missing[k];
  for (const b of lore.books.filter((x) => x.missing === m.id)) { e.booksRead.add(b.id); e.clueIds.add(`book@${b.id}`); }
  if (m.kinIndex >= 0) { e.met.add(m.kinIndex); e.heard.push({ villager: m.kinIndex, statementId: 'lie_not_me', night: 1 }, { villager: m.kinIndex, statementId: 'lie_saw_nothing', night: 2 }); }
  if (m.witnessIndex >= 0) e.met.add(m.witnessIndex);
  return e;
}

test('outcomes, weights, counted leads and reveals match C# for every golden seed', () => {
  for (const c of go.cities) {
    const w = worldOf(c.seed);
    assert.equal(c.missing.length, w.story.missing.length);
    c.missing.forEach(([id, perLead, w0, w6, counted, reveals], k) => {
      assert.equal(w.story.missing[k].id, id);
      assert.deepEqual(Array.from({ length: MAX_LEADS + 1 }, (_, l) => resolveOutcome(w.society, w.story, w.state, outcomes, k, l)), perLead, `outcomes ${c.seed} ${id}`);
      assert.deepEqual(outcomeWeights(w.society, w.story, w.state, outcomes, k, 0), w0);
      assert.deepEqual(outcomeWeights(w.society, w.story, w.state, outcomes, k, MAX_LEADS), w6);
      const n = countLeads(w.story, lore, fullEvidence(w.story, k), k);
      assert.equal(n, counted);
      const o = resolveOutcome(w.society, w.story, w.state, outcomes, k, n), got = [];
      for (const l of [0, 1, 4]) for (const lang of ['en', 'fr']) { const r = revealOutcome(w.story, outcomes, o, k, l, lang); got.push([r.level, r.text]); }
      assert.deepEqual(got, reveals, `reveals ${c.seed} ${id}`);
    });
  }
});

test('every missing person resolves to one known outcome and more leads never leave the survivable outcomes', () => {
  for (const seed of [1, 7, 42, 1818, 99]) {
    const w = worldOf(seed);
    for (let k = 0; k < w.story.missing.length; k++) {
      const c = outcomes.constraints.find((x) => x.missing === w.story.missing[k].id);
      for (let l = 0; l <= MAX_LEADS; l++) {
        const o = resolveOutcome(w.society, w.story, w.state, outcomes, k, l);
        assert.ok(o >= 0 && o < OUTCOME_IDS.length);
        if (c) assert.ok(!c.excludes.includes(o));
        if (isSurvivable(o) && l < MAX_LEADS) assert.ok(isSurvivable(resolveOutcome(w.society, w.story, w.state, outcomes, k, l + 1)));
      }
    }
  }
});

test('recruited needs a cult and hidden always has weight', () => {
  const w = worldOf(7), none = { cults: [], nights: [], atNight: () => null };
  for (let k = 0; k < w.story.missing.length; k++) {
    assert.equal(outcomeWeights(w.society, w.story, none, outcomes, k, 0)[OUTCOME_RECRUITED], 0);
    for (let l = 0; l <= MAX_LEADS; l++) assert.notEqual(resolveOutcome(w.society, w.story, none, outcomes, k, l), OUTCOME_RECRUITED);
    assert.ok(outcomeWeights(w.society, w.story, w.state, outcomes, k, 0)[OUTCOME_HIDDEN] > 0);
  }
});

test('reveal shows nothing at 0 leads, a taken line, then the epitaph', () => {
  const w = worldOf(42);
  for (const lang of ['en', 'fr']) {
    assert.deepEqual(revealOutcome(w.story, outcomes, 0, 0, 0, lang), { level: REVEAL_NOTHING, text: '' });
    const taken = revealOutcome(w.story, outcomes, 0, 0, TAKEN_AT_LEADS, lang);
    assert.equal(taken.level, REVEAL_TAKEN);
    for (let o = 0; o < OUTCOME_IDS.length; o++) {
      const r = revealOutcome(w.story, outcomes, o, 0, OUTCOME_AT_LEADS, lang);
      assert.equal(r.level, REVEAL_OUTCOME);
      assert.ok(!r.text.includes('{') && r.text !== taken.text);
    }
  }
  assert.equal(countLeads(w.story, lore, emptyEvidence(), 0), 0);
});

test('no authored statement names a missing person (audit behind the outcome constraints)', () => {
  for (const s of statements.statements) for (const m of lib.missing) for (const lang of ['en', 'fr']) assert.ok(!s.text[lang].includes(m.given[lang]), `${s.id} names ${m.id}`);
});

test('data file: copies match and parsing rejects excluding hidden', () => {
  assert.equal(readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'outcomes.json'), 'utf8'), text('outcomes.json'));
  const bad = JSON.parse(text('outcomes.json')); bad.constraints[0].excludes = ['hidden'];
  assert.throws(() => parseOutcomeLibrary(bad), /hidden/);
  assert.throws(() => parseOutcomeLibrary({ taken: { en: 'a', fr: 'b' }, outcomes: [], constraints: [] }), /lacks outcome/);
});
