import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateCampaign, generateRitual, SanityModel, InteractionRules, SeededRandom,
  clueTarget, sourcesOffered, nightCreep, totalClues, sanityPoints, nameReveal, endingFor, vigilScore, vigilRank,
  parseVigilResultCode, vigilResultCode, VigilState, VIGIL_ENDING_IDS, VIGIL_EPITAPHS, VIGIL_LAMPS_PER_NIGHT, VIGIL_HIDDEN_LETTER,
} from '../src/core.js';
import { STRINGS } from '../src/i18n.js';

const make = (seed, nights) => {
  const campaign = generateCampaign(seed, nights);
  return { campaign, ritual: generateRitual(campaign) };
};

/** Same scripted careful/reckless players as VigilPlayer in the C# tests. */
function play(seed, nights, careful) {
  const { campaign, ritual } = make(seed, nights);
  const v = new VigilState(campaign, ritual);
  let sanity = new SanityModel(v.sanity);
  const rng = new SeededRandom(seed ^ 0x51ed);
  for (let night = 1; night <= campaign.nights.length && !v.isFinished; night++) {
    let lamp = 0;
    const report = () => v.recordSanity(sanityPoints(sanity.value));
    sanity.apply(-nightCreep(night));
    report();
    for (let s = 0; s < clueTarget(night) && !v.isFinished; s++) {
      if (careful) {
        while (!v.isFinished && v.sanity < 55 && lamp < VIGIL_LAMPS_PER_NIGHT) {
          if (v.lightLantern(`lamp${night}_${lamp++}`)) { sanity.apply(InteractionRules.sanityDelta('candle')); report(); }
        }
      }
      const kind = careful && rng.next(3) === 0 ? 'landmark' : 'whisper';
      v.recordClue(`src${night}_${s}`);
      sanity.apply(InteractionRules.sanityDelta(kind));
      report();
    }
    if (v.isFinished) break;
    const next = v.endureNight(sanityPoints(sanity.value));
    if (next >= 0) sanity = new SanityModel(next);
  }
  return v;
}

test('every end state maps to one ending and the priority holds', () => {
  for (const sanity of [0, 1, 49, 50, 51, 100]) {
    for (const collapsed of [false, true]) for (const named of [false, true]) for (const complete of [false, true]) {
      const id = endingFor(sanity, collapsed, named, complete);
      assert.equal(VIGIL_ENDING_IDS.filter((e) => e === id).length, 1);
      assert.equal(id === 'hollowing', collapsed || sanity === 0);
    }
  }
  assert.equal(VIGIL_EPITAPHS.length, VIGIL_ENDING_IDS.length);
});

test('clues and lanterns count once per night and bad ids are refused', () => {
  const { campaign, ritual } = make(7, 3);
  const v = new VigilState(campaign, ritual);
  assert.equal(v.recordClue('well'), true);
  assert.equal(v.recordClue('well'), false);
  assert.equal(v.lightLantern('lamp'), true);
  assert.equal(v.lightLantern('lamp'), false);
  for (const bad of [null, '', 'a;b', 'a,b', 5]) assert.equal(v.recordClue(bad), false);
  assert.equal(v.clues, 1);
  assert.equal(v.lanterns, 1);
});

test('endureNight is gated and sanity zero collapses', () => {
  const { campaign, ritual } = make(11, 3);
  const v = new VigilState(campaign, ritual);
  assert.equal(v.canEndureNight, false);
  assert.equal(v.endureNight(80), -1);
  for (let i = 0; i < v.clueTarget; i++) v.recordClue(`s${i}`);
  assert.equal(v.endureNight(80), 88);
  assert.equal(v.night, 2);
  v.recordSanity(0);
  assert.equal(v.outcome(0).endingId, 'hollowing');
  assert.equal(v.recordClue('late'), false);
});

test('name reveal is monotonic and whole at the total', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const { ritual } = make(seed * 977, 1 + (seed % 9));
    const total = totalClues(ritual.stages.length);
    let prev = nameReveal(ritual, 0, total);
    for (let f = 1; f <= total + 2; f++) {
      const cur = nameReveal(ritual, f, total);
      for (let i = 0; i < cur.length; i++) assert.ok(prev[i] === cur[i] || prev[i] === VIGIL_HIDDEN_LETTER, `seed ${seed}`);
      prev = cur;
    }
    assert.equal(prev, ritual.name);
  }
});

test('result code round trips and malformed codes are rejected', () => {
  for (const seed of [0, 5, -7, 2147483647, -2147483647]) for (const e of VIGIL_ENDING_IDS) {
    assert.deepEqual(parseVigilResultCode(vigilResultCode(seed, e, 99)), { seed, endingId: e, score: 99 });
  }
  for (const bad of [null, '', 'V1-5-dawn', 'V1-5-nobody-10', 'V1-5-dawn-+10', 'V1-05-dawn-10', 'V1--0-dawn-10', 'V1-5-dawn-010', 'V1-99999999999-dawn-10']) {
    assert.equal(parseVigilResultCode(bad), null, String(bad));
  }
});

test('save string round trips and bad input leaves the state unchanged', () => {
  const a = play(42, 5, true);
  const { campaign, ritual } = make(0, 5);
  const b = new VigilState(campaign, ritual);
  assert.equal(b.tryRestore(a.serialize()), true);
  assert.equal(b.serialize(), a.serialize());
  const before = b.serialize();
  for (const bad of [null, '', 'vigil2;0;50;50;0;0;;', 'vigil1;9;50;50;0;0;;', 'vigil1;0;101;50;0;0;;', 'vigil1;0;50;60;0;0;;', 'vigil1;0;50;50;1;0;a,a;']) {
    assert.equal(b.tryRestore(bad), false, String(bad));
  }
  assert.equal(b.serialize(), before);
});

test('balance: careful players finish, reckless players collapse', () => {
  let finished = 0, named = 0, collapsed = 0;
  const seeds = 200;
  for (let seed = 1; seed <= seeds; seed++) {
    const c = play(seed * 31, 5, true);
    if (c.isFinished && !c.isCollapsed) finished++;
    if (c.outcome(0).endingId === 'name_spoken') named++;
    if (play(seed * 31, 5, false).isCollapsed) collapsed++;
  }
  assert.ok(finished * 100 >= seeds * 90, `finished ${finished}`);
  assert.ok(named * 100 >= seeds * 30 && named * 100 <= seeds * 80, `named ${named}`);
  assert.ok(collapsed * 100 > seeds * 50, `collapsed ${collapsed}`);
});

test('score grows with clues and lanterns; ranks follow thresholds', () => {
  assert.ok(vigilScore(4, 1, 50, 2, 3, 'dawn') > vigilScore(3, 1, 50, 2, 3, 'dawn'));
  assert.ok(vigilScore(3, 2, 50, 2, 3, 'dawn') > vigilScore(3, 1, 50, 2, 3, 'dawn'));
  assert.ok(vigilScore(3, 1, 50, 2, 3, 'name_spoken') > vigilScore(3, 1, 50, 2, 3, 'dawn'));
  assert.equal(vigilRank(0), 0);
  assert.equal(vigilRank(1e9), 4);
  assert.equal(sourcesOffered(3), clueTarget(3) + 2);
});

test('endings, ranks and achievements have en and fr strings', () => {
  for (const lang of ['en', 'fr']) {
    for (const id of VIGIL_ENDING_IDS) assert.ok(STRINGS[lang][`vigil.ending.${id}`], `${lang} ${id}`);
    for (let i = 0; i < 5; i++) assert.ok(STRINGS[lang][`vigil.rank.${i}`], `${lang} rank ${i}`);
  }
  for (let i = 0; i < VIGIL_ENDING_IDS.length; i++) assert.equal(STRINGS.en[`vigil.ending.${VIGIL_ENDING_IDS[i]}`], VIGIL_EPITAPHS[i]);
});
