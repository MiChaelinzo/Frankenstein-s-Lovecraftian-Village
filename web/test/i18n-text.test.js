import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, LANGS } from '../src/i18n.js';
import { StaticNarrationProvider, SafeNarrationProvider, generateCampaign, generateRitual } from '../src/core.js';
import { omenText, entryLabel, describeScene, ritualHudText, nightClampNotice, postcardCaption } from '../src/scene.js';
import { doorMessage, THEMES, CAMERA_LABELS, DOOR_NAMES } from '../src/building.js';
import { DREAD_THRESHOLDS } from '../src/core.js';
import {
  LocalizedNarrationProvider, locName, omenTextL, entryLabelL, doorMessageL, describeSceneL, ritualHudTextL, nightClampNoticeL,
  postcardCaptionL, themeLabel, cameraLabel, doorName, tierLabel,
} from '../src/i18n-text.js';

test('English output equals the original helpers (the Core mirrors stay the source of truth)', () => {
  const ref = new StaticNarrationProvider(), loc = new LocalizedNarrationProvider('en');
  for (const id of [null, undefined, 'church', 'altar', 'well', 'the walls', 'the village', 'house_a'])
    for (const d of [0, 0.1, 0.33, 0.34, 0.5, 0.66, 0.67, 0.9, 1]) assert.equal(loc.narrate(id, d), ref.narrate(id, d), `${id} ${d}`);
  for (const e of [null, { rising: true, name: 'Uneasy', tier: 1 }, { rising: true, name: 'Dire', tier: 2 }, { rising: true, name: 'Abyss', tier: 3 },
    { rising: true, name: 'Odd', tier: 9 }, { rising: false, name: 'Calm', tier: 0 }, { rising: false, name: 'Uneasy', tier: 1 }, { rising: false, name: 'Z', tier: 7 }])
    assert.equal(omenTextL(e, 'en'), omenText(e));
  for (const e of [{ kind: 'omen', text: 'x', sanity: 41.6 }, { kind: 'narration', text: 'y', sanity: 100 }]) assert.equal(entryLabelL(e, 'en'), entryLabel(e));
  for (let b = 0; b < 4; b++) {
    for (const id of ['house_a@1,2', 'house_b@3,4', 'church@0,0', 'a', 'b', 'c', 'd']) assert.equal(doorMessageL(doorMessage(b, id), 'en'), doorMessage(b, id));
    assert.equal(doorName('en', b), DOOR_NAMES[b]);
  }
  for (let tier = 0; tier < 4; tier++) assert.equal(tierLabel('en', tier), DREAD_THRESHOLDS.tierNames[tier]);
  for (let m = 0; m < 3; m++) assert.equal(cameraLabel('en', m), CAMERA_LABELS[m]);
  for (const th of THEMES) assert.equal(themeLabel('en', th), th.label);
  for (const focus of ['', 'well at 3, 4']) {
    assert.equal(describeSceneL({ seed: 5, pieces: 80, tier: 2, dreadPercent: 71, focus }, 'en'),
      describeScene({ seed: 5, pieces: 80, tierName: DREAD_THRESHOLDS.tierNames[2], dreadPercent: 71, focus }));
  }
  for (const seed of [1, 7, 42, 1818]) {
    const c = generateCampaign(seed), r = generateRitual(c);
    for (const p of [0, 10, 40, 70, 100]) {
      assert.equal(ritualHudTextL(r, p, 'en'), ritualHudText(r, p));
      for (const night of [1, 3, 5, 9]) assert.equal(ritualHudTextL(r, p, 'en', night), ritualHudText(r, p, night));
    }
  }
  assert.equal(ritualHudTextL(null, 5, 'en'), '');
  for (const h of ['', '#night=0', '#night=9', '#night=3', '#night=x']) assert.equal(nightClampNoticeL(h, 5, 'en'), nightClampNotice(h, 5));
  const pc = { villageName: 'Innsmouth', seed: 9, night: 2, title: 'The Tide' };
  assert.equal(postcardCaptionL(pc, 'en'), postcardCaption(pc));
});

test('narration is deterministic per language and differs between languages', () => {
  for (const lang of LANGS) {
    const a = new LocalizedNarrationProvider(lang), b = new LocalizedNarrationProvider(lang);
    for (const id of [null, 'church', 'the walls'])
      for (const d of [0, 0.5, 1]) assert.equal(a.narrate(id, d), b.narrate(id, d));
  }
  const en = new LocalizedNarrationProvider('en'), fr = new LocalizedNarrationProvider('fr');
  for (const d of [0, 0.5, 1]) assert.notEqual(en.narrate('church', d), fr.narrate('church', d));
  assert.equal(fr.narrate('church', 0.5), "Quelque chose guette aux fenetres, pres de l'eglise.");
  assert.match(fr.narrate(null, 1), /village/);
});
test('the safe wrapper keeps working with a localized fallback', () => {
  const s = new SafeNarrationProvider({ narrate() { throw new Error('offline'); } }, new LocalizedNarrationProvider('fr'));
  assert.equal(s.narrate(null, 0), STRINGS.fr['narr.calm']);
});
test('french helpers are really translated and never throw on odd input', () => {
  assert.equal(locName('fr', 'well'), 'le puits');
  assert.equal(locName('fr', 'some_thing'), 'some_thing');
  assert.equal(omenTextL({ rising: true, name: 'Abyss', tier: 3 }, 'fr'), STRINGS.fr['omen.rise.Abyss']);
  assert.equal(doorMessageL('The door slams in your face.', 'fr'), STRINGS.fr['door.2.0']);
  assert.equal(doorMessageL('unknown line', 'fr'), 'unknown line');
  assert.match(describeSceneL({ seed: 1, pieces: 2, tier: 3, dreadPercent: 99, focus: '' }, 'fr'), /Effroi 99%, Abime/);
  assert.match(nightClampNoticeL('#night=9', 5, 'fr'), /n'existe pas/);
  assert.equal(entryLabelL({ kind: 'omen', text: 'x', sanity: 3 }, 'fr'), '[raison 3] Presage : x');
});

test('village and investigator descriptions are localized and empty when there is nothing to say', async () => {
  const { describeVillageL, describeInvestigatorL } = await import('../src/i18n-text.js');
  const layout = [{ id: 'church' }, { id: 'house_a' }, { id: 'house_a' }];
  assert.equal(describeVillageL(layout, 'en'), ' The village holds 1 church, 2 house.');
  assert.match(describeVillageL(layout, 'fr'), /2 maison/);
  assert.equal(describeVillageL([], 'en'), '');
  assert.equal(describeInvestigatorL(null, 'en'), '');
  assert.match(describeInvestigatorL({ route: [{ x: 1, z: 2 }, { x: 1, z: 3 }], tick: 0, position: { x: 1, z: 2 } }, 'en'), /at 1, 2, step 1 of 2/);
});
