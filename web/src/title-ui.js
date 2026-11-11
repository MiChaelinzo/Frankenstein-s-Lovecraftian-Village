// Skippable title sequence (?intro=0 disables, deep links skip it). Owns the dialog's focus handling and key map.
import { advanceSlide, slideDelayMs } from './intro.js';
import { introSlidesL } from './i18n-text.js';

export function createIntroController({ $, tr, lang, canvas, state, reduceMotion }) {
  const intro = { slides: [], i: 0, timer: 0, prevFocus: null };
  function renderSlide() {
    const sl = intro.slides[intro.i];
    $('introTitle').textContent = sl.title; $('introText').textContent = sl.text;
    $('introStep').textContent = tr('intro.step', { i: intro.i + 1, n: intro.slides.length });
    $('introNext').textContent = intro.i === intro.slides.length - 1 ? tr('btn.begin') : tr('btn.next');
    clearTimeout(intro.timer);
    const delay = slideDelayMs(reduceMotion);
    if (delay && intro.i < intro.slides.length - 1) intro.timer = setTimeout(introAdvance, delay);
  }
  function introAdvance() { const r = advanceSlide(intro.i, intro.slides.length); if (r.done) closeIntro(); else { intro.i = r.index; renderSlide(); } }
  function openIntro() {
    intro.slides = introSlidesL(state.campaign, lang); intro.i = 0;
    intro.prevFocus = document.activeElement || null;
    $('intro').hidden = false; renderSlide(); $('introNext').focus?.();
  }
  function closeIntro() { clearTimeout(intro.timer); $('intro').hidden = true; (intro.prevFocus && intro.prevFocus.focus ? intro.prevFocus : canvas).focus?.(); }
  const introOpen = () => $('intro').hidden === false;
  $('introNext').addEventListener('click', introAdvance);
  $('introSkip').addEventListener('click', closeIntro);
  // reading time: hovering or any key press stops the auto-advance for the current slide
  $('intro').addEventListener('pointerenter', () => clearTimeout(intro.timer));
  $('intro').addEventListener('pointerleave', () => { if (introOpen()) renderSlide(); });
  $('intro').addEventListener('keydown', () => clearTimeout(intro.timer), true);
  $('intro').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeIntro(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && e.target !== $('introSkip'))) { introAdvance(); e.preventDefault(); }
    else if (e.key === 'Tab') { const to = e.shiftKey === (e.target === $('introNext')) ? $('introSkip') : $('introNext'); to.focus?.(); e.preventDefault(); }
  });
  return { openIntro, closeIntro, introOpen };
}
