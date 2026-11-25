// Round 36 (spec FEAT-009): headless performance audit of the living evolution systems.
// Usage: node tools/perf_audit.mjs [iterationScale]   (prints median and p95 ms per call for each system)
// Timings are indicative of the machine that runs them only. Real hardware frame rates are Unverified.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../web/src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../web/src/districts.js';
import { parseNameLibrary, assignNames } from '../web/src/names.js';
import { generateTownRoster } from '../web/src/villagers.js';
import { villagerPlacements } from '../web/src/villager-view.js';
import { parseStoryLibrary, buildStory } from '../web/src/village-story.js';
import { buildSociety, SEEN_AT_RITUAL_SITE, RETURN_ITEM } from '../web/src/society.js';
import { parseMythosLibrary, runMythos, buildMythosFeed, mythosStatements, mythosSchedule } from '../web/src/mythos.js';
import { parseOutcomeLibrary, resolveOutcome } from '../web/src/outcomes.js';
import { parseMemoryLibrary, replayMemory, baselineEvents, KIND_ACCUSED, KIND_CONVERSATION, KIND_RITUAL_WITNESSED, KIND_CLUE_FOUND } from '../web/src/memory.js';
import { parseRumorMutationLibrary, rumorStage, rumorMutationText } from '../web/src/rumor-mutation.js';
import { parseRealityLibrary, realityHouseName, realityFalseVillager, realityBlurredIdentity, realityLocationLook, realityCollapsedHouseName, realityErasedVillager, realityIdentityStep, realityPhantomPathVisible } from '../web/src/reality.js';
import { BEAT_IDS, startState, step, pickAmbientBeat, NO_BEAT_YET } from '../web/src/director.js';
import { parseChronicleLibrary, chronicleProse } from '../web/src/chronicle-prose.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
export const AUDIT_SEED = 1818, AUDIT_NIGHTS = 12, TIER_MAX = 5, AUDIT_SAMPLES = 15;

/** Builds the world once and returns [{ name, calls, run }]: run() is one call of the system; calls is how many underlying calls one run() makes. */
export function auditCases(seed = AUDIT_SEED) {
  const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
  const storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), mythosLib = parseMythosLibrary(text('mythos.json'));
  const outcomeLib = parseOutcomeLibrary(text('outcomes.json')), memoryLib = parseMemoryLibrary(text('memory.json')), prose = parseChronicleLibrary(text('chronicle.json'));
  const mutations = parseRumorMutationLibrary(text('rumor-mutations.json')), reality = parseRealityLibrary(text('reality.json'));
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateTownRoster(seed, layout, CITY_GRID, CITY_GRID);
  const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  const society = buildSociety(story, layout), schedule = mythosSchedule(AUDIT_NIGHTS), state = runMythos(society, story, mythosLib, schedule, AUDIT_NIGHTS);
  const count = story.roster.length;
  const E = (night, villager, kind, weight) => ({ night, villager, kind, subject: -1, weight });
  const memoryLog = [...baselineEvents(story), E(2, 0, KIND_ACCUSED, 600), E(3, 1, KIND_CONVERSATION, 500), E(4, 2, KIND_RITUAL_WITNESSED, 700), E(5, 3, KIND_CLUE_FOUND, 500)];
  const actions = [], nightOf = [], beats = [];
  for (let night = 1; night <= AUDIT_NIGHTS; night++) {
    actions.push({ kind: night % 2 === 0 ? SEEN_AT_RITUAL_SITE : RETURN_ITEM, subject: (night * 7) % count });
    nightOf.push(night);
    if (night % 3 === 0) beats.push({ night, id: BEAT_IDS[(night / 3 | 0) % BEAT_IDS.length] });
  }
  const ctx = { prose, story, mythos: mythosLib, state, nights: AUDIT_NIGHTS, outcomes: story.missing.map((_, k) => resolveOutcome(society, story, state, outcomeLib, k, 0)), leads: story.missing.map(() => 0), heard: new Set(), met: new Set(), memoryLog,
    evolution: { reputation: society.reputationEffectsAfter(actions, nightOf), mutations, beats } };
  for (const s of mythosStatements(buildMythosFeed(mythosLib, state, AUDIT_NIGHTS))) ctx.heard.add(s.id);
  for (let v = 0; v < count; v++) ctx.met.add(v);
  const rumor = { source: 0, night: 2 };
  const input = { tick: 1190, sanity: 400, knowledge: 500, stress: 600, cultExposure: 500, encounters: 2, safeZoneTicks: 0, clueProgress: 100, safeZoneAbuse: 0, knowledgeTier: 3, rememberedVillager: 1 };

  return [
    { name: 'memory engine (replay, effects, lines)', calls: 1, run() { const m = replayMemory(count, memoryLog, AUDIT_NIGHTS); m.effectsOfAll(); for (let v = 0; v < count; v++) m.lineFor(memoryLib, seed, v, AUDIT_NIGHTS, 'en'); } },
    { name: 'chronicle prose with evolution (12 nights)', calls: 1, run() { chronicleProse(ctx, AUDIT_NIGHTS, 'en'); } },
    { name: 'reality layer at tier 5 incl. collapse (all subjects)', calls: 1, run() {
      for (let night = 1; night <= AUDIT_NIGHTS; night++) {
        realityFalseVillager(reality, seed, night, TIER_MAX); realityErasedVillager(seed, night, TIER_MAX, count);
        for (let h = 0; h < reality.houseNames.length; h++) { realityHouseName(reality, seed, night, TIER_MAX, h); realityCollapsedHouseName(reality, seed, night, TIER_MAX, h); }
        for (let v = 0; v < count; v++) { realityBlurredIdentity(seed, night, TIER_MAX, v, count); realityIdentityStep(seed, night, TIER_MAX, v); }
        for (let p = 0; p < 12; p++) { realityLocationLook(reality, seed, night, TIER_MAX, `place${p}`); realityPhantomPathVisible(seed, night, TIER_MAX, `path${p}`); }
      } } },
    { name: 'villager update (placements of the whole roster, one frame)', calls: 1, run() { villagerPlacements({ roster, layout, tick: 1190.5, dread: 0.5, gridW: CITY_GRID, gridD: CITY_GRID, seed }); } },
    { name: 'rumor mutation (stage and text, every chain)', calls: 1, run() { for (let c = 0; c < mutations.chains.length; c++) { rumorStage(mutations, c, seed, 2, 6, 500); rumorMutationText(mutations, { ...rumor, source: mutations.chains[c].source }, mutations.chains[c].ref, seed, 6, 500, 5, 'en'); } } },
    { name: 'reputation propagation (12 logged actions)', calls: 1, run() { society.reputationEffectsAfter(actions, nightOf); } },
    { name: 'director step and ambient beat', calls: 1, run() { let s = startState(), last = NO_BEAT_YET; for (let t = 0; t < 60; t++) { const x = { ...input, tick: input.tick + t }; s = step(seed, s, x); const b = pickAmbientBeat(seed, s, x, last); if (b.emitted) last = x.tick; } } },
    { name: 'mythos with cult leadership (12 nights)', calls: 1, run() { runMythos(society, story, mythosLib, schedule, AUDIT_NIGHTS); } },
  ];
}

const sorted = (xs) => xs.slice().sort((a, b) => a - b);
/** ms per run(): `samples` batches of `iterations` runs after a warm-up, returns { median, p95 } of the per-run mean of each batch. */
export function measure(run, iterations, samples = AUDIT_SAMPLES) {
  for (let i = 0; i < Math.min(iterations, 5); i++) run();
  const perRun = [];
  for (let s = 0; s < samples; s++) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) run();
    perRun.push((performance.now() - t0) / iterations);
  }
  const xs = sorted(perRun);
  return { median: xs[Math.floor(xs.length / 2)], p95: xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scale = Math.max(1, Number(process.argv[2]) || 1);
  console.log(`node ${process.version}, seed ${AUDIT_SEED}, ${AUDIT_NIGHTS} nights, median and p95 of ${AUDIT_SAMPLES} batches (ms per call)`);
  for (const c of auditCases()) {
    const t0 = performance.now(); c.run();
    const once = Math.max(performance.now() - t0, 0.001), iterations = Math.max(5, Math.min(2000, Math.round(20 * scale / once)));
    const { median, p95 } = measure(() => c.run(), iterations);
    console.log(`${c.name.padEnd(62)} median ${median.toFixed(4)}  p95 ${p95.toFixed(4)}  (${iterations} iterations per batch)`);
  }
}
