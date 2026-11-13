import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, generateCampaign, InteractionRules } from '../src/core.js';
import { MINUTES_PER_DAY, PHASE_LENGTHS, wrapTick, dayNumber, phaseAt, daylightPercent, lanternsLit } from '../src/clock.js';
import {
  ROLE_IDS, generateRoster, scheduledKind, scheduledPlace, behaviorAt, locationAt, talk, lineKey, causeOf, LINE_VARIANTS,
} from '../src/villagers.js';
import { standingPoint } from '../src/villager-view.js';
import { villagerTalkCountsAsClue } from '../src/core.js';
import { STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).villagers;
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
const num = (d) => (typeof d === 'string' ? Number(d) : d);

test('clock matches C# GameClock', () => {
  assert.deepEqual([...PHASE_LENGTHS, MINUTES_PER_DAY], golden.clockConstants);
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
    for (const v of roster) for (const t of golden.ticks) for (const raw of golden.dreads) {
      const d = num(raw);
      const place = locationAt(v, t, d);
      locations.push([behaviorAt(v, t, d), place.kind, place.pieceIndex]);
      const night = 1 + (v.index + t) % 7;
      const r = talk(w.seed, v, t, d, campaign, night);
      talks.push([night, r.available ? 1 : 0, r.behavior, r.yieldsClue ? 1 : 0, r.clueId, r.sanityDelta, r.lineVariant, r.rumor]);
    }
    assert.deepEqual(locations, w.locations, `locations ${w.seed}`);
    assert.deepEqual(talks, w.talks, `talks ${w.seed}`);
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
