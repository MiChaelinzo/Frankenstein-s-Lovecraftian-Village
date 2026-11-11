import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameStats } from '../../tools/browser_check.mjs';

test('frameStats summarizes rAF timestamps', () => {
  const ts = [0, 10, 20, 40, 50, 60];
  const s = frameStats(ts);
  assert.equal(s.frames, 6);
  assert.equal(s.meanMs, 12);
  assert.equal(s.medianMs, 10);
  assert.equal(s.maxMs, 20);
  assert.equal(s.fps, 83.3);
});

test('frameStats tolerates too few samples', () => {
  assert.deepEqual(frameStats([]), { frames: 0, meanMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, fps: 0 });
  assert.equal(frameStats([5]).frames, 1);
  assert.equal(frameStats(undefined).frames, 0);
});
