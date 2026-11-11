import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Lighthouse-style static checks on index.html and style.css (no browser needed).
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(web, 'index.html'), 'utf8');
const css = readFileSync(join(web, 'style.css'), 'utf8');

test('document basics: lang, charset, title, viewport, description', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  const title = /<title>([^<]+)<\/title>/.exec(html);
  assert.ok(title && title[1].trim().length >= 10);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  const desc = /<meta name="description" content="([^"]+)"/.exec(html);
  assert.ok(desc && desc[1].length >= 50 && desc[1].length <= 200);
  assert.match(html, /<main\b/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
});
test('every img has alt text, none are used for text', () => {
  for (const m of html.matchAll(/<img\b[^>]*>/g)) assert.match(m[0], /\salt="/, m[0]);
});
test('every button has an accessible name (text, aria-label or child text)', () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  assert.ok(buttons.length > 25);
  for (const [, attrs, inner] of buttons) {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const named = text || /aria-label="[^"]+"/.test(attrs) || /data-i18n/.test(attrs) || /data-i18n/.test(inner);
    assert.ok(named, `unnamed button: ${attrs}`);
    assert.match(attrs, /\btype="button"/, `button without type: ${attrs}`);
  }
});
test('form controls have labels or aria-labels; ids are unique', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  const labelFor = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/<(input|select)\b([^>]*)>/g)) {
    const id = /\sid="([^"]+)"/.exec(m[2])?.[1];
    const wrapped = new RegExp(`<label[^>]*>[^<]*<${m[1]}\\b[^>]*${id ? `id="${id}"` : 'NOID'}`).test(html);
    assert.ok(labelFor.has(id) || /aria-label=/.test(m[2]) || wrapped, `unlabelled ${m[1]} ${id}`);
  }
});
test('aria references point at existing ids', () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\baria-(?:labelledby|describedby|controls)="([^"]+)"/g)) {
    for (const ref of m[1].split(/\s+/)) assert.ok(ids.has(ref), `dangling aria ref ${ref}`);
  }
  assert.match(html, /class="skip-link" href="#view"/);
});
test('canvas elements are named and the live regions exist', () => {
  for (const m of html.matchAll(/<canvas\b[^>]*>/g)) assert.match(m[0], /aria-label=/, m[0]);
  assert.match(html, /id="toastLive"[^>]*aria-live="polite"/);
});
test('no inline scripts or event-handler attributes (CSP script-src self)', () => {
  assert.ok(![...html.matchAll(/<script\b([^>]*)>/g)].some((m) => !/\bsrc="/.test(m[1])));
  assert.ok(!/\son(?:click|load|error|input|change)\s*=/.test(html));
});

// ---- WCAG AA contrast computed from the CSS variables ----
const lum = (hex) => {
  const h = hex.replace('#', ''); const v = (h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g)).map((x) => parseInt(x, 16) / 255);
  const [r, g, b] = v.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const vars = (block) => Object.fromEntries([...block.matchAll(/--(\w+):\s*(#[0-9a-fA-F]{3,6})/g)].map((m) => [m[1], m[2]]));
const root = vars(/:root\s*\{([^}]*)\}/.exec(css)[1]);
const hc = { ...root, ...vars(/html\.hc\s*\{([^}]*)\}/.exec(css)[1]) };

test('contrast helper matches known values', () => {
  assert.ok(Math.abs(ratio('#000000', '#ffffff') - 21) < 1e-9);
  assert.ok(Math.abs(ratio('#777777', '#ffffff') - 4.48) < 0.01);
});
test('default theme text tokens meet WCAG AA (4.5:1) on the darkest and panel backgrounds', () => {
  for (const bg of ['#05080a', '#0b1012', '#10181a', '#0a1011', '#101a1c', '#060b0c']) {
    for (const k of ['ink', 'dim', 'moss']) assert.ok(ratio(root[k], bg) >= 4.5, `${k} ${root[k]} on ${bg}: ${ratio(root[k], bg).toFixed(2)}`);
  }
});
test('blood accent stays at least 3:1 (large text and graphics, AA) on the page background', () => {
  assert.ok(ratio(root.blood, '#05080a') >= 3, ratio(root.blood, '#05080a').toFixed(2));
});
test('high-contrast theme meets AAA (7:1) against black', () => {
  for (const k of ['ink', 'dim', 'moss', 'blood']) assert.ok(ratio(hc[k], '#000000') >= 7, `${k} ${hc[k]}: ${ratio(hc[k], '#000000').toFixed(2)}`);
});
test('focus styles exist for keyboard users', () => {
  assert.match(css, /button:focus-visible/);
  assert.match(css, /canvas:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
});

// Wiring guards for player-input paths (DOM glue is not unit-testable without a browser).
const appSrc = readFileSync(join(web, 'src', 'app.js'), 'utf8');
const tourSrc = readFileSync(join(web, 'src', 'tour-ui.js'), 'utf8');
test('keyboard sanity and story keys arm progress like their mouse equivalents', () => {
  for (const k of ["case '['", "case ']'", "e.key === 'ArrowRight' && !onCanvas", "e.key === 'ArrowLeft' && !onCanvas", "e.key === '.'", "e.key === ','"]) {
    const line = appSrc.split('\n').find((l) => l.includes(k) && /setSanity|showBeat/.test(l));
    assert.ok(line && line.includes('progress.arm();'), k);
  }
});
test('tour: skip stops propagation, pointerleave only restarts the timer, About pauses it', () => {
  assert.match(tourSrc, /'skip'\) \{ e\.stopPropagation\(\); close\(\)/);
  assert.match(tourSrc, /pointerleave', \(\) => \{ if \(isOpen\(\)\) startTimer\(\)/);
  assert.match(appSrc, /if \(on\) pauseTour\(\); else resumeTour\(\)/);
});
