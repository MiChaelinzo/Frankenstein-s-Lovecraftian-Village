import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { STRINGS, LANGS, t, parseLang, extraKeys, missingKeys } from '../src/i18n.js';

test('every non-English key exists in English', () => {
  for (const l of LANGS) assert.deepEqual(extraKeys(l), [], l);
});
test('fr keys equal en keys, with the same placeholders', () => {
  assert.deepEqual(Object.keys(STRINGS.fr).sort(), Object.keys(STRINGS.en).sort());
  for (const l of LANGS) assert.deepEqual(missingKeys(l), [], l);
  const ph = (v) => (v.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of Object.keys(STRINGS.en)) assert.equal(ph(STRINGS.fr[k]), ph(STRINGS.en[k]), k);
  for (const k of Object.keys(STRINGS.en)) assert.ok(STRINGS.fr[k].trim() !== '', k);
});
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(web, 'index.html'), 'utf8');
const norm = (x) => x.replace(/\s+/g, ' ').trim();
test('index.html declares only known keys and its English text is the en table', () => {
  const re = /<(\w+)([^>]*?)\sdata-i18n(-html|-aria)?="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  let n = 0;
  for (const m of html.matchAll(re)) {
    const [, , before, kind, key, after, inner] = m;
    assert.ok(key in STRINGS.en, `unknown key ${key}`);
    n++;
    if (kind === '-aria') assert.equal(/aria-label="([^"]*)"/.exec(before + after)[1], STRINGS.en[key], key);
    else if (kind === '-html') assert.equal(norm(inner), norm(STRINGS.en[key]), key);
    else assert.equal(norm(inner.replace(/<[^>]+>[\s\S]*$/, '')), norm(STRINGS.en[key]), key);
  }
  assert.ok(n > 60, `only ${n} annotated elements`);
});
test('every literal key used in src exists in the en table', () => {
  for (const f of readdirSync(join(web, 'src'))) {
    if (!f.endsWith('.js') || f === 'i18n.js' || f === 'golden-data.js') continue;
    const src = readFileSync(join(web, 'src', f), 'utf8');
    for (const m of src.matchAll(/\b(?:tr|t)\('([a-z]+\.[\w.]+)'/g)) assert.ok(m[1] in STRINGS.en, `${f}: ${m[1]}`);
  }
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
test('unknown languages fall back to English, per key', () => {
  assert.equal(t('btn.door', 'zz'), STRINGS.en['btn.door']);
});
test('no em dashes in strings', () => { assert.ok(!JSON.stringify(STRINGS).includes('\u2014')); });
