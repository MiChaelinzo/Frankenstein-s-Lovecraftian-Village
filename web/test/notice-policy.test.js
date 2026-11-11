import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unitHash, toastMayReplace, gatedFlash, applyFlash, ambientFlash, dreadJitter,
  TOAST_MIN_HOLD_MS, FLASH_MAX, FLASH_MIN_GAP_MS, AMBIENT_SLOT_MS,
} from '../src/scene.js';
import { t } from '../src/i18n.js';

test('unitHash is deterministic and in [0,1)', () => {
  for (let i = 0; i < 200; i++) {
    const v = unitHash(1818, i, 1);
    assert.equal(v, unitHash(1818, i, 1));
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(unitHash(1, 5, 1), unitHash(2, 5, 1));
});

test('a recent banner is kept unless the new one is rising', () => {
  const cur = { at: 1000, rising: false };
  assert.equal(toastMayReplace(null, { rising: false }, 0), true);
  assert.equal(toastMayReplace(cur, { rising: false }, 1000 + TOAST_MIN_HOLD_MS - 1), false);
  assert.equal(toastMayReplace(cur, { rising: false }, 1000 + TOAST_MIN_HOLD_MS), true);
  assert.equal(toastMayReplace(cur, { rising: true }, 1001), true);
  assert.equal(toastMayReplace({ at: 1000, rising: true }, { rising: false }, 1001), false);
});

test('flashes are capped and cannot strobe', () => {
  assert.equal(gatedFlash(0, null, 0), 0);
  assert.equal(gatedFlash(5, null, 0), FLASH_MAX);
  assert.equal(gatedFlash(0.2, 100, 100 + FLASH_MIN_GAP_MS - 1, 0.2), 0);
  assert.equal(gatedFlash(0.2, 100, 100 + FLASH_MIN_GAP_MS), 0.2);
});

test('a light flash never masks a heavy one inside the gap', () => {
  assert.equal(gatedFlash(0.3, 100, 200, 0.15), 0.3);
  assert.equal(gatedFlash(0.15, 100, 200, 0.3), 0);
  assert.equal(gatedFlash(0.3, 100, 200, 0.3), 0);
  const st = { flash: 0, flashAt: null, flashLevel: 0 };
  assert.equal(applyFlash(st, 0.15, 1000), true);
  assert.equal(applyFlash(st, 0.15, 1500), false);
  assert.equal(applyFlash(st, 0.3, 2000), true, 'church flash passes after a focus flash');
  assert.deepEqual([st.flash, st.flashAt, st.flashLevel], [0.3, 2000, 0.3]);
  assert.equal(applyFlash(st, 0.2, 2500), false);
  assert.equal(applyFlash(st, 0.2, 2000 + FLASH_MIN_GAP_MS), true);
});

test('ambient lightning and jitter are seed-driven and quiet at low dread', () => {
  assert.equal(ambientFlash(7, 0, 0.4), 0);
  assert.deepEqual(dreadJitter(7, 0, 0.5), { dx: 0, dy: 0 });
  let a = 0, b = 0;
  for (let i = 0; i < 4000; i++) {
    const now = i * AMBIENT_SLOT_MS;
    assert.equal(ambientFlash(7, now, 0.9), ambientFlash(7, now, 0.9));
    if (ambientFlash(7, now, 0.9) > 0) a++;
    if (ambientFlash(8, now, 0.9) > 0) b++;
  }
  assert.ok(a > 0 && a < 400 && b > 0, `rate ${a}/${b}`);
  assert.deepEqual(dreadJitter(7, 120, 0.9), dreadJitter(7, 120, 0.9));
  assert.ok(Math.abs(dreadJitter(7, 120, 1).dx) <= 1.5);
});

test('draw.js no longer uses unseeded randomness in the render path', async () => {
  const { readFile } = await import('node:fs/promises');
  const draw = await readFile(new URL('../src/draw.js', import.meta.url), 'utf8');
  assert.equal(/Math\.random/.test(draw), false);
  assert.ok(t('en', 'hint.view') && t('fr', 'hint.view'));
});
