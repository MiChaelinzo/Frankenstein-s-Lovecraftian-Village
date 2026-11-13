// Villager DOM: the Who is where list, the talk dialogue and the optional AI line. The rules come from villagers.js (Core mirror), the
// positions from villager-view.js. Talking applies its clue and sanity effect through deps.applyEffect BEFORE any narrator request starts,
// and the narrator text is only ever written with textContent, so an AI answer (or its failure) cannot change game state.
import { generateRoster, talk, lineKey } from './villagers.js';
import { phaseAt, PHASE_NAMES } from './clock.js';
import { villagerPlacements, whoIsWhereRows, clockParts } from './villager-view.js';
import { buildVillagerRequest, fetchVillagerLine } from './villager-narrator.js';
import { esc } from './util.js';

/**
 * deps: { $, tr, lang, state (seed, layout, sanity, campaign, night), gridW, gridD, tickNow(), announce(text), applyEffect(result, placement),
 *   narratorUrl, fetchImpl, exitPointerLock(), onChange() }
 * state.villagers (placements) is kept current for the 2D and 3D renderers.
 */
export function createVillagerController(deps) {
  const { $, tr, state } = deps;
  let roster = [], rosterKey = '', openFor = -1, talkId = 0, panelOn = false, listKey = '', cursor = -1, returnFocus = null;
  state.villagers = [];

  function ensureRoster() {
    const key = `${state.seed}|${state.layout.length}`;
    if (key !== rosterKey) { rosterKey = key; roster = state.layout.length ? generateRoster(state.seed, state.layout) : []; }
    return roster;
  }
  const placementOf = (index) => state.villagers.find((p) => p.index === index) || null;

  /** Recomputes positions for the current tick and dread; returns true when anything visible changed. */
  function refresh() {
    const tick = deps.tickNow();
    const next = villagerPlacements({ roster: ensureRoster(), layout: state.layout, tick, dread: state.sanity.dread, gridW: deps.gridW, gridD: deps.gridD, seed: state.seed });
    const sig = (list) => list.map((p) => `${p.index}:${p.gone ? 'g' : `${p.x.toFixed(2)},${p.z.toFixed(2)}`}:${p.behavior}:${p.lantern ? 1 : 0}`).join('|');
    const changed = sig(next) !== sig(state.villagers);
    state.villagers = next;
    renderPanel(tick);
    if (openFor >= 0) { const p = placementOf(openFor); if (!p || p.gone) close(); }
    return changed;
  }

  function renderPanel(tick) {
    const clock = $('villagerClock'), list = $('villagerList');
    if (!clock || !list) return;
    const c = clockParts(tick), text = tr('villagerui.clock', { day: c.day, phase: tr(c.phaseKey) });
    if (clock.textContent !== text) clock.textContent = text;
    const rows = whoIsWhereRows(state.villagers), key = rows.map((r) => `${r.index}${r.whereKey}`).join('|');
    if (key === listKey) return;
    listKey = key;
    const focused = deps.focusedVillager ? deps.focusedVillager() : -1;
    list.innerHTML = rows.map((r) => `<li><span class="vname">${esc(r.name)}</span> <span class="vrole">${esc(tr(r.roleKey))}</span> <span class="vwhere">${esc(tr(r.whereKey))}</span> `
      + `<button type="button" data-villager="${r.index}"${r.gone ? ' disabled' : ''}>${esc(tr('villagerui.talk'))}</button></li>`).join('');
    if (focused >= 0) list.querySelector?.(`[data-villager="${focused}"]`)?.focus?.();
  }

  function setPanel(on) {
    panelOn = on;
    const panel = $('villagerPanel'); if (panel) panel.hidden = !on;
    $('villagerToggle')?.setAttribute?.('aria-pressed', String(on));
    if (on) { listKey = ''; refresh(); }
    deps.onChange?.();
    return panelOn;
  }

  function showDialog(p, result, line) {
    const dlg = $('villagerDialog');
    $('villagerName').textContent = p.name;
    $('villagerRole').textContent = tr(`villager.role.${p.roleId}`);
    $('villagerLine').textContent = line;
    const effect = [];
    if (result.yieldsClue) effect.push(tr('villagerui.effect.clue'));
    if (result.sanityDelta !== 0) effect.push(tr('villagerui.effect.sanity', { n: result.sanityDelta }));
    if (result.rumor && result.yieldsClue) effect.push(`${tr('label.rumor')}: ${result.rumor}`);
    $('villagerEffect').textContent = effect.join(' ');
    dlg.hidden = false;
    deps.exitPointerLock?.();
    returnFocus = deps.activeElement ? deps.activeElement() : null;
    $('villagerClose').focus?.();
  }

  /** Talk to a villager by roster index. Returns the Core result, or null when nobody is there to answer. */
  function talkTo(index) {
    const v = ensureRoster()[index], p = placementOf(index);
    if (!v || !p) return null;
    const tick = deps.tickNow(), night = state.night + 1;
    const result = talk(state.seed, v, tick, state.sanity.dread, state.campaign, night);
    const line = tr(lineKey(v, result.behavior, result.lineVariant), { name: v.name });
    if (!result.available) { deps.announce(line); showDialog(p, result, line); openFor = -1; return result; }
    openFor = index; cursor = index;
    deps.applyEffect(result, p); // clue and sanity first, from Core only; nothing below can change them
    showDialog(p, result, line);
    deps.announce(`${v.name}: ${line}`);
    const id = ++talkId;
    if (deps.narratorUrl) {
      const request = buildVillagerRequest({ villager: v.name, roleId: p.roleId, behavior: result.behavior, cause: p.cause, phase: PHASE_NAMES[phaseAt(tick)], dreadPercent: Math.round(state.sanity.dread * 100), night, lang: deps.lang, fallback: line });
      fetchVillagerLine({ url: deps.narratorUrl, request, fallback: line, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs, setTimer: deps.setTimer, clearTimer: deps.clearTimer }).then((out) => {
        if (id !== talkId || !isOpen() || out.source !== 'ai') return; // closed or superseded: drop it
        $('villagerLine').textContent = out.text;
        deps.announce(`${v.name}: ${out.text}`);
      });
    }
    return result;
  }

  /** Cycles through villagers who are present (gamepad in 2D). */
  function talkNext() {
    const present = state.villagers.filter((p) => !p.gone);
    if (!present.length) return null;
    const next = present.find((p) => p.index > cursor) || present[0];
    return talkTo(next.index);
  }

  function close() {
    const dlg = $('villagerDialog');
    if (!dlg || dlg.hidden !== false) return false;
    dlg.hidden = true; openFor = -1; talkId++;
    returnFocus?.focus?.(); returnFocus = null;
    return true;
  }
  const isOpen = () => { const d = $('villagerDialog'); return !!d && d.hidden === false; };

  // Escape, E and Enter close the dialogue first (capture phase), so the 3D view does not exit and the 2D Endure key does not fire.
  deps.keyTarget?.addEventListener?.('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' || e.code === 'KeyE' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') { close(); e.preventDefault?.(); e.stopImmediatePropagation?.(); }
  }, true);
  $('villagerClose')?.addEventListener?.('click', close);
  $('villagerList')?.addEventListener?.('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button[data-villager]') : null;
    if (b && !b.disabled) talkTo(Number(b.getAttribute('data-villager')));
  });
  $('villagerToggle')?.addEventListener?.('click', () => setPanel(!panelOn));

  return { refresh, talkTo, talkNext, close, isOpen, setPanel, get panelOn() { return panelOn; }, get roster() { return ensureRoster(); } };
}
