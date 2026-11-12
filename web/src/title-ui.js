// Title screen dialog: the first thing a visitor sees on a bare URL. Owns focus handling, the key map and the choice between the
// 3D village and the 2D map. Decisions (who is offered what) live in title.js; the app supplies the views and the audio switch.
import { lowPowerDevice, titleModel, titleSubtitle, webglForcedOff } from './title.js';

const lang2 = (l) => (l === 'fr' ? 'fr' : 'en');

/** True when a WebGL context can be created here. A throwaway canvas is used so the village views are not touched. */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    gl.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    return true;
  } catch { return false; }
}

/**
 * Callbacks: startBackdrop(kind) -> kind actually running ('3d' | '2d'), stopBackdrop(), enter3d(), enter2d(), openHelp(),
 * setSound(on), endings() -> { found, total }. Nothing starts on a timer and audio only starts from the sound checkbox.
 */
export function createTitleController({ $, tr, lang, state, canvas, reduceMotion, startBackdrop, stopBackdrop, enter3d, enter2d, openHelp, setSound, endings }) {
  const ctl = { prevFocus: null, model: null };
  const isOpen = () => $('title').hidden === false;
  const buttons = () => ['titleEnter3d', 'titleMap2d', 'titleHelp', 'titleSound', 'titleLangEn', 'titleLangFr'].map($).filter((b) => b && !b.disabled);
  const primary = () => $(ctl.model && ctl.model.recommend === '3d' ? 'titleEnter3d' : 'titleMap2d');

  function open() {
    ctl.prevFocus = document.activeElement || null;
    const sub = titleSubtitle(state.campaign);
    ctl.model = titleModel({ webgl: !webglForcedOff(location.search, location.hash) && webglAvailable(), lowPower: lowPowerDevice(navigator), reduced: reduceMotion });
    const m = ctl.model;
    $('titleVillage').textContent = sub.name;
    $('titleRumor').textContent = sub.rumor;
    $('titleEnter3d').disabled = !m.can3d;
    $('titleReason').textContent = m.reasonKey ? tr(m.reasonKey) : '';
    $('titleEnter3d').classList.toggle('recommended', m.recommend === '3d');
    $('titleMap2d').classList.toggle('recommended', m.recommend === '2d');
    const e = endings(); $('titleEndings').textContent = tr('title.endings', { n: e.found, total: e.total });
    for (const l of ['en', 'fr']) $(l === 'en' ? 'titleLangEn' : 'titleLangFr').setAttribute('aria-pressed', String(l === lang2(lang)));
    $('titleSound').checked = !!($('sound') && $('sound').checked);
    const main = $('main'); if (main) main.inert = true;
    $('title').hidden = false;
    document.documentElement?.classList?.add('title-on');
    startBackdrop(m.backdrop);
    primary().focus?.();
  }
  function close() {
    if (!isOpen()) return;
    $('title').hidden = true;
    document.documentElement?.classList?.remove('title-on');
    const main = $('main'); if (main) main.inert = false;
    stopBackdrop();
  }
  function begin3d() { if (!ctl.model || !ctl.model.can3d) return; close(); enter3d(); }
  function begin2d() { close(); enter2d(); (ctl.prevFocus && ctl.prevFocus.focus ? ctl.prevFocus : canvas).focus?.(); }
  function switchLang(l) { const q = new URLSearchParams(location.search); q.set('lang', l); location.search = `?${q.toString()}`; }

  $('titleEnter3d').addEventListener('click', begin3d);
  $('titleMap2d').addEventListener('click', begin2d);
  $('titleHelp').addEventListener('click', () => openHelp());
  $('titleSound').addEventListener('change', () => setSound($('titleSound').checked)); // the click is the user gesture that may start audio
  $('titleLangEn').addEventListener('click', () => switchLang('en'));
  $('titleLangFr').addEventListener('click', () => switchLang('fr'));
  $('title').addEventListener('keydown', (e) => {
    e.stopPropagation(); // the 3D backdrop listens on window for WASD, E and Enter; none of that applies behind the title
    if (e.key === 'Escape') { begin2d(); e.preventDefault(); return; }
    if (e.key === 'Enter' && !['BUTTON', 'INPUT', 'A'].includes(e.target && e.target.tagName)) { (ctl.model.recommend === '3d' ? begin3d : begin2d)(); e.preventDefault(); return; }
    if (e.key === 'Tab') {
      const list = buttons(), at = list.indexOf(e.target);
      const next = list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length];
      if (next) { next.focus?.(); e.preventDefault(); }
    }
  });
  return { open, close, isOpen };
}
