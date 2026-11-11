import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign, generateRitual } from '../src/core.js';
import { codexEntries, creatureOrder, unlockedIds, unlockInto, CREATURE_COUNT, OMEN_TIERS } from '../src/codex.js';
import { STRINGS } from '../src/i18n.js';

const ritual = (seed) => generateRitual(generateCampaign(seed));

test('creature order is a deterministic permutation', () => {
  for (const seed of [1, 1818, -77, 2147483647]) {
    const o = creatureOrder(seed);
    assert.deepEqual(o, creatureOrder(seed));
    assert.deepEqual([...o].sort((a, b) => a - b), Array.from({ length: CREATURE_COUNT }, (_, i) => i));
  }
  assert.notDeepEqual(creatureOrder(1), creatureOrder(2));
});
test('entries cover every stage and omen tier with stable ids', () => {
  const r = ritual(1818), e = codexEntries(r);
  assert.equal(e.length, r.stages.length + OMEN_TIERS);
  assert.equal(new Set(e.map((x) => x.id)).size, e.length);
  assert.deepEqual(codexEntries(r), e);
  assert.deepEqual(codexEntries(null), []);
});
test('unlocking follows stage and tier, and ignores foreign ids', () => {
  const r = ritual(1818);
  assert.deepEqual(unlockedIds(r, -1, 0), []);
  assert.deepEqual(unlockedIds(r, 1, 2), ['s0', 's1', 'o1', 'o2']);
  assert.equal(unlockedIds(r, 99, 99).length, r.stages.length + OMEN_TIERS);
  const set = new Set();
  assert.deepEqual(unlockInto(set, r, ['s0', 'zz', 'o1']), ['s0', 'o1']);
  assert.deepEqual(unlockInto(set, r, ['s0', 'o2']), ['o2']);
});
test('every creature and omen has en and fr text', () => {
  for (const lang of ['en', 'fr']) {
    for (let i = 0; i < CREATURE_COUNT; i++) assert.ok(STRINGS[lang][`codex.creature.${i}`] && STRINGS[lang][`codex.creature.${i}.d`], `${lang} creature ${i}`);
    for (let t = 1; t <= OMEN_TIERS; t++) assert.ok(STRINGS[lang][`codex.omen.${t}`] && STRINGS[lang][`codex.omen.${t}.d`], `${lang} omen ${t}`);
  }
});
