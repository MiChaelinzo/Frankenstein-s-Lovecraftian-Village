// Pure input mapping for gamepad and touch. The app polls the Gamepad API in requestAnimationFrame and feeds snapshots here.
// Nothing in this file touches the DOM or the network.
export const STICK_DEADZONE = 0.5;
export const SWIPE_MIN_PX = 40;
export const SWIPE_MAX_MS = 800;

// Standard gamepad layout button index -> action. Actions fire once per press (edge triggered).
export const BUTTON_ACTIONS = {
  0: 'listen', 1: 'door', 2: 'whisper', 3: 'candle', 4: 'focusPrev', 5: 'focusNext',
  8: 'cinematic', 9: 'story', 12: 'prevBeat', 13: 'nextBeat', 14: 'focusPrev', 15: 'focusNext',
};

const pressed = (snap, i) => !!(snap && snap.buttons && snap.buttons[i]);
const stick = (snap) => {
  const x = snap && snap.axes && Number.isFinite(snap.axes[0]) ? snap.axes[0] : 0;
  return x <= -STICK_DEADZONE ? -1 : x >= STICK_DEADZONE ? 1 : 0;
};

/** Actions triggered by the change from prev to cur snapshot ({ buttons: bool[], axes: number[] }). Order is by button index. */
export function mapGamepad(prev, cur) {
  const out = [];
  for (const key of Object.keys(BUTTON_ACTIONS).map(Number).sort((a, b) => a - b)) {
    if (pressed(cur, key) && !pressed(prev, key)) out.push(BUTTON_ACTIONS[key]);
  }
  const was = stick(prev), now = stick(cur);
  if (now !== 0 && now !== was) out.push(now > 0 ? 'focusNext' : 'focusPrev');
  return out;
}

/** Reduce a raw pad ({ buttons: [{pressed}], axes }) to a plain snapshot. */
export function snapshotPad(pad) {
  if (!pad) return null;
  return { buttons: Array.from(pad.buttons || [], (b) => !!(b && b.pressed)), axes: Array.from(pad.axes || [], Number) };
}

/** Map a touch gesture (start/end points and elapsed ms) to an action or null. Mostly horizontal swipes only. */
export function mapSwipe(dx, dy, ms) {
  if (![dx, dy, ms].every(Number.isFinite) || ms < 0 || ms > SWIPE_MAX_MS) return null;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax >= SWIPE_MIN_PX && ax >= ay * 1.5) return dx < 0 ? 'focusNext' : 'focusPrev';
  if (ay >= SWIPE_MIN_PX && ay >= ax * 1.5) return dy < 0 ? 'candle' : 'whisper';
  return null;
}

/** While a cinematic take runs only the exit action is accepted, matching the keyboard handler. */
export function gateAction(action, cinematicOn) {
  if (!action) return null;
  return cinematicOn && action !== 'cinematic' ? null : action;
}

/** Which input device produced the last event? Anything unknown is treated as keyboard. */
export const DEVICES = ['keyboard', 'pad', 'touch'];
export const normalizeDevice = (d) => (DEVICES.includes(d) ? d : 'keyboard');

/** i18n key for the cinematic exit hint that matches the active input device. */
export const cinemaExitKey = (device) => {
  const d = normalizeDevice(device);
  return d === 'pad' ? 'cinema.exit.pad' : d === 'touch' ? 'cinema.exit.touch' : 'cinema.exit';
};

/** The exit button is shown only for touch, where there is no keyboard Escape or pad Select. */
export const showCinemaExit = (device) => normalizeDevice(device) === 'touch';

// ---- first-person 3D view (?view=3d): continuous movement from sticks and touch ----
export const PAD_DEADZONE_3D = 0.18;
const dz = (v) => (Number.isFinite(v) && Math.abs(v) >= PAD_DEADZONE_3D ? (v - Math.sign(v) * PAD_DEADZONE_3D) / (1 - PAD_DEADZONE_3D) : 0);

/** Left stick walks (axes 0,1), right stick looks (axes 2,3). Values are -1..1 with a rescaled dead zone; forward is stick up. */
export function padAxes3d(snap) {
  const a = (snap && snap.axes) || [];
  return { strafe: dz(a[0]), forward: -dz(a[1]), turn: dz(a[2]), look: -dz(a[3]) };
}

export const TOUCH_DRIVE_RADIUS_PX = 60;
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 280;
const unit = (v) => Math.max(-1, Math.min(1, v));

/** Virtual joystick: finger offset from where the touch began, in pixels, to forward/strafe -1..1 (drag up walks forward). */
export function touchDrive(start, cur) {
  if (!start || !cur || ![start.x, start.y, cur.x, cur.y].every(Number.isFinite)) return { forward: 0, strafe: 0 };
  return { strafe: unit((cur.x - start.x) / TOUCH_DRIVE_RADIUS_PX), forward: unit(-(cur.y - start.y) / TOUCH_DRIVE_RADIUS_PX) };
}

/** A tap is a short touch that barely moved. */
export const isTap = (x0, y0, x1, y1, ms) => [x0, y0, x1, y1, ms].every(Number.isFinite) && ms >= 0 && ms <= TAP_MAX_MS && Math.hypot(x1 - x0, y1 - y0) <= TAP_MAX_PX;

// ---- on-screen touch controls for the 3D view (touch-ui.js draws them; the maths lives here) ----
export const TOUCH_MIN_PX = 44; // smallest comfortable touch target, enforced by CSS and checked in tests
export const TOUCH_STICK_DEADZONE = 0.15;
export const TOUCH_LOOK_GAIN = 1.4; // pixels dragged to camera pixels; the canvas look gesture uses the same gain

/** Show the controls on coarse pointers or touch hardware; ?touch=1 forces them on and ?touch=0 forces them off. */
export function shouldShowTouchControls({ coarse = false, maxTouchPoints = 0, query = '' } = {}) {
  const forced = new URLSearchParams(String(query).replace(/^[?#]/, '')).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return !!coarse || (Number.isFinite(maxTouchPoints) && maxTouchPoints > 0);
}

/** Fixed on-screen joystick: offset from the stick centre through touchDrive, with a rescaled dead zone. */
export function stickDrive(center, cur) {
  const d = touchDrive(center, cur), mag = Math.hypot(d.forward, d.strafe);
  if (mag < TOUCH_STICK_DEADZONE) return { forward: 0, strafe: 0 };
  const k = Math.min(1, (mag - TOUCH_STICK_DEADZONE) / (1 - TOUCH_STICK_DEADZONE)) / mag;
  return { forward: d.forward * k, strafe: d.strafe * k };
}

/** Look pad drag in pixels to camera look deltas. */
export const lookDelta = (dx, dy) => (Number.isFinite(dx) && Number.isFinite(dy) ? { dx: dx * TOUCH_LOOK_GAIN, dy: dy * TOUCH_LOOK_GAIN } : { dx: 0, dy: 0 });

/** Touch button id -> action name. interact and lantern reuse BUTTON_ACTIONS names; endure and help are app-level. */
export const TOUCH_BUTTON_ACTIONS = { interact: 'listen', lantern: 'candle', endure: 'endure', help: 'help' };
