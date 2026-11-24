import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, SanityModel } from '../src/core.js';
import { createInventoryController } from '../src/inventory-ui.js';
import { createCreatureController } from '../src/creature-ui.js';
import { buildManifestations, glimpseFade, MANIFEST_MAX_TRIANGLES, MANIFEST_FADE_SECONDS, buildCreatures, creatureFlicker, WARD_KEYS, CREATURE_SWAY_PHASE, CREATURE_FLICKER_DEPTH } from '../src/view3d.js';
import { creatureCueParams, CREATURE_CUE_MAX_GAIN } from '../src/music.js';
import { phaseStart } from '../src/clock.js';
import { loadGlbBuffer } from '../src/glb.js';
import { t, STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const catalog = new PrefabCatalog(JSON.parse(read('village_catalog.json')).entries);
const NIGHT = phaseStart(3) + 60;

function make({ locked = false, cam = { x: 0, z: 0, yaw: 0 }, weather = 'fog', sanity = 80, tier = null, at = NIGHT, reduced = false } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', innerHTML: '', focus() {}, addEventListener() {} }); return els.get(id); };
  const san = new SanityModel(sanity), state = { seed: 1818, layout: generateLayout(catalog, 24, 24, 40, 1818), sanity: { get dread() { return 1 - san.value / 100; } } };
  const calls = { sanity: [], journal: [], announce: [], clues: [] };
  const inventory = createInventoryController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, sanity: () => san, onSanity: () => {}, allows: () => !locked, clue: () => {}, journal: () => {}, announce: () => {},
    houseName: () => '', tickNow: () => NIGHT, skipClock: () => {}, in3d: () => true,
  });
  inventory.setCatalog(read('items.json'));
  const c = createCreatureController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, inventory, announce: (x) => calls.announce.push(x), journal: (x) => calls.journal.push(x), allows: () => !locked,
    sanity: () => san, onSanity: (d) => calls.sanity.push(d), tickNow: () => at, weather: () => weather, camera: () => cam,
    ...(tier ? { tierState: () => tier, noteClue: (id) => calls.clues.push(id), reducedMotion: () => reduced } : {}),
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

import { buildWards, WARD_LIFT_M } from '../src/view3d.js';
test('wards render as flat static chalk and salt on the ground', () => {
  const v = buildWards([{ kind: 'salt', ax: 0, az: 0, bx: 6, bz: 0, radius: 4 }, { kind: 'sigil', ax: 10, az: 10, bx: 10, bz: 10, radius: 4 }]);
  assert.ok(v.length > 0 && v.length % 33 === 0);
  for (let i = 1; i < v.length; i += 11) assert.equal(v[i], Math.fround(WARD_LIFT_M));
  assert.equal(buildWards([]).length, 0);
  assert.deepEqual(Array.from(v), Array.from(buildWards([{ kind: 'salt', ax: 0, az: 0, bx: 6, bz: 0, radius: 4 }, { kind: 'sigil', ax: 10, az: 10, bx: 10, bz: 10, radius: 4 }])));
});

// ---- Creature upgrade path (spec 166)
const COSMIC = { societyStage: 3, corruptedVillager: 2, knowledgeTier: 5, cosmicOmens: 1, placeId: '' };

test('witnessing a tier 4 glimpse records one board clue and a journal line, shows for at most four seconds, then rests', () => {
  let found = null;
  for (let d = 0; d < 60 && !found; d++) { const at = d * 1440 + phaseStart(3) + 5, m = make({ tier: COSMIC, at, sanity: 20 }); m.c.update(0.1, 0, 0); if (m.c.manifest().some((e) => e.tier === 4)) found = m; }
  assert.ok(found, 'a glimpse appears on some night');
  const { c, calls } = found;
  assert.ok(calls.clues.some((id) => id.startsWith('witness@')));
  assert.equal(calls.clues.length, new Set(calls.clues).size);
  assert.ok(calls.journal.some((l) => l.startsWith('Seen: ')));
  let t = 0;
  while (c.manifest().some((e) => e.tier === 4) && t < 20) { c.update(0.25, 0, 0); t += 0.25; }
  assert.ok(t <= 4.5, `glimpse lasted ${t}s`);
  assert.equal(c.manifest().some((e) => e.tier === 4), false);
});

test('the board title of a witness clue is the investigator line in both languages and explains nothing', () => {
  const { c } = make({ tier: COSMIC });
  assert.equal(c.witnessTitle('witness@familiar_face', 'en'), 'A neighbour\'s face, worn slightly wrong.');
  assert.match(c.witnessTitle('witness@familiar_face', 'fr'), /voisin/);
  assert.equal(c.witnessTitle('book@b39', 'en'), '');
});

test('a salt line turns a warded tier 1 figure; a tier 2 villager stays', () => {
  const calm = { societyStage: 0, corruptedVillager: -1, knowledgeTier: 0, cosmicOmens: 0, placeId: '' };
  let m = null;
  for (let d = 0; d < 60 && !m; d++) { const x = make({ tier: calm, at: d * 1440 + phaseStart(2) + 5, sanity: 30, cam: { x: 50, z: 50, yaw: 0 } }); if (x.c.manifest().length) m = x; }
  assert.ok(m, 'a tier 1 figure appears on some dusk');
  assert.ok(m.c.manifest().every((e) => e.tier === 1));
  m.inventory.player.add(parseItems(), 'salt', 1);
  assert.equal(m.c.ward('salt'), '');
  assert.equal(m.c.manifest().length, 0);
  let v = null;
  for (let d = 0; d < 60 && !v; d++) { const x = make({ tier: { ...calm, societyStage: 2, corruptedVillager: 1 }, at: d * 1440 + phaseStart(2) + 5, sanity: 30, cam: { x: 50, z: 50, yaw: 0 } }); if (x.c.manifest().some((e) => e.tier === 2)) v = x; }
  assert.ok(v, 'a tier 2 villager appears on some dusk');
  v.inventory.player.add(parseItems(), 'salt', 1);
  assert.equal(v.c.ward('salt'), '');
  assert.ok(v.c.manifest().some((e) => e.tier === 2));
});

test('buildManifestations: bounded triangles, deterministic, still under reduced motion, glimpse fades', () => {
  const eye = { x: 10, z: 10, yaw: 0.4 };
  const entries = [
    { tier: 1, defId: 'watcher_at_wall', x: 14, z: 12, placeId: '', still: false },
    { tier: 2, defId: 'familiar_face', x: 18, z: 12, placeId: '', still: false },
    { tier: 3, defId: 'doubled_villager', x: 20, z: 20, placeId: '', still: false },
    { tier: 3, defId: 'impossible_stair', x: 0, z: 0, placeId: 'manor', still: false },
    { tier: 4, defId: 'sky_that_blinked', x: 40, z: 40, placeId: '', still: false, elapsed: 1.5, seconds: 3 },
  ];
  const a = buildManifestations({ entries, eye }), b = buildManifestations({ entries, eye });
  assert.deepEqual([...a], [...b]);
  assert.ok(a.length > 0 && a.length % (11 * 3) === 0 && a.length / 33 <= MANIFEST_MAX_TRIANGLES);
  for (const v of a) assert.ok(Number.isFinite(v));
  assert.equal(buildManifestations({ entries: [], eye }).length, 0);
  const still = buildManifestations({ entries: entries.map((e) => ({ ...e, still: true })), eye, reduced: true });
  for (let i = 10; i < still.length; i += 11) assert.equal(still[i], 0, 'no sway phase under reduced motion');
  assert.equal(glimpseFade(0, 3, false), 0);
  assert.equal(glimpseFade(1.5, 3, false), 1);
  assert.ok(glimpseFade(MANIFEST_FADE_SECONDS / 2, 3, false) < 1);
  assert.equal(glimpseFade(0, 3, true), 1);
});

test('creature upgrade path strings exist in both languages', () => {
  for (const lang of ['en', 'fr']) assert.ok(t('creature.witness', lang, { text: 'x' }).includes('x'));
});

test('the glimpse cooldown is saved as elapsed ticks and rebased onto a clock that restarted (round 33 review)', () => {
  const tier = { societyStage: 0, corruptedVillager: -1, knowledgeTier: 0, cosmicOmens: 0, placeId: '' };
  const late = make({ tier, at: 5000 }).c;
  assert.deepEqual(late.snapshot(), { glimpse: '' });
  late.restore({ glimpse: 'gl1;300' });
  assert.deepEqual(late.snapshot(), { glimpse: 'gl1;300' });
  const fresh = make({ tier, at: 100 }).c;
  fresh.restore({ glimpse: 'gl1;300' });
  assert.deepEqual(fresh.snapshot(), { glimpse: 'gl1;100' }, 'a young clock clamps to tick 0 instead of going negative');
  fresh.restore({ glimpse: 'gl1;99999999' });
  assert.deepEqual(fresh.snapshot(), { glimpse: '' }, 'an ended cooldown is not kept');
  fresh.restore({ glimpse: 'bad' });
  assert.deepEqual(fresh.snapshot(), { glimpse: '' });
});
