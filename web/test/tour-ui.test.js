import test from 'node:test';
import assert from 'node:assert/strict';
import { createTourController } from '../src/tour-ui.js';

function setup() {
  const els = {};
  const mk = (id) => (els[id] = {
    id, hidden: true, style: {}, disabled: false, textContent: '', scrollHeight: 100, ls: {},
    classList: { add() {}, remove() {} }, focus() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, bottom: 10 }),
    addEventListener(t, f, cap) { (this.ls[t] ||= []).push(f); },
    fire(t, e = {}) { (this.ls[t] || []).forEach((f) => f(e)); },
  });
  ['tour', 'tourTitle', 'tourText', 'tourStep', 'tourNext', 'tourPrev', 'tourSkip', 'canvas'].forEach(mk);
  globalThis.window = { addEventListener() {}, innerHeight: 800 };
  globalThis.document = { activeElement: null, documentElement: { clientHeight: 800 } };
  const c = createTourController({ $: (id) => els[id], tr: (k) => k, canvas: els.canvas, reduceMotion: false, announce() {} });
  return { els, c };
}
const key = (key, target) => { let stopped = false, prevented = false; return { key, target, stopPropagation() { stopped = true; }, preventDefault() { prevented = true; }, get stopped() { return stopped; }, get prevented() { return prevented; } }; };

test('Escape in the card stops propagation and closes', () => {
  const { els, c } = setup();
  c.openTour();
  const e = key('Escape', els.tourNext);
  els.tour.fire('keydown', e);
  assert.equal(e.stopped, true);
  assert.equal(c.tourOpen(), false);
});

test('pause and resume only restart the timer when no key or hover stopped it', () => {
  const { els, c } = setup();
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  let live = 0, n = 0; const ids = new Set();
  globalThis.setTimeout = () => { ids.add(++n); return n; };
  globalThis.clearTimeout = (id) => { ids.delete(id); };
  try {
    c.openTour();
    assert.equal(ids.size, 1, 'auto-advance armed');
    c.pauseTour(); assert.equal(ids.size, 0);
    c.resumeTour(); assert.equal(ids.size, 1);
    els.tour.fire('keydown', key('x', els.tourNext));
    assert.equal(ids.size, 0);
    c.resumeTour(); assert.equal(ids.size, 0, 'key stop survives resume');
    els.tour.fire('pointerleave'); assert.equal(ids.size, 0, 'key stop survives pointerleave');
    c.openTour(); assert.equal(ids.size, 1, 'reopen clears the stop');
    els.tour.fire('pointerenter'); assert.equal(ids.size, 0);
    c.resumeTour(); assert.equal(ids.size, 0, 'hover blocks resume');
    els.tour.fire('pointerleave'); assert.equal(ids.size, 1);
    c.closeTour(); c.resumeTour(); assert.equal(ids.size, 0);
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; delete globalThis.window; delete globalThis.document; }
});
