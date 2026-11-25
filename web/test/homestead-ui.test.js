import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, SanityModel } from '../src/core.js';
import { createInventoryController } from '../src/inventory-ui.js';
import { createHomesteadController, NEAR_PLOT_M } from '../src/homestead-ui.js';
import { HOMESTEAD_KINDS } from '../src/view3d.js';
import { KINDS, loadGlbBuffer } from '../src/glb.js';
import { MINUTES_PER_DAY, SESSION_START_TICK } from '../src/clock.js';
import { parseSession } from '../src/session.js';
import { t, STRINGS } from '../src/i18n.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (f) => readFileSync(join(root, 'web', 'data', f), 'utf8');
const catalog = new PrefabCatalog(JSON.parse(read('village_catalog.json')).entries);

function make({ locked = false, cam = null, sanity = 60 } = {}) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, { id, hidden: true, textContent: '', innerHTML: '', focus() {}, addEventListener() {} }); return els.get(id); };
  const san = new SanityModel(sanity), clock = { tick: SESSION_START_TICK };
  const state = { seed: 1818, night: 0, layout: generateLayout(catalog, 24, 24, 40, 1818), sanity: { get dread() { return 1 - san.value / 100; } } };
  const calls = { sanity: [], journal: [] };
  const inventory = createInventoryController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, sanity: () => san, onSanity: () => {}, allows: () => !locked, clue: () => {}, journal: () => {}, announce: () => {},
    houseName: () => '', tickNow: () => clock.tick, skipClock: () => {}, in3d: () => false,
  });
  inventory.setCatalog(read('items.json'));
  const h = createHomesteadController({
    $, tr: (k, p) => t(k, 'en', p), lang: 'en', state, gridW: 24, gridD: 24, inventory, tickNow: () => clock.tick, sanity: () => san, onSanity: (d) => calls.sanity.push(d),
    allows: () => !locked, announce: () => {}, journal: (x) => calls.journal.push(x), camera: () => cam,
  });
  h.setCatalog(read('homestead.json'));
  return { h, inventory, san, clock, calls, $, state };
}

test('claiming hands over the starter bundle and the yard pieces follow the actions and the village day', () => {
  const { h, inventory, clock } = make();
  assert.deepEqual(h.pieces(), []);
  assert.ok(h.claim().ok);
  assert.equal(h.pieces().filter((p) => p.kind === 'hs_mound').length, 6);
  assert.ok(h.plant(0, 'turnip').ok); assert.ok(h.build('coop').ok);
  assert.ok(h.pieces().some((p) => p.kind === 'hs_coop'));
  assert.ok(!h.pieces().some((p) => p.kind === 'hs_sprout'));
  clock.tick += MINUTES_PER_DAY;
  assert.ok(h.pieces().some((p) => p.kind === 'hs_sprout'));
  clock.tick += MINUTES_PER_DAY;
  assert.ok(h.pieces().some((p) => p.kind === 'hs_turnip'));
  assert.ok(h.harvest(0).ok); assert.equal(inventory.player.count('turnip'), 2);
  assert.ok(h.feed('chicken').ok);
  assert.equal(h.pieces().filter((p) => p.kind === 'hs_chicken').length, 2);
  for (const p of h.pieces()) assert.ok(HOMESTEAD_KINDS.includes(p.kind), p.kind);
});

test('the daily sanity applies once a day and waits while the vigil lock holds', () => {
  const locked = make({ locked: true });
  locked.h.claim(); locked.inventory.player.add(locked.inventory.catalog, 'glowcap', 1); locked.h.build('coop'); locked.h.feed('lantern_moth');
  locked.clock.tick += MINUTES_PER_DAY;
  assert.equal(locked.h.update(), 0);
  const free = make();
  free.h.claim(); free.inventory.player.add(free.inventory.catalog, 'glowcap', 1); free.h.build('coop'); free.h.feed('lantern_moth');
  free.clock.tick += MINUTES_PER_DAY / 2;
  const first = free.h.update();
  assert.ok(first > 0, String(first)); assert.equal(free.h.update(), 0); assert.equal(free.calls.sanity.length, 1);
});

test('in 3D the yard only answers near the plot; the save string round trips through the session', () => {
  const far = make({ cam: { x: -500, z: -500 } });
  assert.equal(far.h.claim(), null);
  assert.equal(far.$('homeNote').textContent, t('home.far', 'en'));
  const a = make(); a.h.claim(); a.h.plant(1, 'glowcap');
  const s = parseSession({ seed: 1818, sanity: 60, ...a.h.snapshot() });
  assert.ok(/^hs1;1;/.test(s.hs));
  const b = make(); b.h.restore(s);
  assert.equal(b.h.snapshot().hs, s.hs);
  assert.ok(NEAR_PLOT_M > 0);
});

test('a seed change or reroll starts an unclaimed yard; going back to the old seed does not bring the old yard back', () => {
  const x = make();
  assert.ok(x.h.claim().ok); assert.ok(x.h.plant(0, 'turnip').ok);
  assert.ok(x.h.pieces().length > 0);
  x.state.seed = 1819; x.state.layout = generateLayout(catalog, 24, 24, 40, 1819); // what rebuild() does on a reroll, seed entry, daily or share code
  assert.equal(x.h.home.claimed, false, 'the new village yard is unclaimed');
  assert.deepEqual(x.h.pieces(), [], 'no beds, crops or structures carried over');
  assert.equal(x.h.snapshot().hs, '');
  assert.equal(x.inventory.player.slots.length, 0, 'the starter bundle went with the old village');
  x.state.seed = 1818; x.state.layout = generateLayout(catalog, 24, 24, 40, 1818);
  assert.equal(x.h.home.claimed, false, 'the old yard is rebuilt fresh, not restored');
  assert.deepEqual(x.h.pieces(), []);
});

test('loading a same-seed save made before the yard was claimed brings back the unclaimed yard', () => {
  const x = make();
  const before = parseSession({ seed: 1818, sanity: 60, ...x.inventory.snapshot(), ...x.h.snapshot() });
  assert.equal(before.hs, '', 'an unclaimed yard saves as an empty string');
  assert.ok(x.h.claim().ok); assert.ok(x.h.plant(0, 'turnip').ok);
  x.inventory.restore(before); x.h.restore(before);
  assert.equal(x.h.home.claimed, false, 'the claim made after the save is gone');
  assert.deepEqual(x.h.pieces(), []);
  assert.equal(x.h.snapshot().hs, '');
  assert.ok(x.h.claim().ok, 'the yard can be claimed again');
});

test('every homestead mesh is in the shape data, loads and is under 200 KB; en and fr strings exist', () => {
  assert.equal(HOMESTEAD_KINDS.length, 17);
  for (const k of HOMESTEAD_KINDS) {
    assert.ok(KINDS.includes(k));
    const buf = readFileSync(join(root, 'web', 'assets', 'meshes', `${k}.glb`));
    assert.ok(buf.length < 200 * 1024, k);
    assert.ok(loadGlbBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)).triangles.length > 0, k);
  }
  for (const k of Object.keys(STRINGS.en).filter((x) => x.startsWith('home.'))) assert.ok(STRINGS.fr[k], k);
});
