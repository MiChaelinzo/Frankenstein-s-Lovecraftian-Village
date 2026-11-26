// Round 37 (FEAT-003 item 3): the same fact reads the same in every panel on the same night and knowledge tier.
// The panels are driven through the producers the live app uses: the villager chat (mythosChatLines), the real board controller (cardTitle, inspect, knowledge),
// the chronicle model, the journal pages (lore text) and the ending story (summaryProse). A fact is one key; every panel that shows it must give the same words.
// The injected-mismatch tests at the end prove the checker fails when one panel disagrees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import { parseLoreLibrary } from '../src/lore.js';
import { buildSociety, TIER_NEUTRAL } from '../src/society.js';
import { parseMythosLibrary, runMythos, buildMythosFeed, mythosChatLines, buildGraph, isDistorted } from '../src/mythos.js';
import { parseRumorMutationLibrary } from '../src/rumor-mutation.js';
import { parseOutcomeLibrary, resolveOutcome, countLeads, revealOutcome, OUTCOME_IDS } from '../src/outcomes.js';
import { parseKnowledgeLibrary, realityDistortion } from '../src/knowledge.js';
import { parseChronicleLibrary, summaryProse, CHRONICLE_LINE_IDS } from '../src/chronicle-prose.js';
import { createBoardController } from '../src/board-ui.js';
import { chronicleModel } from '../src/chronicle-ui.js';
import { t } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const storyLib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), lore = parseLoreLibrary(text('lore_books.json'));
const mythos = parseMythosLibrary(text('mythos.json')), mutations = parseRumorMutationLibrary(text('rumor-mutations.json')), outcomes = parseOutcomeLibrary(text('outcomes.json'));
const knowledgeLib = parseKnowledgeLibrary(text('knowledge.json')), proseLib = parseChronicleLibrary(text('chronicle.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const NIGHT = 8, ABOUT = { available: true, behavior: 0, hintId: 'village', withheld: false };
const TIER_POINTS = knowledgeLib.tiers.map((x) => x.threshold);

function fakeNode(tag) {
  const n = { tag, attrs: {}, children: [], handlers: {}, style: { setProperty() {} }, hidden: false, textContent: '' };
  n.setAttribute = (k, v) => { n.attrs[k] = String(v); }; n.getAttribute = (k) => n.attrs[k];
  n.append = (...c) => { n.children.push(...c); }; n.replaceChildren = () => { n.children = []; };
  n.addEventListener = (type, fn) => { (n.handlers[type] ||= []).push(fn); }; n.focus = () => {};
  return n;
}

/** One village at one night, one knowledge tier and one language, with every panel's producer wired the way app.js wires it. */
function worldOf(seed, tier, lang, withLeads = true) {
  const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, seed), roster = generateRoster(seed, layout);
  const story = buildStory(storyLib, seed, layout, roster, assignNames(nameLib, seed, CITY_GRID, CITY_GRID, layout), generateCampaign(seed, 5).villageName);
  const society = buildSociety(story, layout), graph = buildGraph(society);
  const state = runMythos(society, story, mythos, { dreadPermille: Array(12).fill(500), ritualStage: Array(12).fill(2) }, 12), feed = buildMythosFeed(mythos, state, NIGHT);
  const read = new Set(), els = Object.fromEntries(['boardPanel', 'boardCards', 'boardLines', 'boardTimeline', 'boardNote', 'boardLive', 'boardDetail', 'boardClose', 'boardToggle', 'boardWrap', 'boardKnowledge'].map((id) => [id, fakeNode('div')]));
  const w = { seed, tier, lang, story, society, feed, state, els, read };
  // the same function serves the board, the chronicle and the ending, as in app.js (theory.outcomeLine, theory.outcomeState)
  const outcomeOf = (k) => resolveOutcome(society, story, state, outcomes, k, 0);
  w.outcomeLine = (k) => revealOutcome(story, outcomes, outcomeOf(k), k, countLeads(story, lore, w.board.evidence(), k), lang).text;
  w.board = createBoardController({
    $: (id) => els[id] || null, doc: { createElement: fakeNode, createElementNS: (ns, tag) => fakeNode(tag) }, tr: (k, p) => t(k, lang, p), lang, state: { seed, nameLib }, story: () => story,
    night: () => NIGHT, mythos: () => feed, rumorMutations: () => mutations, knowledgeBonus: () => TIER_POINTS[tier], outcomeLine: (k) => w.outcomeLine(k),
    lore: { library: () => lore, readIds: () => read }, keyTarget: fakeNode('window'), announce: () => {}, activeElement: () => null, reduceMotion: true,
  });
  w.board.setStatements(text('statements.json')); w.board.setKnowledge(JSON.parse(text('knowledge.json')));
  // the player meets the kin and the witness of every missing person and finds every page about them, so the outcome is revealed
  if (withLeads) for (const m of story.missing) { if (m.kinIndex >= 0) w.board.noteMet(m.kinIndex); if (m.witnessIndex >= 0) w.board.noteMet(m.witnessIndex); }
  if (withLeads) for (const b of lore.books) if (b.missing) { read.add(b.id); w.board.noteClue(`book@${b.id}`); }
  // the player talks to every villager once: the chat, the board evidence and the chronicle's heard map all record the same statement from the same speaker
  w.chat = []; w.heard = new Map();
  for (let i = 0; i < society.roster.length; i++) {
    const lines = mythosChatLines(society, feed, story, graph, i, TIER_NEUTRAL, NIGHT, ABOUT, lang, mutations, w.board.knowledge().tier);
    const fresh = lines.filter((l) => !w.heard.has(l.id));
    w.chat.push({ villager: i, lines });
    if (fresh.length) { w.board.noteMet(i); w.board.noteMythos(i, fresh.map((l) => l.id), NIGHT); for (const l of fresh) w.heard.set(l.id, i); }
  }
  // what the player heard moved the knowledge tier, so each villager is asked again at the settled tier: a line told earlier is a snapshot of its night and tier, the panels show the current one
  w.chat = society.roster.map((_, i) => ({ villager: i, lines: mythosChatLines(society, feed, story, graph, i, TIER_NEUTRAL, NIGHT, ABOUT, lang, mutations, w.board.knowledge().tier) }));
  w.outcomes = story.missing.map((_, k) => outcomeOf(k));
  return w;
}

/** Every [fact key, panel, words] the panels show for this world. */
export function collectFacts(w) {
  const out = [], { story, lang, board } = w, tier = board.knowledge().tier;
  const add = (key, panel, words) => out.push({ key, panel, words });
  const revealed = (id) => { const c = board.model().cards.find((x) => x.id === id); return !!c && c.revealed; }; // an unmet suspect or an unfollowed victim is a '???' shell on purpose
  // chronicle, built from the same board evidence and knowledge the live panel reads
  const people = new Set(board.evidence().met), mythosHeard = new Map(w.heard);
  const model = chronicleModel(story, lang, {
    night: NIGHT, nights: 12, dread: 0.5, books: lore.books, readIds: w.read, heard: new Map(), landmarkName: () => '', mythos: w.feed, mythosHeard, knowledge: board.knowledge(),
    evolution: { mutations }, outcomeLine: w.outcomeLine, met: people, bars: () => [],
  });
  // ending story, from the chronicle prose with the same outcomes, leads and heard ids
  const ev = board.evidence(), leads = story.missing.map((_, k) => countLeads(story, lore, ev, k));
  const ending = summaryProse({ prose: proseLib, story, mythos, state: w.state, nights: 12, outcomes: w.outcomes, leads, heard: new Set(w.heard.keys()), met: people, memoryLog: null }, NIGHT, lang);

  // villager name: chat heading, board suspect card, chronicle people, journal pages that name their owner
  for (const i of people) {
    const name = story.roster[i].name;
    add(`name:${i}`, 'chat', name); if (revealed(`suspect:${i}`)) add(`name:${i}`, 'board', board.cardTitle(`suspect:${i}`));
    const person = model.people.find((p) => p.index === i); if (person) add(`name:${i}`, 'chronicle', person.name);
  }
  // a journal page names the neighbour of its writer (and some name the writer's surname): the page must carry the very name the other panels show
  for (const b of lore.books) {
    const o = story.journalOwner(b); if (o < 0 || !people.has(o)) continue;
    const page = `${story.bookTitle(b, lang)} ${story.bookText(b, lang)}`, nb = story.neighbourOf(o), neighbour = story.roster[nb].name;
    if (!page.includes(neighbour)) { add(`name:${nb}`, 'journal', `(page of ${b.id} lacks ${neighbour})`); add(`name:${nb}`, 'chat', neighbour); continue; }
    add(`name:${nb}`, 'journal', neighbour); add(`name:${nb}`, 'chat', neighbour); if (revealed(`suspect:${nb}`)) add(`name:${nb}`, 'board', board.cardTitle(`suspect:${nb}`));
  }

  // missing persons: name on the board card, in the chronicle and in the ending, and the outcome as far as the leads allow
  story.missing.forEach((m, k) => {
    const vars = story.missingVars(m, lang), full = vars.missing, mm = model.missing[k];
    if (revealed(`victim:${k}`)) { add(`missing:${k}`, 'board', board.cardTitle(`victim:${k}`)); add(`missing:${k}`, 'chronicle', mm.name); } // an unrevealed victim card is a shell on purpose
    const level = leads[k] >= 4 ? 2 : leads[k] >= 1 ? 1 : 0;
    if (level > 0) add(`ending-names:${k}`, 'ending', ending.includes(full) ? full : `(ending lacks ${full})`), add(`ending-names:${k}`, 'chronicle', full);
    if (level === 2) {
      const line = board.inspect(`victim:${k}`);
      add(`outcome:${k}`, 'board', line.slice(line.lastIndexOf(mm.outcome)) === mm.outcome ? mm.outcome : line); add(`outcome:${k}`, 'chronicle', mm.outcome);
      add(`outcome-id:${k}`, 'board', OUTCOME_IDS[w.outcomes[k]]); add(`outcome-id:${k}`, 'ending', endingOutcomeId(ending, k, w));
    }
  });

  // rumor version and the true account: chat line, board card, chronicle line (all call mythosCurrentText with the same night and tier)
  for (const c of w.chat) for (const l of c.lines) {
    if (w.heard.get(l.id) !== c.villager) continue;
    add(`rumor:${l.id}`, 'chat', l.text); add(`rumor:${l.id}`, 'board', board.cardTitle(`event:${l.id}`));
    const m = model.mythos.find((x) => x.id === l.id); if (m) add(`rumor:${l.id}`, 'chronicle', m.text);
  }

  // reality distortion: the effects of the tier on tonight, in the board's knowledge line and the chronicle's
  const effects = realityDistortion(knowledgeLib, w.seed, NIGHT, tier).map((id) => knowledgeLib.effects.find((x) => x.id === id).text[lang]);
  add('distortion', 'data', effects.join(' ')); add('distortion', 'board', board.knowledge().effects.join(' ')); add('distortion', 'chronicle', model.knowledge ? model.knowledge.effects.join(' ') : '');
  add('tier-name', 'data', knowledgeLib.tiers[tier].name[lang]); add('tier-name', 'board', board.knowledge().name); add('tier-name', 'chronicle', model.knowledge ? model.knowledge.name : '');
  return out;
}

/** Which outcome id the ending sentence for missing person k belongs to: the id whose chronicle variants contain it, or a marker. */
function endingOutcomeId(ending, k, w) {
  const vars = w.story.missingVars(w.story.missing[k], w.lang);
  const ids = OUTCOME_IDS.filter((id) => proseLib.variants[CHRONICLE_LINE_IDS.indexOf(`outcome_${id}`)].some((v) => {
    const sentence = (v[w.lang] || v.en).replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
    return ending.includes(sentence.charAt(0).toUpperCase() + sentence.slice(1));
  }));
  return ids.length === 1 ? ids[0] : `(ending matches ${ids.length} outcome ids)`;
}

/** Facts whose panels do not all give the same words, as readable lines. */
export function disagreements(facts) {
  const byKey = new Map();
  for (const f of facts) (byKey.get(f.key) || byKey.set(f.key, []).get(f.key)).push(f);
  const bad = [];
  for (const [key, list] of byKey) if (new Set(list.map((f) => f.words)).size > 1) bad.push(`${key}: ${list.map((f) => `${f.panel}="${f.words}"`).join(' | ')}`);
  return bad;
}

const SEEDS = [42, 1818, 7], LANGS = ['en', 'fr'], TIERS = [0, 2, 4, 5];

test('name, outcome, rumor version and reality distortion read the same in every panel, per seed, tier and language', () => {
  let facts = 0, rumors = 0, outcomesSeen = 0, distortions = 0;
  for (const seed of SEEDS) for (const lang of LANGS) for (const tier of TIERS) {
    const w = worldOf(seed, tier, lang), list = collectFacts(w);
    assert.deepEqual(disagreements(list), [], `seed ${seed} ${lang} tier ${tier}`);
    facts += list.length; rumors += list.filter((f) => f.key.startsWith('rumor:')).length / 3; outcomesSeen += list.filter((f) => f.key.startsWith('outcome:')).length / 2;
    distortions += list.filter((f) => f.key === 'distortion' && f.words).length > 0 ? 1 : 0;
  }
  // the scenario is not vacuous: rumors, revealed outcomes and tier effects were all compared
  assert.ok(facts > 100 && rumors > 0 && distortions > 0 && outcomesSeen > 0, `facts ${facts}, rumors ${rumors}, outcomes ${outcomesSeen}, distortions ${distortions}`);
});

test('the rumor version changes with the knowledge tier, and the panels still agree on each version', () => {
  const rumorsAt = (tier) => collectFacts(worldOf(1818, tier, 'en', false)).filter((f) => f.key.startsWith('rumor:') && f.panel === 'chat').map((f) => f.words).join('||');
  assert.notEqual(rumorsAt(0), rumorsAt(5), 'tier 5 tells the true account after the drifted rumor');
});

test('the checker fails when one panel disagrees (injected mismatches)', () => {
  const facts = collectFacts(worldOf(1818, 4, 'en'));
  assert.deepEqual(disagreements(facts), []);
  for (const prefix of ['name:', 'missing:', 'rumor:', 'distortion', 'tier-name']) {
    const target = facts.findIndex((f) => f.key.startsWith(prefix) && f.panel === 'board');
    if (target < 0) { assert.equal(prefix, 'name:', `no ${prefix} fact to inject into`); continue; }
    const broken = facts.map((f, i) => (i === target ? { ...f, words: `${f.words} (told differently)` } : f));
    assert.equal(disagreements(broken).length, 1, `an injected ${prefix} mismatch is reported`);
  }
  const withOutcome = facts.find((f) => f.key.startsWith('outcome:'));
  if (withOutcome) assert.equal(disagreements(facts.map((f) => (f === withOutcome ? { ...f, words: 'changed' } : f))).length, 1);
});

test('the board, the chronicle and the ending are wired to the same outcome and knowledge producers in app.js', () => {
  const app = readFileSync(join(here, '..', 'src', 'app.js'), 'utf8');
  assert.equal([...app.matchAll(/outcomeLine: \(k\) => (?:\(theory \? theory\.outcomeLine\(k\) : ''\)|theory\.outcomeLine\(k\))/g)].length, 2, 'the board and the chronicle share theory.outcomeLine');
  assert.match(app, /outcomeState: \(k\) => theory\.outcomeState\(k\)/);
  assert.match(app, /knowledge: \(\) => board\.knowledge\(\)/);
  assert.match(app, /summary: \(\) => \(chronicle \? chronicle\.summary\(\) : ''\)/);
});
