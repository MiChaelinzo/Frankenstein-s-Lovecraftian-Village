import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaign, generateRitual, VigilState, VIGIL_ENDING_IDS, parseVigilResultCode } from '../src/core.js';
import { STRINGS, t } from '../src/i18n.js';
import { createVigilController } from '../src/vigil-ui.js';
import { SanityModel } from '../src/core.js';
import { pickLamp, LAMP_PICK_RADIUS } from '../src/view3d-math.js';
import {
  objectiveModel, objectiveText, endingModel, endingStatsText, resultText, resultCardFilename, parseEndingsFound, recordEnding, loadEndingsFound,
  drawResultCard, spokenName, ENDINGS_KEY, CARD_WIDTH, CARD_HEIGHT,
} from '../src/vigil-view.js';

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
    canPlay: () => true, exit3d() {}, reroll() {}, download() {}, shareLink() {}, reduceMotion: false,
  });
  c.reset();
  c.clue('a'); c.clue('b');
  c.endure();
  await new Promise((r) => setTimeout(r, 5));
  c.reset();
  await new Promise((r) => setTimeout(r, 1800));
  assert.ok(!$('ending').opened, 'ending dialog opened after reset');
});
