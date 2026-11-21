import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, SanityModel } from '../src/core.js';
import { parseItemCatalog, Inventory, ItemWorld, canSleep, minutesToMorning, PLAYER_SLOTS, FUEL_MAX, CANDLE_FUEL_COST, LODGING_STOCK, itemName } from '../src/inventory.js';
import { phaseStart, wrapTick, phaseAt, SESSION_START_TICK } from '../src/clock.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).items;
const webText = readFileSync(join(root, 'web', 'data', 'items.json'), 'utf8');
const cat = parseItemCatalog(webText);
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);

test('drift: the web data file is a byte copy of the package data file', () => {
  assert.equal(webText, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'items.json'), 'utf8'));
});

test('every item has en and fr text and no em dash; the required items exist', () => {
  for (const id of ['lantern_oil', 'salt', 'candles', 'bread', 'dried_fish', 'tea', 'herbs', 'sigil_chalk']) assert.ok(cat.find(id), id);
  for (const kind of ['key', 'letter', 'trinket']) assert.ok(cat.items.some((d) => d.kind === kind), kind);
  for (const d of cat.items) for (const l of ['en', 'fr']) { assert.ok(d.names[l] && d.texts[l].length >= 30 && d.texts[l].length <= 240, `${d.id} ${l}`); assert.ok(!d.texts[l].includes('\u2014')); }
  assert.equal(itemName(cat.find('bread'), 'de'), cat.find('bread').names.en);
});

test('library digest matches C#', () => {
  assert.deepEqual(cat.items.map((d) => [d.id, d.kind, d.effect, d.amount, d.stack, d.weight, d.clue ? 1 : 0]), golden.defs);
});

test('malformed data names the item', () => {
  assert.throws(() => parseItemCatalog({ items: [{ id: 'x1', kind: 'moon' }] }), /x1/);
  assert.throws(() => parseItemCatalog({}), /items/);
});

test('seeded ground items and chests match C# for every golden village and are repeatable', () => {
  for (const v of golden.villages) {
    const layout = generateLayout(catalog, v.grid, v.grid, v.grid === 24 ? 40 : 20, v.seed);
    const w = ItemWorld.create(v.seed, v.grid, v.grid, layout, cat);
    assert.equal(w.ground.length, v.ground.length, `ground ${v.seed}/${v.grid}`);
    w.ground.forEach((g, i) => {
      const [id, n, x, z] = v.ground[i];
      assert.equal(g.itemId, id); assert.equal(g.count, n);
      assert.ok(Math.abs(g.x - x) < 0.001 && Math.abs(g.z - z) < 0.001, `${v.seed}/${v.grid} ${id}`);
    });
    assert.equal(w.chests.length, v.chests.length);
    w.chests.forEach((c, i) => {
      const [house, lodging, x, z, slots] = v.chests[i];
      assert.equal(c.houseIndex, house); assert.equal(c.lodging ? 1 : 0, lodging); assert.equal(c.contents.slotsText(), slots);
      assert.ok(Math.abs(c.x - x) < 0.001 && Math.abs(c.z - z) < 0.001);
    });
    assert.equal(w.serialize(new Inventory(PLAYER_SLOTS)), v.state);
    assert.equal(ItemWorld.create(v.seed, v.grid, v.grid, layout, cat).serialize(new Inventory(PLAYER_SLOTS)), v.state);
    if (w.chests.length) assert.ok(w.lodging && LODGING_STOCK.every((id) => w.lodging.contents.count(id) >= 1));
  }
});

test('the scripted inventory scenario matches C#', () => {
  const p = new Inventory(3), s = new SanityModel(50), log = [];
  const u = (r) => `${r.used ? 'used' : `refused ${r.reason}`} s${r.sanityDelta} f${r.fuelDelta}`;
  log.push(`add bread 7 -> ${p.add(cat, 'bread', 7)}`, `add tea 3 -> ${p.add(cat, 'tea', 3)}`, `add salt 9 -> ${p.add(cat, 'salt', 9)}`, `add herbs 1 -> ${p.add(cat, 'herbs', 1)}`);
  log.push(`use bread -> ${u(p.use(cat, 'bread', s))} sanity ${s.value}`, `use salt -> ${u(p.use(cat, 'salt', s))}`, `use lantern_oil -> ${u(p.use(cat, 'lantern_oil', s))}`, `remove bread 4 -> ${p.remove('bread', 4)}`);
  p.fuel = 70; p.add(cat, 'lantern_oil', 2);
  log.push(`use lantern_oil -> ${u(p.use(cat, 'lantern_oil', s))} fuel ${p.fuel}`, `use lantern_oil -> ${u(p.use(cat, 'lantern_oil', s))} fuel ${p.fuel}`, `slots ${p.slotsText()}`);
  assert.deepEqual(log, golden.scenario);
});

test('move, pickup, fuel burn and sleep rules', () => {
  const a = new Inventory(4), b = new Inventory(1);
  a.add(cat, 'bread', 8);
  assert.equal(Inventory.move(cat, a, b, 'bread', 8), 5);
  assert.equal(Inventory.move(cat, a, b, 'bread', 1), 0);
  const layout = generateLayout(catalog, 24, 24, 40, 1818), w = ItemWorld.create(1818, 24, 24, layout, cat), me = new Inventory(PLAYER_SLOTS);
  const first = w.ground[0];
  assert.equal(w.pickUp(0, me, cat), first.count);
  assert.equal(w.pickUp(0, me, cat), 0);
  assert.equal(w.pickUp(-1, me, cat), 0);
  assert.equal(w.pickUp(1, new Inventory(0), cat), 0);
  me.burnFuel(CANDLE_FUEL_COST); assert.equal(me.fuel, 55); me.burnFuel(1000); assert.equal(me.fuel, 0);
  assert.ok(canSleep(SESSION_START_TICK) && canSleep(phaseStart(3) + 100));
  assert.ok(!canSleep(phaseStart(1) + 5) && !canSleep(phaseStart(0)));
  const t = phaseStart(3) + 100;
  assert.equal(phaseAt(t + minutesToMorning(t)), 0); assert.equal(wrapTick(t + minutesToMorning(t)), 0);
});

test('save string round trips and a refused restore changes nothing', () => {
  const layout = generateLayout(catalog, 24, 24, 40, 1818), w = ItemWorld.create(1818, 24, 24, layout, cat), me = new Inventory(PLAYER_SLOTS);
  w.pickUp(0, me, cat); Inventory.move(cat, w.lodging.contents, me, 'tea', 1); me.fuel = 33;
  const text = w.serialize(me), w2 = ItemWorld.create(1818, 24, 24, layout, cat), me2 = new Inventory(PLAYER_SLOTS);
  assert.ok(w2.tryRestore(text, me2, cat));
  assert.equal(w2.serialize(me2), text); assert.equal(me2.fuel, 33);
  for (const bad of ['inv1;50;zzz:1;;', `inv1;${FUEL_MAX + 1};;;`, '', 'inv1;50;bread:99;;', null]) assert.equal(w2.tryRestore(bad, me2, cat), false, String(bad));
  assert.equal(w2.serialize(me2), text);
});
