import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, SanityModel } from '../src/core.js';
import { createInventoryController } from '../src/inventory-ui.js';
import { createCreatureController } from '../src/creature-ui.js';
import { buildCreatures, creatureFlicker, WARD_KEYS, CREATURE_SWAY_PHASE, CREATURE_FLICKER_DEPTH } from '../src/view3d.js';
import { creatureCueParams, CREATURE_CUE_MAX_GAIN } from '../src/music.js';
import { phaseStart } from '../src/clock.js';
import { loadGlbBuffer } from '../src/glb.js';
import { t, STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const catalog = new PrefabCatalog(JSON.parse(read('village_catalog.json')).entries);
const NIGHT = phaseStart(3) + 60;

function make({ locked = false, cam = { x: 0, z: 0, yaw: 0 }, weather = 'fog', sanity = 80 } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', innerHTML: '', focus() {}, addEventListener() {} }); return els.get(id); };
  const san = new SanityModel(sanity), state = { seed: 1818, layout: generateLayout(catalog, 24, 24, 40, 1818), sanity: { get dread() { return 1 - san.value / 100; } } };
  const calls = { sanity: [], journal: [], announce: [] };
  const inventory = createInventoryController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, sanity: () => san, onSanity: () => {}, allows: () => !locked, clue: () => {}, journal: () => {}, announce: () => {},
    houseName: () => '', tickNow: () => NIGHT, skipClock: () => {}, in3d: () => true,
  });
  inventory.setCatalog(read('items.json'));
  const c = createCreatureController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, inventory, announce: (x) => calls.announce.push(x), journal: (x) => calls.journal.push(x), allows: () => !locked,
    sanity: () => san, onSanity: (d) => calls.sanity.push(d), tickNow: () => NIGHT, weather: () => weather, camera: () => cam,
  });
  c.setCatalog(read('creatures.json'));
  return { c, inventory, san, calls, $, state };
}

test('a night with fog spawns a bounded seeded scene; the scene lists kind, position, height and phase', () => {
  const a = make(), b = make();
  const s = a.c.scene();
  assert.ok(s.length >= 1 && s.length <= 8);
  assert.deepEqual(s, b.c.scene());
  for (const e of s) assert.ok(e.id.startsWith('k') && e.kind && e.pos.length === 3 && e.height >= 0);
  assert.equal(a.c.marks().length, s.length);
});

test('standing next to a creature drains sanity and raises the telegraph; far away nothing happens', () => {
  const { c, san, inventory } = make();
  inventory.player.fuel = 0; // an unlit lantern holds nothing back
  const near = c.encounter.creatures[0];
  const start = san.value;
  for (let i = 0; i < 20; i++) c.update(0.25, near.x, near.z + 5); // along the open shore: buildings in between would block the gaze
  assert.ok(san.value < start);
  assert.ok(c.level > 0);
  const far = make();
  for (let i = 0; i < 20; i++) far.c.update(0.25, -500, -500);
  assert.equal(far.san.value, 80);
  assert.equal(far.c.level, 0);
});

test('the vigil lock keeps creatures inert', () => {
  const { c, san } = make({ locked: true });
  const near = c.encounter.creatures[0];
  for (let i = 0; i < 20; i++) assert.equal(c.update(0.25, near.x + 5, near.z), null);
  assert.equal(san.value, 80);
});

test('salt and chalk are consumed by warding, the lantern burns fuel, the flare costs oil with a cooldown', () => {
  const { c, inventory } = make({ cam: { x: 50, z: 50, yaw: 0 } });
  const p = inventory.player;
  p.add(inventory.world ? parseItems() : null, 'salt', 2);
  assert.equal(c.ward('salt'), '');
  assert.equal(p.count('salt'), 1);
  assert.equal(c.encounter.wards.length, 1);
  assert.equal(c.ward('sigil'), 'missing');
  p.add(parseItems(), 'sigil_chalk', 1);
  assert.equal(c.ward('sigil'), '');
  assert.equal(p.count('sigil_chalk'), 0);
  const fuel = p.fuel;
  assert.equal(c.ward('flare'), '');
  assert.equal(p.fuel, fuel - 30);
  assert.equal(c.ward('flare'), 'cooldown');
  assert.equal(c.ward('nonsense'), 'unknown');
});

test('warding needs the 3D view', () => {
  const { c } = make({ cam: null });
  assert.equal(c.ward('salt'), 'view');
});

test('a salt line stops the drain in the controller too', () => {
  const { c, inventory, san } = make({ cam: { x: 0, z: 0, yaw: 0 } });
  inventory.player.fuel = 0;
  const cr = c.encounter.creatures[0];
  cr.x = cr.homeX = 50; cr.z = cr.homeZ = 50;
  c.encounter.creatures.splice(1);
  inventory.player.add(parseItems(), 'salt', 1);
  assert.equal(c.encounter.placeSalt(inventory.player, 58, 50, -1, 0, NIGHT), '');
  for (let i = 0; i < 20; i++) c.update(0.25, 58, 50);
  assert.equal(san.value, 80);
});

import { parseItemCatalog } from '../src/inventory.js';
function parseItems() { return parseItemCatalog(read('items.json')); }

test('creature meshes build vertices, wheel only when not reduced and carry the sway phase', () => {
  const models = new Map();
  for (const k of ['shore_crawler', 'hollow_watcher', 'deep_one', 'cliff_flyer']) {
    const buf = readFileSync(join(root, 'web', 'assets', 'meshes', `${k}.glb`));
    assert.ok(buf.length < 200 * 1024, `${k} under 200 KB`);
    models.set(k, loadGlbBuffer(buf));
  }
  const entries = [{ id: 'k0', kind: 'cliff_flyer', pos: [10, 0, 10], yaw: 0, height: 12, phase: 1.3 }, { id: 'k1', kind: 'hollow_watcher', pos: [20, 0, 10], yaw: 1, height: 0, phase: 0 }];
  const a = buildCreatures({ creatures: entries, models, timeSec: 0, reduced: false }), b = buildCreatures({ creatures: entries, models, timeSec: 5, reduced: false });
  const r1 = buildCreatures({ creatures: entries, models, timeSec: 0, reduced: true }), r2 = buildCreatures({ creatures: entries, models, timeSec: 5, reduced: true });
  assert.ok(a.length > 0 && a.length % 11 === 0);
  assert.notDeepEqual(Array.from(a), Array.from(b));
  assert.deepEqual(Array.from(r1), Array.from(r2));
  assert.ok(a[10] >= CREATURE_SWAY_PHASE, 'phase is the hanging sway phase');
  assert.equal(buildCreatures({ creatures: entries, models: null }).length, 0);
  assert.equal(buildCreatures({ creatures: [{ ...entries[0], kind: 'nothing' }], models }).length, 0);
  let maxY = 0; for (let i = 1; i < a.length; i += 11) maxY = Math.max(maxY, a[i]);
  assert.ok(maxY > 11, 'flyers hang high');
});

test('lantern flicker follows closeness, and is a steady dim under reduced motion', () => {
  assert.equal(creatureFlicker(0, 3, false), 1);
  assert.ok(creatureFlicker(1, 0.0, false) >= 1 - CREATURE_FLICKER_DEPTH - 1e-9);
  assert.notEqual(creatureFlicker(1, 0.0, false), creatureFlicker(1, 0.07, false));
  assert.equal(creatureFlicker(1, 0.0, true), creatureFlicker(1, 0.07, true));
  assert.ok(creatureFlicker(1, 0, true) < 1);
  assert.deepEqual({ ...WARD_KEYS }, { KeyZ: 'salt', KeyV: 'sigil', KeyF: 'flare' });
});

test('the audio cue is quiet, silent when nothing is near and eases in slowly', () => {
  assert.equal(creatureCueParams(0, 'deep_one').gain, 0);
  assert.ok(creatureCueParams(1, 'deep_one').gain <= CREATURE_CUE_MAX_GAIN && CREATURE_CUE_MAX_GAIN <= 0.08);
  assert.ok(creatureCueParams(0.5, 'x').gain < creatureCueParams(1, 'x').gain);
  assert.ok(creatureCueParams(1, 'x').timeConstant >= 1);
  assert.equal(creatureCueParams(NaN, 'x').gain, 0);
});

test('creature strings exist in en and fr and have no em dash', () => {
  for (const k of Object.keys(STRINGS.en).filter((x) => x.startsWith('creature.'))) { assert.ok(STRINGS.fr[k], k); assert.ok(!STRINGS.en[k].includes('\u2014') && !STRINGS.fr[k].includes('\u2014')); }
  for (const k of ['creature.near', 'creature.ward.salt', 'creature.ward.sigil', 'creature.flare.lit', 'creature.flare.fuel', 'creature.flare.cooldown', 'creature.btn.salt', 'creature.btn.sigil', 'creature.btn.flare']) assert.ok(STRINGS.en[k], k);
});
