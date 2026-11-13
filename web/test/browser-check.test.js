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

test('round 16 browser_check covers the new flows', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../tools/browser_check.mjs', import.meta.url), 'utf8');
  for (const needle of ['facing a house door', '?meshes=1 fetches all 25', 'independence: default 2D and 3D make no request', 'meshes.html loads every mesh', 'codex: K opens', 'contrast: ?contrast=1', 'i18n: ?lang=fr', 'night 5 fly-through']) assert.ok(src.includes(needle), needle);
});

test('round 19 browser_check covers the clock and the vigil watch', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../tools/browser_check.mjs', import.meta.url), 'utf8');
  for (const needle of ['clock: the 3D sky is measurably brighter', 'clock: the dusk sky is warmer', 'clock vigil: at night Endure runs the clock to dawn', 'clock vigil: by day clues count']) assert.ok(src.includes(needle), needle);
});
