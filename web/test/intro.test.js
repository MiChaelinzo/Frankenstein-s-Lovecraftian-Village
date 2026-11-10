import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowIntro, buildIntroSlides, advanceSlide, slideDelayMs } from '../src/intro.js';
import { generateCampaign } from '../src/core.js';

test('intro shows on a bare URL and is disabled by ?intro=0 or #intro=0', () => {
  assert.equal(shouldShowIntro('', ''), true);
  assert.equal(shouldShowIntro('?intro=0', ''), false);
  assert.equal(shouldShowIntro('', '#intro=0'), false);
  assert.equal(shouldShowIntro('?intro=1', ''), true);
  assert.equal(shouldShowIntro('?pack=1', ''), true);
});

test('deep links auto-skip the intro', () => {
  for (const h of ['#seed=1818', '#story=1&night=2', '#sanity=50', '#night=3']) assert.equal(shouldShowIntro('', h), false, h);
  assert.equal(shouldShowIntro('?story=1', ''), false);
});

test('slides are built from the campaign, deterministic, and free of em dashes', () => {
  const c = generateCampaign(1818);
  const s = buildIntroSlides(c);
  assert.deepEqual(s, buildIntroSlides(generateCampaign(1818)));
  assert.equal(s.length, 3);
  assert.ok(s[1].title === c.villageName);
  for (const x of s) assert.ok(!/\u2014/.test(x.title + x.text));
  assert.equal(buildIntroSlides(null).length, 3);
});

test('advance and delay logic', () => {
  assert.deepEqual(advanceSlide(0, 3), { index: 1, done: false });
  assert.deepEqual(advanceSlide(2, 3), { index: 2, done: true });
  assert.deepEqual(advanceSlide(NaN, 3), { index: 1, done: false });
  assert.equal(slideDelayMs(true), 0);
  assert.ok(slideDelayMs(false) > 0);
});
