// Life layer: display-only motion math (moths, leaves, chimney smoke, sway, shore surge). Pure and deterministic; the GL shader mirrors lifePosition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LIFE, LIFE_KIND, MAX_LIFE, MAX_FIREFLIES, FRAME_BUDGET, lifeParams, lifePosition, lifeSeeds, chimneySites, frameCost } from '../src/view3d-math.js';
import { QUALITY_TIERS } from '../src/quality.js';
import { weatherLook } from '../src/view3d-math.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const lights = [{ pos: [10, 2.2, 10] }, { pos: [30, 3.1, 12] }], chimneys = [{ x: 12, y: 6, z: 14 }, { x: 40, y: 5, z: 20 }];

test('lifeParams: tier gated, reduced motion is all zeros, total stays inside MAX_LIFE', () => {
  assert.deepEqual(lifeParams({ tier: QUALITY_TIERS.high, reduced: true }), { sway: 0, lap: 0, leaves: 0, moths: 0, smoke: 0 });
  const low = lifeParams({ tier: QUALITY_TIERS.low, weather: 'storm' }), med = lifeParams({ tier: QUALITY_TIERS.medium, weather: 'clear' }), high = lifeParams({ tier: QUALITY_TIERS.high, weather: 'storm' });
  assert.equal(low.leaves + low.moths + low.smoke, 0, 'Low draws no life points');
  assert.equal(low.lap, 0, 'Low has no shore surge (no foam shader)'); assert.equal(low.sway, 1);
  assert.ok(high.leaves > med.leaves, 'a storm drops more leaves than clear weather');
  for (const tier of Object.values(QUALITY_TIERS)) for (const weather of ['clear', 'fog', 'rain', 'storm']) {
    const p = lifeParams({ tier, weather, dread: 0.4 }); assert.ok(p.leaves + p.moths + p.smoke <= MAX_LIFE, weather);
  }
});
test('lifeParams: moths keep to dry weather and thin with dread; leaves need wind', () => {
  const t = QUALITY_TIERS.high;
  assert.equal(lifeParams({ tier: t, weather: 'rain' }).moths, 0);
  assert.ok(lifeParams({ tier: t, weather: 'clear', dread: 1 }).moths < lifeParams({ tier: t, weather: 'clear', dread: 0 }).moths);
  assert.ok(lifeParams({ tier: t, weather: 'storm' }).leaves > lifeParams({ tier: t, weather: 'fog' }).leaves);
  assert.ok(weatherLook('fog').wind < weatherLook('storm').wind);
});
test('lifeSeeds: same inputs give the same bytes, kinds are in order and clamped to MAX_LIFE', () => {
  const counts = { moths: 24, smoke: 24, leaves: 32 }, a = lifeSeeds({ seed: 1818, lights, chimneys, counts }), b = lifeSeeds({ seed: 1818, lights, chimneys, counts });
  assert.deepEqual([...a], [...b]); assert.notDeepEqual([...a], [...lifeSeeds({ seed: 7, lights, chimneys, counts })]);
  assert.equal(a.length, 80 * 4);
  const kinds = []; for (let i = 0; i < a.length; i += 4) kinds.push(Math.floor(a[i + 3]));
  assert.equal(kinds.filter((k) => k === LIFE_KIND.moth).length, 24); assert.equal(kinds.filter((k) => k === LIFE_KIND.smoke).length, 24); assert.equal(kinds.filter((k) => k === LIFE_KIND.leaf).length, 32);
  assert.equal(lifeSeeds({ seed: 1, lights, chimneys, counts: { moths: 500, smoke: 500, leaves: 500 } }).length, MAX_LIFE * 4);
  assert.equal(lifeSeeds({ seed: 1, lights: [], chimneys: [], counts: { moths: 5, smoke: 5, leaves: 0 } }).length, 0, 'no sites, no moths or smoke');
});
test('lifePosition: deterministic, moths stay near their lantern, smoke rises and wraps, leaves stay in the box and fall', () => {
  const seeds = lifeSeeds({ seed: 5, lights, chimneys, counts: { moths: 12, smoke: 12, leaves: 16 } }), wind = [0.4, 0.2], cam = [50, 50];
  for (let i = 0; i < seeds.length; i += 4) {
    const p = [...seeds.subarray(i, i + 4)], kind = Math.floor(p[3]);
    for (const t of [0, 3.3, 97.1, 1234.5]) {
      assert.deepEqual(lifePosition(p, t, wind, cam), lifePosition(p, t, wind, cam));
      const q = lifePosition(p, t, wind, cam);
      if (kind === LIFE_KIND.moth) assert.ok(Math.hypot(q[0] - p[0], q[2] - p[2]) <= LIFE.mothRadius * 1.35 && Math.abs(q[1] - p[1]) <= 0.36);
      if (kind === LIFE_KIND.smoke) assert.ok(q[1] >= p[1] && q[1] <= p[1] + LIFE.smokeRise + 1e-6 && q[3] >= 0 && q[3] < 1);
      if (kind === LIFE_KIND.leaf) assert.ok(q[0] >= cam[0] - LIFE.leafBox / 2 - 1e-6 && q[0] <= cam[0] + LIFE.leafBox / 2 + 1e-6 && q[1] >= 0 && q[1] <= LIFE.leafHeight + 1e-6);
    }
  }
  const smoke = [...seeds.subarray(12 * 4, 12 * 4 + 4)], later = lifePosition(smoke, LIFE.smokePeriod * 0.2, [0, 0]), early = lifePosition(smoke, 0, [0, 0]);
  assert.notEqual(later[1], early[1]);
  const leaf = [0.5, 0.9, 0.5, LIFE_KIND.leaf + 0.25];
  assert.ok(lifePosition(leaf, 2, [0, 0], [0, 0])[1] < lifePosition(leaf, 0, [0, 0], [0, 0])[1], 'leaves fall');
  assert.deepEqual(lifePosition([1, 2, 3, 0.5], 9), [1, 2, 3, 0], 'kind 0 is left to the firefly path');
});
test('chimneySites: one per lit house at roof height, none for unlit or other pieces', () => {
  const lit = { id: 'house_a', x: 2, z: 3, sizeX: 4, sizeZ: 3, vis: { lit: 0.9 }, detail: 3 }, dark = { id: 'house_b', x: 9, z: 9, sizeX: 3, sizeZ: 3, vis: { lit: 0.1 }, detail: 3 }, well = { id: 'well', x: 1, z: 1, sizeX: 1, sizeZ: 1 };
  const sites = chimneySites([lit, dark, well], [7.5, 6, 2], 4);
  assert.equal(sites.length, 1); assert.equal(sites[0].y, 7.5); assert.ok(sites[0].x > 2 * 4 && sites[0].x < 6 * 4);
});
test('life points share the firefly draw: the worst frame stays inside FRAME_BUDGET', () => {
  const worst = frameCost({ vertices: { building: 3000, ground: 600, sea: 6, coast: 3000, tentacle: 900 }, rain: 900, halos: 120, fireflies: MAX_FIREFLIES + MAX_LIFE, post: true, lights: 8 });
  assert.ok(worst.points <= FRAME_BUDGET.points && worst.drawCalls <= FRAME_BUDGET.drawCalls, JSON.stringify(worst));
});
test('shader mirrors the constants and the sway marker is removed again', () => {
  const src = readFileSync(join(web, 'src', 'view3d.js'), 'utf8');
  assert.match(src, /uniform float uSway/); assert.match(src, /vPhase=aPhase - fol \* 1000\.0 - hang \* 2000\.0/);
  assert.match(src, /\$\{LIFE\.smokePeriod\.toFixed\(1\)\}/); assert.match(src, /HANG_PHASE = 2000/);
  assert.match(src, /hang \* uSway/, 'sway is multiplied by uSway so reduced motion holds it still');
});
