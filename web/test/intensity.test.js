import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INTENSITY_LEVELS, INTENSITY_PER_MILLE, intensityOf, intensityWanted, nextIntensity, loadIntensity, saveIntensity, INTENSITY_KEY } from '../src/access.js';
import { startState, step, presentation, FOG_GAIN_MAX, LIGHT_DIM_MAX, AMBIENCE_GAIN_MAX } from '../src/director.js';
import { createRealityView, parseRealityLibrary, HOUSE_TIER } from '../src/reality.js';
import { generateLayout, PrefabCatalog } from '../src/core.js';
import { STRINGS } from '../src/i18n.js';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const lib = parseRealityLibrary(readFileSync(join(src, '..', 'data', 'reality.json'), 'utf8'));
const cat = new PrefabCatalog([{ id: 'a', weight: 3 }, { id: 'big', weight: 1, footprintX: 2, footprintZ: 2 }]);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('intensity parsing: unknown means standard, query beats hash beats stored', () => {
  assert.deepEqual(INTENSITY_LEVELS, ['gentle', 'standard', 'dread']);
  assert.equal(intensityOf('nonsense'), 'standard');
  assert.equal(intensityWanted('', '', null), 'standard');
  assert.equal(intensityWanted('', '', 'dread'), 'dread');
  assert.equal(intensityWanted('?intensity=gentle', '', 'dread'), 'gentle');
  assert.equal(intensityWanted('?intensity=bogus', '', 'dread'), 'standard');
  assert.equal(nextIntensity('gentle'), 'standard');
  assert.equal(nextIntensity('dread'), 'gentle');
});

test('intensity storage round trips and survives a missing or broken storage', () => {
  const s = memory();
  assert.equal(loadIntensity(s), null);
  assert.equal(saveIntensity(s, 'dread'), true);
  assert.equal(s.getItem(INTENSITY_KEY), 'dread');
  assert.equal(loadIntensity(s), 'dread');
  assert.equal(saveIntensity(null, 'dread'), false);
  assert.equal(saveIntensity({ setItem() { throw new Error('full'); } }, 'dread'), false);
  assert.equal(loadIntensity({ getItem() { throw new Error('denied'); } }), null);
});

test('same seed, same Core output at every intensity (layout and director run never take an intensity)', () => {
  const run = (seed) => { let s = startState(); const out = []; for (let t = 1; t <= 40; t++) { s = step(seed, s, { tick: t, sanity: 800 - t * 10, knowledge: t * 5, stress: t * 3, safeZoneTicks: 0, clueProgress: t * 10, cultExposure: t * 4, encounters: t % 5 }); out.push([s.intensity, s.beat, s.cause]); } return out; };
  const baseline = JSON.stringify([generateLayout(cat, 12, 12, 30, 1347), run(1347)]);
  for (const level of INTENSITY_LEVELS) {
    presentation(0.7, { scale: INTENSITY_PER_MILLE[level] }); // choosing a level only reads Core, it cannot feed it
    assert.equal(JSON.stringify([generateLayout(cat, 12, 12, 30, 1347), run(1347)]), baseline, level);
  }
});

test('no Core port imports the intensity setting', () => {
  for (const f of readdirSync(src).filter((n) => n.endsWith('.js') && n !== 'app.js' && n !== 'access.js')) {
    const text = readFileSync(join(src, f), 'utf8');
    assert.ok(!/from '\.\/access\.js'/.test(text), `${f} must not import access.js`);
  }
});

test('director presentation scales with intensity and keeps its caps', () => {
  const g = presentation(1, { scale: 500 }), s = presentation(1), d = presentation(1, { scale: 1500 });
  assert.deepEqual(presentation(0.6, { scale: 1000 }), presentation(0.6));
  assert.ok(g.fogGain < s.fogGain && s.fogGain < d.fogGain);
  assert.ok(g.lightGain > s.lightGain && s.lightGain > d.lightGain);
  assert.ok(d.fogGain <= 1 + FOG_GAIN_MAX * 1.5 + 1e-9 && d.lightGain >= 1 - LIGHT_DIM_MAX * 1.5 - 1e-9 && d.ambienceGain <= 1 + AMBIENCE_GAIN_MAX * 1.5 + 1e-9);
  assert.deepEqual(presentation(1, { scale: 99999 }), d);
  assert.deepEqual(presentation(1, { scale: NaN }), s);
  assert.deepEqual(presentation(1, { scale: 1500, reduced: true }).lightGain, 1);
});

test('reality view: gentle drops one tier (skips, never softens); standard and dread match; truth and badge unaffected', () => {
  const make = (intensity) => createRealityView({ lib: () => lib, seed: () => 42, night: () => 3, tier: () => 5, lang: () => 'en', intensity });
  const names = (v) => Array.from({ length: 40 }, (_, h) => v.houseName(h, `H${h}`));
  const std = make(() => 1000), dread = make(() => 1500), gentle = make(() => 500);
  assert.deepEqual(names(dread), names(std));
  assert.ok(names(std).some((n, h) => n !== `H${h}`), 'tier 5 alters some houses');
  assert.equal(gentle.unreliable(), true);
  const t4 = createRealityView({ lib: () => lib, seed: () => 42, night: () => 3, tier: () => HOUSE_TIER + 1, lang: () => 'en', intensity: () => 1000 });
  assert.deepEqual(names(gentle), names(t4), 'gentle at tier 5 equals standard at tier 4');
  const g3 = createRealityView({ lib: () => lib, seed: () => 42, night: () => 3, tier: () => HOUSE_TIER, lang: () => 'en', intensity: () => 500 });
  assert.deepEqual(names(g3), Array.from({ length: 40 }, (_, h) => `H${h}`));
  gentle.setTruth(true);
  assert.deepEqual(names(gentle), Array.from({ length: 40 }, (_, h) => `H${h}`));
  assert.equal(createRealityView({ lib: () => lib, seed: () => 1, night: () => 1, tier: () => 0, lang: () => 'en' }).intensity(), 1000);
});

test('i18n: intensity strings exist in en and fr and the button carries a label', () => {
  for (const k of ['btn.intensity', 'btn.intensity.label', 'intensity.gentle', 'intensity.standard', 'intensity.dread', 'msg.intensity', 'keys.intensity']) {
    assert.ok(STRINGS.en[k] && STRINGS.fr[k], k);
  }
  const app = readFileSync(join(src, 'app.js'), 'utf8'), html = readFileSync(join(src, '..', 'index.html'), 'utf8');
  assert.match(html, /<button id="intensityToggle" type="button"/);
  assert.match(app, /btn\.intensity\.label/);
  assert.ok(!/<button id="intensityToggle"[^>]*style=/.test(html));
});
