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
  assert.match(app, /optParam\('quality'\)/); assert.match(app, /loadSettings\(storage\)\.quality/); assert.match(app, /view3d\.setQuality/); assert.match(app, /c\.tier/);
});

test('2D renderer: the tier switches the layered sky, cast shadows and window spill, and both paths draw without throwing', async () => {
  const { createRenderer } = await import('../src/draw.js');
  const calls = { fill: 0 };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { if (k === 'fill') calls.fill++; }), set: (t, k, v) => ((t[k] = v), true) });
  const state = { layout: [], drawOrder: [{ id: 'house_a', x: 2, z: 2, sizeX: 1, sizeZ: 1, depth: 4, key: 'a', floors: 1, detail: 0, vis: { h: 0.5, tilt: 0.2, lit: 0.1, lit2: 0.2, phase: 1 } }], walkers: [], villagers: [], landmarks: [], doors: [], shakes: new Map(), theme: 'auto', eye: 0, tentacle: 0, flash: 0, seed: 7, floor: 0 };
  const r = createRenderer({ canvas: { width: 960, height: 560 }, ctx, state, cam: { k: 1, hs: 1, mode: 0 }, pack: { roles: {}, patterns: {} }, tex: { resolvePattern: () => null, surf: (r, c) => c, hintLabel: () => '', paintSurface() {} }, V: { tw: 40, th: 20, ox: 480, oy: 60 }, GRID_W: 24, GRID_D: 24, reduceMotion: true, currentNight: () => null, lang: 'en', $: () => ({}), meshes: null });
  const run = (tier) => { r.setQuality(QUALITY_TIERS[tier]); calls.fill = 0; r.drawScene(0, 0, 0.3, 1); return calls.fill; };
  const low = run('low'), med = run('medium');
  assert.ok(med > low, `medium draws the extra layers (${med} fills vs ${low})`);
});

test('2D mood: dredgeMood is pure, dread driven and clamped; Low skips the harbour, yard and grade layers', async () => {
  const { createRenderer, dredgeMood } = await import('../src/draw.js');
  assert.deepEqual(dredgeMood(0.4), dredgeMood(0.4));
  assert.deepEqual(dredgeMood(-3), dredgeMood(0));
  assert.deepEqual(dredgeMood(9), dredgeMood(1));
  assert.ok(dredgeMood(1).fogAlpha > dredgeMood(0).fogAlpha, 'fog thickens with dread');
  assert.notEqual(dredgeMood(0).ground, dredgeMood(1).ground);
  const strokes = { n: 0, grad: 0 };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => { strokes.grad++; return { addColorStop() {} }; } : k === 'measureText' ? () => ({ width: 10 }) : (...a) => { if (k === 'stroke') strokes.n++; }), set: (t, k, v) => ((t[k] = v), true) });
  const state = { layout: [], drawOrder: [], walkers: [], villagers: [], landmarks: [], doors: [], shakes: new Map(), theme: 'auto', eye: 0, tentacle: 0, flash: 0, seed: 7, floor: 0 };
  const r = createRenderer({ canvas: { width: 960, height: 560 }, ctx, state, cam: { k: 1, hs: 1, mode: 0 }, pack: { roles: {}, patterns: {} }, tex: { resolvePattern: () => null, surf: (r2, c) => c, hintLabel: () => '', paintSurface() {} }, V: { tw: 40, th: 20, ox: 480, oy: 60 }, GRID_W: 24, GRID_D: 24, reduceMotion: true, currentNight: () => null, lang: 'en', $: () => ({}), meshes: null });
  r.setQuality(QUALITY_TIERS.low); strokes.n = 0; r.drawScene(0, 0, 0.3, 1); const low = strokes.n;
  r.setQuality(QUALITY_TIERS.medium); strokes.n = 0; r.drawScene(0, 0, 0.3, 1); const med = strokes.n;
  assert.ok(med >= low + 2, `medium strokes yard tufts and the quay (${med} vs ${low})`);
});

test('lantern halo settings grow with the tier and Low keeps the plain disc', () => {
  const { low, medium, high } = QUALITY_TIERS;
  assert.equal(low.lampHalo, 1); assert.equal(low.lampCore, 0);
  assert.ok(medium.lampHalo > low.lampHalo && high.lampHalo > medium.lampHalo);
  assert.ok(medium.lampCore > 0 && high.lampCore > medium.lampCore);
});
