import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shouldShowTouchControls, stickDrive, lookDelta, TOUCH_BUTTON_ACTIONS, TOUCH_MIN_PX, TOUCH_STICK_DEADZONE, TOUCH_LOOK_GAIN, BUTTON_ACTIONS, TOUCH_DRIVE_RADIUS_PX } from '../src/input.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');

test('visibility: coarse or touch hardware shows, desktop hides, ?touch overrides', () => {
  assert.equal(shouldShowTouchControls({}), false);
  assert.equal(shouldShowTouchControls({ coarse: true }), true);
  assert.equal(shouldShowTouchControls({ maxTouchPoints: 5 }), true);
  assert.equal(shouldShowTouchControls({ query: '?touch=1' }), true);
  assert.equal(shouldShowTouchControls({ query: '#seed=1&touch=1' }), true);
  assert.equal(shouldShowTouchControls({ coarse: true, query: '?touch=0' }), false);
  assert.equal(shouldShowTouchControls({ maxTouchPoints: NaN }), false);
});
test('stick: dead zone, direction, clamp', () => {
  const c = { x: 100, y: 100 };
  assert.deepEqual(stickDrive(c, { x: 100 + 2, y: 100 - 2 }), { forward: 0, strafe: 0 });
  const up = stickDrive(c, { x: 100, y: 100 - TOUCH_DRIVE_RADIUS_PX });
  assert.ok(Math.abs(up.forward - 1) < 1e-9 && up.strafe === 0);
  const right = stickDrive(c, { x: 100 + 500, y: 100 });
  assert.ok(Math.abs(right.strafe - 1) < 1e-9);
  const diag = stickDrive(c, { x: 100 + 500, y: 100 - 500 });
  assert.ok(Math.hypot(diag.forward, diag.strafe) <= 1 + 1e-9);
  assert.deepEqual(stickDrive(null, c), { forward: 0, strafe: 0 });
  assert.ok(TOUCH_STICK_DEADZONE > 0 && TOUCH_STICK_DEADZONE < 0.5);
});
test('look delta applies the shared gain and rejects junk', () => {
  assert.deepEqual(lookDelta(10, -5), { dx: 10 * TOUCH_LOOK_GAIN, dy: -5 * TOUCH_LOOK_GAIN });
  assert.deepEqual(lookDelta(NaN, 1), { dx: 0, dy: 0 });
});
test('button table reuses gamepad action names', () => {
  assert.deepEqual(Object.keys(TOUCH_BUTTON_ACTIONS).sort(), ['endure', 'help', 'interact', 'lantern']);
  assert.ok(Object.values(BUTTON_ACTIONS).includes(TOUCH_BUTTON_ACTIONS.interact));
  assert.ok(Object.values(BUTTON_ACTIONS).includes(TOUCH_BUTTON_ACTIONS.lantern));
});
test('markup and css: every button id exists and targets are at least 44 px', () => {
  const html = readFileSync(join(web, 'index.html'), 'utf8'), css = readFileSync(join(web, 'style.css'), 'utf8');
  assert.equal(TOUCH_MIN_PX, 44);
  for (const id of Object.keys(TOUCH_BUTTON_ACTIONS)) assert.match(html, new RegExp(`id="touch${id[0].toUpperCase()}${id.slice(1)}"`));
  assert.match(html, /id="touchDock"[^>]*\shidden/);
  assert.match(css, /\.touch-buttons button \{[^}]*min-height: 44px/);
  assert.match(css, /\.touch-buttons button \{[^}]*min-width: 44px/);
  assert.match(css, /html\.hc \.touch-stick/);
  assert.match(css, /forced-colors: active\) \{ \.touch-stick/);
  assert.ok(!/transition|animation/.test(css.slice(css.indexOf('.touch-dock'))), 'touch controls do not animate');
});
