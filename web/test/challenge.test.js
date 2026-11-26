// Round 36 (spec 184): weekly seed, investigation accuracy and the challenge leaderboard export mirror Core (golden key "streamerChallenge").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeedShareLibrary } from '../src/daily.js';
import { t } from '../src/i18n.js';
import { weeklyKey, weeklySeedFromKey, weeklyCodeForKey, weeklyChallenge, accuracyScore, accuracyOfState, leaderboardJson, parseLeaderboard, addResult, leaderboardText, rankResults, MAX_ENTRIES } from '../src/challenge.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8')).streamerChallenge;
const lib = parseSeedShareLibrary(JSON.parse(readFileSync(new URL('../data/seedshare.json', import.meta.url), 'utf8')));
const at = (text) => { const [d, h] = text.split(' '), [y, m, day] = d.split('-').map(Number), [hh, mm] = h.split(':').map(Number); const x = new Date(0); x.setUTCFullYear(y, m - 1, day); x.setUTCHours(hh, mm, 0, 0); return x; };
const sample = [{ seed: 1818, score: 61, theories: 4, endings: 2 }, { seed: -7, score: 88, theories: 5, endings: 3 }, { seed: 42, score: 61, theories: 2, endings: 1 }];

test('weekly keys, seeds and codes match C#', () => {
  assert.ok(golden.weekly.length > 0);
  for (const [instant, key, seed, code] of golden.weekly) {
    assert.equal(weeklyKey(at(instant)), key, instant);
    assert.equal(weeklySeedFromKey(key), seed, instant);
    assert.equal(weeklyCodeForKey(lib, key), code, instant);
  }
});

test('the weekly seed is the same across a week and changes the next', () => {
  const a = weeklyChallenge(lib, () => at('2026-11-09 00:00')), b = weeklyChallenge(lib, () => at('2026-11-15 23:59')), c = weeklyChallenge(lib, () => at('2026-11-16 00:00'));
  assert.deepEqual(a, b); assert.notEqual(a.seed, c.seed);
  assert.equal(weeklyChallenge(lib, () => new Date(NaN)), null);
  assert.equal(weeklyChallenge(lib, () => { throw new Error('no clock'); }), null);
});

test('accuracy scores match C# and are deterministic', () => {
  assert.ok(golden.accuracy.length > 0);
  for (const [tr, pa, fa, belief, score] of golden.accuracy) assert.equal(accuracyScore(tr, pa, fa, belief), score);
  const state = { list: [{ grade: 0, averageBelief: 80 }, { grade: 1, averageBelief: 40 }] };
  assert.equal(accuracyOfState(state), accuracyScore(1, 1, 0, 120));
  assert.equal(accuracyOfState({ list: [] }), 0);
});

test('leaderboard json is byte identical to C# and round trips', () => {
  assert.equal(leaderboardJson(lib, '2026-W46', sample), golden.leaderboard);
  assert.equal(leaderboardJson(lib, '2026-W46', sample.slice().reverse()), golden.leaderboard);
  const back = parseLeaderboard(lib, golden.leaderboard);
  assert.equal(back.week, '2026-W46');
  assert.deepEqual(back.results.map((r) => r.seed), [-7, 42, 1818]);
  assert.equal(leaderboardJson(lib, back.week, back.results), golden.leaderboard);
});

test('the export holds no free text and is capped', () => {
  const many = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({ seed: i, score: i % 100, theories: 1, endings: 0 }));
  assert.equal(rankResults(many).length, MAX_ENTRIES);
  const root = JSON.parse(leaderboardJson(lib, '2026-W46', many));
  assert.deepEqual(Object.keys(root).sort(), ['entries', 'format', 'week']);
  for (const e of root.entries) assert.deepEqual(Object.keys(e).sort(), ['code', 'endings', 'rank', 'score', 'seed', 'theories']);
});

test('parse rejects a bad week in an otherwise valid leaderboard', () => {
  const bad = JSON.parse(golden.leaderboard);
  bad.week = 'w';
  assert.throws(() => parseLeaderboard(lib, JSON.stringify(bad)), /leaderboard: week/);
});

test('parse rejects malformed lists with a readable error', () => {
  const bad = ['not json', '[]', '{"format":"x","week":"w","entries":[]}', '{"format":"flv-challenge-1","week":"w"}',
    '{"format":"flv-challenge-1","week":"w","entries":[{"seed":1,"code":"1-WRONG-WORDS","score":1,"theories":1,"endings":1}]}',
    '{"format":"flv-challenge-1","week":"w","entries":[{"seed":1,"code":"x","score":101,"theories":1,"endings":1}]}'];
  for (const text of bad) assert.throws(() => parseLeaderboard(lib, text), /leaderboard:/, text);
});

test('addResult keeps the best score per seed', () => {
  const list = addResult(addResult([], { seed: 5, score: 40, theories: 1, endings: 0 }), { seed: 5, score: 30, theories: 1, endings: 0 });
  assert.equal(list.length, 1); assert.equal(list[0].score, 40);
  assert.equal(addResult(list, { seed: 5, score: 90, theories: 2, endings: 1 })[0].score, 90);
});

for (const lang of ['en', 'fr']) for (const format of ['md', 'txt']) test(`text export (${lang}, ${format}) shows codes and counts, no em dash`, () => {
  const tr = (k, v) => t(k, lang, v), text = leaderboardText(lib, sample, { tr, format, weekKey: '2026-W46' });
  assert.equal(text, leaderboardText(lib, sample, { tr, format, weekKey: '2026-W46' }));
  assert.ok(text.includes('2026-W46') && text.includes('4294967289-DROWNED-FOG'));
  assert.ok(!text.includes('\u2014'));
  assert.ok(leaderboardText(lib, [], { tr, format, weekKey: 'w' }).includes(tr('export.challenge.empty')));
});
