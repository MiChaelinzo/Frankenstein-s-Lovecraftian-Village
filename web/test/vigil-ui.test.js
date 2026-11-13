import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign, generateRitual, VigilState, VIGIL_ENDING_IDS, parseVigilResultCode } from '../src/core.js';
import { STRINGS, t } from '../src/i18n.js';
import { createVigilController } from '../src/vigil-ui.js';
import { SanityModel } from '../src/core.js';
import { pickLamp, LAMP_PICK_RADIUS } from '../src/view3d-math.js';
import {
  objectiveModel, objectiveText, endingModel, endingStatsText, resultText, resultCardFilename, parseEndingsFound, recordEnding, loadEndingsFound,
  drawResultCard, spokenName, ENDINGS_KEY, CARD_WIDTH, CARD_HEIGHT, lampMarkerStates, flameFlicker,
} from '../src/vigil-view.js';

const NIGHT_TICK = 1100; // 1080 is the first minute of night (clock.js)
const make = (seed = 1818, nights = 3) => { const c = generateCampaign(seed, nights); return new VigilState(c, generateRitual(c)); };
const tr = (k, v) => t(k, 'en', v);
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

test('objective text shows night, clues, lanterns and the masked name', () => {
  const v = make();
  v.recordClue('walls'); v.lightLantern('lamp0');
  const m = objectiveModel(v);
  assert.deepEqual([m.night, m.clues, m.lit, m.finished], [1, 1, 1, false]);
  const text = objectiveText(m, tr);
  assert.match(text, /^Night 1 of 3: clues 1\/2, lanterns lit 1\/3, the name: /);
  assert.ok(text.includes(v.revealedName));
});

test('every vigil string exists in en and fr', () => {
  for (const lang of ['en', 'fr']) for (const id of VIGIL_ENDING_IDS) { assert.ok(STRINGS[lang][`vigil.title.${id}`]); assert.ok(STRINGS[lang][`vigil.ending.${id}`]); }
});

test('ending model, result text and code round trip', () => {
  const v = make(7, 1);
  v.recordClue('a'); v.recordClue('b'); v.endureNight(80);
  const outcome = v.outcome(2);
  const m = endingModel(outcome, { vigil: v, villageName: 'Innsmouth', seed: 7, found: 1, stageCount: 5 });
  assert.equal(m.id, outcome.endingId);
  assert.match(endingStatsText(m, tr), /nights endured 1\/1/);
  const text = resultText(m, 'Title', 'http://x/#seed=7');
  assert.match(text, /^Innsmouth \| Title \| /);
  const code = text.split('\n')[0].split(' | ')[3];
  assert.equal(parseVigilResultCode(code).seed, 7);
  assert.ok(text.endsWith('http://x/#seed=7'));
  assert.equal(resultCardFilename(7, 'dawn'), 'vigil-7-dawn.png');
});

test('endings found parses safely, orders by definition and persists', () => {
  assert.deepEqual(parseEndingsFound('vessel,nope,dawn,dawn'), ['dawn', 'vessel']);
  assert.deepEqual(parseEndingsFound(null), []);
  const s = memStorage();
  assert.deepEqual(recordEnding(s, 'vessel'), ['vessel']);
  assert.deepEqual(recordEnding(s, 'hollowing'), ['hollowing', 'vessel']);
  assert.deepEqual(recordEnding(s, 'bogus'), ['hollowing', 'vessel']);
  assert.equal(s.getItem(ENDINGS_KEY), 'hollowing,vessel');
  assert.deepEqual(loadEndingsFound(null), []);
  const errs = []; recordEnding({ getItem: () => null, setItem() { throw new Error('full'); } }, 'dawn', (e) => errs.push(e.message));
  assert.deepEqual(errs, ['full']);
});

test('spokenName drops hidden letters', () => assert.equal(spokenName('Y\u00b7S\u00b7TH'), 'Y S TH'));

test('result card is deterministic and draws on the full canvas', () => {
  const run = (seed) => {
    const calls = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(`${String(k)}:${a.join(',')}`); }), set: () => true });
    drawResultCard(g, { id: 'fever', villageName: 'V', title: 'T', rankName: 'R', score: 9, code: 'C', seed, name: 'N', epitaph: 'E' });
    return calls.join('|');
  };
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
  assert.ok(run(5).includes(`fillRect:0,0,${CARD_WIDTH},${CARD_HEIGHT}`));
});

test('pickLamp finds the nearest lamp on the ray and ignores ones behind', () => {
  const lamps = [{ pos: [0, 0, -10] }, { pos: [0, 0, -5] }, { pos: [0, 0, 8] }];
  const hit = pickLamp([0, 0, 0], [0, 0, -1], lamps, 60);
  assert.equal(hit.index, 1);
  assert.ok(Math.abs(hit.distance - (5 - LAMP_PICK_RADIUS)) < 1e-9);
  assert.equal(pickLamp([0, 0, 0], [1, 0, 0], lamps, 60), null);
  assert.equal(pickLamp([0, 0, 0], [0, 0, -1], lamps, 3), null);
});

test('ending cue kind: dawn and witness are warm, the rest cold', async () => {
  const { endingCueKind } = await import('../src/vigil-view.js');
  assert.equal(endingCueKind('dawn'), 'ending-warm'); assert.equal(endingCueKind('witness'), 'ending-warm');
  for (const id of ['hollowing', 'name_spoken', 'fever', 'vessel']) assert.equal(endingCueKind(id), 'ending-cold');
});

test('reset cancels a pending ending so a reroll never opens the previous run', async () => {
  const campaign = generateCampaign(5, 1), ritual = generateRitual(campaign);
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { hidden: false, textContent: '', showModal() { this.opened = true; }, focus() {}, setAttribute() {}, addEventListener() {}, close() {} }); return els.get(id); };
  const state = { campaign, ritual, layout: [], seed: 5, sanity: new SanityModel(), landmarks: [] };
  const progress = { arm() {}, update() {}, snapshot: () => ({ codex: [] }), note: { vigilDone() {} } };
  const c = createVigilController({
    $, tr, state, progress, storage: memStorage(), announce() {}, notice() {}, adjust() {}, setSanity() {}, selectNight() {}, syncUi() {}, pushHash() {},
    tickNow: () => NIGHT_TICK, skipClock: (minutes, done) => done(), canPlay: () => true, exit3d() {}, reroll() {}, download() {}, shareLink() {}, reduceMotion: false,
  });
  c.reset();
  c.clue('a'); c.clue('b');
  c.endure();
  await new Promise((r) => setTimeout(r, 5));
  c.reset();
  await new Promise((r) => setTimeout(r, 1800));
  assert.ok(!$('ending').opened, 'ending dialog opened after reset');
});

function lockHarness() {
  const campaign = generateCampaign(5, 2), ritual = generateRitual(campaign);
  const els = new Map(), notices = [];
  const $ = (id) => { if (!els.has(id)) els.set(id, { hidden: false, disabled: false, textContent: '', attrs: {}, showModal() {}, focus() {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, close() {} }); return els.get(id); };
  const state = { campaign, ritual, layout: [], seed: 5, sanity: new SanityModel(), landmarks: [] };
  const progress = { arm() {}, update() {}, snapshot: () => ({ codex: [] }), note: { vigilDone() {} } };
  let play = true;
  const c = createVigilController({
    $, tr, state, progress, storage: memStorage(), announce() {}, notice: (t) => notices.push(t), adjust() {}, setSanity() {}, selectNight() {}, syncUi() {}, pushHash() {},
    tickNow: () => NIGHT_TICK, skipClock: (minutes, done) => done(), canPlay: () => play, exit3d() {}, reroll() {}, download() {}, shareLink() {}, reduceMotion: true,
  });
  c.reset();
  return { c, $, notices, setPlay: (v) => { play = v; } };
}

test('sandbox lock: free before the first action, engaged after the first clue, refusing with a reason', () => {
  const { c, $, notices } = lockHarness();
  assert.equal(c.isLocked(), false);
  assert.equal(c.allows('sanity_slider'), true);
  assert.equal($('sanity').disabled, false);
  assert.ok($('vigilLock').hidden);
  c.clue('walls');
  assert.equal(c.isLocked(), true);
  for (const id of ['sanity', 'night', 'nightPrev', 'nightNext', 'reroll', 'seed', 'dailyBtn', 'loadSession', 'drain', 'storyOpen', 'cinemaToggle']) {
    assert.equal($(id).disabled, true, id);
    assert.equal($(id).attrs['aria-disabled'], 'true', id);
  }
  assert.equal($('vigilLock').hidden, false);
  assert.equal($('vigilLock').textContent, 'The vigil binds you. End it to tamper.');
  notices.length = 0;
  for (const id of ['sanity_slider', 'sanity_keys', 'night_select', 'night_step', 'dread_creep', 'new_village', 'seed_entry', 'daily', 'load_session', 'story_playback', 'cinema_playback', 'made_up']) assert.equal(c.allows(id), false, id);
  assert.equal(notices.length, 12);
  assert.ok(notices.every((n) => n === tr('vigil.lock')));
});

test('sandbox lock releases when the vigil is reset or finishes', () => {
  const { c, $ } = lockHarness();
  c.clue('walls');
  assert.equal(c.isLocked(), true);
  c.reset();
  assert.equal(c.isLocked(), false);
  assert.equal($('reroll').disabled, false);
  assert.ok($('vigilLock').hidden);
});

test('story, cinema and tour cannot unlock a begun vigil: the lock does not depend on canPlay', () => {
  const { c, notices, setPlay } = lockHarness();
  c.clue('walls');
  setPlay(false); // story, cinema, tour, title or help open
  assert.equal(c.isLocked(), true);
  notices.length = 0;
  assert.equal(c.allows('story_playback'), false);
  assert.equal(c.allows('cinema_playback'), false);
  assert.equal(c.allows('sanity_keys'), false);
  assert.equal(notices.length, 3);
  assert.equal(c.clue('church-nave'), false, 'nothing is counted while play is suspended');
  setPlay(true);
  assert.equal(c.isLocked(), true);
});

test('the lock is per the Core begun flag: a restored vigil is locked, a fresh one is not', () => {
  const a = lockHarness(); a.c.clue('walls');
  const saved = a.c.serialize();
  const b = lockHarness();
  assert.equal(b.c.isLocked(), false);
  assert.equal(b.c.restore(saved), true);
  assert.equal(b.c.isLocked(), true);
});

test('lanterns past the cap restore no sanity and the same lamp restores once', () => {
  const campaign = generateCampaign(5, 2), ritual = generateRitual(campaign);
  const gains = [];
  const { c } = (() => {
    const els = new Map();
    const $ = (id) => { if (!els.has(id)) els.set(id, { hidden: false, textContent: '', attrs: {}, showModal() {}, focus() {}, setAttribute() {}, addEventListener() {}, close() {} }); return els.get(id); };
    const state = { campaign, ritual, layout: [], seed: 5, sanity: new SanityModel(), landmarks: [] };
    const c = createVigilController({
      $, tr, state, progress: { arm() {}, update() {}, snapshot: () => ({ codex: [] }), note: { vigilDone() {} } }, storage: memStorage(), announce() {}, notice() {},
      adjust: (d) => gains.push(d), setSanity() {}, selectNight() {}, syncUi() {}, pushHash() {}, tickNow: () => NIGHT_TICK, skipClock: (m, done) => done(), canPlay: () => true, exit3d() {}, reroll() {}, download() {}, shareLink() {}, reduceMotion: true,
    });
    c.reset();
    return { c };
  })();
  for (const id of ['hearth0', 'hearth0', 'hearth1', 'hearth2', 'hearth3', 'hearth4']) c.lightLamp(id);
  assert.equal(gains.length, 3, 'three lamps, one gain each');
});

test('sandbox lock does not block the controller own endure and creep', () => {
  const { c } = lockHarness();
  c.clue('walls'); c.clue('church-nave');
  assert.equal(c.endure(), true, 'endure uses the controller own dependencies, not the lock');
  assert.equal(c.isLocked(), true, 'night 2 is still a live vigil');
});

test('the lock strings exist in en and fr without em dashes', () => {
  for (const lang of ['en', 'fr']) { assert.ok(STRINGS[lang]['vigil.lock']); assert.ok(!STRINGS[lang]['vigil.lock'].includes('\u2014')); }
});

test('2D lantern markers: only the lanterns this night can use are reachable, the rest are bare sconces', () => {
  const lamps = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `lamp${i}`, pos: [i, 0, 0] }));
  const states = (lit) => lampMarkerStates(lamps, new Set(lit)).map((m) => m.state);
  assert.deepEqual(states([]), ['reachable', 'reachable', 'reachable', 'sconce', 'sconce', 'sconce']);
  assert.deepEqual(states(['lamp4']), ['reachable', 'reachable', 'sconce', 'sconce', 'lit', 'sconce']);
  assert.deepEqual(states(['lamp0', 'lamp1', 'lamp2']), ['lit', 'lit', 'lit', 'sconce', 'sconce', 'sconce']);
  assert.equal(lampMarkerStates(lamps.slice(0, 2), new Set()).filter((m) => m.state === 'reachable').length, 2);
  assert.deepEqual(lampMarkerStates(lamps, new Set()).map((m) => m.id), lamps.map((l) => l.id));
});

test('flame flicker is steady with reduced motion and bounded and deterministic otherwise', () => {
  assert.equal(flameFlicker(1234, 3, true), 1);
  for (let t = 0; t < 5000; t += 137) { const f = flameFlicker(t, 2, false); assert.ok(f >= 0.75 && f <= 1); assert.equal(f, flameFlicker(t, 2, false)); }
});

test('epilogue links: one pure params entry per ending, deterministic and seed driven', async () => {
  const { EPILOGUE_LOOKS, epilogueHref } = await import('../src/vigil-view.js');
  assert.deepEqual(Object.keys(EPILOGUE_LOOKS).sort(), [...VIGIL_ENDING_IDS].sort());
  const sanities = VIGIL_ENDING_IDS.map((id) => EPILOGUE_LOOKS[id].sanity);
  assert.ok(sanities.every((v) => v >= 0 && v <= 100));
  const args = { seed: 1818, nightNumber: 3, gridW: 24, gridD: 24 };
  for (const id of VIGIL_ENDING_IDS) {
    const a = epilogueHref(id, args);
    assert.equal(a, epilogueHref(id, args));
    assert.match(a, new RegExp(`^\\?intro=0&view=3d&caption=0&cam3d=-?[\\d.]+,-?[\\d.]+,-?[\\d.]+,-?[\\d.]+#seed=1818&sanity=${EPILOGUE_LOOKS[id].sanity}&night=3$`));
  }
  assert.notEqual(epilogueHref('dawn', args), epilogueHref('dawn', { ...args, seed: 7 }));
  assert.equal(epilogueHref('nope', args), '');
  assert.ok(EPILOGUE_LOOKS.dawn.sanity > EPILOGUE_LOOKS.witness.sanity && EPILOGUE_LOOKS.vessel.sanity > EPILOGUE_LOOKS.name_spoken.sanity);
});
