// Codex, achievements and Stitch panels. Owns the progress state (the logic is pure and lives in codex.js, achievements.js, stitch.js).
import { codexEntries, unlockedIds } from './codex.js';
import { settleProgress } from './progress-gate.js';
import { ACHIEVEMENTS, journalCompletion, newStats } from './achievements.js';
import { stitchModel, stitchHtml } from './stitch.js';
import { esc } from './util.js';

export function createProgressController({ $, tr, state, log, announce, fetchJson }) {
  const codex = new Set(), earned = new Set();
  let stats = newStats(), codexSeed = null, stitchLoaded = false, armed = false;

  const statsNow = () => {
    const entries = codexEntries(state.ritual);
    stats.nightsTotal = state.campaign ? state.campaign.nights.length : 0;
    stats.stage = state.ritualStage; stats.stageCount = state.ritual ? state.ritual.stages.length : 0;
    stats.codexTotal = entries.length; stats.codexCount = entries.filter((e) => codex.has(e.id)).length;
    return stats;
  };
  const nameOf = (e) => (e.kind === 'stage' ? tr(`codex.creature.${e.creature}`) : tr(`codex.omen.${e.tier}`));

  function render() {
    const entries = codexEntries(state.ritual), s = statsNow();
    $('codexList').innerHTML = entries.map((e) => {
      if (!codex.has(e.id)) return `<li class="locked"><strong>???</strong> ${esc(tr('codex.locked'))}</li>`;
      const sub = e.kind === 'stage' ? ` <em>${esc(tr('codex.stage', { stage: e.stageName, sigil: tr(`codex.sigil.${e.sigil}`), night: e.night }))}</em>` : '';
      const d = e.kind === 'stage' ? tr(`codex.creature.${e.creature}.d`) : tr(`codex.omen.${e.tier}.d`);
      return `<li><strong>${esc(nameOf(e))}</strong>${sub}<br>${esc(d)}</li>`;
    }).join('');
    $('codexMeta').textContent = tr('codex.progress', { n: s.codexCount, total: s.codexTotal });
    $('achList').innerHTML = ACHIEVEMENTS.map((a) => {
      const on = earned.has(a.id);
      return `<li class="${on ? 'earned' : 'locked'}"><strong>${esc(tr(`ach.${a.id}`))}</strong> ${on ? '[x]' : '[ ]'}<br>${esc(tr(`ach.${a.id}.d`))}</li>`;
    }).join('');
    $('achMeta').textContent = `${tr('ach.progress', { n: earned.size, total: ACHIEVEMENTS.length })}. ${tr('journal.pct', { percent: journalCompletion(stats.kinds).percent })}`;
  }

  /** Re-derives unlocks and achievements from the current state. Safe to call often. */
  function update() {
    if (!state.ritual) return;
    if (codexSeed !== state.seed) { codex.clear(); stats.tier = 0; stats.visited = new Set(); codexSeed = state.seed; }
    stats.nightsVisited = stats.visited ? stats.visited.size : 0;
    const unlockable = unlockedIds(state.ritual, state.ritualStage, stats.tier);
    const byId = new Map(codexEntries(state.ritual).map((e) => [e.id, e]));
    statsNow();
    const { fresh, won } = settleProgress({ armed, codex, earned, ritual: state.ritual, unlockable, stats });
    // A batch (a deep link after the first action can unlock many) gets short journal lines and one announcement.
    const s = statsNow();
    const lines = [];
    const report = (kind, names, summary) => {
      if (!names.length) return;
      const text = names.length > 2 ? summary : names.join(' ');
      log(kind, text); lines.push(text);
    };
    report('codex', fresh.map((id) => tr('codex.unlocked', { name: nameOf(byId.get(id)) })), tr('codex.progress', { n: s.codexCount, total: s.codexTotal }));
    report('achievement', won.map((id) => tr('ach.earnedlog', { name: tr(`ach.${id}`) })), tr('ach.progress', { n: earned.size, total: ACHIEVEMENTS.length }));
    if (lines.length) announce(lines[lines.length - 1]);
    render();
  }

  function setPanel(id, btn, on) { $(id).hidden = !on; $(btn).setAttribute?.('aria-pressed', String(on)); }
  let codexOn = false, stitchOn = false;
  async function setStitch(on) {
    stitchOn = on; setPanel('stitchPanel', 'stitchToggle', on);
    if (on && !stitchLoaded) {
      let model = null;
      try { model = stitchModel(await fetchJson('data/stitch.json')); } catch (err) { console.warn(`[stitch] could not load data/stitch.json: ${err.message}`); model = null; }
      $('stitchBody').innerHTML = stitchHtml(model, tr);
      stitchLoaded = !!model;
    }
  }
  function setCodex(on) { codexOn = on; setPanel('codexPanel', 'codexToggle', on); if (on) render(); }

  return {
    update, render, arm() { armed = true; }, disarm() { armed = false; }, isArmed: () => armed, setStitch, setCodex, isStitchOn: () => stitchOn, isCodexOn: () => codexOn,
    note: {
      whisper() { armed = true; stats.whispers++; }, door() { armed = true; stats.doors++; }, listen() { armed = true; stats.listens++; },
      kind(k) { stats.kinds.add(k); }, tier(n) { stats.tier = Math.max(stats.tier, n); },
      night(i) { (stats.visited ||= new Set()).add(i); }, investigatorDone() { armed = true; stats.investigatorDone = true; },
      vigilDone(named) { armed = true; stats.vigilDone = true; if (named) stats.namerDone = true; },
    },
    snapshot: () => ({ codex: [...codex], ach: [...earned] }),
    restore(s) {
      if (!s) return;
      codexSeed = state.seed;
      for (const id of s.codex || []) codex.add(id);
      for (const id of s.ach || []) earned.add(id);
      render();
    },
  };
}
