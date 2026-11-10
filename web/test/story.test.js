import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign } from '../src/core.js';
import {
  buildStory, clampBeat, nextBeat, prevBeat, nightStartIndex, beatDurationMs, parseStoryParam,
  MIN_DURATION_MS, MAX_DURATION_MS, OMENS, tierForPercent,
} from '../src/story.js';

test('story is deterministic, ordered and has one title first per night', () => {
  for (let seed = -20; seed < 40; seed++) {
    const nights = 1 + (Math.abs(seed) % 9);
    const a = buildStory(generateCampaign(seed, nights));
    assert.deepEqual(a, buildStory(generateCampaign(seed, nights)));
    assert.equal(a.length, nights * 5);
    a.forEach((b, i) => assert.equal(b.index, i));
    for (let n = 1; n <= nights; n++) {
      const mine = a.filter((b) => b.nightNumber === n);
      assert.deepEqual(mine.map((b) => b.kind), ['title', 'rumor', 'lore', 'omen', 'weather']);
      assert.equal(nightStartIndex(a, n), (n - 1) * 5);
    }
    let prev = 0;
    for (const b of a) {
      assert.ok(b.dreadPercent >= prev);
      prev = b.dreadPercent;
      assert.ok(b.durationMs >= MIN_DURATION_MS && b.durationMs <= MAX_DURATION_MS);
      assert.ok(!b.text.includes('\u2014'), 'no em dash');
      if (b.kind === 'omen') assert.ok(OMENS[tierForPercent(b.dreadPercent)].includes(b.text));
    }
  }
});

test('navigation clamps and is inverse inside range', () => {
  assert.equal(clampBeat(-3, 10), 0);
  assert.equal(clampBeat(99, 10), 9);
  assert.equal(clampBeat(5, 0), 0);
  assert.equal(clampBeat(NaN, 10), 0);
  assert.equal(nextBeat(9, 10), 9);
  assert.equal(prevBeat(0, 10), 0);
  for (let i = 0; i < 9; i++) assert.equal(prevBeat(nextBeat(i, 10), 10), i);
  const beats = buildStory(generateCampaign(7, 4));
  assert.equal(nightStartIndex(beats, -1), 0);
  assert.equal(nightStartIndex(beats, 99), 15);
  assert.equal(nightStartIndex([], 2), 0);
});

test('beat duration has min, max and grows with length', () => {
  assert.equal(beatDurationMs(0), MIN_DURATION_MS);
  assert.equal(beatDurationMs(-4), MIN_DURATION_MS);
  assert.equal(beatDurationMs(NaN), MIN_DURATION_MS);
  assert.equal(beatDurationMs(1e6), MAX_DURATION_MS);
  assert.equal(beatDurationMs(100), 6000);
});

test('empty or bad campaign gives empty story', () => {
  assert.deepEqual(buildStory(null), []);
  assert.deepEqual(buildStory({}), []);
});

test('parseStoryParam handles hash, query and bad input', () => {
  assert.deepEqual(parseStoryParam('#story=1'), { on: true, night: 1, beat: 0 });
  assert.deepEqual(parseStoryParam('#story=3&beat=7'), { on: true, night: 3, beat: 7 });
  assert.deepEqual(parseStoryParam('?story=1'), { on: true, night: 1, beat: 0 });
  assert.deepEqual(parseStoryParam('seed=5&story=99'), { on: true, night: 9, beat: 0 });
  const off = { on: false, night: 1, beat: 0 };
  for (const bad of ['', '#', '#story=', '#story=0', '#story=-2', '#story=abc', '#story=1.5', '#story=99999999', '#seed=1', null, undefined, 42]) {
    assert.deepEqual(parseStoryParam(bad), off, String(bad));
  }
  assert.deepEqual(parseStoryParam('#story=2&beat=-1'), { on: true, night: 2, beat: 0 });
  assert.deepEqual(parseStoryParam('#story=2&beat=x'), { on: true, night: 2, beat: 0 });
});
