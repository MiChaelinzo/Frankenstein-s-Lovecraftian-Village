// Guided judge tour (about 60 s). Pure step model: opt-in only (?tour=1), never starts on a bare URL.
// The DOM glue lives in tour-ui.js. Each step points at one control by element id; text comes from i18n keys tour.<id> and tour.<id>.d.
import { queryParam } from './util.js';
export const TOUR_STEPS = [
  { id: 'view', target: 'view', ms: 6000 },
  { id: 'seed', target: 'seed', ms: 5000 },
  { id: 'sanity', target: 'sanity', ms: 6000 },
  { id: 'story', target: 'storyOpen', ms: 5000 },
  { id: 'nights', target: 'night', ms: 5000 },
  { id: 'buildings', target: 'theme', ms: 5000 },
  { id: 'cinematic', target: 'cinemaToggle', ms: 5000 },
  { id: 'codex', target: 'codexToggle', ms: 6000 },
  { id: 'stitch', target: 'stitchToggle', ms: 6000 },
  { id: 'contrast', target: 'contrastToggle', ms: 5000 },
  { id: 'daily', target: 'dailyBtn', ms: 5000 },
  { id: 'about', target: 'aboutBtn', ms: 5000 },
];

/** True only for an explicit ?tour=1 in the query or hash. */
export function tourWanted(search, hash) {
  return queryParam(search, 'tour') === '1' || queryParam(hash, 'tour') === '1';
}

export const tourTotalMs = (steps = TOUR_STEPS) => steps.reduce((n, s) => n + s.ms, 0);

/** Next step; `done` once past the last one. */
export function tourNext(i, n = TOUR_STEPS.length) {
  return i + 1 >= n ? { done: true, index: i } : { done: false, index: i + 1 };
}
/** Previous step, clamped at the first. */
export const tourPrev = (i) => Math.max(0, i - 1);

/** Auto-advance delay for step i; 0 under reduced motion (the reader advances by hand) and on the last step. */
export function tourDelayMs(i, reduceMotion, steps = TOUR_STEPS) {
  if (reduceMotion || i < 0 || i >= steps.length - 1) return 0;
  return steps[i].ms;
}

/** Key map: 'next', 'prev', 'skip' or null. Enter and Space are left to a focused button. */
export function tourKeyAction(key, onButton = false) {
  if (key === 'Escape') return 'skip';
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  if ((key === 'Enter' || key === ' ') && !onButton) return 'next';
  return null;
}

/**
 * Where the tour card sits. Pure: all numbers are CSS pixels.
 * The card always stays fully inside the viewport (maxHeight caps it, the CSS scrolls the overflow) and moves to the
 * top edge when the highlighted control would otherwise sit underneath it.
 * `target` is the control's bounding rect ({top, bottom}) or null; `margin` is the gap to the viewport edge.
 */
export function tourCardPlacement({ vh, cardH, target = null, margin = 12 }) {
  const maxHeight = Math.max(80, Math.floor(vh - margin * 2));
  const h = Math.min(cardH > 0 ? cardH : maxHeight, maxHeight);
  const bottomTop = vh - margin - h;
  // bottom by default; top only when the control is hidden by a bottom card and the top card would not cover it too
  const hiddenAtBottom = !!target && target.bottom > bottomTop && target.top < vh;
  const side = hiddenAtBottom && target.top >= margin + h ? 'top' : 'bottom';
  return { side, maxHeight, top: side === 'top' ? margin : bottomTop };
}
