// Round 26: the society model mirrors Core/VillageSociety.cs and the trust overload of VillagerRules.Chat. Golden key "society".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster, chat } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import {
  buildSociety, tierOf, dreadPermille, combinedBehavior, coldLine, suspiciousStatement, UNREACHABLE, SCALE, ALL_VILLAGERS, LIE_STATEMENT_IDS,
  ACTION_TRUST, ACTION_SUSPICION, ACTION_IDS, START_TRUST, TIER_NEUTRAL, TIER_SUSPICIOUS, TIER_TRUSTING, CORRUPTION_MISSING, CORRUPTION_CORRUPTED,
  SEEN_AT_RITUAL_SITE, RETURN_ITEM, CHAT_POLITE, fearWithholds, TERRIFIED_AT,
  EFFECT_TRUSTED, EFFECT_ACCUSED, MAX_REPUTATION_HOPS, MAX_EFFECT_STRENGTH, PROPAGATED_CAP_PER_VILLAGER, PROPAGATED_CAP_PER_NIGHT,
} from '../src/society.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).society;
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);

function societyOf(seed) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(lib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  return { roster, society: buildSociety(story, layout) };
}

test('constants line up with the action list', () => {
  assert.equal(ACTION_TRUST.length, ACTION_IDS.length);
  assert.equal(ACTION_SUSPICION.length, ACTION_IDS.length);
  assert.equal(START_TRUST.length, 4);
  for (const id of LIE_STATEMENT_IDS) assert.ok(id.startsWith('lie_'));
});

test('links, spread, fates, opinions, corruption and trust gated chat match C# for every golden seed', () => {
  const log = golden.log.map(([kind, subject]) => ({ kind, subject }));
  for (const c of golden.cities) {
    const { roster, society } = societyOf(c.seed);
    assert.equal(society.patientZero, c.zero, `zero ${c.seed}`);
    assert.deepEqual(society.neighbour, c.neighbour);
    assert.deepEqual(society.spreadDelay.map((d) => (d === UNREACHABLE ? -1 : d)), c.delay);
    assert.deepEqual(society.fate, c.fate);
    const op = society.opinionsAfter(log);
    assert.deepEqual(op.trust, c.trust, `trust ${c.seed}`);
    assert.deepEqual(op.suspicion, c.suspicion, `suspicion ${c.seed}`);
    for (const [night, dread, ritual, levels, stages] of c.corruption) {
      assert.deepEqual(roster.map((v) => society.corruptionLevel(v.index, night, dread, ritual)), levels, `level ${c.seed} ${night} ${dread} ${ritual}`);
      assert.deepEqual(roster.map((v) => society.corruptionAt(v.index, night, dread, ritual)), stages);
    }
    for (const [index, night, topic, tier, corruption, available, behavior, hintId, strong, withheld, lie, cold, lineVariant] of c.chat) {
      const st = society.standingOf(index, op, night, 0.25, 1);
      assert.deepEqual([st.tier, st.corruption], [tier, corruption], `standing ${c.seed} ${index} ${night}`);
      const r = chat(c.seed, roster[index], 600, 0.25, night, topic, 2, 1, 80, st);
      assert.deepEqual([r.available ? 1 : 0, r.behavior, r.hintId, r.strongHint ? 1 : 0, r.withheld ? 1 : 0, r.lieStatementId, r.coldLine ? 1 : 0, r.lineVariant],
        [available, behavior, hintId, strong, withheld, lie, cold, lineVariant], `chat ${c.seed} ${index} ${night} ${topic}`);
    }
  }
});

test('same seed and log give the same society; log order matters; values stay clamped', () => {
  const a = societyOf(42).society, b = societyOf(42).society;
  const log = [{ kind: CHAT_POLITE, subject: 1 }, { kind: SEEN_AT_RITUAL_SITE, subject: ALL_VILLAGERS }];
  assert.deepEqual(a.opinionsAfter(log), b.opinionsAfter(log));
  const scare = { kind: SEEN_AT_RITUAL_SITE, subject: 0 }, gift = { kind: RETURN_ITEM, subject: 0 };
  assert.notEqual(a.opinionsAfter([scare, scare, scare, gift]).trust[0], a.opinionsAfter([gift, scare, scare, scare]).trust[0]);
  const spam = a.opinionsAfter(new Array(50).fill({ kind: SEEN_AT_RITUAL_SITE, subject: ALL_VILLAGERS }));
  for (let i = 0; i < spam.trust.length; i++) {
    assert.ok(spam.trust[i] >= 0 && spam.trust[i] <= SCALE && spam.suspicion[i] <= SCALE);
    assert.equal(tierOf(spam.trust[i], spam.suspicion[i]), TIER_SUSPICIOUS);
  }
  assert.ok(a.opinionsAfter([{ kind: 99, subject: 0 }, { kind: CHAT_POLITE, subject: 999 }]).trust.every((t, i) => t === a.opinionsAfter([]).trust[i]), 'bad entries are ignored');
});

test('chat without standing is the plain chat; standing gates the hint and corruption colds the line', () => {
  const { roster } = societyOf(42), v = roster[0];
  const plain = chat(42, v, 600, 0, 1, 0, 2, 1, 80);
  assert.equal(plain.hintId, 'clues_seek');
  assert.deepEqual(chat(42, v, 600, 0, 1, 0, 2, 1, 80, { tier: TIER_NEUTRAL, corruption: 0 }), plain);
  assert.equal(chat(42, v, 600, 0, 1, 0, 2, 1, 80, { tier: TIER_TRUSTING, corruption: 0 }).strongHint, true);
  const cold = chat(42, v, 600, 0, 1, 0, 2, 1, 80, { tier: TIER_TRUSTING, corruption: CORRUPTION_CORRUPTED });
  assert.equal(cold.coldLine, true);
  assert.equal(cold.hintId, '');
  assert.equal(chat(42, v, 600, 0, 1, 0, 2, 1, 80, { tier: TIER_NEUTRAL, corruption: CORRUPTION_MISSING }).available, false);
  assert.equal(combinedBehavior(2, 1), 2);
  assert.equal(coldLine(1), false);
  assert.equal(dreadPermille(Number.NaN), 0);
  assert.equal(dreadPermille(2), SCALE);
  const statements = new Set();
  for (let night = 1; night <= 40; night++) statements.add(suspiciousStatement(42, 0, night, 0));
  assert.ok(statements.has('') && statements.size > 1, 'a suspicious villager both withholds and lies');
});

const axesGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).axes;

test('trust network axes and fear gated chat match C# for every golden seed (round 29)', () => {
  const log = golden.log.slice(0, 4).map(([kind, subject]) => ({ kind, subject }));
  for (const c of axesGolden.cities) {
    const { roster, society } = societyOf(c.seed), op = society.opinionsAfter(log);
    for (const [night, dread, ritual, fear, faith, loyalty, obsession] of c.grid) {
      const a = society.axesAfter(op, night, dread, ritual);
      assert.deepEqual([a.fear, a.faith, a.loyalty, a.obsession], [fear, faith, loyalty, obsession], `axes ${c.seed} ${night} ${dread} ${ritual}`);
      for (const axis of [a.fear, a.faith, a.loyalty, a.obsession]) for (const v of axis) assert.ok(v >= 0 && v <= SCALE);
    }
    for (const [index, night, dread, ritual, available, withheld, fearWithheld, strong, hintId, lie] of c.chat) {
      const st = society.standingWithAxes(index, op, society.axesAfter(op, night, dread, ritual), night, dread, ritual);
      const r = chat(c.seed, roster[index], 600, dread, night, 0, 2, 1, 80, st);
      assert.deepEqual([r.available ? 1 : 0, r.withheld ? 1 : 0, r.fearWithheld ? 1 : 0, r.strongHint ? 1 : 0, r.hintId, r.lieStatementId], [available, withheld, fearWithheld, strong, hintId, lie], `chat ${c.seed} ${index} ${night}`);
    }
  }
});

test('axes are deterministic and leave opinions alone; fear above trust withholds while trust shows', () => {
  const { roster, society } = societyOf(42), op = society.opinionsAfter([]), trust = op.trust.slice();
  assert.deepEqual(society.axesAfter(op, 3, 0.5, 2), society.axesAfter(op, 3, 0.5, 2));
  assert.deepEqual(society.axesAfter(op, 0, NaN, -4).fear.every((v) => v >= 0 && v <= SCALE), true);
  assert.deepEqual(op.trust, trust);
  const r = chat(42, roster[0], 600, 0, 1, 0, 2, 1, 80, { tier: TIER_TRUSTING, corruption: 0, trust: 900, fear: 950 });
  assert.equal(r.available, true);
  assert.deepEqual([r.withheld, r.fearWithheld, r.strongHint, r.hintId], [true, true, false, '']);
  assert.equal(chat(42, roster[0], 600, 0, 1, 0, 2, 1, 80, { tier: TIER_TRUSTING, corruption: 0, trust: 900, fear: 700 }).strongHint, true);
  assert.equal(fearWithholds(500, TERRIFIED_AT), true);
  assert.equal(fearWithholds(TERRIFIED_AT, TERRIFIED_AT), false);
});

// Round 36 (spec 176): reputation propagation. Golden key "reputation".
const reputationGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).reputation;
const rows = (fx) => fx.map((e) => [e.source, e.target, e.kind, e.effect, e.hop, e.strength, e.night]);

test('reputation effect records match C# for every golden seed, with nights and with a crowded log', () => {
  const log = reputationGolden.log.map(([kind, subject]) => ({ kind, subject })), crowded = reputationGolden.crowded.map(([kind, subject]) => ({ kind, subject }));
  for (const c of reputationGolden.cities) {
    const { society } = societyOf(c.seed);
    assert.deepEqual(rows(society.reputationEffectsAfter(log, reputationGolden.nights)), c.effects, `effects ${c.seed}`);
    assert.deepEqual(rows(society.reputationEffectsAfter(crowded, null)), c.crowdedEffects, `crowded ${c.seed}`);
  }
});

test('reputation: decay by hop, caps hold on cyclic links, each villager once per origin, replay equals incremental', () => {
  const { roster, society } = societyOf(42), n = roster.length;
  const one = society.reputationEffectsAfter([{ kind: SEEN_AT_RITUAL_SITE, subject: 0 }]);
  const origin = one.filter((e) => e.hop === 0);
  assert.equal(origin.length, 1);
  assert.deepEqual([origin[0].effect, origin[0].strength], [EFFECT_ACCUSED, 400]);
  for (const e of one.filter((x) => x.hop > 0)) assert.ok(e.hop <= MAX_REPUTATION_HOPS && e.strength <= origin[0].strength >> e.hop);
  assert.equal(new Set(one.map((e) => e.target)).size, one.length);
  assert.equal(society.reputationEffectsAfter([{ kind: RETURN_ITEM, subject: 0 }])[0].effect, EFFECT_TRUSTED);
  const crowd = Array.from({ length: 40 }, (_, i) => ({ kind: i % 2 === 0 ? SEEN_AT_RITUAL_SITE : 5, subject: i % n }));
  const fx = society.reputationEffectsAfter(crowd);
  const perTarget = new Map();
  for (const e of fx) { assert.ok(e.strength >= 1 && e.strength <= MAX_EFFECT_STRENGTH); if (e.hop > 0) perTarget.set(e.target, (perTarget.get(e.target) || 0) + e.strength); }
  for (const total of perTarget.values()) assert.ok(total <= PROPAGATED_CAP_PER_VILLAGER);
  assert.ok(fx.filter((e) => e.hop > 0).reduce((s, e) => s + e.strength, 0) <= PROPAGATED_CAP_PER_NIGHT);
  assert.deepEqual(fx, society.reputationEffectsAfter(crowd));
  for (let cut = 1; cut <= crowd.length; cut += 7) assert.deepEqual(society.reputationEffectsAfter(crowd.slice(0, cut)), fx.slice(0, society.reputationEffectsAfter(crowd.slice(0, cut)).length));
  assert.deepEqual(society.reputationEffectsAfter([]), []);
  assert.deepEqual(society.reputationEffectsAfter(null), []);
  const all = society.reputationEffectsAfter([{ kind: 3, subject: ALL_VILLAGERS }, { kind: 99, subject: 0 }, { kind: CHAT_POLITE, subject: 999 }]);
  assert.equal(all.length, n);
  assert.ok(all.every((e) => e.hop === 0));
});
