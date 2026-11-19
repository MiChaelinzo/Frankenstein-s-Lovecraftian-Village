import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout } from '../src/core.js';
import { Inventory, ItemWorld, parseItemCatalog, PLAYER_SLOTS } from '../src/inventory.js';
import { growPlotEdge, corruptionLevel, CORRUPTION_LEVELS } from '../src/dressing.js';
import { MINUTES_PER_DAY, SESSION_START_TICK } from '../src/clock.js';
import { parseHomesteadCatalog, Homestead, HomesteadPlot, STAGE_PLANTED, STAGE_SPROUT, STAGE_RIPE, BLIGHT_LEVEL, DAILY_SANITY_CAP, BED_COUNT } from '../src/homestead.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).homestead;
const text = readFileSync(join(root, 'web', 'data', 'homestead.json'), 'utf8');
const items = parseItemCatalog(readFileSync(join(root, 'web', 'data', 'items.json'), 'utf8'));
const cat = parseHomesteadCatalog(text, items);
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);
const r3 = (v) => String(Math.round(v * 1000) / 1000);
const DAY = MINUTES_PER_DAY, T = SESSION_START_TICK;

function village(seed, grid) {
  const layout = generateLayout(catalog, grid, grid, grid === 24 ? 40 : 20, seed);
  return new Homestead(cat, HomesteadPlot.create(seed, grid, grid, layout, ItemWorld.create(seed, grid, grid, layout, items)));
}
function ready() { const h = village(1818, 24), p = new Inventory(PLAYER_SLOTS); assert.ok(h.available); assert.ok(h.claim(0, p, items).ok); return [h, p]; }

test('drift: the web data file is a byte copy of the package data file; en and fr texts exist with no em dash', () => {
  assert.equal(text, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'homestead.json'), 'utf8'));
  for (const d of [...cat.crops, ...cat.structures, ...cat.residents]) for (const l of ['en', 'fr']) { assert.ok(d.texts[l].length >= 30 && d.texts[l].length <= 240, `${d.id} ${l}`); assert.ok(!d.texts[l].includes('\u2014')); }
  assert.equal(cat.crops.filter((c) => c.kind === 'eldritch').length, 3);
  assert.equal(cat.residents.filter((r) => r.group === 'pet').length, 3);
});

test('malformed data names the offending entry', () => {
  assert.throws(() => parseHomesteadCatalog({}, items), /starter/);
  assert.throws(() => parseHomesteadCatalog(text.replace('"seed": "seed_kelp"', '"seed": "nope"'), items), /kelp/);
  assert.throws(() => parseHomesteadCatalog(text.replace('"shelter": "trough"', '"shelter": "moat"'), items), /jar_tentacle/);
});

test('data digest, plots and plot edge corruption match C#', () => {
  const defs = [];
  for (const c of cat.crops) defs.push(`crop ${c.id} ${c.kind} ${c.seedItem} ${c.harvestItem} ${c.growDays} ${c.yield}`);
  for (const s of cat.structures) defs.push(`structure ${s.id} ${s.cost}`);
  for (const r of cat.residents) defs.push(`animal ${r.id} ${r.group} ${r.foodItem} ${r.shelter} ${r.fedDays} ${r.sanity} ${r.produce || '-'} ${r.every} ${r.cap} ${r.count}`);
  for (const s of cat.starter) defs.push(`starter ${s.id} ${s.count}`);
  assert.deepEqual(defs, golden.defs);
  for (const v of golden.plots) {
    const h = village(v.seed, v.grid), p = h.plot;
    assert.equal(p.exists ? 1 : 0, v.exists, `${v.seed}/${v.grid}`);
    assert.deepEqual([r3(p.originX), r3(p.originZ)], v.origin.map(String).map((s) => r3(Number(s))));
    assert.deepEqual([r3(p.dir[0]), r3(p.dir[1])], v.dir.map((n) => r3(n)));
    assert.deepEqual(p.exists ? [r3(p.beds[5][0]), r3(p.beds[5][1])] : [], v.bed5.map((n) => r3(n)));
    const edge = Array.from({ length: CORRUPTION_LEVELS + 1 }, (_, level) => growPlotEdge(p.originX, p.originZ, p.side, p.dir, level).map((e) => `${e.kind} ${r3(e.x)} ${r3(e.z)} ${r3(e.yaw)} ${r3(e.scale)}`).join(';'));
    assert.deepEqual(edge, v.edge, `edge ${v.seed}/${v.grid}`);
  }
});

test('scripted scenario matches C#', () => {
  const h = village(1818, 24), p = new Inventory(PLAYER_SLOTS), log = [], res = (l, r) => `${l} ${r.ok ? 'ok' : r.reason} ${r.count}`;
  log.push(res('plant early', h.plant(0, 'turnip', T, p)));
  log.push(res('claim', h.claim(T, p, items)), res('claim again', h.claim(T, p, items)), res('plant turnip', h.plant(0, 'turnip', T, p)), res('plant glowcap', h.plant(1, 'glowcap', T, p)));
  log.push(res('build coop', h.build('coop', p)), res('build coop again', h.build('coop', p)), res('build trough', h.build('trough', p)), res('build scarecrow', h.build('scarecrow', p)), res('build fence', h.build('fence', p)));
  p.add(items, 'turnip', 1); p.add(items, 'kelp', 1);
  log.push(res('adopt chicken', h.feed('chicken', T, p)), res('adopt jar', h.feed('jar_tentacle', T, p)));
  const chicken = cat.findResident('chicken'), jar = cat.findResident('jar_tentacle');
  for (const days of [0, 1, 2, 3]) {
    const now = T + days * DAY;
    log.push(`day ${days} stages ${h.stageOf(0, now)}${h.stageOf(1, now)}${h.stageOf(2, now)} chickenFed ${h.fedPercent(chicken, T, now)} mood ${h.mood(chicken, T, now, 0)}/${h.mood(jar, T, now, 3)} eggs ${h.produceReady(chicken, h.residents[0], now)} sanity ${h.dailySanity(now, days)}`);
  }
  log.push(res('collect', h.collect('chicken', T + 3 * DAY, p, items)), res('harvest turnip', h.harvest(0, T + 3 * DAY, 4, p, items)), res('harvest glowcap', h.harvest(1, T + 3 * DAY, 4, p, items)));
  log.push(`yields ${h.yieldAt(cat.findCrop('turnip'), 3)}${h.yieldAt(cat.findCrop('kelp'), 3)}${h.yieldAt(cat.findCrop('eyeroot'), 2)}`, `bag ${p.slotsText()}`, `save ${h.serialize()}`);
  assert.deepEqual(log, golden.scenario);
});

test('crops grow by village day and harvest adds crop and seed to the inventory', () => {
  const [h, p] = ready();
  assert.ok(h.plant(0, 'turnip', T, p).ok);
  assert.equal(h.stageOf(0, T + 100), STAGE_PLANTED); assert.equal(h.stageOf(0, T + DAY), STAGE_SPROUT); assert.equal(h.stageOf(0, T + 2 * DAY), STAGE_RIPE); assert.equal(h.stageOf(1, T), -1);
  assert.equal(h.plant(0, 'cabbage', T, p).reason, 'occupied'); assert.equal(h.plant(99, 'cabbage', T, p).reason, 'bed'); assert.equal(h.plant(1, 'weed', T, p).reason, 'unknown'); assert.equal(h.plant(1, 'eyeroot', T, p).reason, 'noseed');
  assert.equal(h.harvest(0, T, 0, p, items).reason, 'growing'); assert.equal(h.harvest(1, T, 0, p, items).reason, 'empty');
  const seeds = p.count('seed_turnip'), r = h.harvest(0, T + 2 * DAY, 0, p, items);
  assert.ok(r.ok); assert.equal(r.count, 2); assert.equal(p.count('turnip'), 2); assert.equal(p.count('seed_turnip'), seeds + 1); assert.equal(h.stageOf(0, T + 2 * DAY), -1);
});

test('harvest without room changes nothing; claim without room changes nothing', () => {
  const h = village(1818, 24), tiny = new Inventory(1);
  assert.equal(h.claim(0, tiny, items).reason, 'full'); assert.equal(h.claimed, false); assert.equal(tiny.slots.length, 0);
  const [h2, p] = ready();
  h2.plant(0, 'turnip', T, p);
  let i = 0; while (p.slots.length < p.capacity) p.add(items, i++ % 2 ? 'tea' : 'bread', 99);
  p.slots = p.slots.filter((s) => s.id !== 'seed_turnip');
  const before = p.slotsText();
  assert.equal(h2.harvest(0, T + 2 * DAY, 0, p, items).reason, 'full'); assert.equal(p.slotsText(), before); assert.equal(h2.beds[0].cropId, 'turnip');
});

test('dread thins plain crops unless a scarecrow stands and feeds eldritch crops; structures cost timber once', () => {
  const [h, p] = ready(), turnip = cat.findCrop('turnip'), kelp = cat.findCrop('kelp');
  assert.equal(h.yieldAt(turnip, BLIGHT_LEVEL - 1), 2); assert.equal(h.yieldAt(turnip, BLIGHT_LEVEL), 1); assert.equal(h.yieldAt(kelp, BLIGHT_LEVEL - 1), 2); assert.equal(h.yieldAt(kelp, BLIGHT_LEVEL), 3);
  assert.ok(h.build('scarecrow', p).ok); assert.equal(h.yieldAt(turnip, CORRUPTION_LEVELS), 2);
  assert.equal(h.build('scarecrow', p).reason, 'built'); assert.ok(h.build('coop', p).ok); assert.equal(p.count('timber'), 0); assert.equal(h.build('fence', p).reason, 'notimber'); assert.equal(h.build('tower', p).reason, 'unknown');
  assert.equal(corruptionLevel(1, 10), CORRUPTION_LEVELS);
});

test('needs fall with village time, mood follows food, shelter and blight, sanity applies once a day with a cap', () => {
  const [h, p] = ready(), moth = cat.findResident('lantern_moth');
  p.add(items, 'glowcap', 1); p.add(items, 'kelp', 1); p.add(items, 'dried_fish', 1);
  assert.equal(h.collect('chicken', T, p, items).reason, 'notowned');
  assert.equal(h.dailySanity(T, 0), 0);
  h.feed('lantern_moth', T, p); h.feed('jar_tentacle', T, p); h.feed('tide_hound', T, p);
  assert.equal(h.feed('lantern_moth', T, p).reason, 'full'); assert.equal(h.feed('dragon', T, p).reason, 'unknown');
  assert.equal(h.fedPercent(moth, T, T + DAY), 50); assert.equal(h.fedPercent(moth, T, T + 5 * DAY), 0);
  assert.equal(h.mood(moth, T, T, 0), 'uneasy'); assert.equal(h.mood(moth, T, T, BLIGHT_LEVEL), 'distressed');
  h.build('coop', p); assert.equal(h.mood(moth, T, T, BLIGHT_LEVEL), 'content'); assert.equal(h.mood(moth, T, T + 5 * DAY, 0), 'uneasy');
  const day1 = h.dailySanity(T + DAY, BLIGHT_LEVEL);
  assert.ok(Math.abs(day1) <= DAILY_SANITY_CAP); assert.equal(h.dailySanity(T + DAY, BLIGHT_LEVEL), 0);
});

test('produce needs shelter and food and goes to the inventory', () => {
  const [h, p] = ready(), chicken = cat.findResident('chicken');
  p.add(items, 'turnip', 2); h.feed('chicken', T, p);
  assert.equal(h.collect('chicken', T + DAY, p, items).reason, 'notready');
  h.build('coop', p);
  assert.equal(h.collect('chicken', T, p, items).reason, 'notready');
  const r = h.collect('chicken', T + DAY, p, items);
  assert.ok(r.ok); assert.equal(r.count, 1); assert.equal(p.count('egg'), 1);
  assert.equal(h.produceReady(chicken, { defId: 'chicken', fedTick: T + 9 * DAY, collectDay: 0 }, T + 9 * DAY), 3);
  p.add(items, 'dried_fish', 1); h.feed('cat', T, p); assert.equal(h.collect('cat', T, p, items).reason, 'noproduce');
});

test('save string round trips and rejects bad input without changing anything', () => {
  const [h, p] = ready(); p.add(items, 'turnip', 1);
  h.plant(2, 'glowcap', T, p); h.build('coop', p); h.feed('chicken', T, p);
  const s = h.serialize(), other = village(1818, 24);
  assert.ok(s.startsWith('hs1;1;'));
  assert.ok(other.tryRestore(s)); assert.equal(other.serialize(), s);
  for (const bad of ['', 'hs2;1;0;-,-,-,-,-,-;;', 'hs1;1;0;-,-;;', 'hs1;1;0;nope.1,-,-,-,-,-;;', 'hs1;1;0;-,-,-,-,-,-;moat;', 'hs1;1;0;-,-,-,-,-,-;;dragon.1.1', 'hs1;1;-3;-,-,-,-,-,-;;', 'hs1;1;999999999999;-,-,-,-,-,-;;', 'hs1;1;0;-,-,-,-,-,-;coop.coop;', 'hs1;1;0;-,-,-,-,-,-;;cat.1.1,cat.2.2', null]) assert.equal(other.tryRestore(bad), false, String(bad));
  assert.equal(other.serialize(), s); assert.equal(BED_COUNT, 6);
});

test('plot edge corruption grows with the level and never passes full size', () => {
  let prev = 0;
  for (let level = 0; level <= CORRUPTION_LEVELS; level++) { const g = growPlotEdge(10, 20, [1, 0], [0, 1], level); assert.ok(g.length >= prev); prev = g.length; for (const it of g) assert.ok(it.scale >= 0.55 && it.scale <= 1); }
  assert.equal(growPlotEdge(10, 20, [1, 0], [0, 1], 0).length, 0); assert.equal(prev, 3);
});
