import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout } from '../src/core.js';
import { Inventory, parseItemCatalog, FUEL_START } from '../src/inventory.js';
import { landmarkDressing, landmarkPathDressing } from '../src/landmarks.js';
import { composeDressing, dressingBoxes } from '../src/dressing.js';
import { isBlocked } from '../src/lore.js';
import { phaseStart } from '../src/clock.js';
import {
  parseCreatureCatalog, CreatureEncounter, hasLineOfSight, creatureName, MAX_CREATURES, SALT_MINUTES, SIGIL_MINUTES, SIGIL_RADIUS, FLARE_FUEL_COST, FLARE_MINUTES, FLARE_COOLDOWN_MINUTES, MAX_DRAIN_PER_SECOND,
} from '../src/creatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).creatures;
const webText = readFileSync(join(root, 'web', 'data', 'creatures.json'), 'utf8');
const cat = parseCreatureCatalog(webText);
const items = parseItemCatalog(readFileSync(join(root, 'web', 'data', 'items.json'), 'utf8'));
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);
const NIGHT = phaseStart(3) + 60, DUSK = phaseStart(2) + 5, DAY = phaseStart(1) + 10;
const fmt4 = (v) => String(Math.round(v * 10000) / 10000);

function blockedFor(seed, grid, layout) {
  const boxes = dressingBoxes([...composeDressing(seed, grid, grid, layout), ...landmarkDressing(seed, grid, grid), ...landmarkPathDressing(seed, grid, grid)]);
  return (x, z) => isBlocked(x, z, layout, boxes, seed, grid, grid);
}
function one(id, x, z) {
  const enc = CreatureEncounter.spawn(1, 24, 24, NIGHT, 1.0, 'fog', cat, null);
  enc.creatures = enc.creatures.filter((c) => c.defId === id).slice(0, 1);
  const c = enc.creatures[0]; c.homeX = c.x = x; c.homeZ = c.z = z;
  return enc;
}

test('drift: the web data file is a byte copy of the package data file', () => {
  assert.equal(webText, readFileSync(join(root, 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'creatures.json'), 'utf8'));
});

test('every creature has en and fr text and no em dash; malformed data names the creature', () => {
  for (const d of cat.defs) for (const l of ['en', 'fr']) { assert.ok(d.names[l] && d.texts[l].length >= 30 && d.texts[l].length <= 240, `${d.id} ${l}`); assert.ok(!d.texts[l].includes('\u2014')); }
  assert.equal(creatureName(cat.defs[0], 'de'), cat.defs[0].names.en);
  assert.throws(() => parseCreatureCatalog({ creatures: [{ id: 'x1', habitat: 'moon' }] }), /x1/);
  assert.throws(() => parseCreatureCatalog({}), /creatures/);
});

test('library digest matches C#', () => {
  assert.deepEqual(cat.defs.map((d) => [d.id, d.habitat, d.phase, d.weather, d.minDread, d.max, d.drain, d.range, d.needsLos ? 1 : 0, d.speed, d.hunt, d.height]), golden.defs);
});

test('seeded spawns match C# for every golden village and condition, and stay bounded', () => {
  const cache = new Map();
  for (const v of golden.spawns) {
    const key = `${v.seed}/${v.grid}`;
    if (!cache.has(key)) { const layout = generateLayout(catalog, v.grid, v.grid, v.grid === 24 ? 40 : 20, v.seed); cache.set(key, blockedFor(v.seed, v.grid, layout)); }
    const enc = CreatureEncounter.spawn(v.seed, v.grid, v.grid, v.tick, v.dread, v.weather, cat, cache.get(key));
    assert.deepEqual(enc.creatures.map((c) => enc.describe(c)), v.creatures, `${key} ${v.tick}`);
    assert.ok(enc.creatures.length <= MAX_CREATURES);
  }
});

test('the scripted encounter with every counter matches C#', () => {
  const scene = CreatureEncounter.spawn(1818, 24, 24, NIGHT, 1.0, 'fog', cat, null);
  const player = new Inventory(12);
  player.add(items, 'salt', 2); player.add(items, 'sigil_chalk', 1);
  const wall = (x, z) => x > 20 && x < 22 && z > 0 && z < 40;
  const log = [], target = scene.creatures[0];
  const px = target.x + 9.0, pz = target.z;
  log.push(`spawned ${scene.creatures.map((c) => scene.describe(c)).join(';')}`);
  const note = (label, r) => log.push(`${label} drain ${fmt4(r.drain)} burn ${r.fuelBurn} tele ${fmt4(r.telegraph)} near ${r.nearest} pushed ${r.pushed ? 1 : 0} blocked ${r.blocked ? 1 : 0} at ${scene.describe(target)}`);
  let tick = NIGHT;
  for (let i = 0; i < 4; i++) note(`walk${i}`, scene.step(0.5, px, pz, tick, 0, wall));
  for (let i = 0; i < 3; i++) note(`lantern${i}`, scene.step(1.0, target.x + 5.0, target.z, tick, player.fuel, wall));
  log.push(`salt ${scene.placeSalt(player, target.x + 8.0, target.z, -1, 0, tick) === '' ? 'ok' : 'no'} left ${player.count('salt')}`);
  for (let i = 0; i < 3; i++) note(`salted${i}`, scene.step(0.5, target.x + 8.0, target.z, tick, 0, wall));
  log.push(`sigil ${scene.placeSigil(player, target.x + 12.0, target.z, tick) === '' ? 'ok' : 'no'} again ${scene.placeSigil(player, target.x, target.z, tick)}`);
  for (let i = 0; i < 3; i++) note(`sigil${i}`, scene.step(0.5, target.x + 12.0, target.z, tick, 0, wall));
  log.push(`flare ${scene.useFlare(player, tick)} fuel ${player.fuel} again ${scene.useFlare(player, tick + 1)}`);
  note('flared', scene.step(1.0, target.x + 6.0, target.z, tick + 1, 0, wall));
  tick += SALT_MINUTES;
  note('later', scene.step(0.5, target.x + 8.0, target.z, tick, 0, wall));
  log.push(`wards ${scene.wards.length} fuelDebt ${fmt4(scene.fuelDebt)}`);
  assert.deepEqual(log, golden.scenario);
});

test('spawn rules: deterministic, phase, weather and dread gates, bounded', () => {
  const a = CreatureEncounter.spawn(42, 24, 24, NIGHT, 1.0, 'fog', cat, null), b = CreatureEncounter.spawn(42, 24, 24, NIGHT, 1.0, 'fog', cat, null);
  assert.deepEqual(a.creatures, b.creatures);
  assert.ok(a.creatures.length >= 1 && a.creatures.length <= MAX_CREATURES);
  assert.equal(CreatureEncounter.spawn(1, 24, 24, DAY, 1.0, 'clear', cat, null).creatures.length, 0);
  assert.ok(CreatureEncounter.spawn(1, 24, 24, NIGHT, 0, 'clear', cat, null).creatures.every((c) => c.defId === 'shore_crawler'));
  assert.ok(!CreatureEncounter.spawn(1, 24, 24, NIGHT, 0.5, 'clear', cat, null).creatures.some((c) => c.defId === 'deep_one'));
  assert.ok(CreatureEncounter.spawn(1, 24, 24, NIGHT, 0.8, 'clear', cat, null).creatures.some((c) => c.defId === 'deep_one'));
  assert.ok(CreatureEncounter.spawn(1, 24, 24, DAY, 0.5, 'fog', cat, null).creatures.some((c) => c.defId === 'hollow_watcher'));
  assert.ok(!CreatureEncounter.spawn(1, 24, 24, DAY, 0.5, 'clear', cat, null).creatures.some((c) => c.defId === 'hollow_watcher'));
  assert.ok(CreatureEncounter.spawn(1, 24, 24, DUSK, 0.5, 'clear', cat, null).creatures.some((c) => c.defId === 'cliff_flyer'));
  assert.equal(CreatureEncounter.spawn(1, 0, 0, NIGHT, 1.0, 'fog', cat, null).creatures.length, 0);
});

test('drain needs range and line of sight and is capped', () => {
  const def = cat.find('hollow_watcher'), wall = (x, z) => x > 53 && x < 55;
  const near = one('hollow_watcher', 50, 50).step(1.0, 58, 50, NIGHT, 0, null);
  assert.ok(near.drain > 0 && near.drain <= def.drain);
  assert.equal(one('hollow_watcher', 50, 50).step(1.0, 50 + def.hunt + def.range + 5, 50, NIGHT, 0, null).drain, 0);
  assert.equal(one('hollow_watcher', 50, 50).step(1.0, 58, 50, NIGHT, 0, wall).drain, 0);
  assert.ok(!hasLineOfSight(50, 50, 58, 50, wall) && hasLineOfSight(50, 50, 58, 50, null));
  assert.ok(hasLineOfSight(50, 50, 58, 50, (x) => x > 57.5 && x < 60));
  assert.equal(one('cliff_flyer', 0, 0).step(1.0, 10, 0, NIGHT, 0, (x) => x > 3 && x < 5).drain, 0);
  const crowd = CreatureEncounter.spawn(1, 24, 24, NIGHT, 1.0, 'fog', cat, null);
  for (const c of crowd.creatures) { c.x = c.homeX = 10; c.z = c.homeZ = 10; }
  assert.ok(crowd.step(1.0, 10.5, 10, NIGHT, 0, null).drain <= MAX_DRAIN_PER_SECOND + 1e-9);
  assert.equal(one('hollow_watcher', 50, 50).step(0, 50, 50, NIGHT, 0, null).drain, 0);
});

test('lantern, salt line, chalk sigil and flare each repel', () => {
  let e = one('shore_crawler', 50, 50);
  let r = e.step(1.0, 54, 50, NIGHT, 50, null);
  assert.ok(r.pushed && r.drain === 0 && e.creatures[0].x < 50);
  let burned = 0; for (let i = 0; i < 6; i++) burned += e.step(1.0, 54, 50, NIGHT, 50, null).fuelBurn;
  assert.ok(burned >= 1 && burned <= 5);
  r = one('shore_crawler', 50, 50).step(1.0, 54, 50, NIGHT, 0, null);
  assert.ok(!r.pushed && r.drain > 0 && r.fuelBurn === 0);

  const inv = new Inventory(12); inv.add(items, 'salt', 1); inv.add(items, 'sigil_chalk', 1);
  e = one('shore_crawler', 50, 50);
  assert.equal(e.placeSalt(inv, 58, 50, -1, 0, NIGHT), '');
  assert.equal(e.placeSalt(inv, 58, 50, -1, 0, NIGHT), 'missing');
  for (let i = 0; i < 20; i++) assert.equal(e.step(0.5, 58, 50, NIGHT, 0, null).drain, 0);
  assert.ok(e.creatures[0].x < 56.5);
  assert.ok(one('shore_crawler', 50, 50).step(0.5, 58, 50, NIGHT, 0, null).drain > 0);

  e = one('shore_crawler', 50, 50);
  assert.equal(e.placeSigil(inv, 55, 50, NIGHT), '');
  assert.equal(e.placeSigil(inv, 55, 50, NIGHT), 'missing');
  for (let i = 0; i < 30; i++) assert.equal(e.step(0.5, 55, 50, NIGHT, 0, null).drain, 0);
  assert.ok(Math.hypot(e.creatures[0].x - 55, e.creatures[0].z - 50) >= SIGIL_RADIUS - 1e-6);
  e.step(0.5, 90, 50, NIGHT + SIGIL_MINUTES, 0, null);
  assert.equal(e.wards.length, 0);

  const me = new Inventory(12); e = one('deep_one', 50, 50);
  assert.equal(e.useFlare(me, NIGHT), '');
  assert.equal(me.fuel, FUEL_START - FLARE_FUEL_COST);
  assert.equal(e.useFlare(me, NIGHT + 1), 'cooldown');
  assert.ok(e.flareActive(NIGHT + 1) && !e.flareActive(NIGHT + FLARE_MINUTES));
  r = e.step(1.0, 62, 50, NIGHT + 1, 0, null);
  assert.ok(r.pushed && r.drain === 0);
  me.fuel = 5;
  assert.equal(e.useFlare(me, NIGHT + FLARE_COOLDOWN_MINUTES), 'fuel');
  assert.equal(me.fuel, 5);
});

test('telegraph rises as a creature nears and creatures keep to their leash', () => {
  const far = one('shore_crawler', 50, 50).step(0.1, 79, 50, NIGHT, 0, null).telegraph, e = one('shore_crawler', 50, 50);
  const near = e.step(0.1, 56, 50, NIGHT, 0, null).telegraph;
  assert.ok(far <= 0.2 && near > far);
  for (let i = 0; i < 400; i++) e.step(0.5, 65, 50 + (i % 2), NIGHT, 0, null);
  assert.ok(Math.hypot(e.creatures[0].x - 50, e.creatures[0].z - 50) <= 26 + 1e-6);
});
