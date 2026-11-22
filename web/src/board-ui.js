// Investigation board panel: cards by type, strings between revealed links, contradiction markers and a timeline strip, drawn from investigation.js (the Core mirror).
// The board is an aid to the existing Vigil goal: it reads evidence and changes no clue, sanity or ending. DOM nodes are built with createElement and textContent only.
// Nothing runs per frame: the board is recomputed when evidence changes and redrawn only while it is open.
import {
  buildBoard, cardTitle, parseStatementLibrary, emptyEvidence,
  CARD_SUSPECT, CARD_VICTIM, CARD_LOCATION, CARD_CLUE, CARD_EVENT,
} from './investigation.js';
import { MINUTES_PER_DAY } from './clock.js';

export const BOARD_KEY = ';'; // every letter is taken by the main key switch, so the board uses a punctuation key that is unshifted on QWERTY and AZERTY
export const BOARD_SAVE_TAG = 'bd1';
export const COLUMN_KINDS = [CARD_SUSPECT, CARD_VICTIM, CARD_LOCATION, CARD_CLUE, CARD_EVENT];
export const CARD_W = 168, CARD_H = 48, GAP_X = 36, GAP_Y = 14, PAD = 12; // pixels of the board canvas
export const MAX_MET = 64, MAX_CLUES = 120, MAX_HEARD = 80;
export const UNKNOWN_TITLE = '???';
export const SVG_NS = 'http://www.w3.org/2000/svg';
const CLUE_ID_RE = /^[A-Za-z0-9_@:.\-]{1,40}$/;
const STATEMENT_ID_RE = /^[a-z0-9_]{1,40}$/;
const SHELL_KINDS = [CARD_SUSPECT, CARD_VICTIM]; // shown as ??? before they are found, so the player sees how many people there are
const clockText = (minute) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** The cards the board shows: every revealed card, plus suspects and victims as ??? shells. */
export const visibleCards = (cards) => cards.filter((c) => c.revealed || SHELL_KINDS.includes(c.kind));

/** Column per card type, rows in model order. Returns { slots: Map(id -> { x, y, col, row }), order (column-major ids), width, height }. */
export function layoutBoard(cards) {
  const slots = new Map(), order = [];
  let rows = 0, cols = 0;
  COLUMN_KINDS.forEach((kind, col) => {
    const mine = cards.filter((c) => c.kind === kind);
    if (!mine.length) return;
    mine.forEach((c, row) => { slots.set(c.id, { x: PAD + cols * (CARD_W + GAP_X), y: PAD + row * (CARD_H + GAP_Y), col: cols, row }); order.push(c.id); });
    rows = Math.max(rows, mine.length); cols++;
  });
  return { slots, order, width: PAD * 2 + cols * CARD_W + Math.max(0, cols - 1) * GAP_X, height: PAD * 2 + rows * CARD_H + Math.max(0, rows - 1) * GAP_Y };
}

/** Arrow-key navigation over the layout: up and down stay in the column, left and right go to the nearest column that has cards (same row, or the last row there). Null when there is nowhere to go. */
export function neighbourCard(layout, fromId, dir) {
  const from = layout.slots.get(fromId);
  if (!from) return layout.order.length ? layout.order[0] : null;
  const inColumn = (col) => layout.order.filter((id) => layout.slots.get(id).col === col);
  if (dir === 'up' || dir === 'down') {
    const mine = inColumn(from.col), i = mine.indexOf(fromId) + (dir === 'down' ? 1 : -1);
    return i >= 0 && i < mine.length ? mine[i] : null;
  }
  const step = dir === 'right' ? 1 : -1;
  for (let col = from.col + step; col >= 0 && col < COLUMN_KINDS.length; col += step) {
    const mine = inColumn(col);
    if (mine.length) return mine[Math.min(from.row, mine.length - 1)];
  }
  return null;
}

export const ARROW_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** Compact save string: bd1;<met roster indices>;<clue ids>;<villager:statementId:night heard entries>. Commas separate items. */
export function serializeBoardEvidence(e) {
  const heard = e.heard.slice(0, MAX_HEARD).map((h) => `${h.villager}:${h.statementId}:${h.night}`);
  return [BOARD_SAVE_TAG, [...e.met].sort((a, b) => a - b).slice(0, MAX_MET).join(','), [...e.clueIds].sort().slice(0, MAX_CLUES).join(','), heard.join(',')].join(';');
}

/** Parses a save string into evidence; anything malformed is dropped item by item. Returns empty evidence for a bad string. */
export function parseBoardEvidence(text) {
  const e = emptyEvidence();
  if (typeof text !== 'string') return e;
  const parts = text.split(';');
  if (parts.length !== 4 || parts[0] !== BOARD_SAVE_TAG) return e;
  for (const s of parts[1].split(',')) { const n = Number(s); if (s !== '' && Number.isInteger(n) && n >= 0 && n < MAX_MET) e.met.add(n); }
  for (const s of parts[2].split(',')) if (CLUE_ID_RE.test(s) && e.clueIds.size < MAX_CLUES) e.clueIds.add(s);
  for (const s of parts[3].split(',')) {
    const [v, id, n] = s.split(':'), villager = Number(v), night = Number(n);
    if (Number.isInteger(villager) && villager >= 0 && villager < MAX_MET && STATEMENT_ID_RE.test(id || '') && Number.isInteger(night) && night >= 1 && night <= 9 && e.heard.length < MAX_HEARD
      && !e.heard.some((h) => h.statementId === id)) e.heard.push({ villager, statementId: id, night });
  }
  return e;
}

const linkKey = (l) => `${l.kind}|${l.from}|${l.to}`;

/**
 * deps: { $, doc, tr, lang, state (seed), story() -> village story or null, lore (controller: library(), readIds()), corruption?() -> stage per roster index or null,
 *   announce(text), exitPointerLock(), activeElement(), keyTarget, reduceMotion, onChange?() }
 */
export function createBoardController(deps) {
  const { $, tr, state, doc } = deps;
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  let statements = null, evidence = emptyEvidence(), evidenceSeed = null, model = null, modelKey = '', version = 0, titles = new Map();
  let seenLinks = null, seenContradictions = null, layout = null, selected = null, returnFocus = null, open = false;

  const reduced = () => (typeof deps.reduceMotion === 'function' ? deps.reduceMotion() : !!deps.reduceMotion);
  const library = () => (deps.lore && deps.lore.library ? deps.lore.library() : null);
  const clone = () => ({ clueIds: new Set(evidence.clueIds), booksRead: deps.lore ? deps.lore.readIds() : new Set(), met: new Set(evidence.met), heard: evidence.heard.slice() });

  function setStatements(json) { statements = json ? parseStatementLibrary(json) : null; modelKey = ''; seenLinks = null; sync(); }

  function ensureSeed() {
    if (evidenceSeed !== state.seed) { evidence = emptyEvidence(); evidenceSeed = state.seed; modelKey = ''; seenLinks = null; seenContradictions = null; selected = null; }
  }

  /** The current board model, or null while the story, lore library or statements are missing. Recomputed only when evidence, language or the story changed. */
  function current() {
    ensureSeed();
    const story = deps.story ? deps.story() : null, lib = library();
    if (!story || !lib || !statements) return null;
    const read = deps.lore ? deps.lore.readIds().size : 0, corruption = deps.corruption ? deps.corruption() : null;
    const key = `${state.seed}|${version}|${read}|${lang()}|${corruption ? corruption.join('') : ''}|${story.roster.length}|${story.missing.length}`;
    if (key !== modelKey || !model) {
      modelKey = key;
      model = buildBoard(story, lib, statements, clone(), corruption);
      titles = new Map(model.cards.map((c) => [c.id, c.revealed || !SHELL_KINDS.includes(c.kind) ? cardTitle(c, story, lib, statements, deps.state.nameLib || null, lang()) : UNKNOWN_TITLE]));
    }
    return model;
  }
  const titleOf = (id) => titles.get(id) || id;

  /** Announces links and contradictions that appeared since the last look. The first look after a load or a new seed only records what is already known. */
  function announceNew(m) {
    const links = new Set(m.links.filter((l) => l.revealed).map(linkKey)), pairs = new Set(m.contradictions.map((c) => c.pairId));
    if (seenLinks !== null) {
      const messages = [];
      for (const l of m.links) if (l.revealed && !seenLinks.has(linkKey(l))) messages.push(tr('board.link.new', { a: titleOf(l.from), b: titleOf(l.to) }));
      for (const c of m.contradictions) {
        if (seenContradictions.has(c.pairId)) continue;
        const def = statements.contradictions.find((x) => x.id === c.pairId);
        messages.push(tr('board.contradiction.new', { a: titleOf(c.cardA), b: titleOf(c.cardB), reason: def ? def.reason[lang()] || def.reason.en : '' }));
      }
      if (messages.length) { const text = messages.join(' '); const live = $('boardLive'); if (live) live.textContent = text; deps.announce?.(text); }
    }
    seenLinks = links; seenContradictions = pairs;
  }

  /** Called whenever evidence may have changed (a book read, a clue found, someone met or heard). Cheap, and not per frame. */
  function sync() {
    const m = current();
    if (m) announceNew(m);
    if (open) render();
    deps.onChange?.();
  }

  function noteMet(index) { if (Number.isInteger(index) && index >= 0 && index < MAX_MET && !evidence.met.has(index)) { ensureSeed(); evidence.met.add(index); version++; sync(); } }
  function noteClue(id) { ensureSeed(); if (typeof id === 'string' && CLUE_ID_RE.test(id) && !evidence.clueIds.has(id) && evidence.clueIds.size < MAX_CLUES) { evidence.clueIds.add(id); version++; sync(); } }
  /** A chat result: only an authored statement (the villager's lie today) becomes board evidence. */
  function noteChat(index, result, night) {
    noteMet(index);
    const id = result && result.lieStatementId;
    if (!id || !STATEMENT_ID_RE.test(id) || evidence.heard.some((h) => h.statementId === id) || evidence.heard.length >= MAX_HEARD) return;
    ensureSeed(); evidence.heard.push({ villager: index, statementId: id, night: Math.max(1, Math.min(9, night | 0)) }); version++; sync();
  }

  // ---- DOM ----
  const node = (tag, attrs = {}, text = '') => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  };
  const svgNode = (tag, attrs) => { const n = doc.createElementNS(SVG_NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  const clear = (el) => { if (el.replaceChildren) el.replaceChildren(); else el.textContent = ''; };
  let cardNodes = new Map();

  function render() {
    const m = current(), cardsEl = $('boardCards'), linesEl = $('boardLines'), timelineEl = $('boardTimeline'), note = $('boardNote');
    if (!cardsEl || !linesEl || !timelineEl) return;
    clear(cardsEl); clear(linesEl); clear(timelineEl); cardNodes = new Map();
    if (!m) { if (note) note.textContent = tr('board.unavailable'); layout = null; return; }
    const shown = visibleCards(m.cards), shownIds = new Set(shown.map((c) => c.id));
    layout = layoutBoard(shown);
    if (note) note.textContent = tr('board.note', { n: m.links.filter((l) => l.revealed).length, c: m.contradictions.length });
    const wrap = $('boardWrap');
    if (wrap) { wrap.style.setProperty('width', `${layout.width}px`); wrap.style.setProperty('height', `${layout.height}px`); }
    linesEl.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    linesEl.setAttribute('width', String(layout.width)); linesEl.setAttribute('height', String(layout.height));
    const centre = (id) => { const s = layout.slots.get(id); return { x: s.x + CARD_W / 2, y: s.y + CARD_H / 2 }; };
    const drawClass = reduced() ? 'board-string' : 'board-string board-draw'; // static when reduced motion is on; the stylesheet only animates .board-draw
    for (const l of m.links) {
      if (!l.revealed || !shownIds.has(l.from) || !shownIds.has(l.to)) continue;
      const a = centre(l.from), b = centre(l.to);
      linesEl.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: drawClass }));
    }
    const flagged = new Set();
    for (const c of m.contradictions) {
      if (!shownIds.has(c.cardA) || !shownIds.has(c.cardB)) continue;
      flagged.add(c.cardA); flagged.add(c.cardB);
      const a = centre(c.cardA), b = centre(c.cardB), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      linesEl.append(svgNode('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'board-contradiction-string' }));
      const badge = svgNode('text', { x: mx, y: my, class: 'board-contradiction-mark', 'text-anchor': 'middle' }); badge.textContent = '!'; linesEl.append(badge);
    }
    for (const c of shown) {
      const slot = layout.slots.get(c.id), title = titleOf(c.id), contradictory = flagged.has(c.id);
      const label = [tr(`board.kind.${c.kind}`), title, contradictory ? tr('board.flag.contradiction') : '', c.invalidated ? tr('board.flag.invalid') : ''].filter(Boolean).join(', ');
      const b = node('button', { type: 'button', class: `board-card board-kind-${c.kind}${c.revealed ? '' : ' board-unknown'}${contradictory ? ' board-contradiction' : ''}${c.invalidated ? ' board-invalid' : ''}`, 'data-card': c.id, 'aria-label': label, tabindex: '-1' });
      b.style.setProperty('left', `${slot.x}px`); b.style.setProperty('top', `${slot.y}px`); b.style.setProperty('width', `${CARD_W}px`); b.style.setProperty('height', `${CARD_H}px`);
      b.append(node('span', { class: 'board-card-kind' }, tr(`board.kind.${c.kind}`)), node('span', { class: 'board-card-title' }, title));
      b.addEventListener('click', () => inspect(c.id));
      cardsEl.append(b); cardNodes.set(c.id, b);
    }
    const first = layout.order.includes(selected) ? selected : layout.order[0];
    for (const [id, b] of cardNodes) b.setAttribute('tabindex', id === first ? '0' : '-1');
    if (!m.timeline.length) timelineEl.append(node('li', { class: 'board-timeline-empty' }, tr('board.timeline.empty')));
    for (const ev of m.timeline) {
      const who = ev.villager >= 0 && deps.story().roster[ev.villager] ? deps.story().roster[ev.villager].name : '';
      timelineEl.append(node('li', {}, tr('board.timeline.row', { night: ev.night, time: clockText(ev.minute % MINUTES_PER_DAY), text: titleOf(`event:${ev.statementId}`), who })));
    }
  }

  /** Enter or click on a card: its linked cards and any contradiction it is part of, in the detail line (also read out). */
  function inspect(id) {
    const m = current(); if (!m) return null;
    const card = m.cards.find((c) => c.id === id); if (!card) return null;
    selected = id;
    const linked = [];
    for (const l of m.links) { if (!l.revealed) continue; if (l.from === id) linked.push(titleOf(l.to)); else if (l.to === id) linked.push(titleOf(l.from)); }
    const reasons = m.contradictions.filter((c) => c.cardA === id || c.cardB === id).map((c) => { const d = statements.contradictions.find((x) => x.id === c.pairId); return d ? d.reason[lang()] || d.reason.en : ''; });
    const parts = [`${tr(`board.kind.${card.kind}`)}: ${titleOf(id)}.`, linked.length ? tr('board.detail.linked', { list: linked.join(', ') }) : tr('board.detail.none'), ...reasons.map((r) => tr('board.detail.contradiction', { reason: r }))];
    const text = parts.join(' ');
    const el = $('boardDetail'); if (el) el.textContent = text;
    deps.announce?.(text);
    for (const [cid, b] of cardNodes) b.setAttribute('tabindex', cid === id ? '0' : '-1');
    return text;
  }

  const focusCard = (id) => { const b = cardNodes.get(id); if (!b) return false; selected = id; for (const [cid, n] of cardNodes) n.setAttribute('tabindex', cid === id ? '0' : '-1'); b.focus?.(); return true; };

  function openBoard() {
    const panel = $('boardPanel'); if (!panel) return false;
    open = true; panel.hidden = false; render();
    deps.exitPointerLock?.();
    returnFocus = deps.activeElement ? deps.activeElement() : null;
    const first = layout && layout.order.length ? (layout.order.includes(selected) ? selected : layout.order[0]) : null;
    if (!(first && focusCard(first))) $('boardClose')?.focus?.();
    $('boardToggle')?.setAttribute?.('aria-expanded', 'true');
    return true;
  }
  function close() {
    const panel = $('boardPanel');
    if (!open || !panel) return false;
    open = false; panel.hidden = true;
    $('boardToggle')?.setAttribute?.('aria-expanded', 'false');
    returnFocus?.focus?.(); returnFocus = null;
    return true;
  }
  const toggle = () => (open ? close() : openBoard());

  function focusables() { return [...cardNodes.values(), $('boardClose')].filter(Boolean); }

  deps.keyTarget?.addEventListener?.('keydown', (e) => {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    const stop = () => { e.preventDefault?.(); e.stopImmediatePropagation?.(); };
    if (e.key === 'Escape' || e.key === BOARD_KEY) { close(); stop(); return; }
    if (e.key === 'Tab') {
      const list = focusables(), at = list.indexOf(deps.activeElement ? deps.activeElement() : null);
      if (list.length) { list[(at + (e.shiftKey ? -1 : 1) + list.length) % list.length].focus?.(); }
      stop(); return;
    }
    const dir = ARROW_DIRS[e.key];
    if (dir && layout) {
      const active = deps.activeElement ? deps.activeElement() : null, from = [...cardNodes].find(([, n]) => n === active);
      const next = neighbourCard(layout, from ? from[0] : selected, dir);
      if (next) focusCard(next);
      stop(); return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      const active = deps.activeElement ? deps.activeElement() : null, from = [...cardNodes].find(([, n]) => n === active);
      if (from) { inspect(from[0]); stop(); }
    }
  }, true);
  $('boardClose')?.addEventListener?.('click', close);
  $('boardToggle')?.addEventListener?.('click', toggle);

  return {
    setStatements, noteMet, noteClue, noteChat, sync, open: openBoard, close, toggle, inspect, isOpen: () => open, model: () => current(),
    evidence: () => clone(), cardTitle: titleOf,
    snapshot: () => { ensureSeed(); return { board: serializeBoardEvidence(evidence) }; },
    restore(s) {
      ensureSeed();
      evidence = parseBoardEvidence(s && s.board); version++; modelKey = ''; seenLinks = null; seenContradictions = null; // what a restored save already holds is not announced again
      sync();
    },
  };
}
