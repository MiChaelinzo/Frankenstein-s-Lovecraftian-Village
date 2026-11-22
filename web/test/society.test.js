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
  SEEN_AT_RITUAL_SITE, RETURN_ITEM, CHAT_POLITE,
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
