// DOM glue for the judge tour: a non-blocking dialog card, a highlight on the current control, focus restore on exit.
import { TOUR_STEPS, tourNext, tourPrev, tourDelayMs, tourKeyAction, tourCardPlacement } from './tour.js';

export function createTourController({ $, tr, canvas, reduceMotion, announce }) {
  const tour = { i: 0, timer: 0, prevFocus: null, hl: null };
  const isOpen = () => $('tour').hidden === false;
  function highlight(id) {
    tour.hl?.classList?.remove('tour-target');
    tour.hl = $(id);
    tour.hl?.classList?.add('tour-target');
    tour.hl?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  }
  // keep the whole card inside the viewport and off the highlighted control
  function place() {
    const card = $('tour'), vh = window.innerHeight || document.documentElement.clientHeight;
    card.style.maxHeight = ''; card.style.top = 'auto'; card.style.bottom = '';
    const r = tour.hl?.getBoundingClientRect?.();
    const p = tourCardPlacement({ vh, cardH: card.scrollHeight + 2, target: r ? { top: r.top, bottom: r.bottom } : null });
    card.style.maxHeight = `${p.maxHeight}px`;
    if (p.side === 'top') { card.style.top = '12px'; card.style.bottom = 'auto'; } else { card.style.top = 'auto'; card.style.bottom = '12px'; }
  }
  function render() {
    const s = TOUR_STEPS[tour.i];
    $('tourTitle').textContent = tr(`tour.${s.id}`);
    $('tourText').textContent = tr(`tour.${s.id}.d`);
    $('tourStep').textContent = tr('tour.step', { i: tour.i + 1, n: TOUR_STEPS.length });
    $('tourNext').textContent = tour.i === TOUR_STEPS.length - 1 ? tr('btn.tourdone') : tr('btn.next');
    $('tourPrev').disabled = tour.i === 0;
    highlight(s.target);
    place();
    announce?.(`${tr('tour.step', { i: tour.i + 1, n: TOUR_STEPS.length })}: ${tr(`tour.${s.id}`)}`);
    startTimer();
  }
  function startTimer() {
    clearTimeout(tour.timer);
    const delay = tourDelayMs(tour.i, reduceMotion);
    if (delay) tour.timer = setTimeout(next, delay);
  }
  function next() { const r = tourNext(tour.i); if (r.done) close(); else { tour.i = r.index; render(); } }
  function prev() { tour.i = tourPrev(tour.i); render(); }
  function open() {
    tour.i = 0; tour.prevFocus = document.activeElement || null;
    $('tour').hidden = false; render(); $('tourNext').focus?.();
  }
  function close() {
    clearTimeout(tour.timer); tour.hl?.classList?.remove('tour-target'); tour.hl = null;
    $('tour').hidden = true;
    (tour.prevFocus && tour.prevFocus.focus ? tour.prevFocus : canvas).focus?.();
  }
  window.addEventListener('resize', () => { if (isOpen()) place(); });
  $('tourNext').addEventListener('click', next);
  $('tourPrev').addEventListener('click', prev);
  $('tourSkip').addEventListener('click', close);
  // reading time: hovering or any key press stops the auto-advance
  $('tour').addEventListener('pointerenter', () => clearTimeout(tour.timer));
  $('tour').addEventListener('pointerleave', () => { if (isOpen()) startTimer(); });
  $('tour').addEventListener('keydown', () => clearTimeout(tour.timer), true);
  $('tour').addEventListener('keydown', (e) => {
    const onButton = e.target === $('tourNext') || e.target === $('tourPrev') || e.target === $('tourSkip');
    const a = tourKeyAction(e.key, onButton);
    if (a === 'skip') { e.stopPropagation(); close(); } else if (a === 'next') next(); else if (a === 'prev') { if (tour.i > 0) prev(); }
    else if (e.key === 'Tab') {
      const btns = [$('tourPrev'), $('tourNext'), $('tourSkip')].filter((b) => !b.disabled);
      const at = btns.indexOf(e.target), to = btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length];
      to.focus?.(); e.preventDefault(); return;
    } else return;
    e.preventDefault();
  });
  const pauseTour = () => clearTimeout(tour.timer);
  const resumeTour = () => { if (isOpen()) startTimer(); };
  return { pauseTour, resumeTour, openTour: open, closeTour: close, tourOpen: isOpen };
}
