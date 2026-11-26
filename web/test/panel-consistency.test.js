// Round 37 (FEAT-003 item 2): the panels share one Victorian vocabulary (v-heading, v-subheading, v-badge, v-empty, v-error and one focus ring),
// and the page keeps a self-only style policy: no inline style attribute, no style element, no 'unsafe-inline'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KIND_COLORS, OTHER_COLOR } from '../src/minimap.js';

const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => readFileSync(here(p), 'utf8');
const html = read('../index.html'), css = read('../style.css');
const layer = css.slice(css.indexOf('round 37 (FEAT-003 item 2): one panel vocabulary'));
const srcFiles = readdirSync(here('../src/')).filter((f) => f.endsWith('.js') && !['golden-data.js', 'i18n.js'].includes(f));
const tokens = Object.fromEntries([...css.matchAll(/--(v-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

export const headingsWithout = (markup, tag, cls) => [...markup.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map((m) => m[0]).filter((o) => !new RegExp(`class="[^"]*\\b${cls}\\b`).test(o));

test('every h2 and h3 in the page uses the shared heading classes', () => {
  assert.deepEqual(headingsWithout(html, 'h2', 'v-heading'), []);
  assert.deepEqual(headingsWithout(html, 'h3', 'v-subheading'), []);
});
test('the heading detector fails on a plain heading (injected)', () => {
  assert.equal(headingsWithout('<h2 id="x">a</h2><h2 class="v-heading">b</h2>', 'h2', 'v-heading').length, 1);
});
test('headings built in scripts use the shared classes', () => {
  for (const f of srcFiles) { const s = read(`../src/${f}`); assert.deepEqual(headingsWithout(s, 'h3', 'v-subheading'), [], f); assert.deepEqual(headingsWithout(s, 'h2', 'v-heading'), [], f); }
});
test('the paper panels (chronicle, journal page) set the paper surface and the others keep wood', () => {
  assert.match(html, /class="panel chronicle v-paper"/);
  assert.match(html, /id="loreDialog" class="lore-dialog v-paper"/);
  assert.doesNotMatch(html, /class="[^"]*(board-dialog|inv-dialog|villager-dialog)[^"]*v-paper/);
});
test('empty states in the journal, chronicle, board and inventory use v-empty', () => {
  assert.match(html, /<li class="empty v-empty"/);
  assert.match(read('../src/chronicle-ui.js'), /class="stats v-empty"[^>]*>\$\{esc\(tr\('chronicle\.empty'\)\)/);
  assert.match(read('../src/chronicle-ui.js'), /v-empty" id="chronicleMythos"/);
  assert.match(read('../src/chronicle-ui.js'), /v-empty" id="chroniclePeople"/);
  assert.match(read('../src/inventory-ui.js'), /inv-empty v-empty/);
  assert.match(read('../src/board-ui.js'), /board-timeline-empty v-empty/);
});
test('badges and the title error state use the shared classes', () => {
  assert.match(html, /class="reality-badge v-badge"/);
  assert.match(html, /class="jbadge v-badge"/);
  assert.match(read('../src/title-ui.js'), /'title-reason v-error'/);
});
test('the shared layer defines every class and one focus ring', () => {
  for (const sel of ['h2.v-heading', 'h3.v-subheading', '.v-badge', '.v-empty', '.v-error', '.v-paper']) assert.ok(layer.includes(sel), sel);
  assert.match(layer, /:is\(button, a, input, select, textarea, summary, \[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible \{ outline: 3px solid var\(--v-focus\)/);
});
test('shared text colours reach 4.5:1 on both surfaces', () => {
  const wood = ['v-wood', 'v-wood-hi'], paper = ['v-paper', 'v-paper-deep'];
  for (const [fg, bgs] of [['v-on-wood', wood], ['v-on-wood-dim', wood], ['v-brass', wood], ['v-ink', paper], ['v-ink-soft', paper], ['v-ink-red', paper], ['v-ink-blue', paper]])
    for (const bg of bgs) assert.ok(contrast(tokens[fg], tokens[bg]) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast('#f1e6c8', tokens['v-wood']) >= 4.5 && contrast('#e69a9e', tokens['v-wood']) >= 4.5);
});
test('no inline style attribute or style element in the pages, scripts or templates', () => {
  for (const page of ['index.html', 'meshes.html', 'selftest.html']) { const s = read(`../${page}`); assert.doesNotMatch(s, /\sstyle=/, page); assert.doesNotMatch(s, /<style\b/, page); }
  for (const f of srcFiles) { const s = read(`../src/${f}`); assert.doesNotMatch(s, /\sstyle="|setAttribute\(\s*'style'|cssText/, f); }
});
test('the style policy is self-only and the same in all three header files', () => {
  for (const f of ['../_headers', '../../netlify.toml', '../../vercel.json']) {
    const s = read(f), m = s.match(/style-src ([^;]*);/);
    assert.ok(m, f); assert.equal(m[1].trim(), "'self'", f);
    assert.doesNotMatch(s, /unsafe-inline|unsafe-eval/, f);
    assert.match(s, /font-src 'self' data:/, f);
  }
});
test('the stylesheet loads no external font, url or import', () => {
  assert.doesNotMatch(css, /@font-face|@import|url\(\s*['"]?https?:/);
});
test('every minimap legend colour has a swatch class', () => {
  for (const c of [...Object.values(KIND_COLORS), OTHER_COLOR]) assert.ok(css.includes(`.swatch-${c.slice(1)} { background: ${c}; }`), c);
});
