// Round 34 (spec 172): the chronicle and theory exports are deterministic, carry the seed code, hold only what the player learned and contain no em dash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t } from '../src/i18n.js';
import { chronicleExportText, theoryExportText, outcomeComparisonLines, exportFileName } from '../src/export-text.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const model = (over = {}) => ({
  prose: { nights: ['The lamps were lit.', 'A bell rang once.'], summary: 'You learned little.' },
  missing: [
    { id: 'm0', name: 'Ada Vane', home: 'Salt Row', told: 2, outcome: 'Taken by the tide.', given: 'SECRET-GIVEN-LINE' },
    { id: 'm1', name: 'Tobias Reed', home: 'Chapel Lane', told: 0, outcome: '', given: 'HIDDEN-GIVEN-LINE' },
  ],
  mythos: [{ id: 'mythos:omen:3', night: 3, kind: 'omen', text: 'The well hummed.' }],
  theories: [{ grade: 0 }, { grade: 2 }, { grade: 1 }, { grade: 0 }],
  ...over,
});

for (const lang of ['en', 'fr']) for (const format of ['md', 'txt']) {
  test(`chronicle export (${lang}, ${format}) is deterministic, has the seed code and the comparison block`, () => {
    const tr = (k, v) => t(k, lang, v), opts = { tr, format, seedCode: '1818-BLACK-TIDE', endings: { found: 2, total: 7 } };
    const a = chronicleExportText(model(), opts);
    assert.equal(a, chronicleExportText(model(), opts));
    assert.ok(a.includes('1818-BLACK-TIDE'));
    assert.ok(a.toLowerCase().includes(tr('export.compare').toLowerCase()));
    assert.ok(a.includes(tr('export.compare.theories', { n: 4, t: 2, p: 1, f: 1 })));
    assert.ok(a.includes(tr('export.compare.outcomes', { n: 1, total: 2 })));
    assert.ok(a.includes(tr('export.compare.endings', { found: 2, total: 7 })));
    assert.ok(a.includes('The lamps were lit.'));
    assert.ok(!a.includes('\u2014'), 'no em dash');
    assert.ok(!/\{\w+\}/.test(a), 'no unfilled slot');
    assert.equal(a.startsWith('# '), format === 'md');
  });
}

test('chronicle export leaves out everything the player has not learned', () => {
  const text = chronicleExportText(model(), { tr: (k, v) => t(k, 'en', v), format: 'md', seedCode: '1-A-B', endings: null });
  assert.ok(text.includes('Ada Vane'));
  assert.ok(!text.includes('Tobias Reed'), 'a missing person without a lead stays out');
  assert.ok(!text.includes('GIVEN-LINE'), 'the given line is never exported');
  const none = chronicleExportText(model({ prose: null, mythos: [], missing: [model().missing[1]] }), { tr: (k, v) => t(k, 'en', v), format: 'txt', seedCode: '1-A-B', endings: null });
  assert.ok(!none.includes('Tobias') && !none.includes('Taken by the tide'));
  assert.ok(none.includes('Missing outcomes learned: 0 of 1'));
});

test('theory export lists conclusions with the seed code and no em dash', () => {
  const rows = [
    { grade: 0, gradeName: 'True', question: 'Who took Ada?', answer: 'The tide.', verdict: 'The village agrees.', evidence: ['Whisper at the well'] },
    { grade: 2, gradeName: 'False', question: 'Who rang the bell?', answer: 'Nobody.', verdict: 'It was wrong.', evidence: [] },
  ];
  for (const lang of ['en', 'fr']) for (const format of ['md', 'txt']) {
    const tr = (k, v) => t(k, lang, v), opts = { tr, format, seedCode: '42-PALE-BELL', endings: null }, text = theoryExportText(rows, opts);
    assert.equal(text, theoryExportText(rows, opts));
    assert.ok(text.includes('42-PALE-BELL') && text.includes('Who took Ada?') && text.includes('Whisper at the well'));
    assert.ok(text.includes(tr('export.compare.theories', { n: 2, t: 1, p: 0, f: 1 })));
    assert.ok(!text.includes('\u2014') && !/\{\w+\}/.test(text));
  }
  const empty = theoryExportText([], { tr: (k, v) => t(k, 'en', v), format: 'txt', seedCode: '1-A-B', endings: null });
  assert.ok(empty.includes('No theory concluded yet'));
});

test('comparison lines skip what is not available and file names are safe', () => {
  assert.equal(outcomeComparisonLines({ tr: (k) => k, theories: [], missing: null, endings: null }).length, 1);
  assert.equal(exportFileName('chronicle', '1818-BLACK-TIDE', 'md'), 'chronicle-1818-black-tide.md');
  assert.equal(exportFileName('theories', '../x y', 'txt'), 'theories-x-y.txt');
});

test('the title, the chronicle and the board carry the seed code, its entry and the exports; the service worker caches the new files', () => {
  const html = read('../index.html'), sw = read('../sw.js'), app = read('../src/app.js');
  for (const id of ['titleSeedCode', 'titleSeedInput', 'titleSeedApply', 'titleSeedMsg', 'titleDaily', 'chronicleSeed', 'chronicleExportMd', 'chronicleExportTxt', 'dailyCode']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<label for="titleSeedInput"/);
  assert.match(sw, /data\/seedshare\.json/); assert.match(sw, /src\/export-text\.js/); assert.match(sw, /flv-shell-v84/);
  assert.match(app, /data\/seedshare\.json/);
  assert.ok(!/<script(?![^>]*src=)/.test(html) && !/\sstyle="/.test(html.slice(html.indexOf('id="title"'))), 'no inline script or style');
});

test('i18n: every seed and export key exists in en and fr with the same slots', () => {
  const slots = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of ['export.seed', 'export.compare.theories', 'export.compare.outcomes', 'export.compare.endings', 'export.done', 'seed.code.copied', 'seed.code.copyfail', 'seed.code.applied', 'seed.err.mismatch', 'seed.daily', 'export.theory.row']) {
    assert.equal(slots(t(k, 'fr')), slots(t(k, 'en')), k);
    assert.notEqual(t(k, 'fr'), k);
  }
});
