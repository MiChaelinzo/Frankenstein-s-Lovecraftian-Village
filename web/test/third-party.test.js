// CC0 third party assets (web/assets/third_party, THIRD_PARTY_ASSETS.md): glb texture and node reading, fitting, atlas, fallbacks, world uv,
// renderer wiring, budgets and the service worker exclusion. Counts and structure only; how the photos look is checked by screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGlbBuffer, fitModelInto, atlasModel, loadThirdPartyModels, THIRD_PARTY_MODELS, ATLAS_GRID, KINDS, VERTEX_FLOATS } from '../src/glb.js';
import { buildWorld, createGlRenderer, THIRD_PARTY_TEXTURES, THIRD_PARTY_BASE } from '../src/view3d.js';
import { generateLayout, PrefabCatalog } from '../src/core.js';
import { frameCost, FRAME_BUDGET, partitionChunks, visibleRanges, frustumPlanes, viewProjection, fogFloorFor, chunkCullDistance } from '../src/view3d-math.js';
import { tierSettings } from '../src/quality.js';
import { generateCityLayout, CITY_GRID, CITY_PIECES } from '../src/districts.js';
import { composeDressing } from '../src/dressing.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..'), tp = join(web, 'assets', 'third_party');
const catalog = new PrefabCatalog(JSON.parse(readFileSync(join(web, 'data', 'village_catalog.json'), 'utf8')).entries);
const read = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const original = (k) => loadGlbBuffer(read(join(web, 'assets', 'meshes', `${k}.glb`)));
const prop = (file) => loadGlbBuffer(read(join(tp, 'models', file)));
const okFetch = (map) => async (url) => (url in map ? { ok: true, arrayBuffer: async () => map[url] } : { ok: false, status: 404 });

function walk(d) { return readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])); }

test('every committed CC0 prop has an embedded JPEG base colour, uv on every triangle inside 0..1, and replaces an existing kind', () => {
  for (const [kind, file] of Object.entries(THIRD_PARTY_MODELS)) {
    assert.ok(KINDS.includes(kind), kind);
    const m = prop(file);
    assert.equal(m.texture.mimeType, 'image/jpeg'); assert.deepEqual([...m.texture.bytes.slice(0, 2)], [0xff, 0xd8], 'JPEG magic');
    assert.ok(m.triangles.every((t) => t.uv && t.uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1)), file);
  }
  assert.ok(Object.keys(THIRD_PARTY_MODELS).length <= ATLAS_GRID * ATLAS_GRID, 'one atlas slot per prop');
});

test('node transforms are applied (translation, rotation, scale, children) and the original Blender meshes stay untextured', () => {
  const bench = read(join(tp, 'models', 'bench.glb')), dv = new DataView(bench), jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(bench, 20, jl)));
  const rebuild = (nodes) => { // same binary chunk, new node tree
    const js = new TextEncoder().encode(JSON.stringify({ ...json, nodes, scenes: [{ nodes: [0] }] })), pad = (4 - (js.length % 4)) % 4, binLen = dv.getUint32(20 + jl, true);
    const total = 12 + 8 + js.length + pad + 8 + binLen, out = new ArrayBuffer(total), o = new DataView(out);
    o.setUint32(0, 0x46546c67, true); o.setUint32(4, 2, true); o.setUint32(8, total, true); o.setUint32(12, js.length + pad, true); o.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(out, 20).set(js); new Uint8Array(out, 20 + js.length, pad).fill(0x20);
    new Uint8Array(out, 20 + js.length + pad).set(new Uint8Array(bench, 20 + jl, 8 + binLen)); return loadGlbBuffer(out);
  };
  const base = prop('bench.glb').bounds, moved = rebuild([{ children: [1], translation: [0, 2, 0] }, { mesh: 0, scale: [2, 2, 2] }]).bounds;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(moved.max[k] - (base.max[k] * 2 + (k === 1 ? 2 : 0))) < 1e-5, `axis ${k}`);
  const turned = rebuild([{ mesh: 0, rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }]).bounds; // 90 degrees about +Y: x -> -z
  assert.ok(Math.abs(turned.min[2] + base.max[0]) < 1e-5 && Math.abs(turned.max[1] - base.max[1]) < 1e-5);
  for (const k of KINDS) assert.equal(original(k).texture, null, `${k} stays untextured`);
});

test('fitModelInto keeps the prop inside the original bounding box, standing on its floor, centred, and is deterministic', () => {
  for (const [kind, file] of Object.entries(THIRD_PARTY_MODELS)) {
    const ref = original(kind), fit = fitModelInto(prop(file), ref);
    for (let k = 0; k < 3; k++) { assert.ok(fit.bounds.min[k] >= ref.bounds.min[k] - 1e-6 && fit.bounds.max[k] <= ref.bounds.max[k] + 1e-6, `${kind} axis ${k}`); }
    assert.ok(Math.abs(fit.bounds.min[1] - ref.bounds.min[1]) < 1e-6, `${kind} on the floor`);
    assert.ok(Math.abs((fit.bounds.min[0] + fit.bounds.max[0]) - (ref.bounds.min[0] + ref.bounds.max[0])) < 1e-6, `${kind} centred`);
    assert.deepEqual(fit, fitModelInto(prop(file), ref));
  }
});

test('atlasModel moves uv into its slot and rejects slots outside the grid', () => {
  const m = { bounds: { min: [0, 0, 0], max: [1, 1, 1] }, triangles: [{ p: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], uv: [[0, 0], [1, 1], [1.2, -0.1]] }, { p: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }] };
  const a = atlasModel(m, 3, 2);
  assert.deepEqual(a.triangles[0].uv, [[0.5, 0.5], [1, 1], [1, 0.5]]); assert.equal(a.triangles[1].uv, undefined);
  assert.throws(() => atlasModel(m, 4, 2), /slot/);
});

test('loadThirdPartyModels: fits, places in fixed slots, skips kinds without an original, warns once per failure and keeps the original', async () => {
  const base = 'assets/third_party/models/', files = Object.fromEntries(Object.values(THIRD_PARTY_MODELS).map((f) => [base + f, read(join(tp, 'models', f))]));
  const originals = new Map(Object.keys(THIRD_PARTY_MODELS).map((k) => [k, original(k)]));
  const warns = [], all = await loadThirdPartyModels(okFetch(files), base, originals, (m) => warns.push(m));
  assert.equal(warns.length, 0); assert.deepEqual(all.map((p) => [p.kind, p.slot]), Object.keys(THIRD_PARTY_MODELS).map((k, i) => [k, i]));
  const w2 = [], some = await loadThirdPartyModels(okFetch({ ...files, [base + 'barrel.glb']: new ArrayBuffer(8) }), base, originals, (m) => w2.push(m));
  assert.deepEqual(some.map((p) => [p.kind, p.slot]), [['bench', 1]], 'a broken file keeps its slot reserved'); assert.equal(w2.length, 1);
  const w3 = [], none = await loadThirdPartyModels(okFetch({}), base, originals, (m) => w3.push(m));
  assert.equal(none.length, 0); assert.equal(w3.length, 2, 'missing files: one warning each');
  w2.push(...w3);
  assert.ok(w2.every((m) => /^\[third-party\] .*keeping the original/.test(m)), w2.join('\n'));
  assert.deepEqual(await loadThirdPartyModels(okFetch(files), base, new Map([['bench', original('bench')]]), () => {}).then((r) => r.map((p) => p.kind)), ['bench']);
});

const layout = (seed) => generateLayout(catalog, 24, 24, 80, seed).map((p, i) => ({ ...p, detail: 3, vis: { lit: 0.9, lit2: 0.9, phase: i } }));
async function upgradedSet() {
  const meshes = new Map(KINDS.map((k) => [k, original(k)])), base = 'assets/third_party/models/';
  const files = Object.fromEntries(Object.values(THIRD_PARTY_MODELS).map((f) => [base + f, read(join(tp, 'models', f))]));
  for (const p of await loadThirdPartyModels(okFetch(files), base, meshes, () => {})) meshes.set(p.kind, p.model);
  return meshes;
}

test('buildWorld: buildingUv has one pair per building vertex, -1 everywhere except the CC0 props and window panes, and the originals give only -1 or pane codes', async () => {
  const meshes = await upgradedSet(), plain = new Map(KINDS.map((k) => [k, original(k)]));
  for (const seed of [1818, 7]) {
    const l = layout(seed), w = buildWorld({ layout: l, meshes, seed, gridW: 24, gridD: 24 }), o = buildWorld({ layout: l, meshes: plain, seed, gridW: 24, gridD: 24 });
    assert.equal(w.buildingUv.length, (w.building.length / VERTEX_FLOATS) * 2);
    assert.ok(o.buildingUv.every((v) => v === -1 || (v <= -2 && v >= -3)), 'untextured -1, or a window pane coordinate in -3..-2');
    assert.ok(o.buildingUv.some((v) => v <= -2), 'the houses have window panes');
    const props = composeDressing(seed, 24, 24, l).filter((it) => it.kind in THIRD_PARTY_MODELS).length;
    const textured = w.buildingUv.filter((v, i) => i % 2 === 0 && v >= 0).length;
    assert.ok(props > 0 && textured > 0, `seed ${seed}: ${props} props, ${textured} textured vertices`);
    assert.deepEqual(w.buildingUv, buildWorld({ layout: l, meshes, seed, gridW: 24, gridD: 24 }).buildingUv, 'deterministic');
    const cost = frameCost({ vertices: { building: w.building.length / VERTEX_FLOATS, ground: w.ground.length / VERTEX_FLOATS, sea: 6, coast: w.coast.length / VERTEX_FLOATS, tentacle: 900, villager: 900 }, rain: 900, mist: 300, halos: 100, fireflies: 100, post: true, lights: 8 });
    assert.ok(cost.triangles <= FRAME_BUDGET.triangles * 0.7 && cost.drawCalls <= FRAME_BUDGET.drawCalls, JSON.stringify(cost));
  }
});

// Round 23: the city is 36 by 36 cells, so the whole world is over one frame's budget by design; what counts is what a frame draws. Chunks are culled by the frustum and the fog.
test('city: the chunk culled building triangles in view stay inside the frame budget from every compass heading and several spots', async () => {
  const meshes = await upgradedSet(), g = CITY_GRID;
  for (const seed of [1818, 7, 42, 2024, -7]) {
    const l = generateCityLayout(catalog, g, g, CITY_PIECES, seed).map((p, i) => ({ ...p, detail: 3, vis: { lit: 0.9, lit2: 0.9, phase: i } }));
    const w = buildWorld({ layout: l, meshes, seed, gridW: g, gridD: g }), chunks = partitionChunks(w.building, w.buildingUv, VERTEX_FLOATS).chunks;
    for (const q of ['low', 'medium', 'high']) {
    const far = tierSettings(q).drawDistance, density = fogFloorFor(far); // a clear day: the fog is at its floor, so only the draw distance culls
    let worst = 0;
    for (const [x, z] of [[g * 2, g * 2], [g, g], [g * 3, g * 3], [2, 2], [g * 3, g]]) for (let k = 0; k < 8; k++) {
      const cam = { x, y: 1.6, z, yaw: k * Math.PI / 4, pitch: 0 }, ranges = visibleRanges(chunks, frustumPlanes(viewProjection(cam, 16 / 9)), [x, 1.6, z], chunkCullDistance(density, far));
      worst = Math.max(worst, ranges.reduce((a, r) => a + r.count, 0));
    }
    const cost = frameCost({ vertices: { building: worst, ground: w.ground.length / VERTEX_FLOATS, sea: 6, coast: w.coast.length / VERTEX_FLOATS, tentacle: 900, villager: 900 }, rain: 900, mist: 300, halos: 100, fireflies: 100, post: true, lights: 8 });
    assert.ok(cost.triangles <= FRAME_BUDGET.triangles, `seed ${seed} ${q}: ${JSON.stringify(cost)}`);
    assert.ok(Math.abs(Math.exp(-((far * density) ** 2)) - 0.05) < 1e-9, 'the fog leaves 5% of the colour at the draw distance');
    }
  }
});

test('renderer: material photos skip pack units, the prop atlas goes to unit 5, uv is bound only for the building buffer and aPos is attribute 0', () => {
  const calls = [];
  const gl = new Proxy({}, { get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? (name === 'TEXTURE0' ? 100 : 1) : (...a) => { calls.push([name, ...a]); return name === 'getShaderParameter' || name === 'getProgramParameter' ? true : name === 'getAttribLocation' ? (a[1] === 'aUv' ? 7 : 0) : {}; }) });
  const r = createGlRenderer(gl);
  assert.ok(calls.some(([n, , i, nm]) => n === 'bindAttribLocation' && i === 0 && nm === 'aPos'));
  const img = { width: 512, height: 512 };
  r.setPackTextures(null, img); calls.length = 0;
  r.setMaterialTextures({ ground: img, stone: img, roof: null, cobble: img, bogus: img });
  const units = calls.filter(([n]) => n === 'activeTexture').map(([, u]) => u - 100);
  assert.deepEqual(units, [2, 4], 'ground keeps the pack texture, roof stays procedural, unknown names ignored');
  calls.length = 0; r.setPropAtlas(img); assert.deepEqual(calls.filter(([n]) => n === 'activeTexture').map(([, u]) => u - 100), [5]);
  const sv = (n) => new Float32Array(n * VERTEX_FLOATS);
  r.setWorld({ building: sv(3), buildingUv: new Float32Array(6), ground: sv(6), sea: sv(6), coast: sv(3), halos: new Float32Array(0) });
  calls.length = 0;
  const M = { vp: new Float32Array(16), basis: { f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] }, camPos: [0, 1, 0], aspect: 1, time: 0, reduced: true, sky: { zenith: [0, 0, 0], horizon: [0, 0, 0], stars: 0, cloud: 0, ambient: [0, 0, 0] },
    moon: { dir: [0, 1, 0], color: [1, 1, 1], size: 0.1 }, moonLight: [1, 1, 1], lights: [], fog: 0, groundFog: 0, groundHeight: 1, eye: { dir: [0, 0, 1], width: 1, height: 1, open: 0 }, fogColor: [0, 0, 0], glowColor: [1, 1, 1],
    windU: [0, 0, 0, 0], rain: { vel: [0, 0, 0], size: 1, alpha: 0 }, sunWeight: 0, sea: { ripple: 0, fresnel: 1, tint: [0, 0, 0], moonGain: 0, lanternGain: 0 }, waterTime: 0, flies: { rise: 0, size: 1, color: [1, 1, 1] }, fogOffset: [0, 0], pointScale: 1 };
  r.draw(M);
  assert.equal(calls.filter(([n, l]) => n === 'enableVertexAttribArray' && l === 7).length, 1, 'uv array enabled once, for the building buffer');
  assert.ok(calls.filter(([n, l, a]) => n === 'vertexAttrib2f' && l === 7 && a === -1).length >= 3, 'other buffers read the constant -1');
});

test('service worker never precaches third party assets; the shell precache size is unchanged by them', () => {
  const sw = readFileSync(join(web, 'sw.js'), 'utf8');
  assert.ok(!/third_party/.test(sw), 'sw.js does not list third_party');
  assert.equal(THIRD_PARTY_BASE, 'assets/third_party/');
  for (const f of Object.values(THIRD_PARTY_TEXTURES)) assert.ok(statSync(join(tp, f)).size > 0, f);
});

test('third party budget: each file at most 5 MB, all together at most 40 MB, only GLB and JPEG or PNG', () => {
  const files = walk(tp), sizes = files.map((f) => statSync(f).size);
  assert.ok(files.length >= Object.keys(THIRD_PARTY_MODELS).length + Object.keys(THIRD_PARTY_TEXTURES).length);
  assert.ok(sizes.every((s) => s <= 5 * 1024 * 1024)); assert.ok(sizes.reduce((a, b) => a + b, 0) <= 40 * 1024 * 1024);
  assert.ok(files.every((f) => /\.(glb|jpg|png)$/.test(f)), files.join(','));
});
