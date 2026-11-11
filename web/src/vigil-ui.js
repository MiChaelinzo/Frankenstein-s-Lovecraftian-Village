// Vigil DOM controller. Owns the VigilState instance, the objective line, the endure prompt and the ending dialog.
// Every rule (clue/lantern uniqueness, targets, creep, endings, score) comes from VigilState and friends in core.js; this file forwards player actions.
import { VigilState, InteractionRules, nightCreep, sanityPoints, VIGIL_LAMPS_PER_NIGHT, VIGIL_ENDING_IDS } from './core.js';
import { CELL, lanternLights } from './view3d-math.js';
import {
  objectiveModel, objectiveText, endingModel, endingStatsText, resultText, resultCardFilename, loadEndingsFound, recordEnding,
  drawResultCard, CARD_WIDTH, CARD_HEIGHT, spokenName,
} from './vigil-view.js';

const ENDING_FADE_MS = 1600;

/**
 * deps: $, tr, state, progress, storage, announce, notice(text), adjust(delta, where), setSanity(v, quiet), selectNight(i, quiet),
 *  syncUi(), pushHash(), canPlay() (false during cinematic, tour, intro, story), exit3d(), reroll(), download(name, blob, mime), shareLink(), reduceMotion.
 */
export function createVigilController(deps) {
  const { $, tr, state, progress, storage, announce, notice } = deps;
  let vigil = null, lamps = [], started = false, suspended = false, endingShown = false, endingIsOpen = false, lastText = '', card = null;

  /** Stable lamp ids from the layout: lanternLights with every house at full detail, so dread never reshuffles the ids. */
  const buildLamps = (layout) => lanternLights(layout.map((p) => ({ ...p, detail: 3 })), CELL).map((l, i) => ({ id: `lamp${i}`, pos: l.pos }));
  const live = () => !!vigil && !vigil.isFinished && deps.canPlay();
  const found = () => loadEndingsFound(storage);

  function reset() {
    vigil = state.campaign && state.ritual ? new VigilState(state.campaign, state.ritual) : null;
    lamps = buildLamps(state.layout); started = false; suspended = false; endingShown = false; lastText = '';
    render();
  }
  function restore(text) {
    if (!vigil || !text || !vigil.tryRestore(text)) return false;
    started = true; endingShown = vigil.isFinished;
    render();
    return true;
  }
  const serialize = () => (vigil && started ? vigil.serialize() : '');

  function applyCreep() {
    state.sanity.apply(-nightCreep(vigil.night));
    vigil.recordSanity(sanityPoints(state.sanity.value));
    notice(tr('vigil.creep', { n: nightCreep(vigil.night), night: vigil.night }));
  }
  /** The first vigil action starts night 1: the dark takes its share before anything else happens. */
  function begin() {
    if (started) return;
    started = true;
    vigil.recordSanity(sanityPoints(state.sanity.value));
    applyCreep();
  }

  /** A listen/whisper/landmark source. Returns true when it was a new clue (the sanity cost is applied by the caller either way). */
  function clue(sourceId) {
    if (!live()) return false;
    progress.arm(); begin();
    if (!vigil.recordClue(sourceId)) { $('vigilNote').textContent = tr('vigil.clue.again'); return false; }
    const text = tr('vigil.clue', { n: vigil.nightClueIds.size, target: vigil.clueTarget });
    $('vigilNote').textContent = text; announce(text);
    if (vigil.canEndureNight) $('vigilNote').textContent = `${text} ${tr('vigil.endure.ready')}`;
    return true;
  }

  function lightLamp(lampId) {
    if (!live()) return false;
    progress.arm(); begin();
    if (vigil.nightLampIds.has(lampId)) { notice(tr('vigil.lamp.already')); return true; }
    if (vigil.nightLampIds.size >= VIGIL_LAMPS_PER_NIGHT) { notice(tr('vigil.lamp.none')); return true; }
    if (!vigil.lightLantern(lampId)) return true;
    const gain = InteractionRules.sanityDelta('candle');
    deps.adjust(gain, 'the village');
    const text = tr('vigil.lamp', { n: gain, lit: vigil.nightLampIds.size, lamps: VIGIL_LAMPS_PER_NIGHT });
    $('vigilNote').textContent = text; announce(text);
    return true;
  }
  /** The candle button: lights the next unlit lantern in layout order. False when the vigil is not live (free roam candle applies). */
  function candle() {
    if (!live()) return false;
    const pool = lamps.map((l) => l.id);
    for (let k = 0; pool.length < VIGIL_LAMPS_PER_NIGHT; k++) pool.push(`hearth${k}`); // villages with few lit houses still offer three
    const next = pool.find((id) => !vigil.nightLampIds.has(id));
    if (!next || vigil.nightLampIds.size >= VIGIL_LAMPS_PER_NIGHT) { progress.arm(); begin(); notice(tr('vigil.lamp.none')); return true; }
    return lightLamp(next);
  }

  function endure() {
    if (!live() || !vigil.canEndureNight) return false;
    progress.arm(); begin();
    suspended = true;
    const next = vigil.endureNight(sanityPoints(state.sanity.value));
    if (next < 0) { suspended = false; return false; }
    if (!vigil.isFinished) {
      deps.selectNight(vigil.night - 1, true);
      deps.setSanity(next, true);
      applyCreep();
      notice(tr('vigil.night', { night: vigil.night }));
      deps.syncUi(); deps.pushHash();
    }
    suspended = false;
    sync();
    return true;
  }

  /** Called after every sanity change. Records sanity into the vigil, then reacts to its end. */
  function sync() {
    if (!vigil || suspended) return;
    if (started && live()) vigil.recordSanity(sanityPoints(state.sanity.value));
    if (vigil.isFinished && started && !endingShown) { endingShown = true; finish(); }
    render();
  }

  function render() {
    const bar = $('objective'); if (!bar) return;
    let text = '';
    if (vigil) {
      const m = objectiveModel(vigil);
      text = m.finished ? tr('vigil.objective.done', { found: tr('vigil.end.found', { n: found().length, total: VIGIL_ENDING_IDS.length }) }) : objectiveText(m, tr);
      $('endure').hidden = !(m.canEndure && !m.finished);
      $('endure').textContent = tr(vigil.night >= vigil.nightsTotal ? 'vigil.finish' : 'vigil.endure');
    }
    if (text !== lastText) { lastText = text; $('objectiveText').textContent = text; }
  }

  // ---------- ending ----------
  let model = null, endingTitle = '';
  function finish() {
    const outcome = vigil.outcome(progress.snapshot().codex.length);
    if (!outcome) return;
    progress.note.vigilDone(outcome.endingId === 'name_spoken'); progress.update();
    const list = recordEnding(storage, outcome.endingId, (err) => console.warn(`[vigil] could not store endings: ${err.message}`));
    model = endingModel(outcome, { vigil, villageName: state.campaign.villageName, seed: state.seed, found: list.length, stageCount: state.ritual.stages.length });
    endingTitle = tr(`vigil.title.${outcome.endingId}`);
    deps.exit3d();
    setTimeout(openEnding, deps.reduceMotion ? 0 : ENDING_FADE_MS);
  }
  function openEnding() {
    if (!model) return;
    $('endingTitle').textContent = endingTitle;
    $('endingEpitaph').textContent = tr(`vigil.ending.${model.id}`);
    $('endingScore').textContent = tr('vigil.end.score', { score: model.score, rank: model.rankName });
    $('endingName').textContent = tr('vigil.end.name', { name: model.named ? model.name : spokenName(model.name) || model.name });
    $('endingStats').textContent = endingStatsText(model, tr);
    $('endingFound').textContent = tr('vigil.end.found', { n: model.found, total: model.foundTotal });
    $('endingNote').textContent = '';
    const d = $('ending'); endingIsOpen = true;
    if (d.showModal) d.showModal(); else d.setAttribute?.('open', '');
    $('endingKeep').focus?.();
    announce(`${endingTitle}. ${tr(`vigil.ending.${model.id}`)}`);
  }
  function closeEnding() {
    const d = $('ending'); endingIsOpen = false;
    if (d.close) d.close(); else d.removeAttribute?.('open');
    render();
  }
  function cardBlob(cb) {
    const c = document.createElement('canvas'); c.width = CARD_WIDTH; c.height = CARD_HEIGHT;
    drawResultCard(c.getContext('2d'), { ...model, title: endingTitle, epitaph: tr(`vigil.ending.${model.id}`) });
    c.toBlob(cb, 'image/png');
  }
  async function copyResult() {
    const text = resultText(model, endingTitle, deps.shareLink());
    try { await navigator.clipboard.writeText(text); $('endingNote').textContent = tr('vigil.end.copied'); }
    catch (err) { console.warn(`[vigil] clipboard write failed: ${err.message}`); $('endingNote').textContent = tr('vigil.end.copyfail'); }
  }
  $('endingCard')?.addEventListener('click', () => { if (model) cardBlob((blob) => { if (blob) deps.download(resultCardFilename(model.seed, model.id), blob, 'image/png'); }); });
  $('endingCopy')?.addEventListener('click', () => { if (model) copyResult(); });
  $('endingAgain')?.addEventListener('click', () => { closeEnding(); deps.reroll(); });
  $('endingKeep')?.addEventListener('click', closeEnding);
  $('ending')?.addEventListener('close', () => { endingIsOpen = false; });
  $('endure')?.addEventListener('click', endure);

  // ---------- 2D lamp markers and 3D lamp targets ----------
  const lampTargets = () => lamps.map((l) => ({ id: l.id, pos: l.pos, lit: !!vigil && vigil.nightLampIds.has(l.id) }));
  /** Small markers on the 2D board: a warm flame for a lit lantern, a pale ring for one still dark. iso maps grid cells to pixels. */
  function drawLamps(g, iso) {
    if (!vigil || vigil.isFinished) return;
    for (const l of lampTargets()) {
      const p = iso(l.pos[0] / CELL, l.pos[2] / CELL);
      g.save();
      if (l.lit) { g.fillStyle = 'rgba(255,196,110,0.9)'; g.shadowColor = '#ffb25c'; g.shadowBlur = 12; g.beginPath(); g.arc(p.x, p.y - 4, 3.5, 0, 6.283); g.fill(); }
      else { g.strokeStyle = 'rgba(190,210,200,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y - 4, 3, 0, 6.283); g.stroke(); }
      g.restore();
    }
  }

  return {
    reset, restore, serialize, clue, candle, lightLamp, endure, sync, render, lampTargets, drawLamps, closeEnding,
    endingOpen: () => endingIsOpen, canEndure: () => !!vigil && vigil.canEndureNight && !vigil.isFinished,
    isFinished: () => !!vigil && vigil.isFinished, isLive: live,
  };
}
