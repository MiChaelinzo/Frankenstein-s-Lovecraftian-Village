// Local Alien pack area (?pack=1): manifest validation, model loading and fallback. Synthetic stand-ins only: the original Blender meshes play the pack models, no pack data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGlbBuffer, loadAlienModels, shrinkUv, fitModelInto } from '../src/glb.js';
import { validateAlienManifest, ALIEN_KINDS } from '../src/pack.js';
import { CORRUPTION_LEVELS, growCorruption, corruptionSites } from '../src/dressing.js';
import { groundHeight } from '../src/landmarks.js';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const bytes = (k) => { const b = readFileSync(join(web, 'assets', 'meshes', `${k}.glb`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const original = (k) => loadGlbBuffer(bytes(k));
const okFetch = (map) => async (url) => (url in map ? { ok: true, arrayBuffer: async () => map[url] } : { ok: false, status: 404 });
const manifest = (models) => ({ version: 1, models });

test('alien kinds are exactly the kinds Core CorruptionGrowth places', () => {
  const placed = new Set(growCorruption(7, 24, 24, CORRUPTION_LEVELS).map((it) => it.kind));
  for (const k of placed) assert.ok(ALIEN_KINDS.includes(k), `${k} placed by the growth rule but not swappable`);
  for (const k of ALIEN_KINDS) assert.ok(original(k).triangles.length > 0, `${k} has an original look-alike`);
});

test('validateAlienManifest keeps well-formed known kinds and rejects the rest', () => {
  const v = validateAlienManifest(manifest({ tentacle_tree: { file: 'tentacle_tree.glb', textured: true }, spire_horn: { file: '../evil.glb' }, rock: { file: 'rock.glb' }, fungus_tall: { file: 'a/b.glb' } }));
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.models), ['tentacle_tree']);
  assert.equal(v.models.tentacle_tree.textured, true);
  assert.equal(v.errors.length, 2);
  for (const bad of [null, 5, {}, { version: 2, models: {} }, manifest({}), manifest({ spire_horn: { file: 'x.png' } }), { version: 1 }]) assert.equal(validateAlienManifest(bad).ok, false, JSON.stringify(bad));
});

test('loadAlienModels fits each model into the original footprint and standing on its floor, deterministically', async () => {
  const originals = new Map(ALIEN_KINDS.map((k) => [k, original(k)]));
  const files = { 'local-pack/alien/tentacle_tree.glb': bytes('spire_horn') }; // any valid GLB stands in
  const warns = [], got = await loadAlienModels(okFetch(files), 'local-pack/alien/', { tentacle_tree: { file: 'tentacle_tree.glb' } }, originals, (m) => warns.push(m));
  assert.equal(warns.length, 0);
  assert.equal(got.length, 1);
  const ref = originals.get('tentacle_tree'), b = got[0].model.bounds;
  for (let k = 0; k < 3; k++) assert.ok(b.min[k] >= ref.bounds.min[k] - 1e-6 && b.max[k] <= ref.bounds.max[k] + 1e-6);
  assert.ok(Math.abs(b.min[1] - ref.bounds.min[1]) < 1e-6);
  assert.deepEqual(got[0].model, fitModelInto(original('spire_horn'), ref));
});

test('loadAlienModels warns once per failed model and leaves it out so the original stays', async () => {
  const originals = new Map(ALIEN_KINDS.map((k) => [k, original(k)])), warns = [];
  const entries = { tentacle_tree: { file: 'tentacle_tree.glb' }, spire_horn: { file: 'spire_horn.glb' } };
  const got = await loadAlienModels(okFetch({ 'p/spire_horn.glb': new ArrayBuffer(8) }), 'p/', entries, originals, (m) => warns.push(m));
  assert.equal(got.length, 0);
  assert.equal(warns.length, 2);
  assert.ok(warns.every((m) => /^\[alien-pack\] .*keeping the original/.test(m)), warns.join('\n'));
  assert.deepEqual(await loadAlienModels(okFetch({}), 'p/', entries, new Map(), () => {}), [], 'kinds without an original are skipped');
});

test('shrinkUv moves atlas uv into the corner quarter and leaves untextured triangles alone', () => {
  const m = { bounds: { min: [0, 0, 0], max: [1, 1, 1] }, triangles: [{ p: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], uv: [[0, 0], [1, 1], [0.5, 1]] }, { p: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }] };
  const s = shrinkUv(m, 0.5);
  assert.deepEqual(s.triangles[0].uv, [[0, 0], [0.5, 0.5], [0.25, 0.5]]);
  assert.equal(s.triangles[1].uv, undefined);
});

test('the pack area is gated, never precached and never named in the service worker', () => {
  const sw = readFileSync(join(web, 'sw.js'), 'utf8'), view = readFileSync(join(web, 'src', 'view3d.js'), 'utf8'), app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
  assert.ok(!/alien/i.test(sw));
  assert.match(app, /alienPack: \(\) => pack\.want/);
  assert.match(view, /wantAlien: alienPack\(\)/);
});

test('every corruption site stands on the Core ground height, so fitted pack models (floor at the original floor) never hover', () => {
  for (const seed of [1818, 1, 7, 4400, 123456]) for (const it of corruptionSites(seed, 36, 36)) {
    assert.ok(Math.abs(it.y - groundHeight(seed, 36, 36, it.x, it.z)) < 1e-9, `${seed} ${it.kind} at ${it.x},${it.z}`);
    assert.equal(original(it.kind).bounds.min[1], 0, `${it.kind} original mesh floor`);
  }
});
