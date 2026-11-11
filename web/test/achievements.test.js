import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, award, earnedIds, newStats, journalCompletion, cleanAchievementIds } from '../src/achievements.js';
import { STRINGS } from '../src/i18n.js';

test('fresh stats earn nothing', () => { assert.deepEqual(earnedIds(newStats()), []); });
test('thresholds and stickiness', () => {
  const s = newStats(), earned = new Set();
  s.whispers = 1;
  assert.deepEqual(award(earned, s), ['whisper']);
  assert.deepEqual(award(earned, s), []);
  s.doors = 3; s.tier = 3;
  assert.deepEqual(award(earned, s), ['doors', 'abyss']);
  s.stageCount = 5; s.stage = 3;
  assert.ok(!earnedIds(s).includes('ritual'));
  s.stage = 4;
  assert.ok(earnedIds(s).includes('ritual'));
  s.codexTotal = 8; s.codexCount = 4;
  assert.ok(earnedIds(s).includes('codexhalf') && !earnedIds(s).includes('codexfull'));
  s.codexCount = 8;
  assert.ok(earnedIds(s).includes('codexfull'));
});
test('journal completion tracks the four entry kinds', () => {
  assert.deepEqual(journalCompletion(new Set()), { seen: 0, total: 4, percent: 0 });
  assert.equal(journalCompletion(new Set(['omen', 'door', 'bogus'])).percent, 50);
  const s = newStats(); ['narration', 'omen', 'door', 'investigator'].forEach((k) => s.kinds.add(k));
  assert.equal(journalCompletion(s.kinds).percent, 100);
  assert.ok(earnedIds(s).includes('journal'));
});
test('nights achievement needs every night of a non-empty campaign', () => {
  const s = newStats(); s.nightsVisited = 0; s.nightsTotal = 0;
  assert.ok(!earnedIds(s).includes('nights'));
  s.nightsTotal = 5; s.nightsVisited = 5;
  assert.ok(earnedIds(s).includes('nights'));
});
test('cleaning save data and i18n coverage', () => {
  assert.deepEqual(cleanAchievementIds(['abyss', 'abyss', 'x', 4]), ['abyss']);
  assert.deepEqual(cleanAchievementIds('no'), []);
  for (const lang of ['en', 'fr']) for (const a of ACHIEVEMENTS) assert.ok(STRINGS[lang][`ach.${a.id}`] && STRINGS[lang][`ach.${a.id}.d`], `${lang} ${a.id}`);
});
