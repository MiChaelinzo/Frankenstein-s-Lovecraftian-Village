// Round 34 (spec 169): reality instability parity with Core/RealityInstability.cs plus tier gating, determinism, presentation-only guarantees and en/fr text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseRealityLibrary, realityHouseName, realityFalseVillager, realityContradictionHidden, realityBlurredIdentity, realityLocationLook, realityUnreliable, createRealityView,
  REALITY_NOTE_IDS, HOUSE_TIER,
} from '../src/reality.js';
import { parseSession, serializeSession } from '../src/session.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).reality;
const raw = readFileSync(join(root, 'web', 'data', 'reality.json'), 'utf8'), lib = parseRealityLibrary(raw);
const TIERS = 6, signature = (seed, night, tier) => [
  ...Array.from({ length: golden.houses }, (_, h) => `h${realityHouseName(lib, seed, night, tier, h)}`), `f${realityFalseVillager(lib, seed, night, tier)}`,
  ...golden.pairIds.map((id) => (realityContradictionHidden(seed, night, tier, id) ? 'x' : '-')),
  ...Array.from({ length: golden.villagers }, (_, v) => `b${realityBlurredIdentity(seed, night, tier, v, golden.villagers)}`),
  ...golden.placeIds.map((id) => `l${realityLocationLook(lib, seed, night, tier, id)}`),
].join(',');

test('every alteration matches the Core golden data', () => {
  for (const city of golden.cities) {
    assert.equal(city.nights.length, 9);
    city.nights.forEach((tiers, n) => tiers.forEach((sig, tier) => assert.equal(signature(city.seed, n + 1, tier), sig, `seed ${city.seed} night ${n + 1} tier ${tier}`)));
  }
});

test('the notes match the golden notes in en and fr', () => {
  for (const lang of ['en', 'fr']) assert.deepEqual(lib.notes.map((n) => n[lang]), golden.notes[lang]);
  assert.equal(lib.notes.length, REALITY_NOTE_IDS.length);
});

test('below tier 3 nothing changes', () => {
  const untouched = signature(1, 1, 0);
  for (const seed of [0, 1, 42, 1818, -7]) for (let night = 1; night <= 9; night++) for (let tier = -1; tier < HOUSE_TIER; tier++) {
    assert.equal(signature(seed, night, tier), untouched);
    assert.equal(realityUnreliable(tier), false);
  }
});

test('tiers unlock in order: houses at 3, false villagers at 4, board, identity and places at 5', () => {
  const count = (tier, f) => { let n = 0; for (const seed of [0, 1, 42, 1818, -7]) for (let night = 1; night <= 9; night++) n += f(seed, night, tier); return n; };
  const houses = (s, n, t) => Array.from({ length: 6 }, (_, h) => realityHouseName(lib, s, n, t, h)).filter((k) => k >= 0).length;
  const fake = (s, n, t) => (realityFalseVillager(lib, s, n, t) >= 0 ? 1 : 0);
  const hidden = (s, n, t) => golden.pairIds.filter((id) => realityContradictionHidden(s, n, t, id)).length;
  const blur = (s, n, t) => Array.from({ length: 7 }, (_, v) => realityBlurredIdentity(s, n, t, v, 7)).filter((k) => k >= 0).length;
  const look = (s, n, t) => golden.placeIds.filter((id) => realityLocationLook(lib, s, n, t, id) >= 0).length;
  assert.ok(count(3, houses) > 0); assert.ok(count(5, houses) > count(3, houses));
  assert.equal(count(3, fake), 0); assert.ok(count(4, fake) > 0);
  for (const f of [hidden, blur, look]) { assert.equal(count(4, f), 0); assert.ok(count(5, f) > 0); }
});

test('a blurred identity is never the villager itself', () => {
  for (let night = 1; night <= 9; night++) for (let v = 0; v < 7; v++) { const k = realityBlurredIdentity(42, night, 5, v, 7); if (k >= 0) { assert.notEqual(k, v); assert.ok(k >= 0 && k < 7); } }
  assert.equal(realityBlurredIdentity(1, 1, 5, 0, 1), -1);
});

test('the view alters presentation only, answers truthfully on request and never touches the session save', () => {
  const session = parseSession({ seed: 42, night: 3, board: 'bd1;0,1;c1;', lore: ['a'] }), before = serializeSession(session), names = ['Ada Marsh', 'Bram Thorne', 'Cora Pike', 'Dov Crowe', 'Edda Reeve', 'Finn Salter', 'Gwen Tallow'];
  const view = createRealityView({ lib: () => lib, seed: () => 42, night: () => 3, tier: () => 5, lang: () => 'en' });
  Object.freeze(names);
  const shown = names.map((_, i) => view.shownName(i, names)), places = golden.placeIds.map((id) => view.placeLabel(id, 'Place'));
  assert.ok(shown.some((n, i) => n !== names[i]) || places.some((p) => p !== 'Place') || golden.pairIds.some((id) => view.contradictionHidden(id)), 'tier 5 alters something for this seed and night');
  assert.deepEqual(shown, names.map((_, i) => view.shownName(i, names)), 'deterministic');
  assert.equal(serializeSession(session), before);
  view.setTruth(true);
  assert.deepEqual(names.map((_, i) => view.shownName(i, names)), [...names]);
  assert.equal(view.placeLabel(golden.placeIds[0], 'Place'), 'Place');
  assert.equal(view.houseName(0, 'True House'), 'True House');
  assert.equal(view.falseVillager(), null);
  assert.equal(golden.pairIds.some((id) => view.contradictionHidden(id)), false);
  assert.equal(view.unreliable(), true, 'the badge stays so the player knows the village can lie');
});

test('a tier 2 view changes nothing and has no badge', () => {
  const view = createRealityView({ lib: () => lib, seed: () => 7, night: () => 4, tier: () => 2, lang: () => 'en' });
  assert.equal(view.unreliable(), false); assert.equal(view.active(), false);
  assert.equal(view.houseName(1, 'Home'), 'Home'); assert.equal(view.falseVillager(), null); assert.equal(view.placeLabel('x', 'Label'), 'Label');
});

test('notes are written once per night and kind, in en and fr, with no em dashes', () => {
  let night = 2, language = 'en';
  const view = createRealityView({ lib: () => lib, seed: () => 1, night: () => night, tier: () => 5, lang: () => language });
  const first = view.noteOnce('board');
  assert.match(first, /contradiction/); assert.equal(view.noteOnce('board'), '');
  night = 3; assert.notEqual(view.noteOnce('board'), '');
  language = 'fr'; night = 4; assert.match(view.noteOnce('board'), /contradiction/);
  for (const group of [lib.houseNames, lib.falseVillagers, lib.locationLooks, lib.notes]) for (const e of group) for (const l of ['en', 'fr']) assert.ok(e[l] && !e[l].includes('\u2014'));
});

test('parse names the broken field', () => {
  assert.throws(() => parseRealityLibrary({ houseNames: [] }), /houseNames/);
  assert.throws(() => parseRealityLibrary(null), /root/);
  const bad = JSON.parse(raw); delete bad.notes[0].fr;
  assert.throws(() => parseRealityLibrary(bad), /notes house lacks fr/);
});

test('golden data covers every tier', () => assert.equal(golden.cities[0].nights[0].length, TIERS));
