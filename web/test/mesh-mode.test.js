import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KINDS, loadGlbBuffer, loadMeshSet, meshPolygons } from '../src/glb.js';
import { meshKindFor, meshesWanted } from '../src/building.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'meshes');
const load = (k) => loadGlbBuffer(readFileSync(join(dir, k + '.glb')));
const project = (x, z) => ({ x: 400 + (x - z) * 32, y: 100 + (x + z) * 16 });
const piece = { id: 'house_a', x: 3, z: 4, sizeX: 2, sizeZ: 2 };

test('piece ids map to committed mesh kinds; others stay procedural', () => {
  for (const id of ['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree']) assert.ok(KINDS.includes(meshKindFor(id)), id);
  assert.equal(meshKindFor('unknown'), null);
});

test('meshes mode is opt-in only', () => {
  assert.equal(meshesWanted('', ''), false);
  assert.equal(meshesWanted('?meshes=0', ''), false);
  assert.equal(meshesWanted('?meshes=1', ''), true);
  assert.equal(meshesWanted('', '#seed=1&meshes=1'), true);
});

test('meshPolygons is pure, deterministic and one polygon per triangle', () => {
  const m = load('house_a');
  const a = meshPolygons(m, project, piece, { dread: 0.4 }), b = meshPolygons(m, project, piece, { dread: 0.4 });
  assert.deepEqual(a, b);
  assert.equal(a.length, m.stats.triangles);
  for (const t of a) { assert.equal(t.pts.length, 3); assert.match(t.fill, /^rgb\(\d+,\d+,\d+\)$/); }
});

test('dread and theme tint change the fill, height scale moves points up', () => {
  const m = load('church');
  const calm = meshPolygons(m, project, piece), grim = meshPolygons(m, project, piece, { dread: 1 });
  assert.notDeepEqual(calm.map((t) => t.fill), grim.map((t) => t.fill));
  const tinted = meshPolygons(m, project, piece, { tint: [112, 62, 52] });
  assert.notDeepEqual(calm.map((t) => t.fill), tinted.map((t) => t.fill));
  const top = (l) => Math.min(...l.flatMap((t) => t.pts.map((p) => p.y)));
  assert.ok(top(meshPolygons(m, project, piece, { hs: 1.45 })) < top(calm));
});

test('loadMeshSet falls back with a clear warning on failure', async () => {
  const warnings = [];
  const fetchFn = async (url) => (url.endsWith('well.glb') ? { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }
    : url.endsWith('altar.glb') ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => readFileSync(join(dir, url.split('/').pop())).buffer.slice(0) });
  const set = await loadMeshSet(fetchFn, 'assets/meshes/', ['house_a', 'well', 'altar'], (m) => warnings.push(m));
  assert.deepEqual([...set.keys()], ['house_a']);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /well failed/);
  assert.match(warnings[1], /HTTP 404/);
});
