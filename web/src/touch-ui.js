// On-screen touch controls for the first-person 3D view. The maths and the action table are pure (input.js);
// this file only wires DOM pointer events to the existing 3D movement/look paths and to app-level actions.
import { shouldShowTouchControls, stickDrive, lookDelta, TOUCH_BUTTON_ACTIONS } from './input.js';

const STOPPED = { forward: 0, strafe: 0 };

/**
 * root: the dock element. view3d: { setTouchDrive, addTouchLook, interactCenter }.
 * actions: { candle(), endure(), help() } supplied by the app so the vigil lock and sandbox rules apply unchanged.
 * Returns { sync(open) } where open says whether the 3D view is on; the dock shows only then, and only when the rule allows it.
 */
export function createTouchControls({ doc, view3d, actions, query, coarse, maxTouchPoints, onTouch = () => {} }) {
  const $ = (id) => doc.getElementById(id);
  const root = $('touchDock'), stick = $('touchStick'), knob = $('touchKnob'), lookPad = $('touchLook');
  const allowed = shouldShowTouchControls({ coarse, maxTouchPoints, query });
  let open = false;

  const syncEndure = () => { const src = $('endure'); $('touchEndure').hidden = !src || src.hidden; };
  const sync = (on) => { open = !!on; root.hidden = !(allowed && open); if (root.hidden) view3d.setTouchDrive(STOPPED); syncEndure(); };

  // Joystick: fixed centre, drag offset through stickDrive; the knob follows the clamped finger.
  let stickPointer = null;
  const centre = () => { const r = stick.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const moveStick = (e) => {
    const c = centre(), v = stickDrive(c, { x: e.clientX, y: e.clientY });
    view3d.setTouchDrive(v);
    knob.style.setProperty('--kx', `${(v.strafe * 32).toFixed(1)}px`); knob.style.setProperty('--ky', `${(-v.forward * 32).toFixed(1)}px`);
  };
  const endStick = (e) => {
    if (stickPointer !== e.pointerId) return;
    stickPointer = null; view3d.setTouchDrive(STOPPED); knob.style.setProperty('--kx', '0px'); knob.style.setProperty('--ky', '0px');
  };
  stick.addEventListener('pointerdown', (e) => { stickPointer = e.pointerId; onTouch(); try { stick.setPointerCapture(e.pointerId); } catch { /* pointer already ended */ } moveStick(e); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (stickPointer === e.pointerId) moveStick(e); });
  stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);

  // Look pad: relative drag turns the camera.
  let lookPointer = null, last = null;
  lookPad.addEventListener('pointerdown', (e) => { lookPointer = e.pointerId; last = { x: e.clientX, y: e.clientY }; onTouch(); try { lookPad.setPointerCapture(e.pointerId); } catch { /* pointer already ended */ } e.preventDefault(); });
  lookPad.addEventListener('pointermove', (e) => {
    if (lookPointer !== e.pointerId || !last) return;
    const d = lookDelta(e.clientX - last.x, e.clientY - last.y); last = { x: e.clientX, y: e.clientY };
    view3d.addTouchLook(d.dx, d.dy);
  });
  const endLook = (e) => { if (lookPointer === e.pointerId) { lookPointer = null; last = null; } };
  lookPad.addEventListener('pointerup', endLook); lookPad.addEventListener('pointercancel', endLook);

  const run = { listen: () => view3d.interactCenter(), candle: () => actions.candle(), endure: () => actions.endure(), help: () => actions.help() };
  for (const [id, action] of Object.entries(TOUCH_BUTTON_ACTIONS)) {
    $(`touch${id[0].toUpperCase()}${id.slice(1)}`).addEventListener('click', () => { onTouch(); run[action](); });
  }
  // The vigil controller toggles the main Endure button's hidden flag; mirror it without coupling to vigil-ui.
  if (typeof doc.defaultView?.MutationObserver === 'function' && $('endure')) new doc.defaultView.MutationObserver(syncEndure).observe($('endure'), { attributes: true, attributeFilter: ['hidden'] });
  return { sync, get allowed() { return allowed; } };
}
