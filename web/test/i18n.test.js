import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { locName } from '../src/i18n-text.js';
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
const attrKeys = [...html.matchAll(/\sdata-i18n(?:-html|-aria)?="([^"]+)"/g)].map((m) => m[1]);
test('every data-i18n key in index.html exists in en and fr with non-empty text', () => {
  assert.ok(attrKeys.length > 80, `${attrKeys.length} keys`);
  for (const k of attrKeys) for (const l of LANGS) assert.ok(STRINGS[l][k] && STRINGS[l][k].trim(), `${l}: ${k}`);
});
test('fr html strings keep the same tags as en (kbd, links) and the same link targets', () => {
  const tags = (v) => (v.match(/<\/?\w+/g) || []).join(',');
  const hrefs = (v) => (v.match(/href="[^"]+"/g) || []).join(',');
  for (const k of Object.keys(STRINGS.en)) {
    assert.equal(tags(STRINGS.fr[k]), tags(STRINGS.en[k]), k);
    assert.equal(hrefs(STRINGS.fr[k]), hrefs(STRINGS.en[k]), k);
  }
});
test('plain strings contain no markup; only html keys may', () => {
  const htmlKeys = new Set(attrKeys.filter((k) => new RegExp(`data-i18n-html="${k.replace(/\./g, '\\.')}"`).test(html)));
  for (const [k, v] of Object.entries(STRINGS.en)) if (!htmlKeys.has(k)) assert.ok(!/<[a-z]/i.test(v), `${k} has markup but is not data-i18n-html`);
});
test('every placeholder written in en is passed by some call site', () => {
  // each {name} must appear as a key in some call in src; a typo like {nn} would render literally
  const seen = new Set();
  for (const v of Object.values(STRINGS.en)) for (const m of v.matchAll(/\{(\w+)\}/g)) seen.add(m[1]);
  const src = readdirSync(join(web, 'src')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(web, 'src', f), 'utf8')).join('\n');
  for (const name of seen) assert.ok(new RegExp(`\\b${name}\\s*[:,}]`).test(src), `placeholder {${name}} never passed anywhere`);
});
test('the tour and About keys exist in both languages', () => {
  for (const l of LANGS) for (const k of ['tour.step', 'tour.hint', 'btn.tourdone', 'btn.tourskip', 'btn.about', 'btn.close', 'about.title', 'about.html', 'keys.about', 'keys.tour']) assert.ok(STRINGS[l][k], `${l}: ${k}`);
});

test('Core PromptStrings.PlaceName matches locName for every golden case', () => {
  const places = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.json'), 'utf8')).places;
  assert.ok(places.length > 0);
  for (const [lang, id, name] of places) assert.equal(locName(parseLang(lang), id), name, `${lang}/${id}`);
});
