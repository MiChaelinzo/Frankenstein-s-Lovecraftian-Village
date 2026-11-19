import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, generateCampaign, InteractionRules } from '../src/core.js';
import { MINUTES_PER_DAY, PHASE_LENGTHS, wrapTick, dayNumber, phaseAt, daylightPercent, lanternsLit, SESSION_START_TICK } from '../src/clock.js';
import {
  ROLE_IDS, generateRoster, scheduledKind, scheduledPlace, behaviorAt, locationAt, talk, chat, CHAT_TOPICS, lineKey, causeOf, LINE_VARIANTS,
  carriesLitLantern,
} from '../src/villagers.js';
import { standingPoint, presenceAt } from '../src/villager-view.js';
import { villagerTalkCountsAsClue } from '../src/core.js';
import { STRINGS } from '../src/i18n.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';

const here = dirname(fileURLToPath(import.meta.url));
const fullGolden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')), golden = fullGolden.villagers;
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
const PRESENCE_TICKS = [0, 3, 130.5, 300.25, 700, 845, 1085.5, 1100, 1270.5, 1380, 1439.5, 1445], PRESENCE_DREADS = [0, 0.2, 0.67, 1];
const num = (d) => (typeof d === 'string' ? Number(d) : d);

test('clock matches C# GameClock', () => {
  assert.deepEqual([...PHASE_LENGTHS, MINUTES_PER_DAY], golden.clockConstants);
  assert.equal(SESSION_START_TICK, golden.sessionStart);
  for (const [tick, wrapped, day, phase, light, lit] of golden.clock) {
    assert.equal(wrapTick(tick), wrapped, `wrap ${tick}`);
    assert.equal(dayNumber(tick), day, `day ${tick}`);
    assert.equal(phaseAt(tick), phase, `phase ${tick}`);
    assert.equal(daylightPercent(tick), light, `light ${tick}`);
    assert.equal(lanternsLit(tick) ? 1 : 0, lit, `lantern ${tick}`);
  }
});

test('clue and talk sanity rules match C#', () => {
  for (const [disposition, behavior, clue, delta] of golden.clueRule) {
    assert.equal(villagerTalkCountsAsClue(disposition, behavior) ? 1 : 0, clue, `${disposition}/${behavior}`);
    assert.equal(InteractionRules.talkSanityDelta(behavior, disposition % 2 === 0), delta);
  }
});

test('roster, schedule, locations and talk match C# for every golden seed', () => {
  for (const w of golden.worlds) {
    const layout = generateLayout(catalog, 24, 24, 40, w.seed);
    const roster = generateRoster(w.seed, layout);
    assert.deepEqual(roster.map((v) => [v.name, v.role, v.disposition, v.homeIndex, v.workIndex]), w.roster, `roster ${w.seed}`);
    assert.deepEqual(roster.map((v) => [0, 1, 2, 3].map((p) => scheduledKind(v, p))), w.schedule, `schedule ${w.seed}`);
    const campaign = generateCampaign(w.seed, 5);
    const locations = [];
    const talks = [];
    const chats = [];
    for (const v of roster) for (const t of golden.ticks) for (const raw of golden.dreads) {
      const d = num(raw);
      const place = locationAt(v, t, d);
      locations.push([behaviorAt(v, t, d), place.kind, place.pieceIndex]);
      const night = 1 + (v.index + t) % 7;
      const r = talk(w.seed, v, t, d, campaign, night);
      const topic = (v.index + night) % CHAT_TOPICS, cluesLeft = (v.index + t) % 3, lampsLeft = (v.index + night) % 2, sanity = 50 - 10 + 20 * (v.index % 2);
      const c = chat(w.seed, v, t, d, night, topic, cluesLeft, lampsLeft, sanity);
      chats.push([night, topic, cluesLeft, lampsLeft, sanity, c.available ? 1 : 0, c.topic, c.hintId, c.lineVariant]);
      talks.push([night, r.available ? 1 : 0, r.behavior, r.yieldsClue ? 1 : 0, r.clueId, r.sanityDelta, r.lineVariant, r.rumor]);
    }
    assert.deepEqual(locations, w.locations, `locations ${w.seed}`);
    assert.deepEqual(talks, w.talks, `talks ${w.seed}`);
    assert.deepEqual(chats, w.chats, `chats ${w.seed}`);
    assert.deepEqual(roster.flatMap((v) => golden.ticks.map((t) => (carriesLitLantern(v, t) ? 1 : 0))), w.lanterns, `lanterns ${w.seed}`);
    const presence = [];
    for (const v of roster) for (const t of PRESENCE_TICKS) for (const d of PRESENCE_DREADS) {
      const r = presenceAt(roster, v, t, d, layout, 24, 24, w.seed);
      presence.push([r.gone ? 1 : 0, r.walking ? 1 : 0, r.indoors ? 1 : 0, r.stop, r.placeKind, r.x, r.z, r.faceDx, r.faceDz, r.stride, r.fade]);
    }
    assert.equal(presence.length, w.presence.length, `presence rows ${w.seed}`);
    presence.forEach((row, i) => row.forEach((x, j) => assert.ok(Math.abs(x - w.presence[i][j]) < 1e-9, `presence ${w.seed} row ${i} col ${j}: ${x} vs ${w.presence[i][j]}`)));
    const stand = [];
    for (const v of roster) for (let k = 0; k <= 3; k++) { const pt = standingPoint(v, k, layout, 24, 24, w.seed); stand.push([k, pt.x, pt.z, pt.faceDx, pt.faceDz]); }
    assert.equal(stand.length, w.stand.length);
    stand.forEach((row, i) => row.forEach((x, j) => assert.ok(Math.abs(x - w.stand[i][j]) < 1e-9, `stand ${w.seed} ${i}.${j}: ${x} vs ${w.stand[i][j]}`)));
  }
});

test('behavior is monotonic in dread, vanishes at Abyss and is normal by day at low dread', () => {
  const layout = generateLayout(catalog, 24, 24, 40, 42);
  for (const v of generateRoster(42, layout)) {
    for (const t of [0, 300, 900, 1100, 1300]) {
      let prev = -1;
      for (const d of [0, 0.1, 0.2, 0.33, 0.34, 0.5, 0.66, 0.67, 0.89, 0.9, 1]) {
        const b = behaviorAt(v, t, d);
        assert.ok(b >= prev);
        prev = b;
        assert.equal(b === 4, d >= 0.9);
      }
      assert.equal(locationAt(v, t, 1).kind, 4);
    }
    for (let t = 0; t < MINUTES_PER_DAY; t += 10) {
      if (phaseAt(t) > 1) continue;
      assert.equal(behaviorAt(v, t, 0.33), 0);
      assert.deepEqual(locationAt(v, t, 0.33), scheduledPlace(v, t));
    }
  }
});

test('talk never reads display text and vanished villagers are silent', () => {
  const layout = generateLayout(catalog, 24, 24, 40, 7);
  const v = generateRoster(7, layout)[0];
  const before = talk(7, v, 1000, 0.6, null, 2);
  assert.deepEqual(before, talk(7, v, 1000, 0.6, null, 2));
  assert.equal(before.rumor, '');
  const gone = talk(7, v, 1000, 1, null, 2);
  assert.deepEqual([gone.available, gone.yieldsClue, gone.sanityDelta, gone.clueId], [false, false, 0, '']);
  for (let b = 0; b < 5; b++) assert.ok(causeOf(b).length > 0);
});

test('every role and behavior has a line in en and fr, and en and fr define the same villager keys', () => {
  const keys = (lang) => Object.keys(STRINGS[lang]).filter((k) => k.startsWith('villager.')).sort();
  assert.deepEqual(keys('en'), keys('fr'));
  for (const lang of ['en', 'fr']) {
    for (let role = 0; role < ROLE_IDS.length; role++) {
      assert.ok(STRINGS[lang][`villager.role.${ROLE_IDS[role]}`]);
      for (let b = 0; b < 5; b++) for (let variant = 0; variant < LINE_VARIANTS; variant++) {
        assert.ok(STRINGS[lang][lineKey({ role }, b, variant)], `${lang} ${role} ${b} ${variant}`);
      }
    }
  }
});

test('chat is deterministic, wraps topics and only lucid villagers hint', () => {
  const v = generateRoster(7, generateLayout(catalog, 24, 24, 40, 7))[0];
  assert.deepEqual(chat(7, v, 1000, 0.1, 2, 4, 1, 1, 10), chat(7, v, 1000, 0.1, 2, 4, 1, 1, 10));
  assert.equal(chat(7, v, 1000, 0.1, 2, -2, 1, 1, 10).topic, 2);
  assert.equal(chat(7, v, 1000, 0.1, 2, 3, 1, 1, 10).hintId, 'village');
  assert.equal(chat(7, v, 1000, 0.1, 2, 7, 1, 1, 10).topic, 3);
  assert.equal(chat(7, v, 1000, 0.1, 2, 0, 0, 1, 10).hintId, 'clues_done');
  assert.equal(chat(7, v, 1000, 0.1, 2, 2, 0, 0, 10).hintId, 'sanity_low');
  assert.equal(chat(7, v, 1000, 0.6, 2, 0, 1, 1, 10).hintId, '', 'a restless villager gives no hint');
  assert.equal(chat(7, v, 1000, 1, 2, 0, 1, 1, 10).available, false);
});

test('presence on the 36 by 36 city matches C# (the scale where villagers used to vanish)', () => {
  const cat = new PrefabCatalog(JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
  for (const c of fullGolden.cityPresence.cases) {
    const layout = generateCityLayout(cat, CITY_GRID, CITY_GRID, CITY_PIECES, c.seed), roster = generateRoster(c.seed, layout), rows = [];
    for (const v of roster) for (const t of PRESENCE_TICKS) for (const d of PRESENCE_DREADS) {
      const r = presenceAt(roster, v, t, d, layout, CITY_GRID, CITY_GRID, c.seed);
      rows.push([r.gone ? 1 : 0, r.walking ? 1 : 0, r.indoors ? 1 : 0, r.stop, r.placeKind, r.x, r.z, r.faceDx, r.faceDz, r.stride, r.fade]);
    }
    assert.equal(rows.length, c.presence.length, `city rows ${c.seed}`);
    rows.forEach((row, i) => row.forEach((x, j) => assert.ok(Math.abs(x - c.presence[i][j]) < 1e-9, `city ${c.seed} row ${i} col ${j}: ${x} vs ${c.presence[i][j]}`)));
  }
});
