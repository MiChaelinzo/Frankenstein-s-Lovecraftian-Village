// Round 30 (spec 162): the theory builder inside the investigation board. Pick a question, pick an answer, attach up to three revealed statements as evidence, conclude.
// Every rule (grading, tiers, knowledge, trust cost, epilogue variant) comes from theory.js, the Core TheoryModel mirror; this file keeps the choice log, draws it with
// createElement and textContent only, and passes results out. Nothing runs per frame: it redraws when a choice is made, evidence changes or the board opens.
import {
  parseTheoryLibrary, theoryInstances, replayTheories, legalChoices, choice, theoryQuestion, theoryOptionText, verdictText, theoryKnowledge, theoryTrustLost,
  epilogueVariant, epilogueText, serializeTheoryLog, parseTheoryLog, GRADE_IDS, CHOICE_THEORY, CHOICE_OPTION, CHOICE_EVIDENCE, CHOICE_CONCLUDE, MAX_EVIDENCE,
} from './theory.js';
import { theoryExportText, exportFileName } from './export-text.js';
import { parseOutcomeLibrary, resolveOutcome, countLeads, revealOutcome, aftermathStatements, recruitedByNight } from './outcomes.js';

export const MAX_LOG = 300;
export const FINAL_NIGHTS_DEFAULT = 5;

/** The shortest log that rebuilds the same state: per concluded theory its choice, answer, evidence and conclusion, then the open selection. */
export function compactLog(state) {
  const log = [];
  for (const c of state.list) {
    log.push(choice(CHOICE_THEORY, c.instance), choice(CHOICE_OPTION, c.option));
    for (const e of c.evidence) log.push(choice(CHOICE_EVIDENCE, e));
    log.push(choice(CHOICE_CONCLUDE, 0));
  }
  if (state.current >= 0) {
    log.push(choice(CHOICE_THEORY, state.current));
    if (state.currentOption >= 0) log.push(choice(CHOICE_OPTION, state.currentOption));
    for (const e of state.currentEvidence) log.push(choice(CHOICE_EVIDENCE, e));
  }
  return log;
}

/**
 * deps: { $, doc, tr, lang, state (seed), story() -> story or null, society() -> VillageSociety or null, mythosFinal() -> MythosState or null (the last night),
 *   board: { beliefs() -> Map(statement index -> belief), statementTitle(index), evidence() }, lore: { library() }, announce?(text), journal?(text), onChange?() }
 */
export function createTheoryController(deps) {
  const { $, doc, tr, state } = deps;
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  let theories = null, outcomes = null, log = [], version = 0, seenSeed = null, instKey = '', insts = [], replayKey = '', replayed = null, open = false, lastVerdict = '';

  /** Loads data/theories.json and data/outcomes.json (objects). Without both the builder shows a note and every result is empty. */
  function setData(theoriesJson, outcomesJson) {
    theories = theoriesJson ? parseTheoryLibrary(theoriesJson) : null;
    outcomes = outcomesJson ? parseOutcomeLibrary(outcomesJson) : null;
    instKey = ''; replayKey = '';
  }
  const ready = () => !!(theories && outcomes && deps.story && deps.story() && deps.society && deps.society());

  function ensureSeed() { if (seenSeed !== state.seed) { seenSeed = state.seed; log = []; version++; instKey = ''; lastVerdict = ''; } }

  /** The questions of this village (Core TheoryRules.Instances), cached per village. */
  function instances() {
    ensureSeed();
    if (!ready()) return [];
    const story = deps.story(), society = deps.society(), key = `${state.seed}|${story.roster.length}|${story.missing.length}|${deps.mythosFinal() ? 1 : 0}`;
    if (key !== instKey || !insts.length) { instKey = key; insts = theoryInstances(society, story, deps.mythosFinal(), theories, outcomes); replayKey = ''; }
    return insts;
  }

  function theoryState() {
    const list = instances(), beliefs = deps.board.beliefs();
    if (!list.length) return { list: [], current: -1, currentOption: -1, currentEvidence: [], conclusions: new Map(), rejected: 0 };
    const key = `${instKey}|${version}|${log.length}|${[...beliefs].join(';')}`;
    if (key !== replayKey || !replayed) { replayKey = key; replayed = replayTheories(theories, list, beliefs, log); }
    return replayed;
  }

  const knowledgeBonus = () => (ready() ? theoryKnowledge(theoryState()) : 0);
  const trustLost = () => (ready() ? theoryTrustLost(instances(), theoryState()) : 0);
  const gradeName = (g) => tr(`theory.grade.${GRADE_IDS[g]}`);

  /** The extra epilogue line for an ending id: '' when nothing was concluded. */
  function epilogue(endingId, l = lang()) {
    if (!ready()) return '';
    return epilogueText(theories, endingId, epilogueVariant(theoryState()), l);
  }

  /** What the player concluded, as plain data for the chronicle and the journal. */
  function summary() {
    if (!ready()) return [];
    const list = instances(), story = deps.story(), society = deps.society(), l = lang();
    return theoryState().list.map((c) => {
      const inst = list[c.instance];
      return {
        instance: c.instance, grade: c.grade, gradeName: gradeName(c.grade), question: theoryQuestion(theories, society, story, inst, l),
        answer: theoryOptionText(theories, society, story, inst, c.option, l), verdict: verdictText(theories, c.grade, c.tier, l),
        evidence: c.evidence.map((e) => deps.board.statementTitle(e)),
      };
    });
  }

  /** What the player has learned of one missing person: nothing until a lead, the taken line from one, the epitaph from four. Empty text when unknown or without data. */
  function outcomeLine(missingIndex) {
    if (!ready() || !Number.isInteger(missingIndex) || missingIndex < 0 || missingIndex >= deps.story().missing.length) return '';
    const story = deps.story(), lib = deps.lore.library();
    if (!lib) return '';
    const leads = countLeads(story, lib, deps.board.evidence(), missingIndex, deps.board.places ? deps.board.places() : null);
    const outcome = resolveOutcome(deps.society(), story, deps.mythosFinal(), outcomes, missingIndex, 0);
    return revealOutcome(story, outcomes, outcome, missingIndex, leads, lang()).text;
  }

  /** Round 34: what really happened to one missing person and how many leads the player has, for the generated chronicle (it reveals only as far as the leads allow). Null without data. */
  function outcomeState(missingIndex) {
    if (!ready() || !Number.isInteger(missingIndex) || missingIndex < 0 || missingIndex >= deps.story().missing.length) return null;
    const story = deps.story(), lib = deps.lore.library();
    if (!lib) return null;
    return { outcome: resolveOutcome(deps.society(), story, deps.mythosFinal(), outcomes, missingIndex, 0), leads: countLeads(story, lib, deps.board.evidence(), missingIndex, deps.board.places ? deps.board.places() : null) };
  }

  /** Round 34 (spec 170): recruits active on each night 1..night (mythos input recruitedByNight), from outcomes resolved on the run without recruits. Null without data. */
  function recruited(night) {
    if (!ready() || !outcomes.aftermath) return null;
    const story = deps.story(), baseline = deps.mythosFinal();
    return recruitedByNight(story.seed, story.missing.map((_, k) => resolveOutcome(deps.society(), story, baseline, outcomes, k, 0)), night);
  }

  /** Round 34 (spec 170): the aftermath of the missing persons on the current night, as far as the leads allow ({ statements, reason } or null without data). Same outcomes as outcomeState (ground truth never changes). */
  let aftermathKey = '', aftermathCache = null;
  function aftermath() {
    if (!ready() || !outcomes.aftermath) return null;
    const story = deps.story(), lib = deps.lore.library();
    if (!lib) return null;
    const night = Math.max(1, deps.night ? deps.night() : 1), places = deps.board.places ? deps.board.places() : null, ev = deps.board.evidence();
    const states = story.missing.map((_, k) => ({ outcome: resolveOutcome(deps.society(), story, deps.mythosFinal(), outcomes, k, 0), leads: countLeads(story, lib, ev, k, places) }));
    const key = `${state.seed}|${night}|${states.map((x) => `${x.outcome}.${x.leads}`).join(',')}`;
    if (key !== aftermathKey) { aftermathKey = key; aftermathCache = { statements: aftermathStatements(story, outcomes, states.map((x) => x.outcome), states.map((x) => x.leads), night), reason: outcomes.aftermath.reason }; }
    return aftermathCache;
  }

  /** Applies one log entry when it is legal now. Returns true when the log grew. */
  function choose(entry) {
    const list = instances();
    if (!list.length) return false;
    const s = theoryState();
    if (!legalChoices(theories, list, deps.board.beliefs(), s).includes(entry)) return false;
    const wasOpen = s.current;
    log.push(entry); version++; replayed = null;
    if (log.length > MAX_LOG) { log = compactLog(replayTheories(theories, list, deps.board.beliefs(), log)); version++; }
    const after = theoryState();
    if (Math.trunc(entry / 10000) === CHOICE_CONCLUDE) {
      const done = after.list.find((c) => c.instance === wasOpen);
      if (done) {
        const text = summary().find((x) => x.instance === wasOpen);
        if (text) {
          lastVerdict = tr('theory.verdict.live', { grade: text.gradeName, verdict: text.verdict });
          deps.announce?.(lastVerdict);
          deps.journal?.(tr('theory.journal', { question: text.question, answer: text.answer, grade: text.gradeName }));
        }
      }
    }
    deps.onChange?.();
    render();
    return true;
  }

  // ---- DOM ----
  const node = (tag, attrs = {}, text = '') => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
  const clear = (el) => { if (el.replaceChildren) el.replaceChildren(); else el.textContent = ''; };

  function render() {
    const root = $('boardTheory');
    if (!root) return;
    const body = $('boardTheoryBody'); if (!body) return;
    const focusId = doc.activeElement && root.contains?.(doc.activeElement) ? doc.activeElement.getAttribute?.('data-k') : null;
    clear(body);
    const list = instances();
    if (!list.length) { body.append(node('p', { class: 'stats' }, tr(ready() ? 'theory.none' : 'theory.unavailable'))); return; }
    const s = theoryState(), story = deps.story(), society = deps.society(), l = lang();
    const picker = node('ul', { class: 'theory-list', 'aria-label': tr('theory.list') });
    list.forEach((inst, i) => {
      const done = s.conclusions.get(i), q = theoryQuestion(theories, society, story, inst, l);
      const label = done ? tr('theory.status.concluded', { grade: gradeName(done.grade) }) : tr('theory.status.open');
      const b = node('button', { type: 'button', class: `theory-pick${done ? ` theory-${GRADE_IDS[done.grade]}` : ''}`, 'data-k': `t${i}`, 'aria-pressed': String(s.current === i) }, `${q} (${label})`);
      b.addEventListener('click', () => choose(choice(CHOICE_THEORY, i)));
      const li = node('li'); li.append(b); picker.append(li);
    });
    body.append(picker);
    if (s.current >= 0) {
      const inst = list[s.current], template = theories.templates.find((t) => t.kind === inst.kind);
      const set = node('fieldset', { class: 'theory-form' });
      set.append(node('legend', {}, theoryQuestion(theories, society, story, inst, l)));
      template.options.forEach((_, o) => {
        const id = `theoryOpt${o}`, label = node('label', { for: id, class: 'theory-option' });
        const input = node('input', { type: 'radio', name: 'theoryOption', id, 'data-k': `o${o}` });
        if (s.currentOption === o) input.setAttribute('checked', 'checked');
        input.checked = s.currentOption === o;
        input.addEventListener('change', () => choose(choice(CHOICE_OPTION, o)));
        label.append(input, doc.createTextNode(` ${theoryOptionText(theories, society, story, inst, o, l)}`));
        set.append(label);
      });
      const beliefs = deps.board.beliefs(), keys = [...beliefs.keys()].sort((a, b) => a - b);
      set.append(node('p', { class: 'stats' }, tr('theory.evidence', { max: MAX_EVIDENCE })));
      if (!keys.length) set.append(node('p', { class: 'stats' }, tr('theory.evidence.none')));
      for (const k of keys) {
        const id = `theoryEv${k}`, picked = s.currentEvidence.includes(k), label = node('label', { for: id, class: 'theory-evidence' });
        const input = node('input', { type: 'checkbox', id, 'data-k': `e${k}` });
        input.checked = picked;
        if (!picked && s.currentEvidence.length >= MAX_EVIDENCE) input.disabled = true;
        input.addEventListener('change', () => choose(choice(CHOICE_EVIDENCE, k)));
        label.append(input, doc.createTextNode(` ${deps.board.statementTitle(k)}`));
        set.append(label);
      }
      const go = node('button', { type: 'button', 'data-k': 'conclude' }, tr('theory.conclude'));
      if (s.currentOption < 0) go.disabled = true;
      go.addEventListener('click', () => choose(choice(CHOICE_CONCLUDE, 0)));
      set.append(go);
      body.append(set);
    }
    const results = summary();
    if (results.length) {
      const ul = node('ul', { class: 'theory-results' });
      for (const r of results) {
        const li = node('li', { class: `theory-${GRADE_IDS[r.grade]}` });
        li.append(node('strong', {}, `${r.gradeName}: `), doc.createTextNode(`${r.question} ${r.answer} `), node('em', {}, r.verdict));
        if (r.evidence.length) li.append(node('span', { class: 'stats' }, ` ${tr('theory.summary.evidence', { list: r.evidence.join(', ') })}`));
        ul.append(li);
      }
      body.append(ul);
      if (deps.download) {
        const row = node('div', { class: 'row theory-export' });
        for (const format of ['md', 'txt']) {
          const b = node('button', { type: 'button', 'data-k': `export-${format}` }, tr(`export.theory.${format}`));
          b.addEventListener('click', () => exportTheory(format));
          row.append(b);
        }
        if (deps.exportChallenge) for (const format of ['json', 'txt']) {
          const b = node('button', { type: 'button', 'data-k': `challenge-${format}` }, tr(`export.challenge.${format}`));
          b.addEventListener('click', () => deps.exportChallenge(format));
          row.append(b);
        }
        body.append(row);
      }
    }
    if (lastVerdict) { const live = $('boardLive'); if (live) live.textContent = lastVerdict; }
    if (focusId) { const again = body.querySelector?.(`[data-k="${focusId}"]`); again?.focus?.(); }
  }

  /** Round 34 (spec 172): downloads the theory log and conclusions, with the seed code. Only concluded theories appear; nothing unconcluded is revealed. */
  function exportTheory(format) {
    if (!ready() || !deps.download) return;
    const code = deps.seedCode ? deps.seedCode() : String(state.seed), name = exportFileName('theories', code, format);
    deps.download(name, theoryExportText(summary(), { tr, format, seedCode: code, endings: deps.endings ? deps.endings() : null }), format === 'md' ? 'text/markdown' : 'text/plain');
    deps.announce?.(tr('export.done', { name }));
  }

  /** The panel is part of the board: it redraws with it. */
  function refresh() { if (open) render(); }
  function setOpen(value) { open = !!value; if (open) render(); }
  const focusables = () => [...(($('boardTheoryBody') || { querySelectorAll: () => [] }).querySelectorAll('button:not([disabled]), input:not([disabled])'))];
  const owns = (el) => !!(el && $('boardTheory') && $('boardTheory').contains?.(el));

  return {
    setData, instances, state: theoryState, knowledgeBonus, trustLost, epilogue, summary, outcomeLine, outcomeState, aftermath, recruited, exportTheory, choose, render, refresh, setOpen, focusables, owns, isReady: ready,
    snapshot: () => { ensureSeed(); return { theories: log.length ? serializeTheoryLog(log) : '' }; },
    restore(saved) { ensureSeed(); log = parseTheoryLog(saved && saved.theories); version++; replayed = null; lastVerdict = ''; deps.onChange?.(); if (open) render(); },
    lastVerdict: () => lastVerdict,
  };
}
