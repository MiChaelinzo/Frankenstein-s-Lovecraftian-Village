// Round 30 (spec 162): theories mirror Core/TheoryModel.cs. Golden key "theories".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign, VIGIL_ENDING_IDS } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import { buildSociety } from '../src/society.js';
import { parseMythosLibrary, runMythos } from '../src/mythos.js';
import { parseOutcomeLibrary } from '../src/outcomes.js';
import { parseSession } from '../src/session.js';
import {
  parseTheoryLibrary, theoryInstances, replayTheories, legalChoices, gradeTheory, templateOf, epilogueVariant, epilogueText, verdictText, theoryKnowledge, theoryTrustLost,
  theoryQuestion, theoryOptionText, serializeTheoryLog, parseTheoryLog, countGrade, choice,
  CHOICE_THEORY, CHOICE_OPTION, CHOICE_EVIDENCE, CHOICE_CONCLUDE, GRADE_TRUE, GRADE_PARTIAL, GRADE_FALSE, KIND_VILLAGER, TIER_BARE, TIER_FIRM, TIER_DOUBTFUL, MAX_EVIDENCE,
  VARIANT_UNEXPLORED, VARIANT_MISLED, VARIANT_CLEAR, VARIANT_UNCERTAIN, KNOWLEDGE_FALSE, WRONG_VILLAGER_TRUST,
} from '../src/theory.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const gm = golden.mythos, gt = golden.theories;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json'));
const mythos = parseMythosLibrary(text('mythos.json')), outcomes = parseOutcomeLibrary(text('outcomes.json')), theories = parseTheoryLibrary(text('theories.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const inputs = { dreadPermille: gm.dread, ritualStage: gm.ritual };
const beliefs = new Map([[0, 90], [1, 40], [2, 70]]);

function worldOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  const society = buildSociety(story, layout), state = runMythos(society, story, mythos, inputs, gm.nights);
  return { story, society, state, instances: theoryInstances(society, story, state, theories, outcomes) };
}

test('instances, texts, a fixed log, conclusions, effects and epilogues match C# for every golden seed', () => {
  for (const c of gt.cities) {
    const w = worldOf(c.seed);
    assert.deepEqual(w.instances.map((x) => [x.kind, x.subject, x.truth]), c.instances);
    const texts = w.instances.map((inst) => {
      const parts = [];
      for (const lang of ['en', 'fr']) {
        parts.push(theoryQuestion(theories, w.society, w.story, inst, lang));
        for (let o = 0; o < templateOf(theories, inst.kind).options.length; o++) parts.push(theoryOptionText(theories, w.society, w.story, inst, o, lang));
      }
      return parts;
    });
    assert.deepEqual(texts, c.texts, `texts ${c.seed}`);
    const s = replayTheories(theories, w.instances, beliefs, c.log);
    assert.deepEqual(s.list.map((x) => [x.instance, x.option, x.grade, x.evidence, x.averageBelief, x.tier]), c.conclusions, `conclusions ${c.seed}`);
    assert.equal(s.rejected, c.rejected);
    assert.deepEqual([countGrade(s, GRADE_TRUE), countGrade(s, GRADE_PARTIAL), countGrade(s, GRADE_FALSE)], c.counts);
    assert.equal(theoryKnowledge(s), c.knowledge);
    assert.equal(theoryTrustLost(w.instances, s), c.trustLost);
    const v = epilogueVariant(s);
    assert.equal(v, c.variant);
    const epilogues = [];
    for (const ending of VIGIL_ENDING_IDS) for (const lang of ['en', 'fr']) epilogues.push(epilogueText(theories, ending, v, lang));
    assert.deepEqual(epilogues, c.epilogues);
    const verdicts = [];
    for (const x of s.list) for (const lang of ['en', 'fr']) verdicts.push(verdictText(theories, x.grade, x.tier, lang));
    assert.deepEqual(verdicts, c.verdicts);
    // Replaying the saved text gives the same state.
    assert.deepEqual(parseTheoryLog(serializeTheoryLog(c.log)), c.log);
  }
});

test('every template can reach True, Partial and False for every option as the truth, and every instance too', () => {
  for (const t of theories.templates) for (let truth = 0; truth < t.options.length; truth++) assert.equal(new Set(t.options.map((_, pick) => gradeTheory(t, truth, pick))).size, 3);
  for (const seed of [1, 42, 1818, 7, 99]) {
    const w = worldOf(seed);
    w.instances.forEach((inst, i) => {
      const t = templateOf(theories, inst.kind);
      const grades = new Set(t.options.map((_, pick) => replayTheories(theories, w.instances, beliefs, [choice(CHOICE_THEORY, i), choice(CHOICE_OPTION, pick), choice(CHOICE_CONCLUDE, 0)]).conclusions.get(i).grade));
      assert.equal(grades.size, 3);
    });
  }
});

test('illegal entries are rejected, evidence is capped and toggles, and tier changes wording not grade', () => {
  const w = worldOf(42), b = new Map([[0, 90], [1, 40], [2, 70], [3, 10]]);
  const noisy = replayTheories(theories, w.instances, b, [choice(CHOICE_CONCLUDE, 0), choice(CHOICE_OPTION, 0), -5, 99999, choice(CHOICE_THEORY, 0), choice(CHOICE_OPTION, 50), choice(CHOICE_EVIDENCE, 77), choice(CHOICE_CONCLUDE, 0)]);
  assert.equal(noisy.rejected, 7); assert.equal(noisy.list.length, 0);
  const log = [choice(CHOICE_THEORY, 0), ...[0, 1, 2, 3].map((e) => choice(CHOICE_EVIDENCE, e))];
  const capped = replayTheories(theories, w.instances, b, log);
  assert.equal(capped.rejected, 1); assert.equal(capped.currentEvidence.length, MAX_EVIDENCE);
  assert.equal(replayTheories(theories, w.instances, b, [...log, choice(CHOICE_EVIDENCE, 1)]).currentEvidence.length, 2);
  const truth = w.instances[0].truth;
  const conclude = (...ev) => replayTheories(theories, w.instances, b, [choice(CHOICE_THEORY, 0), choice(CHOICE_OPTION, truth), ...ev.map((e) => choice(CHOICE_EVIDENCE, e)), choice(CHOICE_CONCLUDE, 0)]).conclusions.get(0);
  assert.deepEqual([conclude().tier, conclude(0, 2).tier, conclude(1, 3).tier], [TIER_BARE, TIER_FIRM, TIER_DOUBTFUL]);
  assert.ok([conclude(), conclude(0, 2), conclude(1, 3)].every((c) => c.grade === GRADE_TRUE));
  assert.deepEqual(parseTheoryLog('th1;1,x'), []); assert.deepEqual(parseTheoryLog('nope'), []);
});

test('there is always a further choice, and a False villager conclusion is a small normal result', () => {
  const w = worldOf(42);
  let seedState = 5; const rnd = (n) => { seedState = (Math.imul(seedState, 1103515245) + 12345) & 0x7fffffff; return seedState % n; };
  const log = [];
  for (let step = 0; step < 300; step++) {
    const legal = legalChoices(theories, w.instances, beliefs, replayTheories(theories, w.instances, beliefs, log));
    assert.ok(legal.length > 0);
    log.push(legal[rnd(legal.length)]);
    assert.equal(replayTheories(theories, w.instances, beliefs, log).rejected, 0);
  }
  const vi = w.instances.findIndex((x) => x.kind === KIND_VILLAGER), t = templateOf(theories, KIND_VILLAGER);
  const wrong = t.options.findIndex((_, p) => gradeTheory(t, w.instances[vi].truth, p) === GRADE_FALSE);
  const s = replayTheories(theories, w.instances, beliefs, [choice(CHOICE_THEORY, vi), choice(CHOICE_OPTION, wrong), choice(CHOICE_CONCLUDE, 0)]);
  assert.equal(epilogueVariant(s), VARIANT_MISLED);
  assert.equal(theoryKnowledge(s), KNOWLEDGE_FALSE);
  assert.equal(theoryTrustLost(w.instances, s), WRONG_VILLAGER_TRUST);
  assert.equal(epilogueVariant(replayTheories(theories, w.instances, beliefs, [])), VARIANT_UNEXPLORED);
  for (const ending of VIGIL_ENDING_IDS) for (const v of [VARIANT_CLEAR, VARIANT_MISLED, VARIANT_UNCERTAIN]) for (const lang of ['en', 'fr']) assert.notEqual(epilogueText(theories, ending, v, lang), '');
  assert.equal(epilogueText(theories, 'dawn', VARIANT_UNEXPLORED, 'en'), '');
});

test('data parsing rejects bad files, the web copy matches the package copy, and the session keeps the log', () => {
  assert.equal(readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'theories.json'), 'utf8'), text('theories.json'));
  assert.throws(() => parseTheoryLibrary('[]'), /root/);
  const bad = JSON.parse(text('theories.json')); bad.epilogues[0].ending = 'nowhere';
  assert.throws(() => parseTheoryLibrary(bad), /unknown ending/);
  const bad2 = JSON.parse(text('theories.json')); bad2.templates[1].grading = 'nearby';
  assert.throws(() => parseTheoryLibrary(bad2), /grading/);
  for (const t of theories.templates) for (const o of t.options) assert.ok(!(o.text.en + o.text.fr).includes('\u2014'));
  assert.equal(parseSession({ seed: 1, sanity: 5, theories: 'th1;10000,20003,40000' }).theories, 'th1;10000,20003,40000');
  for (const badLog of ['<script>', 'th2;1', 'th1;a', 'th1;' + '1,'.repeat(1100), 5, null]) assert.equal(parseSession({ seed: 1, sanity: 5, theories: badLog }).theories, '');
  assert.equal(parseSession({ seed: 1, sanity: 5 }).theories, '');
});
