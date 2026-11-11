import test from 'node:test';
import assert from 'node:assert/strict';
import { flythroughCamera, flyStop, FLY_ANGLE_STEP, cinematicFrame, totalMs, TAIL_MS, WAYPOINTS, cameraTransform, cinematicWanted, waypoint } from '../src/cinematic.js';
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

import { cinemaExitKey, showCinemaExit, normalizeDevice } from '../src/input.js';
import { restoreAction, shouldStepInvestigator, snapshotPlayback } from '../src/investigator-state.js';
import { t, STRINGS } from '../src/i18n.js';
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));

test('exit hint matches the active input device', () => {
  assert.equal(cinemaExitKey('keyboard'), 'cinema.exit');
  assert.equal(cinemaExitKey('pad'), 'cinema.exit.pad');
  assert.equal(cinemaExitKey('touch'), 'cinema.exit.touch');
  assert.equal(cinemaExitKey('weird'), 'cinema.exit');
  assert.equal(normalizeDevice(undefined), 'keyboard');
  assert.match(t('cinema.exit.pad', 'en'), /Select/);
  assert.doesNotMatch(t('cinema.exit.pad', 'en'), /Escape/);
  assert.match(t('cinema.exit', 'en'), /Escape/);
});
test('touch users get a visible exit button, others do not', () => {
  assert.equal(showCinemaExit('touch'), true);
  assert.equal(showCinemaExit('pad'), false);
  assert.equal(showCinemaExit('keyboard'), false);
  assert.equal(showCinemaExit(null), false);
});
test('investigator pauses when hidden or during a take', () => {
  const inv = {};
  assert.equal(shouldStepInvestigator({ investigator: inv, hidden: false, cinemaOn: false }), true);
  assert.equal(shouldStepInvestigator({ investigator: inv, hidden: true, cinemaOn: false }), false);
  assert.equal(shouldStepInvestigator({ investigator: inv, hidden: false, cinemaOn: true }), false);
  assert.equal(shouldStepInvestigator({ investigator: null }), false);
  assert.equal(shouldStepInvestigator(), false);
});
test('playback restore after a take', () => {
  assert.deepEqual(snapshotPlayback({ on: true, playing: true }), { hadStory: true, hadPlaying: true });
  assert.deepEqual(snapshotPlayback(null), { hadStory: false, hadPlaying: false });
  assert.equal(restoreAction({ hadStory: false, hadPlaying: false }), 'close');
  assert.equal(restoreAction({ hadStory: true, hadPlaying: false }), 'keep');
  assert.equal(restoreAction({ hadStory: true, hadPlaying: true }), 'resume');
  assert.equal(restoreAction(null), 'close');
});
test('page description is translated and index.html carries the same English text', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(`content="${t('page.description', 'en')}"`));
  assert.notEqual(t('page.description', 'fr'), t('page.description', 'en'));
  assert.ok(t('page.title', 'fr') !== t('page.title', 'en'));
});

// ---------- 3D fly-through ----------
const W = { gridW: 24, gridD: 24, seed: 1818 };
test('fly-through: identical elapsed ms give an identical camera, for any seed', () => {
  for (const t of [0, 1, 1500, 3000, 4321, 9499, 9500, 11000, 99999]) {
    assert.deepEqual(flythroughCamera(t, D, W), flythroughCamera(t, D, { ...W }));
    assert.deepEqual(flythroughCamera(t, D, W, true), flythroughCamera(t, D, W, true));
  }
  assert.notDeepEqual(flythroughCamera(1500, D, W), flythroughCamera(1500, D, { ...W, seed: 5 }));
});
test('fly-through: starts on stop 0, reaches the next stop at each beat boundary, ends on the last stop', () => {
  const at = (t) => flythroughCamera(t, D, W), pos = (c) => [c.x, c.y, c.z];
  const near3 = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${a} vs ${b}`));
  near3(pos(at(0)), flyStop(0, W).pos); near3(pos(at(3000)), flyStop(1, W).pos); near3(pos(at(7000)), flyStop(2, W).pos);
  near3(pos(at(9500 + TAIL_MS)), flyStop(3, W).pos);
  const a = pos(at(1500)); assert.notDeepEqual(a, flyStop(0, W).pos); assert.notDeepEqual(a, flyStop(1, W).pos);
});
test('fly-through: stays over the roofs, looks at the village, yaw and pitch are finite and pitch is bounded', () => {
  for (let t = 0; t <= totalMs(D); t += 250) {
    const c = flythroughCamera(t, D, W);
    assert.ok(Object.values(c).every(Number.isFinite)); assert.ok(c.y >= 4.6, 'above the 3 m houses'); assert.ok(Math.abs(c.pitch) < 1.2);
    const cx = 48, cz = 48, toward = Math.hypot(c.x - cx, c.z - cz); assert.ok(toward > 20 && toward < 90);
  }
  const c = flythroughCamera(0, D, W), s = flyStop(0, W), dx = s.look[0] - s.pos[0], dz = s.look[2] - s.pos[2];
  assert.ok(Math.abs(Math.sin(c.yaw) * Math.hypot(dx, dz) - dx) < 1e-6 && Math.abs(-Math.cos(c.yaw) * Math.hypot(dx, dz) - dz) < 1e-6);
});
test('fly-through: reduced motion is one fixed still viewpoint, whatever the time or beat', () => {
  const still = flythroughCamera(0, D, W, true);
  for (const t of [1, 3000, 5000, 9000, 20000]) assert.deepEqual(flythroughCamera(t, D, W, true), still);
  assert.notDeepEqual(flythroughCamera(5000, D, W), flythroughCamera(5001, D, W));
  assert.ok(FLY_ANGLE_STEP > 0.3 && FLY_ANGLE_STEP < 2, 'a visible but not dizzy move per beat');
  assert.ok(Object.values(flythroughCamera(5, [], W)).every(Number.isFinite), 'empty durations do not break the camera');
});

test('Core FlythroughPath matches cinematicFrame and flythroughCamera for every golden case', () => {
  const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-9, `${what}: ${a} vs ${b}`);
  assert.ok(golden.flythrough.cases.length > 0);
  for (const c of golden.flythrough.cases) {
    assert.equal(totalMs(c.durations), c.total);
    const world = { gridW: c.gridW, gridD: c.gridD, seed: c.seed };
    for (const [t, done, beat, beatT, cx, cy, zoom, x, y, z, yaw, pitch] of c.frames) {
      const f = cinematicFrame(t, c.durations, c.reduced), cam = flythroughCamera(t, c.durations, world, c.reduced);
      assert.equal(f.done, done === 1); assert.equal(f.beat, beat);
      near(f.beatT, beatT, 'beatT'); near(f.cam.x, cx, 'camx'); near(f.cam.y, cy, 'camy'); near(f.cam.zoom, zoom, 'zoom');
      near(cam.x, x, 'x'); near(cam.y, y, 'y'); near(cam.z, z, 'z'); near(cam.yaw, yaw, 'yaw'); near(cam.pitch, pitch, 'pitch');
    }
  }
});
