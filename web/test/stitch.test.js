import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stitchModel, stitchHtml, STITCH_PARTS } from '../src/stitch.js';
import { STRINGS, t } from '../src/i18n.js';

const data = JSON.parse(readFileSync(new URL('../data/stitch.json', import.meta.url), 'utf8'));

test('real generated data produces a model for every part', () => {
  const m = stitchModel(data);
  assert.deepEqual(m.map((p) => p.id), STITCH_PARTS.map((p) => p.id));
  assert.ok(m.find((p) => p.id === 'golden').vars.vectors > 100);
  assert.ok(m.find((p) => p.id === 'core').vars.count > 10);
});
test('rejects junk and sanitizes numbers', () => {
  for (const bad of [null, 5, [], {}, { version: 2, parts: {} }, { version: 1 }]) assert.equal(stitchModel(bad), null);
  const m = stitchModel({ version: 1, parts: { core: { count: -3, x: 'a' }, js: 'zzz' } });
  assert.equal(m.find((p) => p.id === 'core').vars.count, 0);
  assert.equal(m.find((p) => p.id === 'js').vars.count, 0);
});
test('every link points at a known part', () => {
  const ids = new Set(STITCH_PARTS.map((p) => p.id));
  for (const p of STITCH_PARTS) for (const f of p.feeds) assert.ok(ids.has(f));
});
test('html shows repo numbers in both languages and escapes', () => {
  const m = stitchModel(data);
  for (const lang of ['en', 'fr']) {
    const html = stitchHtml(m, (k, v) => t(k, lang, v));
    assert.match(html, new RegExp(`\\b${m.find((p) => p.id === 'golden').vars.vectors}\\b`));
    assert.ok(!/\{\w+\}/.test(html), `unfilled placeholder in ${lang}`);
  }
  assert.match(stitchHtml(null, (k) => `<${k}>`), /&lt;stitch\.unavailable&gt;/);
  assert.ok(STRINGS.en['stitch.unavailable']);
});
