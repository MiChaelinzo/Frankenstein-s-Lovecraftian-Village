import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, SanityModel } from '../src/core.js';
import { createInventoryController } from '../src/inventory-ui.js';
import { phaseStart } from '../src/clock.js';
import { t, STRINGS } from '../src/i18n.js';
import { ITEM_KINDS } from '../src/inventory.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const itemsText = readFileSync(join(root, 'web', 'data', 'items.json'), 'utf8');
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(root, 'web', 'data', 'village_catalog.json'), 'utf8')).entries);

function make({ tick = phaseStart(3) + 50, locked = false, sanity = 50 } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', innerHTML: '', focus() {}, addEventListener() {} }); return els.get(id); };
  const calls = { clues: [], journal: [], skipped: [], allows: [], sanity: [] };
  const san = new SanityModel(sanity), state = { seed: 1818, layout: generateLayout(catalog, 24, 24, 40, 1818) };
  const c = createInventoryController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, sanity: () => san, onSanity: (d) => calls.sanity.push(d),
    allows: (id) => { calls.allows.push(id); return !locked; }, clue: (id) => calls.clues.push(id), journal: (x) => calls.journal.push(x), announce: () => {},
    houseName: (i) => `House ${i}`, tickNow: () => tick, skipClock: (m, done) => { calls.skipped.push(m); done(); }, in3d: () => false,
  });
  c.setCatalog(itemsText);
  return { c, $, calls, san, state };
}

test('scene lists ground items and chests; picking up removes the item, journals it and respects clues', () => {
  const { c, calls, $ } = make();
  const scene = c.scene(), items = scene.filter((q) => !q.chest), chests = scene.filter((q) => q.chest);
  assert.ok(items.length > 0 && chests.length > 0 && chests.some((q) => q.lodging));
  const n = c.pickUpById(items[0].id);
  assert.ok(n >= 1);
  assert.equal(c.scene().filter((q) => !q.chest).length, items.length - 1);
  assert.equal(calls.journal.length, 1);
  assert.equal(c.pickUpById(items[0].id), 0);
  const clueItem = c.world.ground.findIndex((g, i) => c.world.picked.has(i) === false && ['brass_key', 'iron_key', 'harbour_letter', 'chapel_letter'].includes(g.itemId));
  if (clueItem >= 0) { c.pickUpById(`g${clueItem}`); assert.ok(calls.clues[0].startsWith('item@')); }
});

test('use, drop, store and take through the panel', () => {
  const { c, calls, san } = make();
  c.openChestById(`c${c.world.chests.findIndex((q) => q.lodging)}`);
  assert.equal(c.isOpen(), true);
  assert.equal(c.takeItem('bread'), 1);
  assert.equal(c.takeItem('tea'), 1);
  const r = c.useItem('bread');
  assert.equal(r.used, true); assert.equal(san.value, 50 + r.sanityDelta); assert.deepEqual(calls.sanity, [r.sanityDelta]);
  assert.equal(c.storeItem('tea'), 1);
  assert.equal(c.player.count('tea'), 0);
  assert.equal(c.dropItem('bread'), 0);
  c.takeItem('lantern_oil');
  c.player.fuel = 20;
  assert.equal(c.useItem('lantern_oil').fuelDelta, 40);
  assert.equal(c.fuel, 60);
  assert.equal(c.useItem('lantern_oil').reason, 'missing');
  assert.equal(c.takeItem('tea'), 1);
  assert.equal(c.dropItem('tea'), 1);
  assert.equal(c.dropItem('tea'), 0);
});

test('the vigil lock refuses sanity items and sleeping without consuming anything', () => {
  const { c, calls, san } = make({ locked: true });
  c.openChestById(`c${c.world.chests.findIndex((q) => q.lodging)}`);
  c.takeItem('bread');
  assert.equal(c.useItem('bread'), null);
  assert.equal(c.player.count('bread'), 1); assert.equal(san.value, 50);
  assert.equal(c.sleep(), false);
  assert.deepEqual(calls.skipped, []);
  assert.deepEqual([...new Set(calls.allows)].sort(), ['night_step', 'sanity_keys']);
});

test('sleeping at the lodging chest runs the clock to dawn and restores sanity; daytime refuses', () => {
  const night = make();
  night.c.openChestById(`c${night.c.world.chests.findIndex((q) => q.lodging)}`);
  assert.equal(night.c.sleep(), true);
  assert.equal(night.calls.skipped.length, 1);
  assert.equal(night.san.value, 60);
  const day = make({ tick: phaseStart(1) + 10 });
  day.c.openChestById(`c${day.c.world.chests.findIndex((q) => q.lodging)}`);
  assert.equal(day.c.sleep(), false); assert.deepEqual(day.calls.skipped, []);
  const other = make();
  const found = other.c.world.chests.findIndex((q) => !q.lodging);
  if (found >= 0) { other.c.openChestById(`c${found}`); assert.equal(other.c.sleep(), false); }
});

test('snapshot and restore round trip; a candle burns fuel; gather cycles and then runs out', () => {
  const a = make();
  a.c.gatherNext(); a.c.burnCandle();
  const snap = a.c.snapshot();
  assert.match(snap.inv, /^inv1;55;/);
  const b = make();
  b.c.restore(snap);
  assert.equal(b.c.fuel, 55);
  assert.equal(b.c.snapshot().inv, snap.inv);
  b.c.restore({ inv: 'junk' });
  assert.equal(b.c.snapshot().inv, snap.inv);
  const total = b.c.world.ground.length;
  for (let i = 0; i < total + 2; i++) b.c.gatherNext();
  assert.ok(b.c.scene().every((q) => q.chest) || b.c.player.slots.length === 12);
});

test('inventory strings exist in en and fr', () => {
  const keys = ['inv.title', 'inv.use', 'inv.drop', 'inv.store', 'inv.take', 'inv.sleep', 'inv.fuel', 'inv.lodging', 'inv.chest', 'inv.note.pick', 'inv.note.slept', 'inv.refused.full', 'inv.refused.ward', 'inv.refused.none', 'inv.refused.missing',
    'view3d.prompt.item', 'view3d.prompt.chest', 'view3d.prompt.lodging', 'keys.inventory', 'touch.bag', 'btn.inventory', 'tour.satchel', 'tour.satchel.d'];
  for (const k of keys) assert.ok(STRINGS.en[k] && STRINGS.fr[k], k);
  assert.ok(ITEM_KINDS.length > 0);
});
