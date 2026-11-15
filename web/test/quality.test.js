import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUALITY_TIERS, QUALITY_CHOICES, parseQuality, autoTier, resolveQuality, tierSettings, tierFeatures, tierLines } from '../src/quality.js';
import * as M from '../src/view3d-math.js';
import { t } from '../src/i18n.js';

test('parseQuality: only the four choices, case and space tolerant', () => {
  for (const c of QUALITY_CHOICES) assert.equal(parseQuality(c), c);
  assert.equal(parseQuality(' HIGH '), 'high');
  for (const bad of ['ultra', '', null, undefined, 3, '1']) assert.equal(parseQuality(bad), null);
});

test('autoTier: software GL, Data Saver and two cores are low; integrated laptop graphics medium; discrete GPUs high', () => {
  assert.equal(autoTier({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', cores: 16 }), 'low');
  assert.equal(autoTier({ renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)', cores: 8 }), 'low');
  assert.equal(autoTier({ renderer: 'NVIDIA GeForce RTX 3060', cores: 8, saveData: true }), 'low');
  assert.equal(autoTier({ renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', cores: 8, dpr: 1.25 }), 'medium');
  assert.equal(autoTier({ renderer: 'AMD Radeon(TM) Graphics', cores: 12 }), 'medium', 'integrated Radeon is not a discrete RX');
  assert.equal(autoTier({ renderer: '', cores: 8 }), 'medium', 'a hidden renderer string defaults to medium');
  assert.equal(autoTier({ renderer: 'Intel HD Graphics 620', cores: 2 }), 'low');
  assert.equal(autoTier({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11)', cores: 12, dpr: 1 }), 'high');
  assert.equal(autoTier({ renderer: 'Apple M2', cores: 8, dpr: 2 }), 'high');
  assert.equal(autoTier({ renderer: 'NVIDIA GeForce GTX 1650', cores: 4 }), 'medium', 'four cores hold a discrete GPU at medium');
  assert.equal(autoTier(), 'medium');
});

test('resolveQuality: URL beats saved beats auto; junk counts as auto', () => {
  const hints = { renderer: 'SwiftShader', cores: 8 };
  assert.deepEqual(resolveQuality({ query: 'high', stored: 'low', hints }), { choice: 'high', tier: 'high', source: 'url' });
  assert.deepEqual(resolveQuality({ query: null, stored: 'medium', hints }), { choice: 'medium', tier: 'medium', source: 'saved' });
  assert.deepEqual(resolveQuality({ query: 'ultra', stored: 'nonsense', hints }), { choice: 'auto', tier: 'low', source: 'default' });
  assert.deepEqual(resolveQuality({ query: 'auto', stored: 'high', hints }), { choice: 'auto', tier: 'low', source: 'url' });
});

test('tiers: monotonic cost from low to high, every field present, unknown names get medium', () => {
  const [lo, me, hi] = ['low', 'medium', 'high'].map((n) => QUALITY_TIERS[n]);
  assert.deepEqual(Object.keys(lo).sort(), Object.keys(hi).sort());
  assert.ok(lo.maxPixels < me.maxPixels && me.maxPixels < hi.maxPixels);
  assert.equal(me.maxPixels, M.MAX_PIXELS, 'medium keeps the round 20 pixel ceiling');
  assert.ok(lo.detail < me.detail && me.detail < hi.detail && !lo.post && me.post && hi.fxaa && !me.fxaa);
  assert.ok(lo.particles < me.particles && lo.fireflies < 1 && lo.birds < 1);
  assert.equal(tierSettings('nope'), me);
  assert.deepEqual([tierLines('low'), tierLines('medium'), tierLines('high')], [540, 720, 1080]);
});

test('tierFeatures: names what each tier enables and every id has an en and fr label', () => {
  assert.deepEqual(tierFeatures('low'), ['halfparticles']);
  assert.ok(tierFeatures('medium').includes('grade') && !tierFeatures('medium').includes('fxaa'));
  assert.ok(tierFeatures('high').includes('fxaa') && tierFeatures('high').includes('waves'));
  const ids = new Set(['lines', ...tierFeatures('low'), ...tierFeatures('high')]);
  for (const lang of ['en', 'fr']) {
    for (const id of ids) assert.notEqual(t('quality.f.' + id, lang, { n: 720 }), 'quality.f.' + id, `${lang} ${id}`);
    for (const c of QUALITY_CHOICES) assert.notEqual(t('quality.' + c, lang), 'quality.' + c);
  }
});

test('nextScale: hysteresis band, tier floor, needs 30 frames per step', () => {
  assert.equal(M.nextScale(1, M.DRS_DOWN_MS + 1, 60), 0.75);
  assert.equal(M.nextScale(0.75, 20, 60), 0.75, 'inside the band nothing moves');
  assert.equal(M.nextScale(0.75, M.DRS_UP_MS - 1, 60), 1);
  assert.equal(M.nextScale(0.75, 40, 60, 0.75), 0.75, 'the tier floor holds');
  assert.equal(M.nextScale(0.5, 40, 60, 0.75), 0.75, 'a scale below a raised floor is lifted to it');
  assert.equal(M.nextScale(1, 40, 29), 1);
  // a frame time that oscillates between the thresholds never flips the scale back and forth
  let s = 1; const seen = [];
  for (const ms of [30, 20, 20, 20, 16, 20]) { s = M.nextScale(s, ms, 60); seen.push(s); }
  assert.deepEqual(seen, [0.75, 0.75, 0.75, 0.75, 0.75, 0.75]);
});

test('postParams: the tier switches the pass, bloom and FXAA; reduced motion still has no chroma', () => {
  assert.equal(M.postParams({ tier: QUALITY_TIERS.low }).enabled, false);
  assert.equal(M.postParams({ tier: QUALITY_TIERS.medium }).enabled, true);
  assert.equal(M.postParams({ tier: QUALITY_TIERS.high }).fxaa, true);
  assert.equal(M.postParams({ tier: QUALITY_TIERS.medium }).fxaa, false);
  assert.equal(M.postParams({ tier: QUALITY_TIERS.high }).bloom, QUALITY_TIERS.high.bloom);
  assert.equal(M.postParams({ tier: QUALITY_TIERS.high, reduced: true }).chroma, 0);
  assert.ok(M.postParams({ dread: 1 }).exposure < M.postParams({ dread: 0 }).exposure);
});

test('wiring: settings select, saved key, URL override and HUD tier are present', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(html, /<select id="qualitySelect">/);
  for (const c of QUALITY_CHOICES) assert.match(html, new RegExp(`<option value="${c}"`));
  assert.match(app, /optParam\('quality'\)/); assert.match(app, /QUALITY_KEY/); assert.match(app, /view3d\.setQuality/); assert.match(app, /c\.tier/);
});
