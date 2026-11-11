import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, InteractionRules } from '../src/core.js';
import { loadGlbBuffer, appendMeshVertices, fitScale, VERTEX_FLOATS } from '../src/glb.js';
import { padAxes3d, touchDrive, isTap } from '../src/input.js';
import * as M from '../src/view3d-math.js';
import { buildWorld, createGlRenderer } from '../src/view3d.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(web, 'data', 'village_catalog.json'), 'utf8')).entries);
const layout = (seed) => generateLayout(catalog, 24, 24, 80, seed).map((p, i) => ({ ...p, detail: 3, vis: { lit: 0.9, lit2: 0.9, phase: i } }));
const mesh = (k) => loadGlbBuffer(readFileSync(join(web, 'assets', 'meshes', `${k}.glb`)));
const near = (a, b, e = 1e-5) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test('view=3d is opt-in only', () => {
  assert.equal(M.view3dWanted('', ''), false);
  assert.equal(M.view3dWanted('?view=3d', ''), true);
  assert.equal(M.view3dWanted('', '#seed=1&view=3d'), true);
  assert.equal(M.view3dWanted('?view=2d', ''), false);
});
test('cam3d parameter parses and rejects junk', () => {
  const c = M.parseCamParam('10,20,90,10');
  near(c.yaw, Math.PI / 2); near(c.pitch, (10 * Math.PI) / 180);
  assert.equal(M.parseCamParam('1,2'), null); assert.equal(M.parseCamParam('a,b,c'), null); assert.equal(M.parseCamParam(null), null);
});
test('camera matrices: forward point lands at the screen centre, behind is null', () => {
  const cam = { x: 5, y: 1.6, z: 5, yaw: 0, pitch: 0 }, vp = M.viewProjection(cam, 16 / 9);
  const c = M.projectPoint(vp, [5, 1.6, -5]);
  near(c[0], 0); near(c[1], 0);
  assert.equal(M.projectPoint(vp, [5, 1.6, 20]), null);
  const right = M.projectPoint(vp, [8, 1.6, -5]); assert.ok(right[0] > 0);
  const up = M.projectPoint(vp, [5, 4, -5]); assert.ok(up[1] > 0);
  const turned = M.projectPoint(M.viewProjection({ ...cam, yaw: Math.PI / 2 }, 1), [15, 1.6, 5]);
  near(turned[0], 0);
});
test('screenRay centre equals the forward vector', () => {
  const cam = { x: 0, y: 1.6, z: 0, yaw: 0.7, pitch: -0.2 }, r = M.screenRay(cam, 0, 0, 1.5), f = M.forwardVector(cam.yaw, cam.pitch);
  r.forEach((v, i) => near(v, f[i]));
});
test('walking: forward moves along facing, pitch clamps, bounds and boxes block', () => {
  const bounds = M.worldBounds(24, 24), none = [];
  let cam = { x: 50, y: 1.6, z: 50, yaw: 0, pitch: 0 };
  cam = M.stepCamera(cam, { forward: 1 }, 0.1, none, bounds);
  near(cam.z, 50 - M.WALK_SPEED * 0.1); near(cam.x, 50);
  assert.equal(M.stepCamera(cam, { look: 1 }, 0.1, none, bounds, { dx: 0, dy: -100000 }).pitch, M.MAX_PITCH);
  const wall = [{ minX: 40, maxX: 60, minZ: 30, maxZ: 40, height: 3 }];
  let c = { x: 50, y: 1.6, z: 41, yaw: 0, pitch: 0 };
  for (let i = 0; i < 40; i++) c = M.stepCamera(c, { forward: 1 }, 0.05, wall, bounds);
  assert.ok(c.z >= 40 + M.BODY_RADIUS - 1e-6);
  let e = { x: 0, y: 1.6, z: 0, yaw: -Math.PI / 2, pitch: 0 };
  for (let i = 0; i < 100; i++) e = M.stepCamera(e, { forward: 1 }, 0.1, none, bounds);
  assert.equal(e.x, bounds.minX);
  const diag = M.stepCamera({ x: 50, y: 1.6, z: 50, yaw: 0, pitch: 0 }, { forward: 1, strafe: 1 }, 0.1, none, bounds);
  near(Math.hypot(diag.x - 50, diag.z - 50), M.WALK_SPEED * 0.1, 1e-4);
});
test('a centre inside a box is pushed out', () => {
  const r = M.resolveCollisions(50, 35, 0.35, [{ minX: 40, maxX: 60, minZ: 30, maxZ: 40 }]);
  assert.ok(r.z >= 40 + 0.35 - 1e-9 || r.z <= 30 - 0.35 + 1e-9);
});
test('spawn point is free and deterministic for many seeds', () => {
  for (const seed of [1, 7, 42, 1818, 99999]) {
    const l = layout(seed), a = M.spawnPoint(l, 24, 24), b = M.spawnPoint(l, 24, 24);
    assert.deepEqual(a, b);
    assert.ok(!M.worldBoxes(l).some((bx) => a.x > bx.minX && a.x < bx.maxX && a.z > bx.minZ && a.z < bx.maxZ), `seed ${seed}`);
  }
});
test('picking: nearest box wins, misses return null, range uses InteractionRules', () => {
  const boxes = [{ minX: -1, maxX: 1, minZ: -12, maxZ: -10, height: 3 }, { minX: -1, maxX: 1, minZ: -5, maxZ: -3, height: 3 }];
  const hit = M.pickBox([0, 1.6, 0], [0, 0, -1], boxes);
  assert.equal(hit.index, 1); near(hit.distance, 3);
  assert.ok(InteractionRules.inRange(hit.distance));
  assert.equal(M.pickBox([0, 1.6, 0], [0, 0, 1], boxes), null);
  assert.equal(M.pickBox([0, 5, 0], [0, 0, -1], boxes), null); // passes over the roof
  assert.ok(!InteractionRules.inRange(M.pickBox([0, 1.6, 8], [0, 0, -1], boxes).distance));
  assert.equal(M.pickBox([0, 1.6, 0], [0, 0, -1], boxes, 2), null);
});
test('fog thickens with dread and weather, is monotonic in distance, breath is off when reduced', () => {
  assert.ok(M.fogDensity({ dread: 1 }) > M.fogDensity({ dread: 0 }));
  assert.ok(M.fogDensity({ weather: 'fog' }) > M.fogDensity({ weather: 'rain' }) && M.fogDensity({ weather: 'rain' }) > M.fogDensity({ weather: 'clear' }));
  assert.equal(M.fogFactor(0, 0.02), 0);
  assert.ok(M.fogFactor(50, 0.02) < M.fogFactor(100, 0.02) && M.fogFactor(1e6, 0.02) > 0.999);
  assert.equal(M.fogDensity({ dread: 1, timeSec: 2.75, reduced: true }), M.fogDensity({ dread: 1, timeSec: 8, reduced: true }));
  assert.notEqual(M.fogDensity({ dread: 1, timeSec: 2.75 }), M.fogDensity({ dread: 1, timeSec: 8 }));
});
test('sky and moon: valid colours, deterministic, night darker than dusk, rain veils the moon', () => {
  for (const sky of ['dusk', 'night', 'witching']) for (const w of ['clear', 'rain', 'fog']) {
    const s = M.skyColors(sky, w, 0.5);
    for (const c of [s.zenith, s.horizon, s.fog, s.ambient]) c.forEach((v) => assert.ok(v >= 0 && v <= 1));
  }
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(M.skyColors('dusk', 'clear', 0).horizon) > lum(M.skyColors('night', 'clear', 0).horizon));
  assert.deepEqual(M.moonParams(1818, 2, 'night', 'clear'), M.moonParams(1818, 2, 'night', 'clear'));
  const m = M.moonParams(1818, 2, 'night', 'clear'); near(Math.hypot(...m.dir), 1); assert.ok(m.dir[1] > 0);
  assert.ok(M.moonParams(1818, 2, 'night', 'rain').color[2] < m.color[2]);
});
test('lanterns: only lit houses, nearest first and capped, flicker steady when reduced and synchronised at high dread', () => {
  const l = layout(1818), lights = M.lanternLights(l);
  assert.ok(lights.length > 0);
  assert.equal(M.lanternLights(l.map((p) => ({ ...p, detail: 0 }))).length, 0);
  const cam = { x: 48, z: 48 }, near8 = M.nearestLights(lights, cam);
  assert.ok(near8.length <= M.MAX_LIGHTS - 1);
  for (let i = 1; i < near8.length; i++) assert.ok(Math.hypot(near8[i].pos[0] - 48, near8[i].pos[2] - 48) >= Math.hypot(near8[i - 1].pos[0] - 48, near8[i - 1].pos[2] - 48));
  assert.equal(M.lanternFlicker(3, 12.3, 0.5, true), 1);
  const spread = (d) => { const v = [0, 1, 2, 3, 4, 5].map((p) => M.lanternFlicker(p, 7.3, d, false)); return Math.max(...v) - Math.min(...v); };
  assert.ok(spread(1) < spread(0.1) * 0.2, 'rhythms converge at the Abyss');
  for (const d of [0, 0.5, 1]) for (let t = 0; t < 20; t += 0.7) { const f = M.lanternFlicker(1, t, d, false); assert.ok(f > 0.4 && f < 1.2); }
  assert.ok(M.carriedLantern(1).radius < M.carriedLantern(0).radius && M.carriedLantern(1).radius > 0);
});
test('coast never takes the spawn (south) edge; terrain rects are consistent', () => {
  for (let s = -50; s < 50; s++) assert.ok([0, 1, 2].includes(M.coastSide(s)));
  const t = M.terrainRects(24, 24, 1818);
  assert.ok(t.ground.maxX > t.ground.minX && t.sea.minX < t.ground.minX && t.sea.y < 0);
});
test('particles: none with reduced motion, seeded and bounded otherwise', () => {
  assert.deepEqual(M.particleCounts({ weather: 'rain', dread: 1, reduced: true }), { rain: 0, mist: 0 });
  assert.ok(M.particleCounts({ weather: 'rain', dread: 0 }).rain > 0 && M.particleCounts({ weather: 'clear', dread: 0 }).rain === 0);
  const a = M.particleSeeds(5, 10, 1), b = M.particleSeeds(5, 10, 1);
  assert.deepEqual(a, b); assert.ok(a.every((v) => v >= 0 && v < 1)); assert.notDeepEqual(a, M.particleSeeds(5, 10, 2));
});
test('perf budget: render size is capped and the scale adapts slowly', () => {
  const s = M.renderSize(1920, 1080, 2, 1); assert.ok(s.width * s.height <= M.MAX_PIXELS + s.width);
  assert.deepEqual(M.renderSize(100, 100, 1, 1), { width: 100, height: 100 });
  assert.equal(M.nextScale(1, 40, 10), 1, 'needs 30 frames before it reacts');
  assert.equal(M.nextScale(1, 40, 60), 0.75); assert.equal(M.nextScale(0.5, 40, 60), 0.5); assert.equal(M.nextScale(0.5, 8, 60), 0.75); assert.equal(M.nextScale(1, 8, 60), 1);
});
test('headBob is zero when reduced or standing still', () => {
  assert.equal(M.headBob(1, 1, true), 0); assert.equal(M.headBob(1, 0, false), 0); assert.ok(Math.abs(M.headBob(0.2, 1, false)) <= 0.035);
});
test('input.js 3D mappings: dead zone, joystick, tap', () => {
  assert.deepEqual(padAxes3d({ axes: [0.1, -0.1, 0, 0] }), { strafe: 0, forward: -0, turn: 0, look: -0 });
  const a = padAxes3d({ axes: [1, -1, -1, 1] }); assert.deepEqual([a.strafe, a.forward, a.turn, a.look], [1, 1, -1, -1]);
  assert.deepEqual(padAxes3d(null), { strafe: 0, forward: -0, turn: 0, look: -0 });
  assert.deepEqual(touchDrive({ x: 0, y: 0 }, { x: 0, y: -60 }), { strafe: 0, forward: 1 });
  assert.equal(touchDrive({ x: 0, y: 0 }, { x: 600, y: 0 }).strafe, 1); assert.deepEqual(touchDrive(null, null), { forward: 0, strafe: 0 });
  assert.ok(isTap(0, 0, 3, 3, 100)); assert.ok(!isTap(0, 0, 30, 0, 100)); assert.ok(!isTap(0, 0, 0, 0, 900)); assert.ok(!isTap(NaN, 0, 0, 0, 1));
});
test('glb extension feeds GL buffers from the committed meshes, placed on the footprint, deterministic', () => {
  const house = mesh('house_a'), piece = { id: 'house_a', x: 2, z: 3, sizeX: 1, sizeZ: 1 };
  const a = [], b = [];
  const h = appendMeshVertices(a, house, piece, 4, { glow: 1 }); appendMeshVertices(b, house, piece, 4, { glow: 1 });
  assert.deepEqual(a, b);
  assert.equal(a.length, house.triangles.length * 3 * VERTEX_FLOATS);
  assert.ok(h > 0 && near(h, house.bounds.max[1] * fitScale(house, piece, 4)) === undefined);
  for (let i = 0; i < a.length; i += VERTEX_FLOATS) {
    assert.ok(a[i] >= 8 - 0.01 && a[i] <= 12 + 0.01 && a[i + 2] >= 12 - 0.01 && a[i + 2] <= 16 + 0.01 && a[i + 1] >= -1e-6);
    near(Math.hypot(a[i + 3], a[i + 4], a[i + 5]), 1, 1e-3);
  }
  const emissive = []; for (let i = 0; i < a.length; i += VERTEX_FLOATS) if (a[i + 9] > 0) emissive.push(i);
  assert.ok(emissive.length > 0);
  const dark = []; appendMeshVertices(dark, house, piece, 4, { glow: 0 }); assert.ok(dark.every((v, i) => i % VERTEX_FLOATS !== 9 || v === 0));
});
test('buildWorld is deterministic, uses every kind, and falls back to boxes without meshes', () => {
  const l = layout(1818), meshes = new Map(['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree', 'lamp'].map((k) => [k, mesh(k)]));
  const w1 = buildWorld({ layout: l, meshes, seed: 1818, gridW: 24, gridD: 24 }), w2 = buildWorld({ layout: l, meshes, seed: 1818, gridW: 24, gridD: 24 });
  assert.deepEqual(w1.building, w2.building);
  assert.equal(w1.heights.length, l.length); assert.ok(w1.heights.every((v) => v > 0));
  const boxes = buildWorld({ layout: l, meshes: null, seed: 1818, gridW: 24, gridD: 24 });
  assert.ok(boxes.building.length > 0 && boxes.heights.every((v) => v === 3));
  assert.ok(w1.ground.length === 6 * VERTEX_FLOATS && w1.sea.length === 6 * VERTEX_FLOATS);
  assert.ok(buildWorld({ layout: l, meshes, seed: 1818, gridW: 24, gridD: 24, groundTint: [100, 100, 100] }).ground[6] > 0);
});
test('smoke: the GL renderer runs a frame against a recording stub context', () => {
  const calls = [];
  const gl = new Proxy({}, { get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 1 : (...a) => { calls.push(name); return name === 'getShaderParameter' || name === 'getProgramParameter' ? true : {}; }) });
  const r = createGlRenderer(gl), l = layout(7);
  const meshes = new Map([['house_a', mesh('house_a')]]);
  r.setWorld(buildWorld({ layout: l, meshes, seed: 7, gridW: 24, gridD: 24 })); r.setParticles(M.particleSeeds(7, 30, 1), M.particleSeeds(7, 10, 2)); r.resize(320, 180);
  const cam = { x: 48, y: 1.6, z: 90, yaw: 0, pitch: 0 }, sk = M.skyColors('night', 'rain', 0.4);
  r.draw({ vp: M.viewProjection(cam, 16 / 9), basis: M.cameraBasis(cam), camPos: [48, 1.6, 90], aspect: 16 / 9, time: 1, reduced: false, sky: sk, moon: M.moonParams(7, 1, 'night', 'rain'),
    lights: [{ pos: [1, 2, 3], radius: 9, color: [1, 0.7, 0.4] }], fog: 0.02, fogColor: sk.fog, glowColor: [1, 0.7, 0.4], pointScale: 90 });
  assert.ok(calls.includes('drawArrays') && calls.filter((c) => c === 'drawArrays').length >= 5);
});
test('view3d wiring: precached, no CDN, no inline script, interaction via core rules', () => {
  const app = readFileSync(join(web, 'src', 'app.js'), 'utf8'), v = readFileSync(join(web, 'src', 'view3d.js'), 'utf8');
  assert.match(app, /view3dWanted\(location\.search, location\.hash\)/);
  assert.match(v, /InteractionRules\.inRange/); assert.match(v, /InteractionRules\.cooldownElapsed/);
  assert.match(app, /InteractionRules\.sanityDelta\(kind\)/);
  assert.ok(!/https?:\/\//.test(v) && !/https?:\/\//.test(readFileSync(join(web, 'src', 'view3d-math.js'), 'utf8')));
  assert.match(readFileSync(join(web, 'sw.js'), 'utf8'), /src\/view3d\.js/);
});
