import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGS, t, parseLang, extraKeys } from '../src/i18n.js';

test('every non-English key exists in English', () => {
  for (const l of LANGS) assert.deepEqual(extraKeys(l), [], l);
});
test('fr is complete for now (stub parity)', () => {
  assert.deepEqual(Object.keys(STRINGS.fr).sort(), Object.keys(STRINGS.en).sort());
});
test('lookup, fallback and interpolation', () => {
  assert.equal(t('btn.share', 'fr'), 'Copier le lien');
  assert.equal(t('label.dread', 'en', { n: 40 }), 'Dread 40%');
  assert.equal(t('label.dread', 'fr', { n: 40 }), 'Effroi 40%');
  assert.equal(t('btn.share', 'xx'), 'Copy share link');
  assert.equal(t('no.such.key', 'fr'), 'no.such.key');
  assert.equal(t('label.dread', 'en'), 'Dread {n}%');
});
test('parseLang', () => {
  assert.equal(parseLang('fr'), 'fr'); assert.equal(parseLang('FR-ca'), 'fr');
  for (const v of [null, '', 'de', 'zz', undefined]) assert.equal(parseLang(v), 'en');
});
test('no em dashes in strings', () => { assert.ok(!JSON.stringify(STRINGS).includes('\u2014')); });
