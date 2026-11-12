import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrefabCatalog, generateLayout, InteractionRules } from '../src/core.js';
import { loadGlbBuffer, appendMeshVertices, fitScale, VERTEX_FLOATS } from '../src/glb.js';
import { padAxes3d, touchDrive, isTap } from '../src/input.js';
import * as M from '../src/view3d-math.js';
import { buildWorld, buildCoast, buildChurchHill, buildTentacles, createGlRenderer } from '../src/view3d.js';
import { omenTargets } from '../src/scene.js';
import { texturePlan } from '../src/pack.js';
import { tierFor } from '../src/core.js';

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
  assert.ok(w1.ground.length === (6 + 6 * M.contactRings(layout(1818), w1.lights).length) * VERTEX_FLOATS && w1.sea.length === 6 * VERTEX_FLOATS);
  assert.ok(buildWorld({ layout: l, meshes, seed: 1818, gridW: 24, gridD: 24, groundTint: [100, 100, 100] }).ground[6] > 0);
});
test('smoke: the GL renderer runs a frame against a recording stub context', () => {
  const calls = [];
  const gl = new Proxy({}, { get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 1 : (...a) => { calls.push(name); return name === 'getShaderParameter' || name === 'getProgramParameter' ? true : {}; }) });
  const r = createGlRenderer(gl), l = layout(7);
  const meshes = new Map([['house_a', mesh('house_a')]]);
  r.setWorld(buildWorld({ layout: l, meshes, seed: 7, gridW: 24, gridD: 24 })); r.setParticles(M.particleSeeds(7, 30, 1), M.particleSeeds(7, 10, 2)); r.resize(320, 180);
  const cam = { x: 48, y: 1.6, z: 90, yaw: 0, pitch: 0 }, sk = M.hazedSky('night', 'rain', 0.4, 2);
  r.setTentacles(buildTentacles({ bases: M.tentacleBases(24, 24, 7), grow: 1, dread: 0.9, timeSec: 1 }));
  r.draw({ vp: M.viewProjection(cam, 16 / 9), basis: M.cameraBasis(cam), camPos: [48, 1.6, 90], aspect: 16 / 9, time: 1, reduced: false, sky: sk, moon: M.moonParams(7, 1, 'night', 'rain'),
    lights: [{ pos: [1, 2, 3], radius: 9, color: [1, 0.7, 0.4] }], fog: 0.02, groundFog: 0.03, groundHeight: 2.5, eye: { ...M.eyeParams(7, 2), open: 1 }, fogColor: sk.fog, glowColor: [1, 0.7, 0.4], pointScale: 90,
    moonLight: M.moonBoost(M.moonParams(7, 1, 'night', 'rain').color), sea: M.seaParams({ dread: 0.4 }), waterTime: 1, fogOffset: [0, 0], flies: M.fireflyStyle(0.4, false), post: M.postParams({ dread: 0.4 }) });
  assert.ok(calls.includes('drawArrays') && calls.filter((c) => c === 'drawArrays').length >= 8, 'sky, sea, ground, buildings, coast, tentacles, halos, rain/mist');
});
test('smoke: post pass runs through the offscreen target when complete, and warns once then draws directly when the framebuffer is incomplete', () => {
  const run = (complete) => {
    const calls = [], warns = [];
    const gl = new Proxy({}, { get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 1 : (...a) => { calls.push(name + (name === 'bindFramebuffer' ? ':' + (a[1] ? 'fbo' : 'screen') : '')); return name === 'getShaderParameter' || name === 'getProgramParameter' ? true : name === 'checkFramebufferStatus' ? (complete ? 1 : 0) : {}; }) });
    const orig = console.warn; console.warn = (m) => warns.push(m);
    try {
      const r = createGlRenderer(gl), cam = { x: 48, y: 1.6, z: 90, yaw: 0, pitch: 0 }, sk = M.hazedSky('night', 'clear', 0.4, 2);
      r.resize(320, 180);
      const frame = { vp: M.viewProjection(cam, 16 / 9), basis: M.cameraBasis(cam), camPos: [48, 1.6, 90], aspect: 16 / 9, time: 1, reduced: false, sky: sk, moon: M.moonParams(7, 1, 'night', 'clear'), moonLight: [0.5, 0.5, 0.5],
        lights: [], fog: 0.02, groundFog: 0.03, groundHeight: 2.5, eye: { ...M.eyeParams(7, 2), open: 0 }, fogColor: sk.fog, glowColor: [1, 0.7, 0.4], pointScale: 90, sea: M.seaParams({}), waterTime: 1, fogOffset: [0, 0], flies: M.fireflyStyle(0, false), post: M.postParams({ dread: 0.2 }) };
      r.draw(frame); r.draw(frame);
    } finally { console.warn = orig; }
    return { calls, warns };
  };
  const ok = run(true); assert.equal(ok.warns.length, 0); assert.ok(ok.calls.includes('bindFramebuffer:fbo'));
  const bad = run(false); assert.equal(bad.warns.length, 1, 'one warning, not one per frame'); assert.match(bad.warns[0], /post pass disabled/);
  assert.ok(!bad.calls.slice(bad.calls.lastIndexOf('checkFramebufferStatus')).includes('bindFramebuffer:fbo'), 'after the failure every frame goes straight to the screen');
});
test('view3d wiring: precached, no CDN, no inline script, interaction via core rules', () => {
  const app = readFileSync(join(web, 'src', 'app.js'), 'utf8'), v = readFileSync(join(web, 'src', 'view3d.js'), 'utf8');
  assert.match(app, /view3dWanted\(location\.search, location\.hash\)/);
  assert.match(v, /InteractionRules\.inRange/); assert.match(v, /InteractionRules\.cooldownElapsed/);
  assert.match(app, /InteractionRules\.sanityDelta\(kind\)/);
  assert.ok(!/https?:\/\//.test(v) && !/https?:\/\//.test(readFileSync(join(web, 'src', 'view3d-math.js'), 'utf8')));
  assert.match(readFileSync(join(web, 'sw.js'), 'utf8'), /src\/view3d\.js/);
});

// ---------- round 15: atmosphere, coast, omens, pack textures, budget ----------
const meshSet = () => new Map(['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree', 'lamp'].map((k) => [k, mesh(k)]));

test('each night has its own haze, the cycle repeats, and the fog follows the hazed horizon', () => {
  assert.notDeepEqual(M.nightHaze(1), M.nightHaze(2));
  assert.deepEqual(M.nightHaze(1), M.nightHaze(1 + M.NIGHT_HAZE.length)); assert.deepEqual(M.nightHaze(0), M.nightHaze(1));
  const a = M.hazedSky('night', 'clear', 0.2, 1), b = M.hazedSky('night', 'clear', 0.2, 2);
  assert.notDeepEqual(a.horizon, b.horizon); assert.deepEqual(a.horizon, M.hazedSky('night', 'clear', 0.2, 1).horizon);
  a.fog.forEach((v, i) => near(v, a.horizon[i] * 0.85));
  assert.ok([...a.horizon, ...a.fog].every((v) => v >= 0 && v <= 1));
});
test('fog is layered: ground mist is thicker in fog, rises with dread, breathes, and holds still when reduced', () => {
  const clear = M.fogLayers({ weather: 'clear' }), fog = M.fogLayers({ weather: 'fog' });
  assert.ok(fog.ground > clear.ground && fog.density > clear.density);
  assert.ok(M.fogLayers({ dread: 1 }).groundHeight > M.fogLayers({ dread: 0 }).groundHeight);
  assert.notEqual(M.fogLayers({ timeSec: 0 }).ground, M.fogLayers({ timeSec: 4 }).ground);
  assert.equal(M.fogLayers({ timeSec: 0, reduced: true }).ground, M.fogLayers({ timeSec: 4, reduced: true }).ground);
});
test('lantern halos: one per light, with the lamp post wider than the door lantern', () => {
  const lights = M.lanternLights(layout(5)), h = M.haloSprites(lights);
  assert.equal(h.length, lights.length * M.HALO_FLOATS); assert.ok(lights.length > 0);
  lights.forEach((l, i) => { near(h[i * M.HALO_FLOATS + 1], l.pos[1]); near(h[i * M.HALO_FLOATS + 4], M.haloSize(l)); });
  assert.ok(M.haloSize({ post: true }) > M.haloSize({ post: false }));
  assert.equal(buildWorld({ layout: layout(5), meshes: null, seed: 5, gridW: 24, gridD: 24 }).halos.length, h.length);
});
test('coast: the frame sits on the sea side, features are seeded, and the dock, boats and cliffs are well formed', () => {
  for (const seed of [1, 7, 1818, 99, 4242, 31337]) {
    const f = M.coastFrame(24, 24, seed), t = M.terrainRects(24, 24, seed);
    assert.equal(f.side, t.side); assert.notEqual(f.side, 3, 'never the south spawn edge');
    const c = M.coastFeatures(24, 24, seed);
    assert.deepEqual(c, M.coastFeatures(24, 24, seed));
    assert.equal(c.boats.length, 2); assert.equal(c.cliffs.length, 2);
    assert.ok(c.dock.u > f.lo && c.dock.u < f.hi && c.dock.length >= 14 && c.dock.posts >= 5);
    const w = M.coastToWorld(f, c.dock.u, c.dock.length);
    if (f.axis === 'x') assert.ok(f.dir < 0 ? w.x < t.ground.minX : w.x > t.ground.maxX); else assert.ok(w.z < t.ground.minZ);
  }
  assert.notDeepEqual(M.coastFeatures(24, 24, 1), M.coastFeatures(24, 24, 2));
});
test('coast and church geometry: deterministic, finite, unit normals, church stands opposite the sea', () => {
  for (const seed of [3, 1818, 777]) {
    const a = buildCoast({ gridW: 24, gridD: 24, seed }), b = buildCoast({ gridW: 24, gridD: 24, seed }), ch = buildChurchHill({ gridW: 24, gridD: 24, seed });
    assert.deepEqual(a, b); assert.ok(a.length > 0 && a.length % (3 * VERTEX_FLOATS) === 0 && ch.length % (3 * VERTEX_FLOATS) === 0);
    for (const arr of [a, ch]) for (let i = 0; i < arr.length; i += VERTEX_FLOATS) { assert.ok(arr.slice(i, i + VERTEX_FLOATS).every(Number.isFinite)); near(Math.hypot(arr[i + 3], arr[i + 4], arr[i + 5]), 1, 1e-3); }
    const site = M.churchSite(24, 24, seed), side = M.coastSide(seed);
    if (side === 0) assert.ok(site.x > 24 * 4); if (side === 1) assert.ok(site.x < 0);
    assert.ok(Math.max(...ch.filter((_, i) => i % VERTEX_FLOATS === 1)) > site.hill + 15, 'steeple rises above the hill');
    assert.ok(ch.some((v, i) => i % VERTEX_FLOATS === 9 && v > 0), 'lit windows');
  }
});
test('omens in 3D use the same decision function as the 2D canvas', () => {
  assert.deepEqual(omenTargets(0), { eye: 0, tentacle: 0 }); assert.deepEqual(omenTargets(1), { eye: 0, tentacle: 0 });
  assert.deepEqual(omenTargets(2), { eye: 0, tentacle: 0.4 }); assert.deepEqual(omenTargets(3), { eye: 1, tentacle: 1 });
  const draw = readFileSync(join(web, 'src', 'draw.js'), 'utf8'), v = readFileSync(join(web, 'src', 'view3d.js'), 'utf8');
  assert.match(draw, /omenTargets\(tier\)/); assert.match(v, /omenTargets\(tierFor\(s\.dread\)\)/);
  assert.ok(tierFor(0.95) >= 3 && omenTargets(tierFor(0.95)).eye === 1);
});
test('tentacles: absent below tier 2, grow with the omen, deterministic, sway only when motion is allowed', () => {
  const bases = M.tentacleBases(24, 24, 1818), args = { bases, grow: 1, dread: 0.8, timeSec: 2 };
  assert.equal(bases.length, 3); assert.deepEqual(bases, M.tentacleBases(24, 24, 1818));
  assert.equal(buildTentacles({ ...args, grow: 0 }).length, 0);
  const small = buildTentacles({ ...args, grow: 0.1 }), full = buildTentacles(args);
  assert.ok(small.length > 0 && full.length > small.length, 'more tentacles stand as the omen strengthens');
  const top = (a) => Math.max(...a.filter((_, i) => i % VERTEX_FLOATS === 1));
  assert.ok(top(full) > top(small)); assert.deepEqual(full, buildTentacles(args));
  assert.notDeepEqual(buildTentacles({ ...args, timeSec: 3 }), full);
  assert.deepEqual(buildTentacles({ ...args, timeSec: 3, reduced: true }), buildTentacles({ ...args, timeSec: 9, reduced: true }));
  const eye = M.eyeParams(1818, 3); near(Math.hypot(...eye.dir), 1, 1e-9); assert.ok(eye.dir[1] > 0.3); assert.deepEqual(eye, M.eyeParams(1818, 3));
});
test('pack textures in 3D: planned only from the manifest roles, as local-pack URLs, null when absent', () => {
  assert.deepEqual(texturePlan({}), { wall: null, ground: null });
  const roles = { wall_stone: { texture: 'textures/s.png' }, ground_stones: { texture: 'textures/g.png' } };
  assert.deepEqual(texturePlan(roles), { wall: 'local-pack/textures/s.png', ground: 'local-pack/textures/g.png' });
  assert.equal(texturePlan({ wall_plaster: { texture: 'textures/p.png' }, wall_stone: roles.wall_stone }).wall, 'local-pack/textures/p.png');
  const app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
  assert.match(app, /packTextures: \(\) => \(pack\.want && pack\.roles \? texturePlan\(pack\.roles\) : null\)/);
});
test('frame budget (pure counts, not timings): worst case weather, dread and lights stay within FRAME_BUDGET', () => {
  for (const seed of [1818, 7, 4242]) {
    const w = buildWorld({ layout: layout(seed), meshes: meshSet(), seed, gridW: 24, gridD: 24 });
    const tent = buildTentacles({ bases: M.tentacleBases(24, 24, seed), grow: 1, dread: 1 });
    const parts = M.particleCounts({ weather: 'rain', dread: 1, reduced: false }), mist = M.particleCounts({ weather: 'fog', dread: 1, reduced: false });
    const cost = M.frameCost({
      vertices: { building: w.building.length / VERTEX_FLOATS, ground: w.ground.length / VERTEX_FLOATS, sea: w.sea.length / VERTEX_FLOATS, coast: w.coast.length / VERTEX_FLOATS, tentacle: tent.length / VERTEX_FLOATS },
      rain: parts.rain, mist: mist.mist, halos: w.halos.length / M.HALO_FLOATS, lights: w.lights.length, post: true,
    });
    const B = M.FRAME_BUDGET;
    assert.ok(cost.drawCalls <= B.drawCalls, `draw calls ${cost.drawCalls}`); assert.ok(cost.triangles <= B.triangles, `triangles ${cost.triangles}`);
    assert.ok(cost.points <= B.points, `points ${cost.points}`); assert.ok(cost.lights <= B.lights); assert.ok(cost.halos <= B.halos, `halos ${cost.halos}`);
  }
  assert.equal(M.frameCost({ vertices: { building: 30 }, rain: 5 }).drawCalls, 3);
  assert.equal(M.particleCounts({ weather: 'rain', dread: 1, reduced: true }).rain, 0, 'reduced motion draws no particles');
});
test('view3d wiring for round 15: fly camera replaces walking, pack textures only via the plan, no network', () => {
  const v = readFileSync(join(web, 'src', 'view3d.js'), 'utf8'), app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
  assert.match(v, /s\.fly \? \{ \.\.\.s\.fly \}/); assert.match(app, /flythroughCamera\(/); assert.match(app, /cine\.on && view3d\.active/);
  assert.ok(!/fetch\(/.test(v.replace(/loadMeshSet\(fetch\.bind\(globalThis\)/, '')), 'pack textures load through Image, not fetch');
});

test('round 16 omen framing: eye and tentacles fit the frame at Dire and Abyss for many seeds, deterministically', () => {
  for (const [gridW, gridD] of [[24, 24], [16, 16], [32, 24]]) for (const aspect of [16 / 9, 4 / 3]) {
    for (let seed = 1; seed <= 120; seed++) {
      for (const [tier, grow, eyeOpen] of [[2, 0.4, 0], [3, 1, 1]]) {
        const args = { gridW, gridD, seed, nightNumber: 1 + (seed % 5), grow, eyeOpen, aspect };
        assert.deepEqual(omenTargets(tier), { eye: eyeOpen, tentacle: grow }, 'framing inputs match the shared omen strengths');
        const cam = M.omenFraming(args);
        assert.ok(cam.fits, `seed ${seed} ${gridW}x${gridD} tier ${tier} aspect ${aspect.toFixed(2)} must fit`);
        assert.deepEqual(cam, M.omenFraming(args));
        const vp = M.viewProjection(cam, aspect);
        for (const q of M.omenPoints(args).filter((p) => p.p)) {
          const n = M.projectPoint(vp, q.p);
          assert.ok(n && Math.abs(n[0]) <= 0.88 && Math.abs(n[1]) <= 0.88, 'tentacle point inside the frame');
        }
      }
    }
  }
});

test('round 16 omen framing: the eye hangs over the sea and blendCamera takes the short way round', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const e = M.eyeParams(seed, 2, 24, 24), f = M.coastFrame(24, 24, seed), sea = f.axis === 'x' ? [f.dir, 0] : [0, f.dir];
    assert.ok((e.dir[0] * sea[0] + e.dir[2] * sea[1]) / Math.cos(Math.asin(e.dir[1])) > 0.93, 'eye faces the sea');
    assert.ok(e.dir[1] > 0.3 && e.dir[1] < 0.55);
  }
  assert.deepEqual(M.eyeParams(7, 2), M.eyeParams(7, 2));
  const a = { x: 0, y: 0, z: 0, yaw: 3.0, pitch: 0 }, b = { x: 10, y: 4, z: 0, yaw: -3.0, pitch: 0.2 };
  const mid = M.blendCamera(a, b, 0.5);
  assert.ok(Math.abs(Math.abs(mid.yaw) - Math.PI) < 0.2, 'yaw crosses +-PI, not zero');
  assert.deepEqual(M.blendCamera(a, b, 0), { ...a }); assert.equal(M.blendCamera(a, b, 2).x, 10);
  assert.equal(M.omenBlendWeight(false, 1), 0, 'no framing outside the fly-through');
  assert.equal(M.omenBlendWeight(true, 0), 0); assert.equal(M.omenBlendWeight(true, 0.01), 0);
  assert.ok(Math.abs(M.omenBlendWeight(true, 0.2) - 0.5) < 1e-9);
  assert.equal(M.omenBlendWeight(true, 0.4), 1); assert.equal(M.omenBlendWeight(true, 1), 1);
  assert.equal(M.omenBlendWeight(true, NaN), 0);
});

test('round 16 props: coastProps and lampKind are seeded and in range', async () => {
  const { KINDS, PROP_KINDS } = await import('../src/glb.js');
  for (const k of PROP_KINDS) assert.ok(KINDS.includes(k), k);
  for (let seed = 1; seed <= 40; seed++) {
    const p = M.coastProps(24, 24, seed), f = M.coastFrame(24, 24, seed);
    assert.deepEqual(p, M.coastProps(24, 24, seed));
    assert.ok(p.dockSegments.length >= 4 && p.dockSegments.length <= 7);
    assert.ok(p.fences.length >= 2 && p.fences.every((q) => q.u >= f.lo && q.u <= f.hi && q.v < 0));
  }
  for (const phase of [0, 0.3, 1.7, 9.9, -2]) assert.ok(M.LAMP_KINDS.includes(M.lampKind({ phase })));
  assert.deepEqual(new Set([0, 0.4, 0.8].map((phase) => M.lampKind({ phase }))), new Set(M.LAMP_KINDS));
});

test('round 16 props: the committed prop GLBs load, are small, and replace the procedural coast boxes', () => {
  const dir = join(web, 'assets', 'meshes'), models = new Map();
  for (const k of ['boat', 'dock', 'fence', 'cliff_rock', 'lamp_tall', 'lamp_double', 'lamp']) {
    const b = readFileSync(join(dir, k + '.glb'));
    assert.ok(b.length < 200 * 1024, k + ' under 200 KB');
    models.set(k, loadGlbBuffer(b));
  }
  const plain = buildCoast({ gridW: 24, gridD: 24, seed: 5 }), meshed = buildCoast({ gridW: 24, gridD: 24, seed: 5, meshes: models });
  assert.notEqual(plain.length, meshed.length);
  for (const seed of [5, 6, 7, 8]) {
    const f = M.coastFrame(24, 24, seed), props = M.coastProps(24, 24, seed);
    const withKind = (k) => buildCoast({ gridW: 24, gridD: 24, seed, meshes: new Map([[k, models.get(k)]]) });
    const base = buildCoast({ gridW: 24, gridD: 24, seed });
    const one = []; appendMeshVertices(one, models.get('fence'), null, M.CELL, { at: [0, 0], scale: 1 });
    // fence has no procedural fallback, so the extra vertices are exactly one mesh per fence slot
    assert.equal(withKind('fence').length - base.length, props.fences.length * one.length, 'fence count seed ' + seed);
    for (const k of ['dock', 'boat', 'cliff_rock', 'fence']) assert.notDeepEqual(Array.from(withKind(k)), Array.from(base), k + ' is placed');
    // every vertex stays near the coast: along the shore within 30 m of its extent, out to sea within 45 m, up to 40 m high
    const out = buildCoast({ gridW: 24, gridD: 24, seed, meshes: models });
    for (let i = 0; i < out.length; i += 11) {
      const u = f.axis === 'x' ? out[i + 2] : out[i], v = f.axis === 'x' ? (out[i] - f.edge) * f.dir : (out[i + 2] - f.edge) * f.dir;
      assert.ok(u >= f.lo - 30 && u <= f.hi + 30, 'along shore ' + u);
      assert.ok(v >= -15 && v <= 45, 'out to sea ' + v);
      assert.ok(out[i + 1] >= -2 && out[i + 1] <= 40, 'height ' + out[i + 1]);
    }
  }
  assert.deepEqual(Array.from(meshed), Array.from(buildCoast({ gridW: 24, gridD: 24, seed: 5, meshes: models })));
  assert.ok(meshed.every(Number.isFinite) && meshed.length % 11 === 0);
});

test('lantern pools: lit and free are warm and bright, unlit is a dim cold glint, matched by position', () => {
  const light = { pos: [10, 2.2, 20] }, lamps = [{ pos: [10, 2.2, 20], lit: false }, { pos: [50, 2.2, 5], lit: true }];
  assert.equal(M.lanternState(light, lamps), 'unlit'); assert.equal(M.lanternState({ pos: [50, 2.2, 5] }, lamps), 'lit');
  assert.equal(M.lanternState(light, []), 'free'); assert.equal(M.lanternState(light, undefined), 'free');
  const warm = M.lanternPool('lit', 0), cold = M.lanternPool('unlit', 0);
  assert.ok(warm.gain > 5 * cold.gain && warm.halo > cold.halo);
  assert.ok(warm.color[0] > warm.color[2] && cold.color[2] > cold.color[0], 'warm pool versus cold glint');
  assert.deepEqual(M.lanternPool('lit', 1).color, M.lanternColor(1), 'pool is tinted by dread');
  assert.ok(M.haloSprites([{ pos: [0, 1, 0], haloScale: 0.5 }])[4] < M.haloSprites([{ pos: [0, 1, 0] }])[4]);
});
test('cool fill and moon boost keep colours in range and push toward blue', () => {
  const f = M.coldFill([0.16, 0.19, 0.27]);
  assert.ok(f.every((v) => v >= 0 && v <= 1) && f[2] / f[0] > 0.27 / 0.16);
  assert.ok(M.coldFill([1, 1, 1]).every((v) => v === 1));
  assert.deepEqual(M.moonBoost([0.1, 0.2, 0.3]).map((v) => +v.toFixed(3)), [0.19, 0.38, 0.57]);
});
test('contact rings: nested, darker toward the wall, drawn above the ground, deterministic', () => {
  const lay = layout(1818), rings = M.contactRings(lay, [{ pos: [4, 3, 4], post: true }, { pos: [8, 2, 8] }]);
  assert.equal(rings.length, lay.length * 3 + 2); assert.deepEqual(rings, M.contactRings(lay, [{ pos: [4, 3, 4], post: true }, { pos: [8, 2, 8] }]));
  const [outer, mid, inner] = [rings[0], rings[lay.length], rings[lay.length * 2]];
  assert.ok(outer.x0 < mid.x0 && mid.x0 < inner.x0 && outer.shade > mid.shade && mid.shade > inner.shade && inner.y > outer.y && outer.y > 0);
});

test('postParams: documented ranges, clamps, dread grows vignette and chroma, reduced motion has no grain motion and no chroma', () => {
  const calm = M.postParams({ dread: 0 }), dire = M.postParams({ dread: 1 });
  assert.ok(dire.vignette > calm.vignette && dire.chroma > calm.chroma && dire.grain > calm.grain);
  assert.ok(calm.vignette >= 0.3 && dire.vignette <= 0.6 + 1e-9 && dire.grain <= 0.06 + 1e-9 && dire.chroma <= 0.004 + 1e-9 && calm.chroma > 0);
  assert.deepEqual(M.postParams({ dread: 9 }), dire); assert.deepEqual(M.postParams({ dread: -3 }), calm); assert.deepEqual(M.postParams({ dread: NaN }), calm);
  const still = M.postParams({ dread: 1, reduced: true });
  assert.equal(still.chroma, 0); assert.equal(still.grainMotion, false); assert.equal(dire.grainMotion, true);
  assert.equal(M.postParams({ quality: 1 }).enabled, true); assert.equal(M.postParams({ quality: M.POST_MIN_QUALITY }).enabled, true);
  assert.equal(M.postParams({ quality: 0.5 }).enabled, false, 'governor below the threshold falls back to direct rendering');
});
test('post pass wiring: one pass, fallback warns once and never silently', () => {
  const v = readFileSync(join(web, 'src', 'view3d.js'), 'utf8');
  assert.match(v, /post pass disabled, drawing directly/); assert.match(v, /postBroken = true/); assert.match(v, /f\.post\.grainMotion/);
  assert.equal(M.frameCost({ vertices: { building: 30 }, post: true }).drawCalls, M.frameCost({ vertices: { building: 30 } }).drawCalls + 1);
});

test('sea, fog drift and fireflies: still under reduced motion, seeded, within budget, tier-shaped', () => {
  const calm = M.seaParams({ dread: 0 }), dire = M.seaParams({ dread: 1, weather: 'rain' });
  assert.ok(dire.ripple > calm.ripple && dire.tint[0] > calm.tint[0]); assert.equal(M.seaParams({ reduced: true }).speed, 0); assert.equal(calm.speed, 1);
  assert.deepEqual(M.fogLayers({ reduced: true }).drift, [0, 0]); assert.ok(M.fogLayers({ weather: 'rain' }).drift[0] > M.fogLayers({}).drift[0] && M.fogLayers({}).drift[0] > 0);
  assert.equal(M.fireflyCount({ lights: 3, reduced: true }), 0); assert.equal(M.fireflyCount({ lights: 3 }), 30); assert.equal(M.fireflyCount({ lights: 500 }), M.MAX_FIREFLIES);
  assert.equal(M.fireflyStyle(0.1).kind, 'firefly'); assert.equal(M.fireflyStyle(1).kind, 'ember'); assert.ok(M.fireflyStyle(1).color[0] > M.fireflyStyle(1).color[2]);
  const lights = [{ pos: [10, 2, 10] }, { pos: [30, 2, 40] }], a = M.fireflySeeds(lights, 7, 20), b = M.fireflySeeds(lights, 7, 20);
  assert.deepEqual(a, b); assert.equal(a.length, 20 * M.FIREFLY_FLOATS); assert.equal(M.fireflySeeds([], 7, 20).length, 0);
  for (let i = 0; i < 20; i++) { const l = lights[i % 2]; assert.ok(Math.hypot(a[i * 4] - l.pos[0], a[i * 4 + 2] - l.pos[2]) <= 5.01 && a[i * 4 + 1] >= 0.4 && a[i * 4 + 1] <= 3.01); }
  const worst = M.frameCost({ vertices: { building: 3000, ground: 600, sea: 6, coast: 3000, tentacle: 900 }, rain: 900, halos: 100, fireflies: M.MAX_FIREFLIES, post: true, lights: 8 });
  assert.ok(worst.drawCalls <= M.FRAME_BUDGET.drawCalls && worst.points <= M.FRAME_BUDGET.points, JSON.stringify(worst));
});
