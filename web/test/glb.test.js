import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KINDS, parseGlb, extractTriangles, loadGlbBuffer, projectModel } from '../src/glb.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'meshes');

// Build a tiny synthetic GLB: one triangle, optional index buffer.
function makeGlb({ color = [1, 0, 0, 1], indices = [0, 1, 2], emissive } = {}) {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = new Uint16Array(indices);
  const idxPad = new Uint8Array(Math.ceil(idx.byteLength / 4) * 4); idxPad.set(new Uint8Array(idx.buffer));
  const bin = new Uint8Array(pos.byteLength + idxPad.length);
  bin.set(new Uint8Array(pos.buffer), 0); bin.set(idxPad, pos.byteLength);
  const json = {
    asset: { version: '2.0' },
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: color }, ...(emissive ? { emissiveFactor: emissive } : {}) }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength }],
    buffers: [{ byteLength: bin.length }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jpad = new Uint8Array(Math.ceil(js.length / 4) * 4).fill(0x20); jpad.set(js); js = jpad;
  const total = 12 + 8 + js.length + 8 + bin.length;
  const out = new ArrayBuffer(total), dv = new DataView(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); new Uint8Array(out, 20, js.length).set(js);
  const o = 20 + js.length;
  dv.setUint32(o, bin.length, true); dv.setUint32(o + 4, 0x004e4942, true); new Uint8Array(out, o + 8, bin.length).set(bin);
  return out;
}

test('parses a synthetic GLB', () => {
  const m = loadGlbBuffer(makeGlb());
  assert.equal(m.triangles.length, 1);
  assert.deepEqual(m.triangles[0].color, [1, 0, 0]);
  assert.deepEqual(m.bounds.max, [1, 1, 0]);
});
test('rejects bad magic, version, length and truncation', () => {
  const g = makeGlb();
  const bad = (fn) => { const c = g.slice(0); fn(new DataView(c)); return c; };
  assert.throws(() => parseGlb(bad((d) => d.setUint32(0, 1, true))), /magic/);
  assert.throws(() => parseGlb(bad((d) => d.setUint32(4, 1, true))), /version/);
  assert.throws(() => parseGlb(bad((d) => d.setUint32(8, 99, true))), /length/);
  assert.throws(() => parseGlb(new ArrayBuffer(8)), /short/);
  assert.throws(() => parseGlb(bad((d) => d.setUint32(12, 100000, true))), /overruns/);
});
test('rejects out of range indices and bad index counts', () => {
  assert.throws(() => loadGlbBuffer(makeGlb({ indices: [0, 1, 9] })), /out of range/);
  assert.throws(() => loadGlbBuffer(makeGlb({ indices: [0, 1] })), /multiple of 3/);
});
test('emissive materials are flagged', () => {
  assert.equal(loadGlbBuffer(makeGlb({ emissive: [1, 1, 1] })).triangles[0].emissive, true);
  assert.equal(loadGlbBuffer(makeGlb()).triangles[0].emissive, false);
});
test('projectModel returns back-to-front polygons inside the box', () => {
  const m = loadGlbBuffer(makeGlb());
  const polys = projectModel(m, { w: 100, h: 100 });
  assert.equal(polys.length, 1);
  for (const [x, y] of polys[0].pts) { assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100); }
  assert.match(polys[0].fill, /^rgb\(\d+,\d+,\d+\)$/);
});

test('every catalog kind has a committed original GLB under 200 KB', () => {
  const catalog = JSON.parse(readFileSync(join(dir, '..', '..', 'data', 'village_catalog.json'), 'utf8'));
  // lamp is an extra prop mesh, not a catalog entry; every catalog id must have a mesh
  for (const e of catalog.entries) assert.ok(KINDS.includes(e.id), `${e.id} has no mesh`);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.glb')).sort(), KINDS.map((k) => k + '.glb').sort());
  for (const k of KINDS) {
    const f = join(dir, k + '.glb');
    assert.ok(statSync(f).size < 200 * 1024, k + ' too large');
    const m = extractTriangles(parseGlb(readFileSync(f)));
    assert.ok(m.stats.triangles >= 30, k + ' too few triangles');
    const polys = projectModel(m);
    assert.equal(polys.length, m.triangles.length);
    assert.ok(polys.every((p) => p.pts.flat().every(Number.isFinite)));
  }
});
