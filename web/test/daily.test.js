import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyKey, seedFromKey, dailyVillage, dailyWanted } from '../src/daily.js';
import { contrastWanted, loadContrast, saveContrast, CONTRAST_KEY } from '../src/access.js';

test('key uses the UTC date', () => {
  assert.equal(dailyKey(new Date('2026-11-14T23:59:59Z')), '2026-11-14');
  assert.equal(dailyKey(new Date('2026-01-02T00:00:00Z')), '2026-01-02');
  assert.equal(dailyKey(new Date('nope')), null);
  assert.equal(dailyKey('2026-11-14'), null);
});
test('seed is deterministic, positive and differs by day', () => {
  const a = seedFromKey('2026-11-14');
  assert.equal(a, seedFromKey('2026-11-14'));
  assert.ok(a > 0 && a <= 0x7fffffff && Number.isInteger(a));
  assert.notEqual(a, seedFromKey('2026-11-15'));
});
test('pinned seed values never drift', () => {
  assert.equal(seedFromKey('2026-11-14'), 1880875346);
  assert.equal(seedFromKey('2026-11-15'), 1897652965);
  assert.equal(seedFromKey('2026-11-14'), dailyVillage(() => new Date('2026-11-14T08:00:00Z')).seed);
  assert.equal(typeof seedFromKey(''), 'number');
});
test('injectable clock, same day same village', () => {
  const a = dailyVillage(() => new Date('2026-11-14T00:00:01Z')), b = dailyVillage(() => new Date('2026-11-14T23:59:59Z'));
  assert.deepEqual(a, b);
  assert.deepEqual(a, { key: '2026-11-14', seed: seedFromKey('2026-11-14') });
  assert.equal(dailyVillage(() => new Date(NaN)), null);
  assert.equal(dailyVillage(() => { throw new Error('clock'); }), null);
});
test('daily is opt-in only', () => {
  assert.equal(dailyWanted('', ''), false);
  assert.equal(dailyWanted('?seed=5', '#seed=5'), false);
  assert.equal(dailyWanted('?daily=0', ''), false);
  assert.equal(dailyWanted('?daily=1', ''), true);
  assert.equal(dailyWanted('', '#daily=1'), true);
});
test('contrast preference: explicit param beats stored, default off', () => {
  assert.equal(contrastWanted('', '', null), false);
  assert.equal(contrastWanted('?contrast=1', '', null), true);
  assert.equal(contrastWanted('', '', '1'), true);
  assert.equal(contrastWanted('?contrast=0', '', '1'), false);
  assert.equal(contrastWanted('?contrast=1', '#contrast=0', null), false);
});
test('contrast storage tolerates failure', () => {
  const m = new Map(), st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(saveContrast(st, true), true);
  assert.equal(m.get(CONTRAST_KEY), '1');
  assert.equal(loadContrast(st), '1');
  assert.equal(saveContrast(null, true), false);
  assert.equal(saveContrast({ setItem() { throw new Error('q'); } }, true), false);
  assert.equal(loadContrast({ getItem() { throw new Error('d'); } }), null);
  assert.equal(loadContrast(null), null);
});
