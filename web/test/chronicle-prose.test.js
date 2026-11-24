// Round 34 (spec 168): chronicle prose parity with Core/ChronicleProse.cs plus determinism, seed variety, no slots left open and "only what was learned".
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
import { parseMythosLibrary, runMythos, buildMythosFeed, mythosStatements } from '../src/mythos.js';
import { parseOutcomeLibrary, resolveOutcome } from '../src/outcomes.js';
import { baselineEvents, KIND_ACCUSED, KIND_CONVERSATION, KIND_RITUAL_WITNESSED, KIND_CLUE_FOUND, KIND_MYTHOS_EXPOSURE, KIND_RUMOR_HEARD, KIND_ACCUSING } from '../src/memory.js';
import { parseChronicleLibrary, CHRONICLE_LINE_IDS, CHRONICLE_MIN_VARIANTS, nightSentences, chronicleProse, summaryProse } from '../src/chronicle-prose.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const full = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const golden = full.chronicleProse, nights = full.mythos.nights;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), mythos = parseMythosLibrary(text('mythos.json'));
const outcomeLib = parseOutcomeLibrary(text('outcomes.json')), prose = parseChronicleLibrary(text('chronicle.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const inputs = { dreadPermille: full.mythos.dread, ritualStage: full.mythos.ritual };
const E = (night, villager, kind, weight, subject = -1) => ({ night, villager, kind, subject, weight });
// Mirror of VillagerMemoryTests.ScriptedLog.
const scriptedLog = (baseline) => [...baseline, E(2, 0, KIND_ACCUSED, 600), E(2, 1, KIND_CONVERSATION, 500), E(3, 1, KIND_ACCUSED, 300), E(3, 2, KIND_RITUAL_WITNESSED, 700), E(4, 3, KIND_CONVERSATION, 600),
  E(4, 3, KIND_CLUE_FOUND, 500), E(5, 4, KIND_MYTHOS_EXPOSURE, 800), E(5, 4, KIND_RUMOR_HEARD, 600), E(6, 5, KIND_ACCUSING, 800, 2)];

/** Mirror of ChronicleProseTests.Context. */
function context(seed, scenario) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  const society = buildSociety(story, layout), state = runMythos(society, story, mythos, inputs, nights);
  const ctx = { prose, story, mythos, state, nights: 5, outcomes: story.missing.map((_, k) => resolveOutcome(society, story, state, outcomeLib, k, 0)), leads: story.missing.map(() => 0), heard: new Set(), met: new Set(), memoryLog: null };
  if (scenario === 0) return ctx;
  for (const s of mythosStatements(buildMythosFeed(mythos, state, nights))) ctx.heard.add(s.id);
  ctx.leads = ctx.leads.map((_, k) => [0, 1, 4][k % 3]);
  for (let v = 0; v < 6; v++) ctx.met.add(v);
  ctx.memoryLog = scriptedLog(baselineEvents(story));
  return ctx;
}
const whole = (ctx, lang) => `${chronicleProse(ctx, nights, lang).join('\n')}\n${summaryProse(ctx, nights, lang)}`;

test('chronicle prose matches C# for every golden seed, scenario and language', () => {
  for (const c of golden.cities) {
    for (const sc of c.scenarios) {
      const ctx = context(c.seed, sc.scenario);
      for (const lang of ['en', 'fr']) {
        assert.deepEqual(chronicleProse(ctx, nights, lang), sc[lang], `seed ${c.seed} scenario ${sc.scenario} ${lang}`);
        assert.equal(summaryProse(ctx, nights, lang), sc[`summary_${lang}`], `summary seed ${c.seed} scenario ${sc.scenario} ${lang}`);
      }
    }
  }
});

test('same seed same text, different seeds differ', () => {
  const seeds = [0, 1, 42, 1818, -7, 123456789, 2147483647, -2147483648];
  for (const lang of ['en', 'fr']) {
    assert.equal(new Set(seeds.map((s) => whole(context(s, 1), lang))).size, seeds.length);
    for (const s of seeds.slice(0, 3)) assert.equal(whole(context(s, 1), lang), whole(context(s, 1), lang));
  }
});

test('no open slots or em dashes, and every night has text', () => {
  for (const seed of [1, 42, -7]) for (const scenario of [0, 1]) for (const lang of ['en', 'fr']) {
    const ctx = context(seed, scenario), list = chronicleProse(ctx, 99, lang);
    assert.equal(list.length, nights);
    for (const t of [...list, summaryProse(ctx, 99, lang)]) { assert.ok(t.trim().length > 0); assert.ok(!/[{}\u2014]/.test(t), t); }
  }
});

test('library variants use only known slots and the data file is complete', () => {
  const known = new Set(['village', 'who', 'missing', 'home', 'cult', 'count']);
  assert.equal(prose.variants.length, CHRONICLE_LINE_IDS.length);
  for (const group of prose.variants) {
    assert.ok(group.length >= CHRONICLE_MIN_VARIANTS);
    for (const v of group) for (const lang of ['en', 'fr']) for (const m of v[lang].matchAll(/\{([^}]*)\}/g)) assert.ok(known.has(m[1]), v[lang]);
  }
});

test('nothing learned reveals no villager or missing name', () => {
  for (const seed of [1, 42, 1818]) {
    const ctx = context(seed, 0), all = whole(ctx, 'en');
    for (const v of ctx.story.roster) assert.ok(!all.includes(v.name));
    for (const m of ctx.story.missing) assert.ok(!all.includes(ctx.story.missingVars(m, 'en').missing));
  }
});

test('unsimulated nights are empty and parse errors name the field', () => {
  const ctx = context(42, 1);
  assert.deepEqual(nightSentences(ctx, 0, 'en'), []);
  assert.deepEqual(nightSentences(ctx, nights + 1, 'en'), []);
  assert.throws(() => parseChronicleLibrary({ roles: [], lines: [] }), /roles/);
  const bad = JSON.parse(text('chronicle.json'));
  bad.lines[0].id = 'quiet_nope';
  assert.throws(() => parseChronicleLibrary(bad), /quiet_nope/);
  const dup = JSON.parse(text('chronicle.json'));
  dup.lines[1].id = dup.lines[0].id;
  assert.throws(() => parseChronicleLibrary(dup), /duplicate line id/);
  const thin = JSON.parse(text('chronicle.json'));
  thin.lines[2].variants = thin.lines[2].variants.slice(0, 1);
  assert.throws(() => parseChronicleLibrary(thin), /needs at least 4 variants/);
});
