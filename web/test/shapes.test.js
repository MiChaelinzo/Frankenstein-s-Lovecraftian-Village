import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CATALOG_KINDS, PROP_KINDS, VILLAGE_KINDS, KINDS, loadGlbBuffer, loadMeshSet } from '../src/glb.js';
import { buildShapeModel, shapeKinds, SHAPE_KINDS } from '../src/shapes.js';
import { proceduralTexture, TEXTURE_KINDS } from '../src/proc-textures.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgData = join(web, '..', 'Packages', 'com.michaelinzo.frankenstein-village', 'Data', 'village_shapes.json');
const shapes = JSON.parse(readFileSync(join(web, 'data', 'village_shapes.json'), 'utf8'));
const glb = (k) => loadGlbBuffer(readFileSync(join(web, 'assets', 'meshes', k + '.glb')));

test('web copy of the shape data equals the package source of truth', () => {
  assert.equal(readFileSync(join(web, 'data', 'village_shapes.json'), 'utf8'), readFileSync(pkgData, 'utf8'));
});

test('glb.js kind lists equal the shape data, group by group and in order', () => {
  const k = shapeKinds(shapes);
  assert.deepEqual(CATALOG_KINDS, k.catalog);
  assert.deepEqual(PROP_KINDS, k.prop);
  assert.deepEqual(VILLAGE_KINDS, k.village);
  assert.deepEqual(KINDS, k.all);
  assert.equal(new Set(KINDS).size, KINDS.length);
  for (const m of shapes.meshes) for (const p of m.parts) {
    assert.ok(SHAPE_KINDS.includes(p.shape), `${m.id}/${p.name} shape`);
    assert.ok(shapes.palette[p.material], `${m.id}/${p.name} material`);
  }
});

test('every GLB matches the model built from the same shape data (triangles, bounds, emissive count)', () => {
  for (const kind of KINDS) {
    const g = glb(kind), s = buildShapeModel(shapes, kind);
    assert.equal(s.stats.triangles, g.stats.triangles, `${kind} triangles`);
    assert.equal(s.stats.materials, g.stats.materials, `${kind} materials`);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(s.bounds.min[i] - g.bounds.min[i]) < 1e-3, `${kind} min ${i}`);
      assert.ok(Math.abs(s.bounds.max[i] - g.bounds.max[i]) < 1e-3, `${kind} max ${i}`);
    }
    assert.equal(s.triangles.filter((t) => t.emissive).length, g.triangles.filter((t) => t.emissive).length, `${kind} emissive`);
    assert.ok(statSync(join(web, 'assets', 'meshes', kind + '.glb')).size < 200 * 1024);
  }
});

test('buildShapeModel is deterministic and rejects unknown input clearly', () => {
  assert.deepEqual(buildShapeModel(shapes, 'villager'), buildShapeModel(shapes, 'villager'));
  assert.throws(() => buildShapeModel(shapes, 'nope'), /unknown kind "nope"/);
  const bad = { palette: {}, meshes: [{ id: 'x', parts: [{ name: 'p', shape: 'box', at: [0, 0, 0], size: [1, 1, 1], material: 'gold' }] }] };
  assert.throws(() => buildShapeModel(bad, 'x'), /unknown material "gold"/);
  const odd = { palette: { a: [1, 1, 1, 1] }, meshes: [{ id: 'x', parts: [{ name: 'p', shape: 'torus', at: [0, 0, 0], material: 'a' }] }] };
  assert.throws(() => buildShapeModel(odd, 'x'), /unknown shape "torus"/);
});

test('the villager carries a lantern and stands about human height', () => {
  const m = buildShapeModel(shapes, 'villager');
  assert.ok(m.bounds.max[1] > 1.5 && m.bounds.max[1] < 2.0);
  assert.ok(m.triangles.some((t) => t.emissive));
});

test('loadMeshSet falls back to the shape data when a GLB is missing, and still skips when there is no fallback', async () => {
  const warnings = [];
  const fetchFn = async (url) => (url.endsWith('inn.glb') ? { ok: false, status: 404 }
    : url.endsWith('village_shapes.json') ? { ok: true, json: async () => shapes }
      : { ok: true, arrayBuffer: async () => readFileSync(join(web, 'assets', 'meshes', url.split('/').pop())).buffer.slice(0) });
  const withFallback = await loadMeshSet(fetchFn, 'assets/meshes/', ['barrel', 'inn'], (m) => warnings.push(m), 'data/village_shapes.json');
  assert.deepEqual([...withFallback.keys()], ['barrel', 'inn']);
  assert.equal(withFallback.get('inn').stats.triangles, glb('inn').stats.triangles);
  assert.match(warnings[0], /inn GLB failed.*built from the shape data/);
  const without = await loadMeshSet(fetchFn, 'assets/meshes/', ['barrel', 'inn'], () => {});
  assert.deepEqual([...without.keys()], ['barrel']);
  const brokenBoth = await loadMeshSet(async () => ({ ok: false, status: 500 }), 'assets/meshes/', ['inn'], (m) => warnings.push(m), 'data/village_shapes.json');
  assert.equal(brokenBoth.size, 0);
  assert.match(warnings.at(-1), /shape data: shapes HTTP 500.*procedural drawing/);
});

test('procedural textures are deterministic, opaque, tileable-sized and distinct per kind', () => {
  const seen = new Set();
  for (const kind of TEXTURE_KINDS) {
    const a = proceduralTexture(kind), b = proceduralTexture(kind);
    assert.deepEqual(a.data, b.data, kind);
    assert.equal(a.data.length, 64 * 64 * 4);
    let sum = 0;
    for (let i = 0; i < a.data.length; i += 4) { assert.equal(a.data[i + 3], 255); sum += (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3; }
    const mean = sum / (64 * 64) / 255;
    assert.ok(mean > 0.3 && mean < 0.75, `${kind} mean brightness ${mean}`);
    seen.add(Buffer.from(a.data).toString('base64'));
  }
  assert.equal(seen.size, TEXTURE_KINDS.length);
  assert.equal(proceduralTexture('stone', { size: 32 }).data.length, 32 * 32 * 4);
  assert.notDeepEqual(proceduralTexture('stone', { lit: [200, 0, 0] }).data, proceduralTexture('stone').data);
  assert.throws(() => proceduralTexture('lava'), /unknown kind "lava"/);
});

test('JS shape models match the C# ShapeMeshBuilder golden (parts, triangles, materials, bounds)', () => {
  const golden = JSON.parse(readFileSync(join(web, 'test', 'golden.json'), 'utf8')).shapes;
  assert.equal(golden.length, shapes.meshes.length);
  for (const [id, parts, tris, mats, ...b] of golden) {
    const mesh = shapes.meshes.find((m) => m.id === id);
    const model = buildShapeModel(shapes, id);
    assert.equal(mesh.parts.length, parts, `${id} parts`);
    assert.equal(model.stats.triangles, tris, `${id} triangles`);
    assert.equal(model.stats.materials, mats, `${id} materials`);
    // glTF (x, y, z) is Unity (x, y, -z)
    const { min, max } = model.bounds;
    const js = [min[0], min[1], -max[2], max[0], max[1], -min[2]];
    js.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 0.002, `${id} bound ${k}: ${v} vs ${b[k]}`));
  }
});
