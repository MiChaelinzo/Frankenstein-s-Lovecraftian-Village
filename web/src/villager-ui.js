// Villager DOM: the Who is where list, the talk dialogue and the optional AI line. The rules come from villagers.js (Core mirror), the
// positions from villager-view.js. Talking applies its clue and sanity effect through deps.applyEffect BEFORE any narrator request starts,
// and the narrator text is only ever written with textContent, so an AI answer (or its failure) cannot change game state.
import { generateTownRoster, talk, chat, lineKey } from './villagers.js';
import { combinedBehavior, coldLine, AXIS_NAMES } from './society.js';
import { stageOfNight, GOSSIP_MISSING } from './village-story.js';
import { tierFor } from './core.js';
import { phaseAt, PHASE_NAMES } from './clock.js';
import { villagerPlacements, whoIsWhereRows, clockParts } from './villager-view.js';
import { buildVillagerRequest, fetchVillagerLine } from './villager-narrator.js';
import { esc } from './util.js';

/**
 * Optional mythos deps (Round 27): mythosChat(index, night, result) -> [{ id, text }] told in this chat, onMythos(index, ids, night).
 * Optional society deps (Round 26): standing(index) -> { tier, corruption } or null, stageOf(index) -> corruption stage, chatStatement(index, night, result) -> authored statement or null, onChat(index, result, night).
 * deps: { $, tr, lang, chatNeeds() -> { cluesLeft, lampsLeft, sanity } (what the vigil still needs), state (seed, layout, sanity, campaign, night), gridW, gridD, tickNow(), announce(text), applyEffect(result, placement),
 *   story() -> the village story or null, onGossip(missingId, stage), narratorUrl, fetchImpl, exitPointerLock(), onChange() }
 * Optional reality dep (Round 34): reality() -> reality view (reality.js) or null, journal?(text).
 * state.villagers (placements) is kept current for the 2D and 3D renderers.
 */
export function createVillagerController(deps) {
  const { $, tr, state } = deps;
  let roster = [], rosterKey = '', openFor = -1, talkId = 0, chatCounts = new Map(), chatNight = -1, panelOn = false, listKey = '', cursor = -1, returnFocus = null;
  state.villagers = [];

  function ensureRoster() {
    const key = `${state.seed}|${state.layout.length}`;
    if (key !== rosterKey) { rosterKey = key; chatCounts.clear(); roster = state.layout.length ? generateTownRoster(state.seed, state.layout, deps.gridW, deps.gridD) : []; }
    return roster;
  }
  // Round 34 reality instability (presentation only, Core RealityInstability): a blurred villager is listed under another principal's name, a house can carry a wrong name and a false villager
  // stands in the list. Placements, the roster, chat results and the save keep the true names; the truth switch on the board shows them again.
  const PRINCIPALS = 7;
  const rv = () => (deps.reality ? deps.reality() : null);
  const realityNote = (id) => { const v = rv(), text = v ? v.noteOnce(id) : ''; if (text) deps.journal?.(text); };
  function shownName(index, trueName, roleText = '') {
    const v = rv();
    if (!v || !v.active() || index >= PRINCIPALS) return trueName;
    const names = ensureRoster().slice(0, PRINCIPALS).map((r) => r.name);
    let shown = v.shownName(index, names);
    const step = v.identityStep(index); // collapse (spec 183): Name, Name?, Unknown plus the role
    if (step === 1) shown = `${shown}?`; else if (step >= 2) shown = tr('reality.collapse.unknown', { role: roleText });
    if (shown !== trueName) realityNote('identity');
    return shown;
  }
  function shownHome(homeIndex, trueHome) {
    const v = rv(), shown = v && v.active() ? v.houseName(homeIndex, trueHome) : trueHome;
    if (shown !== trueHome) realityNote('house');
    return shown;
  }
  const placementOf = (index) => state.villagers.find((p) => p.index === index) || null;

  /** Placements at an exact (fractional) tick, so 3D figures walk smoothly between the whole-minute refreshes. */
  function placementsAt(tickExact) {
    return villagerPlacements({ roster: ensureRoster(), layout: state.layout, tick: tickExact, dread: state.sanity.dread, gridW: deps.gridW, gridD: deps.gridD, seed: state.seed, stageOf: deps.stageOf || null });
  }
  state.placementsAt = placementsAt;

  /** Recomputes positions for the current tick and dread; returns true when anything visible changed. */
  function refresh() {
    const tick = deps.tickNow();
    const next = placementsAt(deps.tickExact ? deps.tickExact() : tick);
    const sig = (list) => list.map((p) => `${p.index}:${p.gone ? 'g' : `${p.x.toFixed(2)},${p.z.toFixed(2)}`}:${p.behavior}:${p.corruption | 0}:${p.lantern ? 1 : 0}:${p.indoors ? 1 : 0}`).join('|');
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
    const v = rv(), rows = whoIsWhereRows(state.villagers).filter((r) => !(v && v.active() && r.index < PRINCIPALS && v.erased(r.index, PRINCIPALS))), fake = v && v.active() ? v.falseVillager() : null, key = `${rows.map((r) => `${r.index}${r.whereKey}${shownName(r.index, r.name, tr(r.roleKey))}`).join('|')}|${fake || ''}`;
    if (key === listKey) return;
    listKey = key;
    const focused = deps.focusedVillager ? deps.focusedVillager() : -1;
    list.innerHTML = rows.map((r) => `<li><span class="vname">${esc(shownName(r.index, r.name, tr(r.roleKey)))}</span> <span class="vrole">${esc(tr(r.roleKey))}</span> <span class="vwhere">${esc(tr(r.whereKey))}</span> `
      + `<button type="button" data-villager="${r.index}"${r.gone ? ' disabled' : ''}>${esc(tr('villagerui.talk'))}</button></li>`).join('')
      + (fake ? `<li class="vfalse"><span class="vname">${esc(fake)}</span> <span class="vrole">${esc(tr('reality.false.role'))}</span></li>` : '');
    if (fake) realityNote('villager');
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

  /** Subtle trust line for the dialogue: { text, aria } from the villager's tier, plus a cold-voice cue once corruption shows. Empty for townsfolk outside the story. */
  function trustParts(index) {
    const st = deps.standing ? deps.standing(index) : null;
    if (!st) return { text: '', aria: '' };
    const cold = coldLine(st.corruption || 0), text = [tr(`society.trust.${st.tier}`), cold ? tr('society.cold') : ''].filter(Boolean).join(' ');
    return { text, aria: tr('society.trust.aria', { text }) };
  }

  /** Round 29: readable bars for Fear, Faith, Loyalty and Obsession (0..1000) of a villager in the story, as { html, aria }; empty for townsfolk outside it. */
  function axesParts(index) {
    const a = deps.axes ? deps.axes(index) : null;
    if (!a) return { html: '', aria: '' };
    const rows = AXIS_NAMES.map((k) => ({ label: tr(`society.axis.${k}`), value: a[k] }));
    const html = rows.map((r) => `<li><span class="axis-label">${esc(r.label)}</span><meter min="0" max="1000" value="${r.value}" aria-label="${esc(r.label)}: ${r.value}"></meter></li>`).join('');
    return { html, aria: tr('society.axis.aria', { text: rows.map((r) => `${r.label} ${r.value}`).join(', ') }) };
  }

  function showDialog(p, result, line, effectText = null) {
    const dlg = $('villagerDialog');
    $('villagerName').textContent = shownName(p.index, p.name, tr(`villager.role.${p.roleId}`));
    const story = deps.story ? deps.story() : null, v = story && story.roster[p.index], role = tr(`villager.role.${p.roleId}`);
    $('villagerRole').textContent = v ? tr('villagerui.roleAt', { role, home: shownHome(v.homeIndex, story.pieceName(v.homeIndex, deps.lang, v.name.split(' ').pop())) }) : role;
    $('villagerLine').textContent = line;
    const effect = [];
    if (result.yieldsClue) effect.push(tr('villagerui.effect.clue'));
    if (result.sanityDelta !== 0) effect.push(tr('villagerui.effect.sanity', { n: result.sanityDelta }));
    if (result.rumor && result.yieldsClue) effect.push(`${tr('label.rumor')}: ${result.rumor}`);
    $('villagerEffect').textContent = effectText === null ? effect.join(' ') : effectText;
    const trust = $('villagerTrust');
    if (trust) { const t = trustParts(p.index); trust.textContent = t.text; trust.setAttribute?.('aria-label', t.aria); trust.hidden = !t.text; }
    const axesEl = $('villagerAxes');
    if (axesEl) { const x = axesParts(p.index); axesEl.innerHTML = x.html; axesEl.setAttribute?.('aria-label', x.aria); axesEl.hidden = !x.html; }
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
    const stage = deps.stageOf ? deps.stageOf(index) | 0 : 0, shown = combinedBehavior(result.behavior, stage); // a corrupted villager shows the stronger behaviour; the clue and sanity result stay Core's
    if (shown === 4) result.available = false;
    const line = tr(lineKey(v, shown, result.lineVariant), { name: v.name });
    if (!result.available) { deps.announce(line); showDialog(p, result, line); openFor = -1; return result; }
    openFor = index; cursor = index;
    deps.onMet?.(index);
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

  /** What the villager says about the village (Core story gossip); a missing person told about is recorded in the chronicle. */
  function villageLine(v, night, result) {
    const story = deps.story(), nights = state.campaign ? state.campaign.nights.length : 5;
    const g = story.gossipFor(v, night, stageOfNight(night, nights));
    if (g.kind === GOSSIP_MISSING) deps.onGossip?.(story.missing[g.subject].id, g.stage);
    return story.gossipText(g, v, night, tierFor(state.sanity.dread), deps.lang);
  }

  /**
   * Chat with a villager (C key): a Core-chosen hint about what the vigil still needs. Changes no clue and no sanity, and asks no narrator.
   * Chatting again with the same villager moves on to the next topic. Returns the Core result, or null when nobody is there.
   */
  function chatWith(index) {
    const v = ensureRoster()[index], p = placementOf(index);
    if (!v || !p) return null;
    const night = state.night + 1;
    if (night !== chatNight) { chatNight = night; chatCounts.clear(); } // topics restart each night, so the first chat of a night is always topic 0
    const topic = chatCounts.get(index) || 0, need = deps.chatNeeds();
    const standing = deps.standing ? deps.standing(index) : null;
    const result = chat(state.seed, v, deps.tickNow(), state.sanity.dread, night, topic, need.cluesLeft, need.lampsLeft, need.sanity, standing || undefined);
    const authored = deps.chatStatement ? deps.chatStatement(index, night, result) : null, spoken = result.lieStatementId ? deps.statementText?.(result.lieStatementId) : '';
    let line;
    const remembered = result.available && deps.memoryLine ? deps.memoryLine(index, night) : '';
    if (result.fearWithheld) line = tr('society.chat.afraid', { name: v.name });
    else if (result.memoryWithheld) line = remembered || tr('society.chat.withheld', { name: v.name });
    else if (result.withheld) line = tr('society.chat.withheld', { name: v.name });
    else if (spoken) line = spoken;
    else if (result.hintId === 'village' && deps.story && deps.story()) line = villageLine(v, night, result);
    else if (result.hintId === 'village') line = tr('villagerui.chat.clues_done.0', { name: v.name }); // no story data this session: the plainest hint
    else line = result.hintId ? tr(`villagerui.chat.${result.hintId}.${result.lineVariant}`, { name: v.name }) : tr(lineKey(v, result.behavior, result.lineVariant), { name: v.name });
    if (remembered && !result.memoryWithheld && !result.fearWithheld) line += ` ${remembered}`; // Round 34: what this villager remembers of the player and the village
    const told = deps.mythosChat ? deps.mythosChat(index, night, result) : [];
    if (told.length) line += ` ${told.map((t) => t.text).join(' ')}`; // what the background simulation lets this villager honestly say (rumor, its truth, a cult tie)
    if (authored && result.hintId) line += ` ${authored.text[deps.lang] || authored.text.en}`; // what this villager says they saw, after the hint
    if (told.length) deps.onMythos?.(index, told.map((t) => t.id), night);
    if (result.available) { chatCounts.set(index, topic + 1); deps.onChat?.(index, authored && !result.lieStatementId ? { ...result, lieStatementId: authored.id } : result, night); }
    openFor = result.available ? index : -1; cursor = index; talkId++;
    showDialog(p, result, line, result.hintId || result.withheld || result.lieStatementId ? tr('villagerui.chat.topic', { topic: tr(`villagerui.chat.topic.${result.topic}`) }) : '');
    deps.announce(`${v.name}: ${line}`);
    return result;
  }

  /** Chat with the nearest present villager in the 2D view, which has no player position: cycles like talkNext. */
  function chatNext() {
    const present = state.villagers.filter((p) => !p.gone);
    if (!present.length) return null;
    return chatWith((present.find((p) => p.index > cursor) || present[0]).index);
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

  return { refresh, talkTo, talkNext, chatWith, chatNext, close, isOpen, setPanel, get panelOn() { return panelOn; }, get roster() { return ensureRoster(); } };
}
