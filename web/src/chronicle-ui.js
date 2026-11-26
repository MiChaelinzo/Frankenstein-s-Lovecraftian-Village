// Village chronicle DOM: families and their houses, the missing persons and what has been learned of them, tonight's rumor, district histories and local legends.
// The content comes from village-story.js (Core mirror); this file only gathers what the player has found (read books, heard chat) and writes it with esc().
import { tierFor } from './core.js';
import { stageOfNight, districtHistory, familyHistory } from './village-story.js';
import { esc } from './util.js';
import { EFFECT_ACCUSED } from './society.js';
import { DISTRICT_IDS } from './districts.js';
import { parseChronicleLibrary, chronicleProse, summaryProse } from './chronicle-prose.js';
import { chronicleExportText, exportFileName } from './export-text.js';
import { mythosStatements, mythosCurrentText, isDistorted, nightTickAt, omenId } from './mythos.js';
import { contentEventsFor } from './content.js';

/**
 * Pure model of the panel. ctx: { night (1-based), nights, dread (0..1), books (lore library books), readIds (Set of book ids), heard (Map missing id -> highest stage heard), landmarkName(id), mythos? (feed), mythosHeard? (Map statement id -> speaker) }.
 * A missing person counts one part each for a page read, a journal of kin or witness read and a chat heard.
 */
export function chronicleModel(story, lang, ctx) {
  const lib = story.lib, stage = stageOfNight(ctx.night, ctx.nights), tier = tierFor(ctx.dread);
  const nameOf = (i) => story.roster[i].name;
  const families = story.families.map((f) => ({
    surname: f.surname, members: f.members.map(nameOf), home: story.familyHomeName(f, lang), history: familyHistory(lib, f.surname, lang),
  }));
  const missing = story.missing.map((m) => {
    const data = lib.missing[m.dataIndex], owners = new Set([m.kinIndex, m.witnessIndex]);
    const page = ctx.books.some((b) => b.missing === m.id && ctx.readIds.has(b.id));
    const journal = ctx.books.some((b) => b.role && owners.has(story.journalOwner(b)) && ctx.readIds.has(b.id));
    const heardStage = ctx.heard.has(m.id) ? ctx.heard.get(m.id) : -1;
    const vars = story.missingVars(m, lang);
    return {
      id: m.id, name: vars.missing, home: vars.home, parts: { page, journal, chat: heardStage >= 0 }, told: Number(page) + Number(journal) + Number(heardStage >= 0),
      line: heardStage >= 0 ? story.gossipText({ kind: 2, subject: story.missing.indexOf(m), stage: heardStage, variant: 0 }, story.roster[m.kinIndex >= 0 ? m.kinIndex : 0], ctx.night, tier, lang) : '',
      given: data.given[lang] || data.given.en,
      outcome: ctx.outcomeLine ? ctx.outcomeLine(story.missing.indexOf(m)) : '', // Round 30: only as far as the leads found allow (outcomes.js revealOutcome)
    };
  });
  // Round 27: what the village's background simulation has shown the player. Only statements a villager told (ctx.mythosHeard: statement id -> speaker) up to the current night are listed.
  const mutationLib = ctx.evolution ? ctx.evolution.mutations : null, telling = mutationLib ? { library: mutationLib, night: ctx.night, knowledgeTier: ctx.knowledge ? ctx.knowledge.tier || 0 : 0 } : null; // Round 37 (spec 181)
  const mythos = ctx.mythos ? mythosStatements(ctx.mythos).filter((m) => ctx.mythosHeard && ctx.mythosHeard.has(m.id)).map((m) => {
    const distorted = isDistorted(m.rumor, ctx.mythosHeard.get(m.id));
    return { id: m.id, kind: m.kind, night: m.night, distorted, text: mythosCurrentText(ctx.mythos, story, m, distorted, lang, telling) };
  }) : [];
  // Round 28: the night tick record of the current night, counts only (no secret or omen is named here).
  const tick = ctx.mythos ? nightTickAt(ctx.mythos.state, ctx.mythos.library, ctx.night) : null;
  const knowledge = ctx.knowledge && ctx.knowledge.name ? ctx.knowledge : null; // Round 28: the tier the evidence has earned, with tonight's reality effects
  // Round 30: the trust bars (trust, fear, faith, loyalty, obsession, corruption) of everyone met, and the theories concluded on the board.
  const people = ctx.met && ctx.bars ? [...ctx.met].sort((a, b) => a - b).filter((i) => i >= 0 && i < story.roster.length).map((i) => ({ index: i, name: nameOf(i), rows: ctx.bars(i), reputation: ctx.reputationOf ? (ctx.reputationOf(i)[0] || null) : null })).filter((p) => p.rows) : [];
  const theories = ctx.theories || [];
  // Round 34 (spec 168): the generated prose, night by night up to tonight and as a whole. Only what the player learned (ctx.prose is built from heard statements, leads and people met).
  const prose = ctx.prose ? { nights: chronicleProse(ctx.prose, ctx.night, lang), summary: summaryProse(ctx.prose, ctx.night, lang) } : null;
  // Round 37 (spec 179): authored events from Data/content/events.json, told on their night when that night's new omen matches and the player has heard of the omen.
  const authored = [];
  if (ctx.content && ctx.mythos && ctx.mythosHeard) {
    for (let night = 1; night <= ctx.night; night++) {
      const rec = nightTickAt(ctx.mythos.state, ctx.mythos.library, night);
      if (!rec || rec.night !== night || !ctx.mythosHeard.has(omenId(night))) continue;
      for (const e of contentEventsFor(ctx.content, night, rec.newOmen)) authored.push({ id: e.id, night, text: e.text[lang] || e.text.en });
    }
  }
  return {
    stage, tier, mythos, tick, knowledge, people, theories, prose, authored,
    rumor: story.rumorText(ctx.night, stage, tier, lang),
    families, missing,
    histories: DISTRICT_IDS.map((id) => ({ id, text: districtHistory(lib, id, lang) })),
    legends: lib.legends.map((l) => ({ id: l.id, title: l.title[lang] || l.title.en, text: l.text[lang] || l.text.en, place: ctx.landmarkName(l.id) })),
  };
}

/** deps: { evolution?() -> { reputation, mutations, beats } (round 36), reputationOf?(index) -> effect records, $, tr, lang, state, story() -> story or null, lore: { library(), readIds() }, night() -> 1-based, nights(), dread(), landmarkName(id), mythos?() -> feed or null, mythosHeard?() -> Map statement id -> speaker, knowledge?() -> { tier, points, name, effects }, mythosKey?() -> string, onChange() } */
export function createChronicleController(deps) {
  const { $, tr, state } = deps;
  const heard = new Map();
  let on = false, heardSeed = null;
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);

  function ctx() {
    if (heardSeed !== state.seed) { heard.clear(); heardSeed = state.seed; } // a chronicle belongs to one village
    const lib = deps.lore.library();
    return { night: deps.night(), nights: deps.nights(), dread: deps.dread(), books: lib ? lib.books : [], readIds: deps.lore.readIds(), heard, landmarkName: deps.landmarkName, mythos: deps.mythos ? deps.mythos() : null, mythosHeard: deps.mythosHeard ? deps.mythosHeard() : null, knowledge: deps.knowledge ? deps.knowledge() : null, content: deps.content ? deps.content() : null, met: deps.met ? deps.met() : null, bars: deps.bars, outcomeLine: deps.outcomeLine, theories: deps.theories ? deps.theories() : [], reputationOf: deps.reputationOf, evolution: deps.evolution ? deps.evolution() : null, prose: proseContext() };
  }

  let proseLib = null;
  /** Round 34: parses data/chronicle.json. Throws naming the field when it is malformed, so the caller can log it and the panel simply shows no prose. */
  function setProse(json) { proseLib = parseChronicleLibrary(json); if (on) render(); }

  /** The context the prose reads, or null without data, a story, the mythos run or the outcome state. Heard ids, leads and people met are exactly what the player learned. */
  function proseContext() {
    const story = deps.story(), feed = deps.mythos ? deps.mythos() : null;
    if (!proseLib || !story || !feed || !feed.state || !deps.outcomeState) return null;
    const states = story.missing.map((_, k) => deps.outcomeState(k));
    if (states.some((s) => !s)) return null;
    return {
      prose: proseLib, story, mythos: feed.library, state: feed.state, nights: deps.nights(), outcomes: states.map((s) => s.outcome), leads: states.map((s) => s.leads),
      heard: new Set(deps.mythosHeard ? deps.mythosHeard().keys() : []), met: new Set(deps.met ? deps.met() : []), memoryLog: deps.memoryEvents ? deps.memoryEvents() : null, evolution: deps.evolution ? deps.evolution() : undefined,
    };
  }

  /** A villager told about a missing person at a stage: the chronicle keeps the furthest stage heard. */
  function hear(missingId, stage) {
    ctx();
    if (!heard.has(missingId) || heard.get(missingId) < stage) heard.set(missingId, stage);
    if (on) render();
  }

  let renderedKey = '';
  const mythosStamp = (c) => `${deps.mythosKey ? deps.mythosKey() : ''}|${c.mythosHeard ? c.mythosHeard.size : 0}|${c.met ? [...c.met].map((i) => (c.bars ? (c.bars(i) || []).map((r) => r.value).join('.') : '')).join(',') : ''}|${c.theories.map((t) => `${t.instance}${t.grade}`).join('')}|${c.outcomeLine ? deps.story() && deps.story().missing.map((_, k) => c.outcomeLine(k).length).join('.') : ''}`;
  /** Everything the panel shows that can change while it is open. render() stores it and refresh() compares against it, so both must use this one function. memoryVersion: the prose replays what villagers remember, and the event count stops growing at its cap. */
  const redrawKey = (c) => `${state.seed}|${state.layout.length}|${c.night}|${tierFor(c.dread)}|${c.readIds.size}|${heard.size}|${[...heard.values()].join('')}|${mythosStamp(c)}|${c.knowledge ? c.knowledge.tier : 0}|${c.met ? c.met.size : 0}|${deps.memoryVersion ? deps.memoryVersion() : 0}|${deps.evolutionKey ? deps.evolutionKey() : ''}`;
  /** Re-renders an open panel only when something it shows changed (night, dread tier, books read, chat heard, village). */
  function refresh() {
    if (!on) return;
    if (redrawKey(ctx()) !== renderedKey) render();
  }

  /** Round 34 (spec 172): the seed share code line and the export buttons. Exports hold only what the chronicle already shows. */
  const seedCode = () => (deps.seedCode ? deps.seedCode() : String(state.seed));
  function exportChronicle(format) {
    const story = deps.story(); if (!story || !deps.download) return;
    const text = chronicleExportText(chronicleModel(story, lang(), ctx()), { tr, format, seedCode: seedCode(), endings: deps.endings ? deps.endings() : null });
    const name = exportFileName('chronicle', seedCode(), format);
    deps.download(name, text, format === 'md' ? 'text/markdown' : 'text/plain');
    deps.announce?.(tr('export.done', { name }));
  }

  function render() {
    const body = $('chronicleBody'); if (!body) return;
    if ($('chronicleSeed')) $('chronicleSeed').textContent = tr('export.seed', { code: seedCode() });
    const story = deps.story();
    renderedKey = '';
    if (!story) { body.innerHTML = `<p class="stats v-empty">${esc(tr('chronicle.empty'))}</p>`; return; }
    const c = ctx(), m = chronicleModel(story, lang(), c);
    renderedKey = redrawKey(c);
    const parts = [`<h3 class="v-subheading">${esc(tr('chronicle.rumor'))}</h3><p class="chronicle-rumor">${esc(m.rumor)}</p>`];
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.missing'))}</h3><ul class="chronicle-list">${m.missing.map((p) => {
      const got = ['page', 'journal', 'chat'].filter((k) => p.parts[k]).map((k) => tr(`chronicle.told.${k}`)).join(', ');
      return `<li data-missing="${esc(p.id)}"><strong>${esc(tr('chronicle.missing.row', { missing: p.name, home: p.home, n: p.told }))}</strong>`
        + (got ? ` <em>${esc(got)}</em>` : '') + (p.outcome ? `<p class="lore-text" data-outcome="${esc(p.id)}">${esc(tr('chronicle.outcome', { text: p.outcome }))}</p>` : '') + (p.line ? `<p class="lore-text">${esc(p.line)}</p>` : p.told ? '' : `<p class="stats">${esc(tr('chronicle.missing.unknown'))}</p>`) + '</li>';
    }).join('')}</ul>`);
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.families'))}</h3><ul class="chronicle-list">${m.families.map((f) =>
      `<li data-family="${esc(f.surname)}">${esc(tr('chronicle.family', { surname: f.surname, members: f.members.length ? f.members.join(', ') : tr('chronicle.family.empty'), home: f.home }))}<p class="lore-text">${esc(f.history)}</p></li>`).join('')}</ul>`);
    if (m.prose) parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.prose'))}</h3><div id="chronicleProse">${m.prose.nights.map((t, i) => `<p class="lore-text" data-prose-night="${i + 1}"><strong>${esc(tr('chronicle.prose.night', { night: i + 1 }))}</strong> ${esc(t)}</p>`).join('')}<p class="lore-text" id="chronicleSummary"><em>${esc(m.prose.summary)}</em></p></div>`);
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.mythos'))}</h3>${m.mythos.length ? `<ul class="chronicle-list" id="chronicleMythos">${m.mythos.map((e) =>
      `<li data-mythos="${esc(e.id)}"><strong>${esc(tr('chronicle.mythos.row', { night: e.night, kind: tr(`chronicle.mythos.kind.${e.kind}`), text: e.text }))}</strong>${e.distorted ? ` <em>${esc(tr('chronicle.mythos.distorted'))}</em>` : ''}</li>`).join('')}</ul>`
      : `<p class="stats v-empty" id="chronicleMythos">${esc(tr('chronicle.mythos.empty'))}</p>`}`);
    if (m.knowledge) parts.push(`<p class="stats" id="chronicleKnowledge">${esc(tr('chronicle.knowledge', { tier: m.knowledge.tier, name: m.knowledge.name, points: m.knowledge.points }))}${m.knowledge.effects.length ? ` ${esc(m.knowledge.effects.join(' '))}` : ''}</p>`);
    if (m.tick) parts.push(`<p class="stats" id="chronicleTick">${esc(tr('chronicle.tick', { night: m.tick.night, cult: m.tick.cultGrowth, rumors: m.tick.rumorsChanged + m.tick.rumorsAdded, shift: m.tick.realityShift }))}</p>`);
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.people'))}</h3>${m.people.length ? `<ul class="chronicle-list" id="chroniclePeople">${m.people.map((p) => {
      const text = p.rows.map((r) => `${tr(`society.bar.${r.key}`)} ${r.value}`).join(', ');
      return `<li data-person="${p.index}"><strong>${esc(p.name)}</strong>${p.reputation ? `<p class="stats" data-reputation="${esc(p.reputation.effect === EFFECT_ACCUSED ? 'accused' : 'trusted')}">${esc(tr(p.reputation.effect === EFFECT_ACCUSED ? 'society.reputation.accused' : 'society.reputation.trusted'))}</p>` : ''}<ul class="axis-bars chronicle-bars" aria-label="${esc(tr('society.bar.aria', { text }))}">${p.rows.map((r) => `<li><span class="axis-label">${esc(tr(`society.bar.${r.key}`))}</span><meter min="0" max="1000" value="${r.value}" aria-label="${esc(`${tr(`society.bar.${r.key}`)}: ${r.value}`)}"></meter></li>`).join('')}</ul></li>`;
    }).join('')}</ul>` : `<p class="stats v-empty" id="chroniclePeople">${esc(tr('chronicle.people.empty'))}</p>`}`);
    parts.push(`<h3 class="v-subheading">${esc(tr('theory.summary.title'))}</h3>${m.theories.length ? `<ul class="chronicle-list" id="chronicleTheories">${m.theories.map((t) => `<li data-theory="${t.instance}" class="theory-${['true', 'partial', 'false'][t.grade]}"><strong>${esc(t.gradeName)}</strong>: ${esc(t.question)} ${esc(t.answer)} <em>${esc(t.verdict)}</em></li>`).join('')}</ul>` : `<p class="stats" id="chronicleTheories">${esc(tr('theory.summary.empty'))}</p>`}`);
    if (m.authored.length) parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.authored'))}</h3><ul class="chronicle-list" id="chronicleAuthored">${m.authored.map((a) => `<li data-event="${esc(a.id)}"><strong>${esc(tr('chronicle.authored.night', { night: a.night }))}</strong><p class="lore-text">${esc(a.text)}</p></li>`).join('')}</ul>`);
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.history'))}</h3><ul class="chronicle-list">${m.histories.map((h) => `<li data-district="${esc(h.id)}"><strong>${esc(tr(`district.${h.id}`))}</strong><p class="lore-text">${esc(h.text)}</p></li>`).join('')}</ul>`);
    parts.push(`<h3 class="v-subheading">${esc(tr('chronicle.legends'))}</h3><ul class="chronicle-list">${m.legends.map((l) => `<li data-legend="${esc(l.id)}"><strong>${esc(tr('chronicle.legend.at', { title: l.title, place: l.place }))}</strong><p class="lore-text">${esc(l.text)}</p></li>`).join('')}</ul>`);
    body.innerHTML = parts.join('');
  }

  function setPanel(value) {
    on = !!value;
    const panel = $('chroniclePanel'); if (panel) panel.hidden = !on;
    $('chronicleToggle')?.setAttribute?.('aria-pressed', String(on));
    if (on) render();
    deps.onChange?.();
    return on;
  }
  $('chronicleToggle')?.addEventListener?.('click', () => setPanel(!on));
  $('chronicleExportMd')?.addEventListener?.('click', () => exportChronicle('md'));
  $('chronicleExportTxt')?.addEventListener?.('click', () => exportChronicle('txt'));
  if ($('chronicleSeedCopy')) {
    $('chronicleSeedCopy').hidden = !deps.copyText;
    $('chronicleSeedCopy').addEventListener?.('click', async () => { const text = await deps.copyText(seedCode()); deps.announce?.(text); });
  }

  return { setPanel, render, refresh, hear, setProse, exportChronicle, summary: () => { const p = proseContext(); return p ? summaryProse(p, deps.night(), lang()) : ''; }, model: () => { const s = deps.story(); return s ? chronicleModel(s, lang(), ctx()) : null; }, get panelOn() { return on; } };
}
