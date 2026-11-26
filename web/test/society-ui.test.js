// Round 26: society in the browser: corruption tells (2D and 3D, reduced motion, quality tiers), the action log, saves, determinism and the trust text in dialogue (en and fr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateCampaign, generateLayout, SanityModel } from '../src/core.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { parseNameLibrary, assignNames } from '../src/names.js';
import { generateRoster, behaviorAt } from '../src/villagers.js';
import { parseStoryLibrary, buildStory } from '../src/village-story.js';
import { parseStatementLibrary } from '../src/investigation.js';
import { landmarks } from '../src/landmarks.js';
import { QUALITY_TIERS } from '../src/quality.js';
import { VERTEX_FLOATS } from '../src/glb.js';
import { CELL } from '../src/view3d-math.js';
import { villagerPlacements, villagerScene } from '../src/villager-view.js';
import { createVillagerController } from '../src/villager-ui.js';
import { createSocietyController, serializeSocietyLog, parseSocietyLog, authoredChatStatement, nearestWitness, MAX_LOG, WITNESS_RADIUS_M } from '../src/society-ui.js';
import { tellFor, auraAlpha, applyTell3d, hasTell, PULSE_PERIOD_MS, PULSE_DEPTH, COLD_LANTERN_RGB } from '../src/corruption-tell.js';
import {
  CORRUPTION_NONE, CORRUPTION_UNEASY, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST, CORRUPTION_MISSING, TIER_NEUTRAL, TIER_SUSPICIOUS, TIER_TRUSTING,
  CHAT_POLITE, SEEN_AT_RITUAL_SITE, NIGHT_INTRUSION, WARD_CREATURE_IN_VIEW, ACTION_IDS,
} from '../src/society.js';
import { t, STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const text = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const lib = parseStoryLibrary(text('story.json')), nameLib = parseNameLibrary(text('names.json')), statements = parseStatementLibrary(text('statements.json'));
const catalog = new PrefabCatalog(JSON.parse(text('village_catalog.json')).entries);
const SEED = 42;
const layout = generateCityLayout(catalog, CITY_GRID, CITY_GRID, CITY_PIECES, SEED), roster = generateRoster(SEED, layout);
const story = buildStory(lib, SEED, layout, roster, assignNames(nameLib, SEED, CITY_GRID, CITY_GRID, layout), generateCampaign(SEED, 5).villageName);

function make({ night = 0, sanity = 20, ritualStage = 3 } = {}) {
  const state = { seed: SEED, layout, sanity: new SanityModel(sanity), night, ritualStage }, changes = [];
  const society = createSocietyController({ state, story: () => story, gridW: CITY_GRID, gridD: CITY_GRID, cell: CELL, onChange: () => changes.push(1) });
  society.setStatements(statements);
  return { society, state, changes };
}

// ---- tells ----
test('each corruption stage has its own tell and none has no tell', () => {
  assert.equal(hasTell(tellFor(CORRUPTION_NONE)), false);
  const leans = [CORRUPTION_UNEASY, CORRUPTION_CORRUPTED, CORRUPTION_CULTIST].map((s) => tellFor(s).lean);
  assert.deepEqual([...leans].sort((a, b) => a - b), leans, 'the lean grows with the stage');
  assert.ok(leans[0] > 0);
  for (const s of [CORRUPTION_CORRUPTED, CORRUPTION_CULTIST, CORRUPTION_MISSING]) { const tell = tellFor(s); assert.ok(tell.aura > 0 && tell.lantern && tell.tint > 0); }
  assert.equal(tellFor(CORRUPTION_UNEASY).aura, 0, 'uneasy shows posture only');
  assert.equal(hasTell(tellFor(99)), false); assert.equal(hasTell(tellFor(-1)), false); assert.equal(hasTell(tellFor(1.5)), false);
});
test('the aura breathes slowly and holds still under reduced motion', () => {
  const tell = tellFor(CORRUPTION_CORRUPTED), still = tellFor(CORRUPTION_CORRUPTED, { reduced: true });
  assert.equal(still.pulse, 0);
  for (const ms of [0, 1500, 3000, 4500, 9999]) assert.equal(auraAlpha(still, ms), still.aura);
  let lo = Infinity, hi = -Infinity, maxStep = 0, prev = auraAlpha(tell, 0);
  for (let ms = 16; ms <= PULSE_PERIOD_MS * 2; ms += 16) { const a = auraAlpha(tell, ms); lo = Math.min(lo, a); hi = Math.max(hi, a); maxStep = Math.max(maxStep, Math.abs(a - prev)); prev = a; }
  assert.ok(hi <= tell.aura + 1e-9 && lo >= tell.aura * (1 - PULSE_DEPTH) - 1e-9, 'stays within the breathing band');
  assert.ok(maxStep < 0.005, `no frame-to-frame jump (${maxStep})`);
  assert.equal(auraAlpha(tellFor(CORRUPTION_NONE), 100), 0);
});
test('the Low quality tier draws no aura but keeps posture and lantern; Medium and High keep the aura', () => {
  const low = tellFor(CORRUPTION_CULTIST, { tier: QUALITY_TIERS.low });
  assert.equal(low.aura, 0); assert.equal(low.pulse, 0); assert.ok(low.lean > 0 && low.lantern);
  for (const tier of [QUALITY_TIERS.medium, QUALITY_TIERS.high]) assert.ok(tellFor(CORRUPTION_CULTIST, { tier }).aura > 0);
});
function figure(emissiveFirst = true) { // two vertices: a lantern vertex (emissive) and a coat vertex at 1.5 m
  const v = (x, y, z, rgb, glow) => [x, y, z, 0, 1, 0, rgb[0], rgb[1], rgb[2], glow, 0];
  return [...v(0.2, 0.9, 0, [1, 0.8, 0.5], emissiveFirst ? 1 : 0), ...v(0, 1.5, 0, [0.2, 0.18, 0.16], 0)];
}
test('3D tell leans the figure along its facing, dims the coat and recolours the lantern; same input, same output', () => {
  const tell = tellFor(CORRUPTION_CORRUPTED), a = figure(), b = figure();
  applyTell3d(a, 0, 0, 0, 0, tell); applyTell3d(b, 0, 0, 0, 0, tell);
  assert.deepEqual(a, b);
  assert.ok(a[VERTEX_FLOATS + 2] > 0, 'the head moves forward (yaw 0 faces +z)');
  assert.ok(Math.abs(a[VERTEX_FLOATS + 2] - 1.5 * Math.tan(tell.lean)) < 1e-9);
  assert.deepEqual(a.slice(6, 9), COLD_LANTERN_RGB);
  assert.ok(a[VERTEX_FLOATS + 7] > 0.18, 'the coat is pulled toward the cold tint');
  const none = figure(); applyTell3d(none, 0, 0, 0, 0, tellFor(CORRUPTION_NONE)); assert.deepEqual(none, figure());
});
test('draw.js and view3d.js use the tell and add no per-frame flash', () => {
  const draw = readFileSync(join(root, 'web', 'src', 'draw.js'), 'utf8'), view = readFileSync(join(root, 'web', 'src', 'view3d.js'), 'utf8');
  assert.match(draw, /tellFor\(v\.corruption/); assert.match(draw, /auraAlpha\(tell, time\)/);
  assert.match(view, /applyTell3d\(out, first/); assert.match(view, /v\.corruption \| 0/, 'a stage change rebuilds the villager buffer');
  const art = readFileSync(join(root, 'docs', 'ART_DIRECTION.md'), 'utf8');
  assert.match(art, /corruption tell/i);
});

// ---- behaviour through placements ----
test('a corrupted villager shows the stronger behaviour in the placements and the 3D scene', () => {
  const l = generateLayout(catalog, 24, 24, 80, 1818), r = generateRoster(1818, l), base = { roster: r, layout: l, tick: 300, dread: 0, gridW: 24, gridD: 24, seed: 1818 };
  const plain = villagerPlacements(base), sea = villagerPlacements({ ...base, stageOf: (i) => (i === 0 ? CORRUPTION_CORRUPTED : 0) }), gone = villagerPlacements({ ...base, stageOf: (i) => (i === 1 ? CORRUPTION_MISSING : 0) });
  assert.equal(plain[0].behavior, 0); assert.equal(sea[0].behavior, 2); assert.equal(sea[0].corruption, CORRUPTION_CORRUPTED); assert.equal(sea[1].corruption, 0);
  assert.equal(gone[1].gone, true); assert.equal(plain[1].gone, false);
  assert.deepEqual(sea.slice(2), plain.slice(2));
  assert.equal(behaviorAt(r[0], 300, 0, CORRUPTION_CULTIST), 3);
  const scene = villagerScene(sea.map((p) => ({ ...p, indoors: false, gone: false })), CELL);
  assert.equal(scene.find((s) => s.id === 0).corruption, CORRUPTION_CORRUPTED);
});

// ---- action log ----
test('the log round trips through its save string and drops malformed items', () => {
  const log = [{ kind: CHAT_POLITE, subject: 2 }, { kind: SEEN_AT_RITUAL_SITE, subject: -1 }];
  assert.equal(serializeSocietyLog(log), 'sc1;0:2,4:-1');
  assert.deepEqual(parseSocietyLog('sc1;0:2,4:-1'), log);
  assert.deepEqual(parseSocietyLog('sc1;0:2,zz,99:1,4:-1,5:'), log.concat([]), 'unknown kinds and junk are dropped');
  for (const bad of [undefined, null, 5, '', 'sc2;0:1', '0:1']) assert.deepEqual(parseSocietyLog(bad), []);
  const long = Array.from({ length: MAX_LOG + 20 }, (_, i) => ({ kind: 0, subject: i % 7 }));
  assert.equal(parseSocietyLog(serializeSocietyLog(long)).length, MAX_LOG);
});
test('polite chat, a night door, the ritual site and a ward are logged once each and change standing', () => {
  const { society } = make({ night: 1 });
  society.noteChat(2, { available: true }); society.noteChat(3, { available: false });
  assert.deepEqual(society.log(), [{ kind: CHAT_POLITE, subject: 2 }]);
  const home = story.roster[1].homeIndex;
  society.noteDoor(home, 2); assert.equal(society.log().length, 1, 'only at night');
  society.noteDoor(home, 3); society.noteDoor(home, 3);
  assert.deepEqual(society.log().slice(1), [{ kind: NIGHT_INTRUSION, subject: 1 }], 'once per night');
  society.noteDoor(-1, 3); society.noteDoor(9999, 3); assert.equal(society.log().length, 2);
  const ritual = landmarks(SEED, CITY_GRID, CITY_GRID).find((l) => l.id === 'ritual_site'), spot = { x: ritual.x * CELL, z: ritual.z * CELL };
  const near = [{ id: 4, pos: [spot.x + 3, 1, spot.z] }], far = [{ id: 4, pos: [spot.x + WITNESS_RADIUS_M + 5, 1, spot.z] }];
  society.watch(spot, far); assert.equal(society.log().length, 2, 'nobody saw');
  society.watch(spot, near); society.watch(spot, near);
  assert.deepEqual(society.log().slice(2), [{ kind: SEEN_AT_RITUAL_SITE, subject: 4 }]);
  society.noteWard(spot, near); society.noteWard(spot, []);
  assert.deepEqual(society.log().slice(3), [{ kind: WARD_CREATURE_IN_VIEW, subject: 4 }]);
  assert.ok(society.standing(4).tier !== undefined);
});
test('the ritual site seen raises suspicion until the villager turns suspicious; the same log gives the same standing', () => {
  const a = make({ night: 0, sanity: 100, ritualStage: 0 }), b = make({ night: 0, sanity: 100, ritualStage: 0 });
  for (const m of [a, b]) for (let i = 0; i < 3; i++) m.society.record(SEEN_AT_RITUAL_SITE, 1);
  assert.equal(a.society.standing(1).tier, TIER_SUSPICIOUS);
  assert.deepEqual(a.society.standing(1), b.society.standing(1));
  assert.notEqual(make({ night: 0, sanity: 100, ritualStage: 0 }).society.standing(1).tier, TIER_SUSPICIOUS, 'an empty log is not suspicious');
});
test('save and restore bring the log back; an old save restores empty', () => {
  const a = make({ night: 2 }); a.society.record(CHAT_POLITE, 1); a.society.record(CHAT_POLITE, 1);
  const saved = a.society.snapshot(), b = make({ night: 2 });
  b.society.restore(saved); assert.deepEqual(b.society.log(), a.society.log()); assert.deepEqual(b.society.standing(1), a.society.standing(1));
  b.society.restore({}); assert.deepEqual(b.society.log(), []);
  b.society.restore(undefined); assert.deepEqual(b.society.log(), []);
});
test('record refuses a bad kind or a villager outside the story', () => {
  const { society } = make();
  for (const [k, s] of [[-1, 0], [ACTION_IDS.length, 0], [0, 99], [0, 1.5], ['0', 1]]) assert.equal(society.record(k, s), false);
  assert.equal(society.record(0, -1), true);
});

// ---- corruption per night ----
test('corruption stages are deterministic, never fall as the night and dread rise, and are empty without a story', () => {
  const early = make({ night: 0, sanity: 100, ritualStage: 0 }).society.stages(), late = make({ night: 4, sanity: 0, ritualStage: 5 }).society.stages();
  assert.equal(early.length, story.roster.length);
  assert.deepEqual(late, make({ night: 4, sanity: 0, ritualStage: 5 }).society.stages());
  early.forEach((s, i) => assert.ok(late[i] >= s || late[i] >= CORRUPTION_CULTIST, `villager ${i}`));
  assert.ok(late.some((s) => s >= CORRUPTION_CORRUPTED), 'by the last night someone is corrupted');
  const none = createSocietyController({ state: { seed: 1, layout: [], sanity: new SanityModel(50), night: 0, ritualStage: -1 }, story: () => null, gridW: 8, gridD: 8, cell: CELL });
  assert.deepEqual(none.stages(), []); assert.equal(none.standing(0), null); assert.equal(none.stageOf(0), 0);
});

// ---- authored chat statements ----
test('authored chat statements are revealed deterministically by role, night, topic and trust', () => {
  const fisher = statements.statements.find((s) => s.id === 'c_fisher_home');
  const lucid = { available: true, behavior: 0, hintId: 'village', withheld: false };
  assert.equal(authoredChatStatement(statements, 'fisher', 1, lucid, TIER_NEUTRAL), fisher);
  assert.equal(authoredChatStatement(statements, 'fisher', 0, lucid, TIER_NEUTRAL), null, 'not before its night');
  assert.equal(authoredChatStatement(statements, 'priest', 1, lucid, TIER_NEUTRAL), null);
  assert.equal(authoredChatStatement(statements, 'fisher', 1, { ...lucid, hintId: 'clues_seek' }, TIER_NEUTRAL), null, 'only the village topic');
  assert.equal(authoredChatStatement(statements, 'fisher', 1, { ...lucid, hintId: 'clues_seek' }, TIER_TRUSTING), fisher, 'a trusting villager says it on any hint');
  assert.equal(authoredChatStatement(statements, 'fisher', 1, lucid, TIER_SUSPICIOUS), null);
  assert.equal(authoredChatStatement(statements, 'fisher', 1, { ...lucid, behavior: 2 }, TIER_NEUTRAL), null);
  assert.equal(authoredChatStatement(null, 'fisher', 1, lucid, TIER_NEUTRAL), null);
  assert.equal(nearestWitness([{ id: 3, pos: [0, 1, 0] }, { id: 5, pos: [1, 1, 0] }], 0.5, 0), 3, 'a tie goes to the earlier entry');
});

// ---- dialogue strings ----
const TRUST_KEYS = ['society.trust.0', 'society.trust.1', 'society.trust.2', 'society.trust.short.0', 'society.trust.short.1', 'society.trust.short.2', 'society.trust.aria', 'society.card.aria', 'society.cold', 'society.chat.withheld'];
test('trust strings exist in en and fr, differ between languages and carry no em dash', () => {
  for (const k of TRUST_KEYS) {
    assert.ok(STRINGS.en[k] && STRINGS.fr[k], k);
    assert.notEqual(STRINGS.en[k], STRINGS.fr[k], `${k} is translated`);
    assert.ok(!STRINGS.en[k].includes('\u2014') && !STRINGS.fr[k].includes('\u2014'), k);
  }
  assert.equal(t('society.chat.withheld', 'en', { name: 'Ann' }), 'Ann looks away and says nothing.');
});

function fakeDoc() {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, textContent: '', hidden: true, innerHTML: '', attrs: {}, focus() {}, addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; } }); return els.get(id); };
  return { $: el, els };
}
function chatRun(standing, lang = 'en', extra = {}) {
  const { $, els } = fakeDoc(), l = generateLayout(catalog, 24, 24, 80, 1818);
  const state = { seed: 1818, layout: l, sanity: new SanityModel(40), campaign: generateCampaign(1818), night: 0, villagers: [] }, heard = [];
  const ctl = createVillagerController({
    $, tr: (k, v) => t(k, lang, v), lang, state, gridW: 24, gridD: 24, tickNow: () => 300, chatNeeds: () => ({ cluesLeft: 2, lampsLeft: 1, sanity: 30 }), announce() {}, applyEffect() {},
    standing: () => standing, stageOf: () => (standing ? standing.corruption : 0), onChat: (i, result) => heard.push(result), ...extra,
  });
  ctl.refresh();
  return { ctl, els, heard };
}
test('chat shows trust text for every tier in en and fr, with aria text', () => {
  for (const lang of ['en', 'fr']) for (const tier of [TIER_NEUTRAL, TIER_SUSPICIOUS, TIER_TRUSTING]) {
    const r = chatRun({ tier, corruption: 0 }, lang); r.ctl.chatWith(0);
    const p = r.els.get('villagerTrust');
    assert.equal(p.textContent, t(`society.trust.${tier}`, lang)); assert.equal(p.hidden, false);
    assert.equal(p.attrs['aria-label'], t('society.trust.aria', lang, { text: p.textContent }));
  }
});
test('a suspicious villager withholds or lies; a lie flows to onChat as a statement id', () => {
  let withheld = 0, lied = 0;
  for (let i = 0; i < 12; i++) {
    const r = chatRun({ tier: TIER_SUSPICIOUS, corruption: 0 }, 'en', { statementText: (id) => `LIE ${id}` });
    for (let k = 0; k <= i; k++) r.ctl.chatWith(0);
    const res = r.heard[r.heard.length - 1];
    if (res.withheld) { withheld++; assert.equal(r.els.get('villagerLine').textContent, t('society.chat.withheld', 'en', { name: r.ctl.roster[0].name })); }
    if (res.lieStatementId) { lied++; assert.equal(r.els.get('villagerLine').textContent, `LIE ${res.lieStatementId}`); }
  }
  assert.ok(withheld + lied > 0);
});
test('a corrupted villager speaks the cold line and shows the stronger behaviour in chat and talk', () => {
  const r = chatRun({ tier: TIER_NEUTRAL, corruption: CORRUPTION_CORRUPTED });
  const res = r.ctl.chatWith(0);
  assert.equal(res.behavior, 2); assert.equal(res.hintId, '');
  assert.equal(r.els.get('villagerLine').textContent, t('villager.sea', 'en', { name: r.ctl.roster[0].name }));
  assert.ok(r.els.get('villagerTrust').textContent.includes(t('society.cold', 'en')));
  const talk = chatRun({ tier: TIER_NEUTRAL, corruption: CORRUPTION_CORRUPTED }); talk.ctl.talkTo(0);
  assert.equal(talk.els.get('villagerLine').textContent, t('villager.sea', 'en', { name: talk.ctl.roster[0].name }));
  const gone = chatRun({ tier: TIER_NEUTRAL, corruption: CORRUPTION_MISSING }); assert.equal(gone.ctl.chatWith(0).available, false, 'a missing villager cannot be chatted with');
  assert.equal(gone.els.get('villagerLine').textContent, t('villager.gone', 'en'));
});
test('an authored chat statement is spoken and handed to the board; without society deps nothing changes', () => {
  const fisher = statements.statements.find((s) => s.id === 'c_fisher_home');
  const r = chatRun({ tier: TIER_NEUTRAL, corruption: 0 }, 'en', { chatStatement: () => fisher });
  r.ctl.chatWith(0);
  assert.ok(r.els.get('villagerLine').textContent.includes(fisher.text.en));
  assert.equal(r.heard[0].lieStatementId, 'c_fisher_home');
  const plain = chatRun(null); plain.ctl.chatWith(0);
  assert.equal(plain.els.get('villagerTrust').hidden, true); assert.equal(plain.els.get('villagerTrust').textContent, '');
});
test('index.html declares the trust line and the board card shows trust with aria text', () => {
  assert.match(readFileSync(join(root, 'web', 'index.html'), 'utf8'), /id="villagerTrust"[^>]*hidden/);
  const ui = readFileSync(join(root, 'web', 'src', 'board-ui.js'), 'utf8');
  assert.match(ui, /society\.card\.aria/); assert.match(ui, /board-card-trust/);
});

test('app.js wires the society into the board, villagers, session, doors, wards and the watcher', () => {
  const app = readFileSync(join(root, 'web', 'src', 'app.js'), 'utf8');
  for (const needle of ['createSocietyController(', 'society.stages()', 'trust: (i)', 'stageOf: (i) => society.stageOf(i)', 'standing: (i) => society.standing(i)', '...society.snapshot()', 'society.restore(v)', 'restoreSessionControllers(saved)', 'society.noteDoor(', 'onWard:', 'society.watch(', "data/statements.json", 'society.setStatements(']) assert.ok(app.includes(needle), needle);
  assert.ok(!app.includes('corruption: () => null'), 'the placeholder is gone');
});

// ---- round 34: villager memory ----
test('a villager the player was seen near a body by remembers on day 2 and differs on day 15; the memory saves and restores', () => {
  const memLib = JSON.parse(readFileSync(join(root, 'web', 'data', 'memory.json'), 'utf8'));
  const { society, state } = make({ night: 1 });
  society.setMemory(memLib);
  const before = society.memoryLine(0, 2, 'en');
  assert.equal(society.record(3, 0), true); // seen_near_body
  assert.equal(society.memoryOutcome(0), 2, 'accused on night 2 is paranoid');
  assert.ok(society.standing(0).memory === 2);
  const early = society.memoryLine(0, 2, 'en'), earlyBars = society.bars(0);
  assert.notEqual(early, before);
  const saved = society.snapshot();
  assert.match(saved.memory, /^mm1;2:0:0:500:-1/);
  state.night = 14;
  assert.equal(society.memoryOutcome(0), 0, 'the accusation fades by day 15 but is not gone');
  assert.notEqual(society.memoryLine(0, 15, 'en'), '');
  assert.notEqual(society.memoryLine(0, 15, 'en'), early);
  assert.notDeepEqual(society.bars(0), earlyBars);
  const again = make({ night: 1 }).society;
  again.setMemory(memLib);
  again.restore(saved);
  assert.equal(again.memoryOutcome(0), 2);
  const none = make({ night: 1 }).society; // no memory data: effects still apply, no line
  assert.equal(none.memoryLine(0, 2, 'en'), '');
});

test('memory still updates after the log is full (cache key uses a counter, not the length)', () => {
  const memLib = JSON.parse(readFileSync(join(root, 'web', 'data', 'memory.json'), 'utf8'));
  const { society } = make({ night: 1 });
  society.setMemory(memLib);
  for (let i = 0; i < 150; i += 1) society.record(3, 1);
  assert.equal(society.memoryOutcome(0), 0, 'villager 0 has no event yet (cached)');
  assert.equal(society.record(3, 0), true); // the 151st event
  assert.equal(society.memoryOutcome(0), 2, 'the new event replays although the log length is unchanged');
});

test('a new village starts with a clean action log and no memories; a restore for the new seed still sticks', () => {
  const { society, state } = make({ night: 2 });
  society.record(3, 0); society.record(3, 0);
  assert.ok(society.log().length > 0 && society.memoryEvents().length > baselineCount());
  state.seed = SEED + 1;
  assert.deepEqual(society.log(), [], 'the old village actions do not carry over');
  assert.equal(society.memoryEvents().length, baselineCount(), 'only the story baseline remains');
  assert.equal(society.snapshot().society, serializeSocietyLog([]));
  const saved = { society: serializeSocietyLog([{ kind: 0, subject: 1 }]), memory: 'mm1;' };
  society.restore(saved);
  assert.equal(society.log().length, 1, 'a restore right after the seed change is kept');
});
test('an all-villagers action right after a seed change is not lost to the reset', () => {
  const { society, state } = make({ night: 2 });
  society.record(3, 0);
  state.seed = SEED + 2;
  assert.equal(society.record(1, -1), true);
  assert.equal(society.log().length, 1, 'only the new village action remains');
});
function baselineCount() { return story.missing.filter((m) => m.kinIndex >= 0).length; }

test('axes follow the opinions: lost trust from wrong theories and a full log both change the loyalty bar', () => {
  const state = { seed: SEED, layout, sanity: new SanityModel(20), night: 2, ritualStage: 3 };
  let lost = 0;
  const society = createSocietyController({ state, story: () => story, gridW: CITY_GRID, gridD: CITY_GRID, cell: CELL, trustLost: () => lost });
  society.setStatements(statements);
  const before = society.axes(0).loyalty;
  lost = 40; // 400 per mille of trust gone
  assert.ok(society.axes(0).loyalty < before, 'loyalty drops with the trust that was lost');
  lost = 0;
  assert.equal(society.axes(0).loyalty, before, 'and returns when the loss is undone');
  for (let i = 0; i < 150; i += 1) society.record(1, -1); // fills the log with a trust gain for everyone
  const full = society.axes(0).loyalty;
  society.record(5, -1); // the 151st action (a trust loss) replaces the oldest; the length stays at 150
  assert.ok(society.axes(0).loyalty < full, 'the new action reaches the axes although the log length is unchanged');
});

test('round 36: the controller exposes reputation effect records, strongest first per villager, and none for an empty log', () => {
  const { society } = make({ night: 1 });
  assert.deepEqual(society.reputationEffects(), []);
  assert.equal(society.record(SEEN_AT_RITUAL_SITE, 1), true);
  const fx = society.reputationEffects();
  assert.ok(fx.length >= 1 && fx[0].target === 1 && fx[0].hop === 0 && fx[0].source === 1);
  const mine = society.reputationOf(1);
  assert.equal(mine[0].strength, 400);
  for (const e of fx.filter((x) => x.hop > 0)) assert.deepEqual(society.reputationOf(e.target)[0], e);
  assert.deepEqual(society.reputationOf(999), []);
});
