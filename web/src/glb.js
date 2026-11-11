// Minimal dependency-free GLB (glTF 2.0 binary) reader and software projector. Pure logic, no DOM.
// Reads POSITION, indices and baseColorFactor only; that is all the original Blender meshes use.
export const KINDS = ['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree', 'lamp'];
const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const COMP = { 5121: [1, Uint8Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC3: 3 };

export function parseGlb(buf) {
  const bytes = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (bytes.byteLength < 20) throw new Error('glb: too short');
  const dv = new DataView(bytes);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('glb: bad magic');
  if (dv.getUint32(4, true) !== 2) throw new Error('glb: unsupported version');
  if (dv.getUint32(8, true) !== bytes.byteLength) throw new Error('glb: length mismatch');
  let off = 12, json = null, bin = null;
  while (off + 8 <= bytes.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (off + 8 + len > bytes.byteLength) throw new Error('glb: chunk overruns file');
    if (type === JSON_CHUNK && !json) json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, off + 8, len)));
    else if (type === BIN_CHUNK && !bin) bin = bytes.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  if (!json) throw new Error('glb: no JSON chunk');
  if (!bin) throw new Error('glb: no BIN chunk');
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const acc = json.accessors && json.accessors[index];
  if (!acc) throw new Error('glb: missing accessor ' + index);
  const view = json.bufferViews && json.bufferViews[acc.bufferView];
  if (!view) throw new Error('glb: missing bufferView');
  const ct = COMP[acc.componentType], n = NCOMP[acc.type];
  if (!ct || !n) throw new Error('glb: unsupported accessor');
  const [size, Ctor] = ct;
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count * n;
  if (view.byteStride && view.byteStride !== size * n) throw new Error('glb: strided data unsupported');
  if (start % size !== 0 || start + count * size > bin.byteLength) throw new Error('glb: accessor out of range');
  return new Ctor(bin, start, count);
}

// Returns { triangles: [{p:[[x,y,z]*3], color:[r,g,b]}], bounds:{min,max}, stats }.
export function extractTriangles(glb) {
  const { json, bin } = glb;
  const triangles = [];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.mode !== undefined && prim.mode !== 4) throw new Error('glb: only triangle lists supported');
      const pos = readAccessor(json, bin, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      if (idx.length % 3) throw new Error('glb: index count not multiple of 3');
      const mat = json.materials && json.materials[prim.material];
      const c = (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.6, 0.6, 0.6, 1];
      const color = [c[0], c[1], c[2]];
      const emissive = !!(mat && mat.emissiveFactor && mat.emissiveFactor.some((v) => v > 0));
      for (let i = 0; i < idx.length; i += 3) {
        const p = [0, 1, 2].map((k) => {
          const v = idx[i + k];
          if (v * 3 + 2 >= pos.length) throw new Error('glb: index out of range');
          return [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
        });
        triangles.push({ p, color, emissive });
      }
    }
  }
  if (!triangles.length) throw new Error('glb: no triangles');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of triangles) for (const q of t.p) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
  return { triangles, bounds: { min, max }, stats: { triangles: triangles.length, materials: (json.materials || []).length } };
}

export const loadGlbBuffer = (buf) => extractTriangles(parseGlb(buf));

const lin2srgb = (v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2));

// Rotate around the vertical (glTF +Y) axis, tilt for a three quarter view, flat Lambert shading, painter's order.
// Returns draw list of {pts:[[x,y]*3], fill:'rgb(..)'} fitted into a w x h box, back to front.
export function projectModel(model, { yaw = 0.6, pitch = 0.5, w = 240, h = 240, margin = 12 } = {}) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const { min, max } = model.bounds;
  const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const xf = ([x, y, z]) => {
    x -= mid[0]; y -= mid[1]; z -= mid[2];
    const rx = x * cy + z * sy, rz = -x * sy + z * cy;
    return [rx, y * cp - rz * sp, y * sp + rz * cp];
  };
  const light = [-0.4, 0.8, -0.45], ll = Math.hypot(...light);
  const items = model.triangles.map((t) => {
    const q = t.p.map(xf);
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(...n) || 1; n = n.map((c) => c / nl);
    const lit = t.emissive ? 1 : 0.35 + 0.65 * Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / ll);
    return { q, depth: (q[0][2] + q[1][2] + q[2][2]) / 3, lit, color: t.color };
  });
  let lo = Infinity, hi = -Infinity, lz = Infinity, hz = -Infinity;
  for (const it of items) for (const p of it.q) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); lz = Math.min(lz, p[1]); hz = Math.max(hz, p[1]); }
  const scale = Math.min((w - 2 * margin) / (hi - lo || 1), (h - 2 * margin) / (hz - lz || 1));
  const ox = w / 2 - ((lo + hi) / 2) * scale, oy = h / 2 + ((lz + hz) / 2) * scale;
  items.sort((a, b) => b.depth - a.depth);
  return items.map((it) => ({
    pts: it.q.map((p) => [p[0] * scale + ox, oy - p[1] * scale]),
    fill: 'rgb(' + it.color.map((c) => Math.min(255, lin2srgb(c * it.lit))).join(',') + ')',
  }));
}
