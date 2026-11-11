import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOUR_STEPS, tourWanted, tourTotalMs, tourNext, tourPrev, tourDelayMs, tourKeyAction } from '../src/tour.js';
import { STRINGS } from '../src/i18n.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(web, 'index.html'), 'utf8');

test('tour is opt-in: only ?tour=1 or #tour=1 starts it', () => {
  assert.equal(tourWanted('', ''), false);
  assert.equal(tourWanted('?intro=0', '#seed=1'), false);
  assert.equal(tourWanted('?tour=0', ''), false);
  assert.equal(tourWanted('?tour=1', ''), true);
  assert.equal(tourWanted('', '#seed=1&tour=1'), true);
  assert.equal(tourWanted(undefined, null), false);
});
test('tour lasts about a minute', () => {
  const s = tourTotalMs() / 1000;
  assert.ok(s >= 50 && s <= 75, `${s}s`);
});
test('stepping is clamped and finishes', () => {
  assert.deepEqual(tourNext(0), { done: false, index: 1 });
  assert.deepEqual(tourNext(TOUR_STEPS.length - 1), { done: true, index: TOUR_STEPS.length - 1 });
  assert.equal(tourPrev(0), 0); assert.equal(tourPrev(3), 2);
});
test('reduced motion never auto-advances; the last step never does', () => {
  assert.ok(tourDelayMs(0, false) > 0);
  assert.equal(tourDelayMs(0, true), 0);
  assert.equal(tourDelayMs(TOUR_STEPS.length - 1, false), 0);
});
test('keyboard map: Esc skips, arrows move, Enter is left to focused buttons', () => {
  assert.equal(tourKeyAction('Escape'), 'skip');
  assert.equal(tourKeyAction('ArrowRight'), 'next'); assert.equal(tourKeyAction('ArrowLeft'), 'prev');
  assert.equal(tourKeyAction('Enter'), 'next'); assert.equal(tourKeyAction('Enter', true), null);
  assert.equal(tourKeyAction('x'), null);
});
test('every step has a target in index.html and en and fr text', () => {
  const ids = new Set();
  for (const s of TOUR_STEPS) {
    assert.ok(!ids.has(s.id), s.id); ids.add(s.id);
    assert.match(html, new RegExp(`id="${s.target}"`), s.target);
    for (const l of ['en', 'fr']) for (const k of [`tour.${s.id}`, `tour.${s.id}.d`]) assert.ok(STRINGS[l][k], `${l} ${k}`);
  }
});
test('the tour card and About dialog exist, with their buttons', () => {
  for (const id of ['tour', 'tourTitle', 'tourText', 'tourStep', 'tourPrev', 'tourNext', 'tourSkip', 'about', 'aboutBtn', 'aboutClose']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<dialog id="about"/);
  assert.match(html, /id="tour"[^>]*\shidden/);
});
test('About credits DLNK honestly and links LICENSE and NOTICE', () => {
  for (const l of ['en', 'fr']) {
    const a = STRINGS[l]['about.html'];
    assert.match(a, /DLNK Artworks/); assert.match(a, /LICENSE/); assert.match(a, /NOTICE/); assert.match(a, /Apache/);
  }
  assert.match(STRINGS.en['about.html'], /commercial/);
  assert.match(STRINGS.en['about.html'], /not in this repository/);
});
test('app.js starts the tour only from tourWanted and wires About', () => {
  const app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
  assert.match(app, /const tourOn = tourWanted\(/);
  assert.match(app, /if \(tourOn\) openTour\(\)/);
  assert.match(app, /\$\('aboutBtn'\)\.addEventListener/);
  assert.match(app, /case 'a': case 'A': setAbout\(true\)/);
});

import { tourCardPlacement } from '../src/tour.js';
test('tour card stays inside the viewport and off the target', () => {
  const p = tourCardPlacement({ vh: 720, cardH: 200 });
  assert.equal(p.side, 'bottom'); assert.equal(p.top, 720 - 12 - 200);
  // target hidden under a bottom card, room above for a top card
  assert.equal(tourCardPlacement({ vh: 720, cardH: 200, target: { top: 600, bottom: 630 } }).side, 'top');
  // target already clear of the card
  assert.equal(tourCardPlacement({ vh: 720, cardH: 200, target: { top: 100, bottom: 130 } }).side, 'bottom');
  // target at the very top and under no card stays bottom; a tall card is capped to the viewport
  const tall = tourCardPlacement({ vh: 300, cardH: 900, target: { top: 50, bottom: 80 } });
  assert.equal(tall.maxHeight, 276); assert.ok(tall.top >= 12);
  assert.ok(tall.top + Math.min(900, tall.maxHeight) <= 300);
});
