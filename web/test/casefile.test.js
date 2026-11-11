import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign } from '../src/core.js';
import { buildCaseFile, caseFileHtml, caseFileName } from '../src/casefile.js';

const input = () => ({ campaign: generateCampaign(1818), seed: 1818, sanity: 61.4, journal: [{ kind: 'omen', text: 'A <bell> rings.', sanity: 60 }], report: { pieces: 80, tier: 'Uneasy', dreadPercent: 39, omen: 'Fog\nrises.' } });
test('deterministic markdown with nights, beats and journal', () => {
  const a = buildCaseFile(input()), b = buildCaseFile(input());
  assert.equal(a, b);
  assert.match(a, /^# Case File: [A-Z]\w+\n/);
  assert.equal((a.match(/^### Night \d+: /gm) || []).length, 5);
  assert.match(a, /## Story beats\n\n- \[night 1,/);
  assert.match(a, /1\. \(omen, sanity 60\) A <bell> rings\./);
  assert.match(a, /> Fog rises\./);
  assert.ok(!a.includes('\u2014'));
});
test('handles missing campaign and empty journal', () => {
  const m = buildCaseFile({ campaign: null, seed: 3, sanity: 0 });
  assert.match(m, /Unknown/);
  assert.match(m, /No entries recorded/);
});
test('html escapes and has no scripts', () => {
  const h = caseFileHtml(buildCaseFile(input()));
  assert.match(h, /A &lt;bell&gt; rings\./);
  assert.ok(!/<script/i.test(h) && !h.includes('<bell>'));
  assert.match(h, /<h1>Case File: /);
  assert.match(h, /<ol>/);
});
test('file names', () => { assert.equal(caseFileName(5.9, 'md'), 'village-casefile-seed-5.md'); });

test('case file includes the ritual chain section', () => {
  const a = buildCaseFile(input());
  assert.match(a, /\n## Ritual: The [^\n]+\n\n- Night 1, /);
  assert.equal((a.match(/^- Night \d+, \w+ \(sigil /gm) || []).length, 5);
  assert.ok(a.indexOf('## Ritual') < a.indexOf('## Story beats'));
});

test('case file states night schedule, dread reached and effective stage', () => {
  const a = buildCaseFile({ ...input(), night: 4, sanity: 80 });
  assert.match(a, /Night schedule: night N reaches ritual stage N of 5/);
  assert.match(a, /Current: night schedule: stage 4 of 5, dread reached: (none|stage [123]), effective stage 4 \(behind\)\./);
  assert.ok(!buildCaseFile(input()).includes('Current: night schedule'));
});
