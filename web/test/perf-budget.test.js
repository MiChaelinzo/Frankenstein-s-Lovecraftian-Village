import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, generateCampaign, generateRitual } from '../src/core.js';
import { computeView, buildWalkers, occupancy, MAX_WALKERS } from '../src/scene.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
const html = readFileSync(join(web, 'index.html'), 'utf8');
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(web, 'data', 'village_catalog.json'), 'utf8')).entries);
const num = (name) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(app)[1]);

// Static complexity budget: the numbers that multiply per-frame draw work.
test('static budget: grid, piece count and canvas size stay small', () => {
  const gw = num('GRID_W'), gd = num('GRID_D'), pieces = num('PIECES');
  assert.ok(gw * gd <= 32 * 32, `grid ${gw}x${gd}`);
  assert.ok(pieces <= 120, `${pieces} pieces`);
  assert.ok(MAX_WALKERS <= 10, `${MAX_WALKERS} walkers`);
  const [, cw, ch] = /<canvas id="view" width="(\d+)" height="(\d+)"/.exec(html).map(Number);
  assert.ok(cw * ch <= 1280 * 720, `canvas ${cw}x${ch}`);
});
test('static budget: frames are drawn only when dirty and the loop can stop', () => {
  assert.match(app, /let dirty = true/);
  assert.match(app, /const mark = \(\) => \{ dirty = true; start\(\); \}/);
  const loops = app.match(/requestAnimationFrame\(/g).length;
  assert.ok(loops <= 6, `${loops} requestAnimationFrame call sites`);
  assert.ok((app.match(/setInterval\(/g) || []).length <= 6);
});
test('static budget: draw.js has no unbounded retry loops', () => {
  const draw = readFileSync(join(web, 'src', 'draw.js'), 'utf8');
  assert.ok(!/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/.test(draw));
});

// Headless timing of the pure functions, with a generous bound (about 50x typical) so slow CI does not flake.
test('timing: generating 40 villages with campaigns, rituals and walkers stays under 4 s', () => {
  const t0 = performance.now();
  for (let seed = 1; seed <= 40; seed++) {
    const layout = generateLayout(catalog, 24, 24, 80, seed);
    const campaign = generateCampaign(seed);
    generateRitual(campaign);
    occupancy(layout, 24, 24);
    buildWalkers(layout, 24, 24, seed);
    computeView(960, 560, 24, 24);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `${ms.toFixed(0)} ms`);
});
test('timing: a single village is generated under 500 ms', () => {
  const t0 = performance.now();
  generateLayout(catalog, 24, 24, 80, 1818);
  assert.ok(performance.now() - t0 < 500);
});
