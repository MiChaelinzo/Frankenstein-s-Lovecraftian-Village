import test from 'node:test';
import assert from 'node:assert/strict';
import { cinematicFrame, totalMs, TAIL_MS, WAYPOINTS, cameraTransform, cinematicWanted, waypoint } from '../src/cinematic.js';
import { gateAction, mapGamepad, mapSwipe, snapshotPad, BUTTON_ACTIONS } from '../src/input.js';

const D = [3000, 4000, 2500];

test('timeline picks the beat from fixed timings', () => {
  assert.equal(cinematicFrame(0, D).beat, 0);
  assert.equal(cinematicFrame(2999, D).beat, 0);
  assert.equal(cinematicFrame(3000, D).beat, 1);
  assert.equal(cinematicFrame(6999, D).beat, 1);
  assert.equal(cinematicFrame(7000, D).beat, 2);
  assert.equal(cinematicFrame(9499, D).beat, 2);
  assert.ok(Math.abs(cinematicFrame(1500, D).beatT - 0.5) < 1e-12);
});

test('timeline is deterministic and ends after the tail', () => {
  assert.deepEqual(cinematicFrame(4321, D), cinematicFrame(4321, D));
  assert.equal(totalMs(D), 9500 + TAIL_MS);
  assert.equal(cinematicFrame(9500, D).done, false);
  assert.equal(cinematicFrame(9500, D).beat, 2);
  const end = cinematicFrame(9500 + TAIL_MS, D);
  assert.equal(end.done, true); assert.equal(end.beat, 2);
});

test('camera starts at the first waypoint and eases between waypoints', () => {
  const c0 = cinematicFrame(0, D).cam;
  assert.deepEqual(c0, { x: WAYPOINTS[0].x, y: WAYPOINTS[0].y, zoom: WAYPOINTS[0].zoom });
  const mid = cinematicFrame(1500, D).cam, a = WAYPOINTS[0], b = WAYPOINTS[1];
  assert.ok(Math.abs(mid.x - (a.x + b.x) / 2) < 1e-12);
  assert.ok(Math.abs(mid.zoom - (a.zoom + b.zoom) / 2) < 1e-12);
  assert.deepEqual(waypoint(WAYPOINTS.length), WAYPOINTS[0]);
  assert.deepEqual(waypoint(-1), WAYPOINTS[WAYPOINTS.length - 1]);
});

test('reduced motion keeps the camera still but beats still advance', () => {
  for (const t of [0, 1000, 5000, 9000]) assert.deepEqual(cinematicFrame(t, D, true).cam, { x: 0, y: 0, zoom: 1 });
  assert.equal(cinematicFrame(3500, D, true).beat, 1);
});

test('timeline survives bad input', () => {
  assert.equal(cinematicFrame(100, []).done, true);
  assert.equal(cinematicFrame(NaN, D).beat, 0);
  assert.equal(cinematicFrame(-50, D).beat, 0);
  assert.equal(cinematicFrame(100, null).done, true);
  assert.equal(cinematicFrame(100, [NaN, 2000]).beat, 1);
});

test('camera transform is identity at rest and zooms about the centre', () => {
  assert.deepEqual(cameraTransform({ x: 0, y: 0, zoom: 1 }, 960, 560), { scale: 1, tx: 0, ty: 0 });
  const t = cameraTransform({ x: 0, y: 0, zoom: 2 }, 960, 560);
  assert.equal(480 * t.scale + t.tx, 480);
  assert.equal(280 * t.scale + t.ty, 280);
  assert.equal(cameraTransform(null, 10, 10).scale, 1);
});

test('cinematic flag parses from query or hash', () => {
  assert.equal(cinematicWanted('?cinematic=1', ''), true);
  assert.equal(cinematicWanted('', '#seed=1&cinematic=1'), true);
  assert.equal(cinematicWanted('?cinematic=0', ''), false);
  assert.equal(cinematicWanted('?cinematic=1', '#seed=2'), true);
  assert.equal(cinematicWanted('?cinematic=12', ''), false);
  assert.equal(cinematicWanted('', ''), false);
});

test('gamepad buttons fire once per press', () => {
  const none = { buttons: [], axes: [0, 0] };
  const a = { buttons: [true], axes: [0, 0] };
  assert.deepEqual(mapGamepad(none, a), ['listen']);
  assert.deepEqual(mapGamepad(a, a), []);
  assert.deepEqual(mapGamepad(a, none), []);
  assert.deepEqual(mapGamepad(null, a), ['listen']);
  assert.deepEqual(mapGamepad(none, { buttons: [], axes: [] }), []);
  for (const [i, act] of Object.entries(BUTTON_ACTIONS)) {
    const b = []; b[Number(i)] = true;
    assert.deepEqual(mapGamepad(none, { buttons: b, axes: [] }), [act]);
  }
});

test('left stick uses a deadzone and fires on crossing only', () => {
  const at = (x) => ({ buttons: [], axes: [x, 0] });
  assert.deepEqual(mapGamepad(at(0), at(0.4)), []);
  assert.deepEqual(mapGamepad(at(0), at(0.9)), ['focusNext']);
  assert.deepEqual(mapGamepad(at(0.9), at(1)), []);
  assert.deepEqual(mapGamepad(at(0), at(-0.9)), ['focusPrev']);
  assert.deepEqual(mapGamepad(at(-0.9), at(0.9)), ['focusNext']);
  assert.deepEqual(mapGamepad(at(0), { buttons: [], axes: [NaN] }), []);
});

test('pad snapshots are plain data', () => {
  assert.equal(snapshotPad(null), null);
  assert.deepEqual(snapshotPad({ buttons: [{ pressed: true }, { pressed: false }], axes: [0.25] }), { buttons: [true, false], axes: [0.25] });
});

test('swipes map to actions and reject slow, short or diagonal gestures', () => {
  assert.equal(mapSwipe(-80, 5, 200), 'focusNext');
  assert.equal(mapSwipe(80, -5, 200), 'focusPrev');
  assert.equal(mapSwipe(2, -90, 300), 'candle');
  assert.equal(mapSwipe(2, 90, 300), 'whisper');
  assert.equal(mapSwipe(-20, 0, 100), null);
  assert.equal(mapSwipe(-80, 70, 100), null);
  assert.equal(mapSwipe(-80, 0, 2000), null);
  assert.equal(mapSwipe(NaN, 0, 100), null);
});

test('gateAction lets only the exit action through during a take', () => {
  for (const a of ['listen', 'door', 'whisper', 'candle', 'focusNext', 'focusPrev', 'story', 'nextBeat', 'prevBeat']) {
    assert.equal(gateAction(a, true), null);
    assert.equal(gateAction(a, false), a);
  }
  assert.equal(gateAction('cinematic', true), 'cinematic');
  assert.equal(gateAction('cinematic', false), 'cinematic');
  assert.equal(gateAction(null, false), null);
});
