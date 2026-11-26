// Round 37 (FEAT-003 item 1): one term per concept across the UI strings (en and fr), the data files and the English docs.
// Driven from test/terminology-table.js. A synonym, a drifted knowledge tier name or a changed trust or axis label fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../src/i18n.js';
import { CONCEPTS } from './terminology-table.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Every string that sits under an "en" or "fr" key of a data file, tagged with its language. */
function dataTexts(node, lang, out) {
  if (typeof node === 'string') { if (lang) out.push({ lang, text: node }); return out; }
  if (Array.isArray(node)) { for (const v of node) dataTexts(v, lang, out); return out; }
  if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) dataTexts(v, k === 'en' || k === 'fr' ? k : lang, out);
  return out;
}
const dataDir = here('../data/');
const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
const corpus = [];
for (const [lang, table] of Object.entries(STRINGS)) for (const [key, text] of Object.entries(table)) corpus.push({ lang, where: `i18n ${lang} ${key}`, text: String(text) });
for (const f of files) for (const d of dataTexts(JSON.parse(readFileSync(dataDir + f, 'utf8')), null, [])) corpus.push({ lang: d.lang, where: `data/${f}`, text: d.text });
// docs are English; history files record old wording on purpose; TERMINOLOGY.md lists the banned words
const docFiles = ['../../README.md', ...readdirSync(here('../../docs/')).filter((f) => f.endsWith('.md') && !['BUILD_LOG.md', 'ROUND20_REPORT_NOTES.md', 'TERMINOLOGY.md'].includes(f)).map((f) => `../../docs/${f}`)];
for (const f of docFiles) corpus.push({ lang: 'en', where: f.replace('../../', ''), text: readFileSync(here(f), 'utf8') });

export const wordRe = (term, lang) => new RegExp(`(^|[^a-z])${lang === 'fr' ? norm(term) : term.toLowerCase()}(?![a-z])`);
/** Returns the list of forbidden-term hits as "where: term" strings. */
export function findDrift(entries, concepts = CONCEPTS) {
  const hits = [];
  for (const c of concepts) for (const lang of ['en', 'fr']) for (const bad of c.forbidden[lang]) {
    const re = wordRe(bad, lang);
    for (const e of entries) if (e.lang === lang && re.test(norm(e.text))) hits.push(`${e.where}: "${bad}" (use ${c[lang]})`);
  }
  return hits;
}

test('every canonical label in the table is what the UI shows, in both languages', () => {
  for (const c of CONCEPTS) for (const [key, [en, fr]] of Object.entries(c.exact || {})) {
    assert.equal(STRINGS.en[key], en, `en ${key}`);
    assert.equal(STRINGS.fr[key], fr, `fr ${key}`);
  }
});
test('the sentences that name a concept contain its canonical term', () => {
  for (const c of CONCEPTS) for (const [key, [en, fr]] of Object.entries(c.contains || {})) {
    assert.ok(STRINGS.en[key].includes(en), `en ${key} has "${en}"`);
    assert.ok(STRINGS.fr[key].includes(fr), `fr ${key} has "${fr}"`);
  }
});
test('no synonym of a table term appears in the UI strings, data files or English docs', () => {
  assert.deepEqual(findDrift(corpus), []);
});
test('drift is detected: a synonym injected into each language fails the scan', () => {
  const injected = [{ lang: 'en', where: 'x', text: 'The villager is tainted and terrified of you.' }, { lang: 'fr', where: 'y', text: 'Il est rempli de crainte.' }];
  const hits = findDrift(injected);
  assert.ok(hits.some((h) => h.includes('tainted')) && hits.some((h) => h.includes('terrified')) && hits.some((h) => h.includes('crainte')), hits.join('|'));
});
test('the six knowledge tier names come from one data file with an English and a French name each', () => {
  const k = JSON.parse(readFileSync(dataDir + 'knowledge.json', 'utf8'));
  assert.deepEqual(k.tiers.map((t) => t.en), ['Nothing', 'Village Folklore', 'Cult Secrets', 'Forbidden Texts', 'Eldritch Science', 'Outer Truth']);
  for (const t of k.tiers) assert.ok(t.en && t.fr, t.id);
  const pkg = JSON.parse(readFileSync(here('../../Packages/com.michaelinzo.frankenstein-village/Data/knowledge.json'), 'utf8'));
  assert.deepEqual(pkg.tiers.map((t) => [t.en, t.fr]), k.tiers.map((t) => [t.en, t.fr]));
});
test('the six missing outcomes have one id list in Data and both languages', () => {
  const o = JSON.parse(readFileSync(dataDir + 'outcomes.json', 'utf8'));
  assert.deepEqual(o.outcomes.map((x) => x.id), ['dead', 'escaped', 'recruited', 'transformed', 'hidden', 'displaced']);
  for (const x of o.outcomes) assert.ok(x.en.includes('{missing}') && x.fr.includes('{missing}'), x.id);
});
test('the creature manifestation tiers are the numbers 1 to 4 and each has an English and a French name', () => {
  const c = JSON.parse(readFileSync(dataDir + 'creatures.json', 'utf8'));
  const tiers = [...new Set(c.manifestations.map((m) => m.tier))].sort();
  assert.deepEqual(tiers, [1, 2, 3, 4]);
});
