import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign, clampNights } from '../src/core.js';
import { skyTint, weatherFor, postcardFilename, postcardCaption, nightFromHash } from '../src/scene.js';

test('campaign is deterministic and dread rises strictly', () => {
  for (let seed = -50; seed < 200; seed += 7) {
    for (let n = 1; n <= 9; n++) {
      const a = generateCampaign(seed, n), b = generateCampaign(seed, n);
      assert.deepEqual(a, b);
      assert.equal(a.nights.length, n);
      let prev = 0;
      for (const night of a.nights) {
        assert.ok(night.dreadTargetPercent > prev && night.dreadTargetPercent <= 100);
        assert.equal(night.sanityStart, 100 - night.dreadTargetPercent);
        prev = night.dreadTargetPercent;
      }
      assert.equal(new Set(a.nights.map((x) => x.title)).size, n);
    }
  }
});

test('night count clamps and bad input falls back', () => {
  assert.equal(clampNights(0), 1);
  assert.equal(clampNights(99), 9);
  assert.equal(clampNights(NaN), 5);
  assert.equal(generateCampaign(1).nights.length, 5);
});

test('skyTint darkens from dusk to witching and weatherFor maps names', () => {
  const lum = (t) => t[0] + t[1] + t[2];
  assert.ok(lum(skyTint('dusk').rgb) > lum(skyTint('night').rgb));
  assert.ok(lum(skyTint('night').rgb) > lum(skyTint('witching').rgb));
  assert.deepEqual(skyTint('bogus'), skyTint('night'));
  assert.deepEqual(weatherFor('rain'), { rain: true, fog: false });
  assert.deepEqual(weatherFor('fog'), { rain: false, fog: true });
  assert.deepEqual(weatherFor('clear'), { rain: false, fog: false });
  assert.deepEqual(weatherFor('???'), { rain: false, fog: false });
});

test('postcard names and caption are safe and informative', () => {
  assert.equal(postcardFilename(42, 3), 'village-postcard-seed-42-night-3.png');
  const c = postcardCaption({ villageName: 'Saltwick', seed: 42, night: 3, title: 'The Eye Opens' });
  assert.match(c, /Saltwick/); assert.match(c, /seed 42/); assert.match(c, /Night 3/);
  assert.ok(!c.includes('\u2014'));
});

test('nightFromHash reads and clamps', () => {
  assert.equal(nightFromHash('#seed=1&night=3', 5), 2);
  assert.equal(nightFromHash('#night=99', 5), 4);
  assert.equal(nightFromHash('#night=-4', 5), 0);
  assert.equal(nightFromHash('#seed=1', 5), 0);
  assert.equal(nightFromHash('#night=x', 5), 0);
});
