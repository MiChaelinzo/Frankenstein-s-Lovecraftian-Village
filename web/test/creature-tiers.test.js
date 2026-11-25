import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { phaseStart, MINUTES_PER_DAY } from '../src/clock.js';
import {
  parseCreatureCatalog, selectAppearances, tierUnlocked, appearanceVisible, wardTurns, directorInputFor, witnessClueId, isWitnessClue,
  CreatureEncounter, GLIMPSE_REDUCED_SECONDS, GLIMPSE_SECONDS, MAX_GLIMPSE_SECONDS, GLIMPSE_COOLDOWN_TICKS, TIER_WARD_ACTIONS,
} from '../src/creatures.js';
import { causeHolds, CAUSE_IDS } from '../src/director.js';
import { CELL_M } from '../src/dressing.js';
import { insideAnyPlace } from '../src/places.js';
import { knowledgeSources } from '../src/investigation.js';
import { parsePlaceLibrary, placeAll } from '../src/places.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).creatureTiers;
const cat = parseCreatureCatalog(readFileSync(join(root, 'web', 'data', 'creatures.json'), 'utf8'));
const placeLib = parsePlaceLibrary(readFileSync(join(root, 'web', 'data', 'places.json'), 'utf8'));
const loadPlaces = () => ({ all: (seed, w, d) => placeAll(placeLib, seed, w, d) });
const SCENARIOS = ['calm', 'corrupted', 'knowing', 'cosmic', 'place_reduced'];
const DAWN = 0, DAY = 1, DUSK = 2, NIGHT = 3;
const tick = (day, phase) => day * MINUTES_PER_DAY + phaseStart(phase) + 5;

function scenario(index, seed, t) {
  const c = { seed, gridW: 24, gridD: 24, tick: t, dreadPercent: 80, societyStage: 0, corruptedVillager: -1, knowledgeTier: 0, cosmicOmens: 0, placeId: '', lastGlimpseTick: -1, reducedMotion: false };
  if (index >= 1) { c.societyStage = 2; c.corruptedVillager = 3; }
  if (index >= 2) c.knowledgeTier = 3;
  if (index >= 3) { c.knowledgeTier = 5; c.cosmicOmens = 1; }
  if (index === 4) { c.knowledgeTier = 3; c.cosmicOmens = 0; c.placeId = 'manor'; c.reducedMotion = true; }
  return c;
}
function over(index, seed, days, places = null) {
  const all = [];
  for (let d = 0; d < days; d++) for (const p of [DAWN, DAY, DUSK, NIGHT]) all.push(...selectAppearances(scenario(index, seed, tick(d, p)), cat, places));
  return all;
}
const r3 = (v) => String(Math.round(v * 1000) / 1000);
const describe = (a) => `${a.defId}@${r3(a.x)},${r3(a.z)},s${r3(a.seconds)},m${a.still ? 1 : 0},${a.cause},v${a.subject},p${a.placeId}`;

test('golden: the data digest and every seeded run match Core', () => {
  const defs = cat.manifestations.map((m) => [m.id, m.tier, m.minDread, m.phase, m.society, m.knowledge, m.omens, m.context, m.chance, m.cause, m.ward]);
  assert.deepEqual(defs, golden.defs);
  const places = loadPlaces();
  for (const [seed, name, slots] of golden.runs) {
    const sc = SCENARIOS.indexOf(name), got = [];
    const placed = places.all(seed, 24, 24);
    for (let d = 0; d < 3; d++) for (const p of [DAWN, DAY, DUSK, NIGHT]) got.push(selectAppearances(scenario(sc, seed, tick(d, p)), cat, placed).map(describe).join(';'));
    assert.deepEqual(got, slots, `${name} seed ${seed}`);
  }
});

test('data: four tiers, both languages, valid causes, honest ward kinds, no em dash', () => {
  assert.deepEqual([...new Set(cat.manifestations.map((m) => m.tier))].sort(), [1, 2, 3, 4]);
  for (const m of cat.manifestations) {
    assert.ok(CAUSE_IDS.includes(m.cause));
    assert.equal(m.ward, m.tier === 1 ? 'warded' : m.tier === 2 ? 'avoided' : 'witnessed');
    for (const lang of ['en', 'fr']) assert.ok(!`${m.names[lang]}${m.texts[lang]}${m.witness[lang]}`.includes('\u2014'));
  }
  const bad = readFileSync(join(root, 'web', 'data', 'creatures.json'), 'utf8').replace('"cause": "nightfall"', '"cause": "boredom"');
  assert.throws(() => parseCreatureCatalog(bad), /watcher_at_wall/);
});

test('no tier unlocks before its condition, and every tier can appear once it holds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const a of over(0, seed, 6)) assert.equal(a.tier, 1);
    for (const a of over(1, seed, 6)) assert.ok(a.tier <= 2);
    for (const a of over(2, seed, 6)) assert.ok(a.tier <= 3);
  }
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) for (const a of over(3, seed, 6)) seen.add(a.tier);
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('stage order: tier order, one per tier per phase', () => {
  for (let seed = 1; seed <= 40; seed++) for (const p of [DUSK, NIGHT]) {
    const tiers = selectAppearances(scenario(3, seed, tick(1, p)), cat).map((a) => a.tier);
    assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
    assert.equal(new Set(tiers).size, tiers.length);
  }
});

test('same seed, same appearances; different seeds vary', () => {
  const key = (seed) => over(3, seed, 5).map((a) => `${a.defId}@${a.x},${a.z}`).join('|');
  assert.equal(key(7), key(7));
  assert.ok(new Set([...Array(12).keys()].map((i) => key(i + 1))).size > 6);
});

test('tier 4 exposure is bounded and rests for two days', () => {
  const glimpses = [];
  for (let seed = 1; seed <= 80; seed++) glimpses.push(...over(3, seed, 4).filter((a) => a.tier === 4));
  assert.ok(glimpses.length > 0);
  for (const g of glimpses) {
    assert.ok(g.seconds > 0.1 && g.seconds <= MAX_GLIMPSE_SECONDS);
    assert.ok(appearanceVisible(g, 0));
    assert.ok(!appearanceVisible(g, MAX_GLIMPSE_SECONDS));
    assert.ok(!appearanceVisible(g, 60));
  }
  const c = scenario(3, 1, tick(2, NIGHT)), def = cat.manifestations.find((m) => m.tier === 4);
  assert.ok(tierUnlocked(def, c));
  assert.ok(!tierUnlocked(def, { ...c, lastGlimpseTick: c.tick - 10 }));
  assert.ok(tierUnlocked(def, { ...c, lastGlimpseTick: c.tick - GLIMPSE_COOLDOWN_TICKS }));
});

test('reduced motion is still and shorter', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const a of over(3, seed, 4)) assert.equal(a.still, false);
    for (const a of selectAppearances({ ...scenario(3, seed, tick(1, NIGHT)), reducedMotion: true }, cat)) { assert.equal(a.still, true); if (a.tier === 4) assert.equal(a.seconds, GLIMPSE_REDUCED_SECONDS); }
  }
  assert.ok(GLIMPSE_REDUCED_SECONDS < GLIMPSE_SECONDS);
});

test('every appearance has a cause the director accepts; idle, unknown and relief causes are rejected', () => {
  for (let seed = 1; seed <= 30; seed++) for (let sc = 0; sc < SCENARIOS.length; sc++) for (const a of over(sc, seed, 4)) {
    assert.ok(a.cause);
    assert.ok(causeHolds(a.cause, directorInputFor(scenario(sc, seed, tick(0, NIGHT)))), a.defId);
  }
  const x = { tick: tick(0, NIGHT), sanity: 1000, stress: 0, cultExposure: 0, knowledge: 0, encounters: 0 };
  for (const c of ['', 'boredom', 'omen_passed', 'cult_exposure', 'forbidden_knowledge']) assert.equal(causeHolds(c, x), false, c);
  assert.equal(causeHolds('nightfall', x), true);
  assert.equal(causeHolds('cult_exposure', { ...x, cultExposure: 250 }), true);
});

test('a cause that does not hold drops the appearance and is reported', () => {
  const broken = { ...cat, manifestations: cat.manifestations.map((m) => (m.tier === 1 ? { ...m, cause: 'forbidden_knowledge' } : m)) };
  const rejected = []; let shown = 0;
  for (let seed = 1; seed <= 60; seed++) shown += selectAppearances(scenario(0, seed, tick(1, NIGHT)), broken, null, rejected).length;
  assert.equal(shown, 0);
  assert.ok(rejected.length > 0 && rejected[0].includes('does not hold'));
});

test('village appearances stay out of places; place entries need a place', () => {
  const lib = loadPlaces();
  for (const seed of [1, 42, 1818]) {
    const placed = lib.all(seed, 24, 24);
    assert.ok(placed.length > 0);
    for (const a of over(3, seed, 8, placed).filter((x) => !x.placeId)) assert.equal(insideAnyPlace(placed, a.x, a.z), false, a.defId);
  }
  for (const m of cat.manifestations) {
    const village = scenario(3, 1, tick(1, NIGHT)), inside = { ...village, placeId: 'manor' };
    if (m.context === 'place') { assert.ok(!tierUnlocked(m, village)); assert.ok(tierUnlocked(m, inside)); }
    if (m.context === 'village') { assert.ok(tierUnlocked(m, village)); assert.ok(!tierUnlocked(m, inside)); }
  }
});

test('warding covers tier 1 only; witness clues add no knowledge', () => {
  for (const tier of [1, 2, 3, 4]) {
    const a = { tier, ward: tier === 1 ? 'warded' : tier === 2 ? 'avoided' : 'witnessed' };
    for (const action of TIER_WARD_ACTIONS) assert.equal(wardTurns(a, action), tier === 1);
    assert.equal(wardTurns(a, 'prayer'), false);
  }
  const e = { clueIds: new Set([witnessClueId('familiar_face')]), booksRead: new Set(), met: new Set(), heard: [] };
  assert.ok(isWitnessClue(witnessClueId('x')));
  assert.equal(knowledgeSources(e, null).length, 0);
  e.clueIds.add('book@b39');
  assert.equal(knowledgeSources(e, null).length, 1);
});

test('the doubled villager keeps subject -1 without a corrupted villager and tier 2 stays locked', () => {
  let doubled = 0;
  for (let seed = 1; seed <= 20; seed++) for (let d = 0; d < 8; d++) for (const p of [DAWN, DAY, DUSK, NIGHT]) {
    const c = scenario(2, seed, tick(d, p));
    c.corruptedVillager = -5;
    for (const a of selectAppearances(c, cat, null)) {
      assert.notEqual(a.tier, 2);
      if (a.defId === 'doubled_villager') { doubled++; assert.equal(a.subject, -1); }
    }
  }
  assert.ok(doubled > 0);
  const c = scenario(2, 1, tick(0, NIGHT));
  c.corruptedVillager = -1;
  assert.equal(tierUnlocked(cat.manifestations.find((m) => m.id === 'doubled_villager'), c), true);
  for (const m of cat.manifestations.filter((x) => x.tier === 2)) assert.equal(tierUnlocked(m, c), false, m.id);
});

test('creature homes fall back to an open lattice point when every redraw is blocked', () => {
  const w = 24 * CELL_M, blocked = (x) => x >= w / 8;
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const t = phaseStart(NIGHT) + 60;
    const enc = CreatureEncounter.spawn(seed, 24, 24, t, 1.0, 'fog', cat, blocked), again = CreatureEncounter.spawn(seed, 24, 24, t, 1.0, 'fog', cat, blocked);
    enc.creatures.forEach((c, k) => {
      assert.equal(c.homeX, again.creatures[k].homeX);
      if (cat.defs.find((d) => d.id === c.defId).habitat !== 'fog') return;
      checked++;
      assert.equal(blocked(c.homeX), false, `seed ${seed} ${c.defId}`);
    });
  }
  assert.ok(checked > 0);
});

test('a fully blocked village still gives deterministic, finite homes (land homes inside the map)', () => {
  const w = 24 * CELL_M, blocked = () => true;
  for (let seed = 1; seed <= 20; seed++) {
    const t = phaseStart(NIGHT) + 60;
    const a = CreatureEncounter.spawn(seed, 24, 24, t, 1.0, 'fog', cat, blocked), b = CreatureEncounter.spawn(seed, 24, 24, t, 1.0, 'fog', cat, blocked);
    assert.deepEqual(a.creatures.map((c) => [c.homeX, c.homeZ]), b.creatures.map((c) => [c.homeX, c.homeZ]));
    for (const c of a.creatures) {
      assert.ok(Number.isFinite(c.homeX) && Number.isFinite(c.homeZ), `seed ${seed}`);
      if (cat.defs.find((d) => d.id === c.defId).habitat === 'fog') assert.ok(c.homeX >= 0 && c.homeX <= w && c.homeZ >= 0 && c.homeZ <= w, `seed ${seed}`);
    }
  }
});
