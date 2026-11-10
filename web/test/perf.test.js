import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPerf, perfWanted, perfText } from '../src/perf.js';

test('computes fps and ms from timestamps', () => {
  const p = createPerf();
  assert.equal(p.stats().frames, 0);
  assert.equal(perfText(p.stats()), 'perf: waiting for frames');
  for (const t of [0, 10, 20, 40]) p.sample(t);
  const s = p.stats();
  assert.equal(s.frames, 3); assert.equal(s.maxMs, 20); assert.ok(Math.abs(s.avgMs - 40 / 3) < 1e-9);
  assert.match(perfText(s), /^75 fps \| 13\.3 ms avg \| 20\.0 ms max$/);
});
test('ring buffer and reset, ignores non-increasing time', () => {
  const p = createPerf(3);
  for (let i = 0; i < 10; i++) p.sample(i * 16);
  assert.equal(p.stats().frames, 3);
  p.sample(1); assert.equal(p.stats().frames, 3);
  p.reset(); assert.equal(p.stats().frames, 0);
});
test('perfWanted is off by default', () => {
  assert.equal(perfWanted('', ''), false);
  assert.equal(perfWanted('?perf=1', ''), true);
  assert.equal(perfWanted('', '#seed=1&perf=1'), true);
  assert.equal(perfWanted('?perf=0', ''), false);
});
