import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTitle, webglForcedOff, lowPowerDevice, titleModel, titleSubtitle, BACKDROP_BEATS } from '../src/title.js';
import { generateCampaign } from '../src/core.js';

test('title shows on a bare URL and is disabled by ?intro=0 or #intro=0', () => {
  assert.equal(shouldShowTitle('', ''), true);
  assert.equal(shouldShowTitle('?intro=0', ''), false);
  assert.equal(shouldShowTitle('', '#intro=0'), false);
  assert.equal(shouldShowTitle('?intro=1', ''), true);
  assert.equal(shouldShowTitle('?pack=1', ''), true);
  assert.equal(shouldShowTitle('?lang=fr', ''), true);
});

test('deep links and explicit view requests skip the title', () => {
  for (const h of ['#seed=1818', '#story=1&night=2', '#sanity=50', '#night=3']) assert.equal(shouldShowTitle('', h), false, h);
  for (const q of ['?story=1', '?view=3d', '?cinematic=1', '?capture=1']) assert.equal(shouldShowTitle(q, ''), false, q);
  assert.equal(shouldShowTitle('', '#view=3d'), false);
  assert.equal(shouldShowTitle('?view=2d', ''), true);
});

test('webgl can be forced off for the 2D fallback check', () => {
  assert.equal(webglForcedOff('?webgl=0', ''), true);
  assert.equal(webglForcedOff('', '#webgl=0'), true);
  assert.equal(webglForcedOff('?webgl=1', ''), false);
  assert.equal(webglForcedOff('', ''), false);
});

test('low power detection', () => {
  assert.equal(lowPowerDevice(null), false);
  assert.equal(lowPowerDevice({ hardwareConcurrency: 8, deviceMemory: 8 }), false);
  assert.equal(lowPowerDevice({ hardwareConcurrency: 2 }), true);
  assert.equal(lowPowerDevice({ deviceMemory: 1 }), true);
  assert.equal(lowPowerDevice({ hardwareConcurrency: 8, connection: { saveData: true } }), true);
  assert.equal(lowPowerDevice({}), false);
});

test('title model: 3D when it can, 2D recommended on weak devices, 3D disabled without WebGL', () => {
  assert.deepEqual(titleModel({ webgl: true, lowPower: false, reduced: false }), { can3d: true, recommend: '3d', reasonKey: '', backdrop: '3d', still: false });
  assert.deepEqual(titleModel({ webgl: true, lowPower: false, reduced: true }), { can3d: true, recommend: '3d', reasonKey: '', backdrop: '3d', still: true });
  assert.deepEqual(titleModel({ webgl: true, lowPower: true, reduced: false }), { can3d: true, recommend: '2d', reasonKey: 'title.reason.lowpower', backdrop: '2d', still: false });
  assert.deepEqual(titleModel({ webgl: false, lowPower: false, reduced: false }), { can3d: false, recommend: '2d', reasonKey: 'title.reason.nogl', backdrop: '2d', still: false });
});

test('subtitle is the generated first-night rumor, deterministic, no em dashes', () => {
  const c = generateCampaign(1818);
  const s = titleSubtitle(c);
  assert.deepEqual(s, titleSubtitle(generateCampaign(1818)));
  assert.equal(s.name, c.villageName);
  assert.equal(s.rumor, c.nights[0].rumor);
  assert.ok(!/\u2014/.test(s.name + s.rumor));
  assert.deepEqual(titleSubtitle(null), { name: '', rumor: '' });
});

test('backdrop beats are fixed', () => { assert.ok(BACKDROP_BEATS.length >= 20 && BACKDROP_BEATS.every((d) => d > 0)); });
