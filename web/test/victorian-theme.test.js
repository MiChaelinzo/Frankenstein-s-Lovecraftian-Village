// Spec 165 (round 33): the Victorian palette tokens in web/style.css keep body text at 4.5:1 or better, and the layer stays CSP-safe and motion-safe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('../style.css', import.meta.url)), 'utf8');
const layer = css.slice(css.indexOf('round 33 Victorian reskin'));
const tokens = Object.fromEntries([...layer.matchAll(/--(v-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));

const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// foreground token on background token, as used by the layer (text on wood, ink on paper)
const PAIRS = [
  ['v-on-wood', 'v-wood'], ['v-on-wood', 'v-wood-hi'], ['v-on-wood-dim', 'v-wood'], ['v-brass', 'v-wood'],
  ['v-ink', 'v-paper'], ['v-ink', 'v-paper-deep'], ['v-ink-soft', 'v-paper'], ['v-ink-soft', 'v-paper-deep'],
  ['v-ink-blue', 'v-paper'], ['v-ink-blue', 'v-paper-deep'], ['v-ink-red', 'v-paper'], ['v-ink-red', 'v-paper-deep'], ['v-paper', 'v-ink'],
];

test('the theme tokens exist', () => { for (const [f, b] of PAIRS) { assert.ok(tokens[f], f); assert.ok(tokens[b], b); } });
test('every text pair reaches 4.5:1', () => {
  for (const [f, b] of PAIRS) assert.ok(contrast(tokens[f], tokens[b]) >= 4.5, `${f} on ${b} is ${contrast(tokens[f], tokens[b]).toFixed(2)}`);
});
// hard-coded colours of the layer: text colour, the token it sits on (the hint sits over the dark 3D scene, so it is checked against the wood and a black floor)
const HARD = [
  ['#6e3609', 'v-paper'], ['#6e3609', 'v-paper-deep'], ['#1d5232', 'v-paper'], ['#1d5232', 'v-paper-deep'],
  ['#e69a9e', 'v-wood'], ['#e69a9e', 'v-wood-hi'], ['#d6cdb6', 'v-wood'], ['#d6cdb6', '#000000'],
];
test('hard-coded text colours reach 4.5:1 on their backgrounds', () => {
  for (const [fg, bg] of HARD) {
    assert.ok(css.includes(fg), `${fg} is still used in style.css`);
    const back = bg.startsWith('#') ? bg : tokens[bg];
    assert.ok(contrast(fg, back) >= 4.5, `${fg} on ${bg} is ${contrast(fg, back).toFixed(2)}`);
  }
});
test('the contrast helper matches known values', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01);
  assert.ok(Math.abs(contrast('#777777', '#777777') - 1) < 0.001);
});
test('the layer has no external fonts or urls and no web font files', () => {
  assert.doesNotMatch(layer, /@font-face|url\(|@import/);
});
test('chronicle and journal animations stop under reduced motion', () => {
  assert.match(layer, /html\.reduced \.chronicle[^{]*\{ animation: none; \}/);
  const media = layer.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\}/);
  assert.ok(media, 'the reduced motion media rule exists');
  assert.match(media[0], /\.chronicle\b/);
  assert.match(media[0], /\.lore-page\b/);
  assert.match(media[0], /animation:\s*none/);
});
test('the layer does not use inline style attributes in the page', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
  assert.doesNotMatch(html, /\sstyle="/);
});
