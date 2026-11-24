// Village chronicle DOM: families and their houses, the missing persons and what has been learned of them, tonight's rumor, district histories and local legends.
// The content comes from village-story.js (Core mirror); this file only gathers what the player has found (read books, heard chat) and writes it with esc().
import { tierFor } from './core.js';
import { stageOfNight, districtHistory, familyHistory } from './village-story.js';
import { esc } from './util.js';
import { DISTRICT_IDS } from './districts.js';
import { mythosStatements, mythosText, isDistorted, nightTickAt } from './mythos.js';

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
    };
  });
  // Round 27: what the village's background simulation has shown the player. Only statements a villager told (ctx.mythosHeard: statement id -> speaker) up to the current night are listed.
  const mythos = ctx.mythos ? mythosStatements(ctx.mythos).filter((m) => ctx.mythosHeard && ctx.mythosHeard.has(m.id)).map((m) => {
    const distorted = isDistorted(m.rumor, ctx.mythosHeard.get(m.id));
    return { id: m.id, kind: m.kind, night: m.night, distorted, text: mythosText(ctx.mythos, story, m, distorted, lang) };
  }) : [];
  // Round 28: the night tick record of the current night, counts only (no secret or omen is named here).
  const tick = ctx.mythos ? nightTickAt(ctx.mythos.state, ctx.mythos.library, ctx.night) : null;
  return {
    stage, tier, mythos, tick,
    rumor: story.rumorText(ctx.night, stage, tier, lang),
    families, missing,
    histories: DISTRICT_IDS.map((id) => ({ id, text: districtHistory(lib, id, lang) })),
    legends: lib.legends.map((l) => ({ id: l.id, title: l.title[lang] || l.title.en, text: l.text[lang] || l.text.en, place: ctx.landmarkName(l.id) })),
  };
}

/** deps: { $, tr, lang, state, story() -> story or null, lore: { library(), readIds() }, night() -> 1-based, nights(), dread(), landmarkName(id), mythos?() -> feed or null, mythosHeard?() -> Map statement id -> speaker, mythosKey?() -> string, onChange() } */
export function createChronicleController(deps) {
  const { $, tr, state } = deps;
  const heard = new Map();
  let on = false, heardSeed = null;
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);

  function ctx() {
    if (heardSeed !== state.seed) { heard.clear(); heardSeed = state.seed; } // a chronicle belongs to one village
    const lib = deps.lore.library();
    return { night: deps.night(), nights: deps.nights(), dread: deps.dread(), books: lib ? lib.books : [], readIds: deps.lore.readIds(), heard, landmarkName: deps.landmarkName, mythos: deps.mythos ? deps.mythos() : null, mythosHeard: deps.mythosHeard ? deps.mythosHeard() : null };
  }

  /** A villager told about a missing person at a stage: the chronicle keeps the furthest stage heard. */
  function hear(missingId, stage) {
    ctx();
    if (!heard.has(missingId) || heard.get(missingId) < stage) heard.set(missingId, stage);
    if (on) render();
  }

  let renderedKey = '';
  const mythosStamp = (c) => `${deps.mythosKey ? deps.mythosKey() : ''}|${c.mythosHeard ? c.mythosHeard.size : 0}`;
  /** Re-renders an open panel only when something it shows changed (night, dread tier, books read, chat heard, village). */
  function refresh() {
    if (!on) return;
    const c = ctx(), key = `${state.seed}|${state.layout.length}|${c.night}|${tierFor(c.dread)}|${c.readIds.size}|${heard.size}|${[...heard.values()].join('')}|${mythosStamp(c)}`;
    if (key !== renderedKey) render();
  }

  function render() {
    const body = $('chronicleBody'); if (!body) return;
    const story = deps.story();
    renderedKey = '';
    if (!story) { body.innerHTML = `<p class="stats">${esc(tr('chronicle.empty'))}</p>`; return; }
    const c = ctx(), m = chronicleModel(story, lang(), c);
    renderedKey = `${state.seed}|${state.layout.length}|${c.night}|${tierFor(c.dread)}|${c.readIds.size}|${heard.size}|${[...heard.values()].join('')}|${mythosStamp(c)}`;
    const parts = [`<h3>${esc(tr('chronicle.rumor'))}</h3><p class="chronicle-rumor">${esc(m.rumor)}</p>`];
    parts.push(`<h3>${esc(tr('chronicle.missing'))}</h3><ul class="chronicle-list">${m.missing.map((p) => {
      const got = ['page', 'journal', 'chat'].filter((k) => p.parts[k]).map((k) => tr(`chronicle.told.${k}`)).join(', ');
      return `<li data-missing="${esc(p.id)}"><strong>${esc(tr('chronicle.missing.row', { missing: p.name, home: p.home, n: p.told }))}</strong>`
        + (got ? ` <em>${esc(got)}</em>` : '') + (p.line ? `<p class="lore-text">${esc(p.line)}</p>` : p.told ? '' : `<p class="stats">${esc(tr('chronicle.missing.unknown'))}</p>`) + '</li>';
    }).join('')}</ul>`);
    parts.push(`<h3>${esc(tr('chronicle.families'))}</h3><ul class="chronicle-list">${m.families.map((f) =>
      `<li data-family="${esc(f.surname)}">${esc(tr('chronicle.family', { surname: f.surname, members: f.members.length ? f.members.join(', ') : tr('chronicle.family.empty'), home: f.home }))}<p class="lore-text">${esc(f.history)}</p></li>`).join('')}</ul>`);
    parts.push(`<h3>${esc(tr('chronicle.mythos'))}</h3>${m.mythos.length ? `<ul class="chronicle-list" id="chronicleMythos">${m.mythos.map((e) =>
      `<li data-mythos="${esc(e.id)}"><strong>${esc(tr('chronicle.mythos.row', { night: e.night, kind: tr(`chronicle.mythos.kind.${e.kind}`), text: e.text }))}</strong>${e.distorted ? ` <em>${esc(tr('chronicle.mythos.distorted'))}</em>` : ''}</li>`).join('')}</ul>`
      : `<p class="stats" id="chronicleMythos">${esc(tr('chronicle.mythos.empty'))}</p>`}`);
    if (m.tick) parts.push(`<p class="stats" id="chronicleTick">${esc(tr('chronicle.tick', { night: m.tick.night, cult: m.tick.cultGrowth, rumors: m.tick.rumorsChanged + m.tick.rumorsAdded, shift: m.tick.realityShift }))}</p>`);
    parts.push(`<h3>${esc(tr('chronicle.history'))}</h3><ul class="chronicle-list">${m.histories.map((h) => `<li data-district="${esc(h.id)}"><strong>${esc(tr(`district.${h.id}`))}</strong><p class="lore-text">${esc(h.text)}</p></li>`).join('')}</ul>`);
    parts.push(`<h3>${esc(tr('chronicle.legends'))}</h3><ul class="chronicle-list">${m.legends.map((l) => `<li data-legend="${esc(l.id)}"><strong>${esc(tr('chronicle.legend.at', { title: l.title, place: l.place }))}</strong><p class="lore-text">${esc(l.text)}</p></li>`).join('')}</ul>`);
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

  return { setPanel, render, refresh, hear, model: () => { const s = deps.story(); return s ? chronicleModel(s, lang(), ctx()) : null; }, get panelOn() { return on; } };
}
