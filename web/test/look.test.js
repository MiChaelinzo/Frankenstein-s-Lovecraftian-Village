import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeParams, closeFog, windowMood, rimLight, projectToScreen, godRayAmount, postParams, viewProjection } from '../src/view3d-math.js';
import { QUALITY_TIERS } from '../src/quality.js';

const { low, medium, high } = QUALITY_TIERS;
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('gradeParams is a pure function of time, dread, weather and tier', () => {
  const a = gradeParams({ tick: 960, dread: 0.3, weather: 'clear', tier: high }), b = gradeParams({ tick: 960, dread: 0.3, weather: 'clear', tier: high });
  assert.deepEqual(a, b);
});

test('gradeParams: dusk is amber over teal, night is cold blue, high dread is green and desaturated', () => {
  const dusk = gradeParams({ tick: 960, tier: medium }), night = gradeParams({ tick: 1250, tier: medium }), sick = gradeParams({ tick: 1250, dread: 1, tier: medium });
  assert.ok(dusk.highlight[0] > dusk.highlight[2] && dusk.shadow[1] > dusk.shadow[0], 'amber highlights, teal shadows');
  assert.ok(night.shadow[2] > night.shadow[0], 'cold blue shadows');
  assert.ok(sick.shadow[1] > sick.shadow[0] && sick.shadow[1] > sick.shadow[2], 'green cast');
  assert.ok(sick.sat < night.sat * 0.8, 'desaturated');
});

test('gradeParams: god rays only on High at night, never with high contrast; high contrast removes tints', () => {
  assert.equal(gradeParams({ tick: 1250, tier: medium }).godRays, 0);
  assert.equal(gradeParams({ tick: 1250, tier: low }).godRays, 0);
  assert.ok(gradeParams({ tick: 1250, tier: high }).godRays > 0);
  assert.equal(gradeParams({ tick: 700, tier: high }).godRays, 0, 'full day: no moon shafts');
  const hc = gradeParams({ tick: 960, dread: 1, tier: high, highContrast: true });
  assert.equal(hc.godRays, 0); assert.equal(hc.sat, 1); assert.equal(hc.grainScale, 0);
  assert.ok(hc.shadow.every((v) => Math.abs(v - 1) < 0.2));
});

test('closeFog: denser by tier, ground mist grows with tier, colour follows the sky and greens with dread', () => {
  const fog = [0.5, 0.3, 0.2];
  assert.ok(closeFog({ fog, tier: low }).density > closeFog({ fog, tier: high }).density);
  assert.ok(closeFog({ fog, tier: high }).ground > closeFog({ fog, tier: low }).ground);
  assert.ok(near(closeFog({ fog, tier: high }).color, fog), 'no dread: the sky fog colour unchanged');
  const sick = closeFog({ fog, tier: high, dread: 1 }).color;
  assert.ok(sick[1] > fog[1] * 0.9 && sick[0] < fog[0]);
});

test('windowMood: dread darkens and flickers more windows, Low draws none of it', () => {
  assert.ok(windowMood({ dread: 1, tier: medium }).unlit > windowMood({ dread: 0, tier: medium }).unlit);
  assert.ok(windowMood({ dread: 1, tier: medium }).flicker > windowMood({ dread: 0, tier: medium }).flicker);
  assert.ok(windowMood({ dread: 0, tier: medium }).unlit > 0, 'some windows are always unlit');
  assert.deepEqual(windowMood({ dread: 1, tier: low }), { unlit: 0, flicker: 0 });
});

test('rimLight: zero on Low, positive on Medium, follows the horizon colour', () => {
  assert.ok(rimLight({ tier: low }).every((v) => v === 0));
  const r = rimLight({ horizon: [0.9, 0.4, 0.3], tier: medium }); assert.ok(r[0] > r[2] && r[0] > 0);
});

test('projectToScreen and godRayAmount: centre point, behind camera, edge fade', () => {
  const vp = viewProjection({ x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 }, 1.6, 1.2);
  const s = projectToScreen(vp, [0, 1.6, 50]), back = projectToScreen(vp, [0, 1.6, -50]);
  assert.ok([s, back].some((p) => p.visible) && s.visible !== back.visible, 'exactly one of front and back is visible');
  const front = s.visible ? s : back;
  assert.ok(Math.abs(front.u - 0.5) < 1e-6 && Math.abs(front.v - 0.5) < 1e-3);
  assert.equal(godRayAmount(1, { visible: false, u: 0.5, v: 0.5 }), 0);
  assert.equal(godRayAmount(1, { visible: true, u: 0.5, v: 0.5 }), 1);
  assert.ok(godRayAmount(1, { visible: true, u: 1.3, v: 0.5 }) < 0.2);
});

test('postParams: chromatic aberration is zero below the high dread threshold and under reduced motion', () => {
  assert.equal(postParams({ dread: 0.4 }).chroma, 0);
  assert.ok(postParams({ dread: 0.9 }).chroma > 0);
  assert.equal(postParams({ dread: 0.9, reduced: true }).chroma, 0);
});

test('shader source: window mood is building-only and foliage is lifted out of the wall base shadow (round 22 regressions)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/view3d.js', import.meta.url), 'utf8');
  assert.match(src, /if \(uWin\.x > 0\.0 && uMode < 0\.5\)/, 'held, villager and coast lanterns (mode 3) must never take the window unlit state');
  assert.match(src, /if \(vFol > 0\.5\) base = base \* 1\.35/, 'grass, reeds and bushes get a colour lift');
  assert.match(src, /else if \(uMode < 0\.5 \|\| uMode > 2\.5\) base \*= mix\(/, 'wall base shadow skips foliage');
});
