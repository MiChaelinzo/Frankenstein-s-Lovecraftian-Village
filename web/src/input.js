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
