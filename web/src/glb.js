// Minimal dependency-free GLB (glTF 2.0 binary) reader and software projector. Pure logic, no DOM.
// Reads POSITION, indices and baseColorFactor (all the original Blender meshes use), node translation, rotation, scale and matrix,
// and TEXCOORD_0 plus one embedded base colour image (the CC0 props under assets/third_party). Normal maps are not read.
import { buildShapeModel } from './shapes.js';
import { MAX_PLACE_SCALE } from './world-scale.js';
export const CATALOG_KINDS = ['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree', 'lamp'];
export const PROP_KINDS = ['boat', 'dock', 'fence', 'cliff_rock', 'lamp_tall', 'lamp_double'];
export const VILLAGE_KINDS = ['cottage_thatch', 'cottage_tall', 'inn', 'chapel', 'lighthouse', 'market_stall', 'crate_stack', 'barrel', 'gravestone', 'gravestone_cross', 'fence_iron', 'villager', 'cart', 'sack', 'wall_low', 'net', 'bench', 'sign', 'wall_lantern', 'tree', 'bush', 'reeds', 'rock', 'laundry_line', 'grass_tuft', 'stump', 'log', 'woodpile', 'hedge', 'picket_fence', 'bollard', 'rope_coil', 'crop_row', 'wheel_ruts', 'tentacle_tree', 'tentacle_sapling', 'fungus_tall', 'fungus_cluster', 'fungus_shelf', 'spire_horn', 'spire_ribbed', 'shipwreck', 'abbey_arch', 'abbey_wall', 'abbey_pillar', 'marsh_pool', 'path_stone'];
export const KINDS = [...CATALOG_KINDS, ...PROP_KINDS, ...VILLAGE_KINDS]; // a test keeps this list equal to data/village_shapes.json
const MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;
const COMP = { 5121: [1, Uint8Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3 };

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

/** Column-major 4x4 from a node: its matrix, or translation * rotation (unit quaternion) * scale. */
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0], [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul4 = (a, b) => Array.from({ length: 16 }, (_, i) => { const c = i >> 2, r = i & 3; return a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** [meshIndex, matrix] pairs: the default scene's node tree when there is one, else every mesh once untransformed. */
function meshInstances(json) {
  const scene = json.scenes && json.scenes[json.scene || 0];
  if (!scene || !json.nodes) return (json.meshes || []).map((_, i) => [i, IDENTITY]);
  const out = [], visit = (ni, parent, depth) => {
    const n = json.nodes[ni];
    if (!n || depth > 32) throw new Error('glb: bad node tree');
    const m = mul4(parent, nodeMatrix(n));
    if (n.mesh !== undefined) out.push([n.mesh, m]);
    for (const c of n.children || []) visit(c, m, depth + 1);
  };
  for (const ni of scene.nodes || []) visit(ni, IDENTITY, 0);
  return out;
}

/** The embedded image of a material's base colour texture: { mimeType, bytes: Uint8Array } or null. */
function baseColorImage(json, bin, mat) {
  const ti = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
  if (!ti) return null;
  const tex = json.textures && json.textures[ti.index], img = tex && json.images && json.images[tex.source];
  if (!img || img.bufferView === undefined) throw new Error('glb: base colour texture must be embedded');
  const view = json.bufferViews[img.bufferView];
  if (!view) throw new Error('glb: missing image bufferView');
  const start = view.byteOffset || 0;
  if (start + view.byteLength > bin.byteLength) throw new Error('glb: image out of range');
  if (!/^image\/(jpeg|png)$/.test(img.mimeType || '')) throw new Error('glb: image must be JPEG or PNG');
  return { mimeType: img.mimeType, bytes: new Uint8Array(bin, start, view.byteLength) };
}

// Returns { triangles: [{p:[[x,y,z]*3], color:[r,g,b], emissive, uv?:[[u,v]*3]}], bounds:{min,max}, stats, texture: {mimeType, bytes} | null }.
// A textured model carries one base colour image; triangles of a textured material have uv, others keep their flat colour.
export function extractTriangles(glb) {
  const { json, bin } = glb;
  const triangles = [];
  let texture = null, textureMat = -1;
  for (const [mi, m] of meshInstances(json)) {
    const mesh = json.meshes && json.meshes[mi];
    if (!mesh) throw new Error('glb: missing mesh ' + mi);
    for (const prim of mesh.primitives || []) {
      if (prim.mode !== undefined && prim.mode !== 4) throw new Error('glb: only triangle lists supported');
      const pos = readAccessor(json, bin, prim.attributes.POSITION);
      const idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      if (idx.length % 3) throw new Error('glb: index count not multiple of 3');
      const mat = json.materials && json.materials[prim.material];
      const c = (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.6, 0.6, 0.6, 1];
      const color = [c[0], c[1], c[2]];
      const emissive = !!(mat && mat.emissiveFactor && mat.emissiveFactor.some((v) => v > 0));
      const img = baseColorImage(json, bin, mat);
      if (img && !texture) { texture = img; textureMat = prim.material; }
      const uvs = img && prim.material === textureMat && prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
      const xf = m === IDENTITY ? (x, y, z) => [x, y, z] : (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      for (let i = 0; i < idx.length; i += 3) {
        const p = [0, 1, 2].map((k) => {
          const v = idx[i + k];
          if (v * 3 + 2 >= pos.length) throw new Error('glb: index out of range');
          return xf(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        });
        const tri = { p, color, emissive };
        if (uvs) tri.uv = [0, 1, 2].map((k) => { const v = idx[i + k]; if (v * 2 + 1 >= uvs.length) throw new Error('glb: uv index out of range'); return [uvs[v * 2], uvs[v * 2 + 1]]; });
        triangles.push(tri);
      }
    }
  }
  if (!triangles.length) throw new Error('glb: no triangles');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of triangles) for (const q of t.p) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
  return { triangles, bounds: { min, max }, stats: { triangles: triangles.length, materials: (json.materials || []).length }, texture };
}

/**
 * Scales a model uniformly and moves it so it fits inside the reference model's bounding box, centred and standing on its floor.
 * Used to put a third party prop exactly where the original Blender mesh of the same kind stood, so footprints and collision stay the same.
 */
export function fitModelInto(model, reference) {
  const a = model.bounds, b = reference.bounds;
  const s = Math.min(...[0, 1, 2].map((k) => (b.max[k] - b.min[k]) / (a.max[k] - a.min[k] || 1)));
  const off = [0, 1, 2].map((k) => (k === 1 ? b.min[1] - a.min[1] * s : (b.min[k] + b.max[k]) / 2 - ((a.min[k] + a.max[k]) / 2) * s));
  const move = (q) => [q[0] * s + off[0], q[1] * s + off[1], q[2] * s + off[2]];
  return { ...model, triangles: model.triangles.map((t) => ({ ...t, p: t.p.map(move) })), bounds: { min: move(a.min), max: move(a.max) } };
}

export const loadGlbBuffer = (buf) => extractTriangles(parseGlb(buf));

// ---- CC0 third party props (assets/third_party/models, see THIRD_PARTY_ASSETS.md) ----

/** Kind -> GLB file of the CC0 model that replaces the original Blender mesh in the 3D view (props from Poly Haven, houses assembled from the Quaternius Medieval Village MegaKit). */
export const THIRD_PARTY_MODELS = Object.freeze({ barrel: 'barrel.glb', bench: 'bench.glb', house_a: 'house_a.glb', house_b: 'house_b.glb', cottage_tall: 'cottage_tall.glb' });
/** Kind -> atlas slot of its base colour image. The kit's houses share one 3 x 3 trim mosaic, so they share slot 2 (the same image is drawn again, harmlessly). */
export const THIRD_PARTY_SLOTS = Object.freeze({ barrel: 0, bench: 1, house_a: 2, house_b: 2, cottage_tall: 2 });
/** The props' base colour images share one texture: a ATLAS_GRID x ATLAS_GRID atlas of equal square slots. */
export const ATLAS_GRID = 2;

/** Moves a textured model's uv (0..1, clamped) into its atlas slot; untextured triangles stay untextured. */
export function atlasModel(model, slot, grid = ATLAS_GRID) {
  if (slot < 0 || slot >= grid * grid) throw new Error('glb: atlas slot out of range');
  const ox = slot % grid, oy = Math.floor(slot / grid), c = (v) => Math.max(0, Math.min(1, v));
  return { ...model, triangles: model.triangles.map((t) => (t.uv ? { ...t, uv: t.uv.map(([u, v]) => [(ox + c(u)) / grid, (oy + c(v)) / grid]) } : t)) };
}

/**
 * Loads the CC0 props through the injected fetch. Each must carry an embedded base colour texture and replaces a kind that has an original mesh
 * in `originals`: it is fitted into that mesh's bounding box (same footprint and collision) and its uv moved to its atlas slot.
 * Returns [{ kind, slot, model, texture: {mimeType, bytes} }]. A prop that fails is logged once and left out, so the original mesh stays.
 */
export async function loadThirdPartyModels(fetchFn, base, originals, warn = console.warn) {
  const out = [];
  for (const [kind, file] of Object.entries(THIRD_PARTY_MODELS)) {
    const slot = THIRD_PARTY_SLOTS[kind];
    const reference = originals && originals.get(kind);
    if (!reference) continue;
    try {
      const res = await fetchFn(base + file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const model = loadGlbBuffer(await res.arrayBuffer());
      if (!model.texture) throw new Error('no base colour texture');
      out.push({ kind, slot, model: atlasModel(fitModelInto(model, reference), slot), texture: model.texture });
    } catch (e) {
      warn(`[third-party] ${file} failed (${e.message}); keeping the original ${kind} mesh`);
    }
  }
  return out;
}

// ---- local Alien Terrain horror area (?pack=1 only, models from the git-ignored local-pack/alien/) ----

/**
 * Loads the local Alien models of `entries` ({kind: {file}}) through the injected fetch and fits each into the bounding box of the original mesh of
 * the same kind (same footprint, collision and Core growth scale). Returns [{ kind, model, texture }] (texture null when the model is flat coloured).
 * A model that fails is logged once and left out, so the original look-alike stays.
 */
export async function loadAlienModels(fetchFn, base, entries, originals, warn = console.warn) {
  const out = [];
  for (const [kind, entry] of Object.entries(entries)) {
    const reference = originals && originals.get(kind);
    if (!reference) continue;
    try {
      const res = await fetchFn(base + entry.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const model = loadGlbBuffer(await res.arrayBuffer());
      out.push({ kind, model: fitModelInto(model, reference), texture: model.texture });
    } catch (e) {
      warn(`[alien-pack] ${entry.file} failed (${e.message}); keeping the original ${kind} mesh`);
    }
  }
  return out;
}

/** Moves the uv of an already atlased model into the first `fraction` of each axis, for when its atlas becomes the corner of a bigger one. */
export function shrinkUv(model, fraction) {
  return { ...model, triangles: model.triangles.map((t) => (t.uv ? { ...t, uv: t.uv.map(([u, v]) => [u * fraction, v * fraction]) } : t)) };
}

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

// ---- village mesh mode (?meshes=1) ----

/**
 * Loads every kind through the injected fetch. A failed GLB is logged once per kind. With shapesUrl, the mesh is then built from the shared
 * shape data (data/village_shapes.json) instead; without it, or when that also fails, the kind is left out so callers use the procedural drawing.
 */
export async function loadMeshSet(fetchFn, base, kinds = KINDS, warn = console.warn, shapesUrl = null) {
  const set = new Map();
  let shapes = null;
  const shapeFallback = async (kind) => {
    if (!shapesUrl) return null;
    if (!shapes) {
      const res = await fetchFn(shapesUrl);
      if (!res.ok) throw new Error('shapes HTTP ' + res.status);
      shapes = await res.json();
    }
    return buildShapeModel(shapes, kind);
  };
  for (const kind of kinds) {
    try {
      const res = await fetchFn(base + kind + '.glb');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      set.set(kind, loadGlbBuffer(await res.arrayBuffer()));
    } catch (e) {
      try {
        const model = await shapeFallback(kind);
        if (model) { set.set(kind, model); warn(`[meshes] ${kind} GLB failed (${e.message}); built from the shape data`); continue; }
      } catch (e2) { e = new Error(`${e.message}; shape data: ${e2.message}`); }
      warn(`[meshes] ${kind} failed (${e.message}); using the procedural drawing`);
    }
  }
  return set;
}

/**
 * Places a parsed mesh on a village footprint and returns back to front polygons [{pts:[{x,y}*3], fill}].
 * project(x, z) is the renderer's iso projector, so meshes share the board with the procedural pieces.
 * piece {x, z, sizeX, sizeZ}; opts: hs (camera height scale), unitPx (pixels per world unit of height),
 * dread 0..1, tint [r,g,b] 0..255 theme colour or null, rot radians about the vertical axis (default 0, so existing output is unchanged). Deterministic: no randomness, same input gives the same output.
 */
export function meshPolygons(model, project, piece, { hs = 1, unitPx = 32, dread = 0, tint = null, rot = 0 } = {}) {
  const { min, max } = model.bounds;
  const s = 0.9 * Math.min(piece.sizeX / (max[0] - min[0] || 1), piece.sizeZ / (max[2] - min[2] || 1));
  const cx = piece.x + piece.sizeX / 2, cz = piece.z + piece.sizeZ / 2;
  const mx = (min[0] + max[0]) / 2, mz = (min[2] + max[2]) / 2;
  const light = [-0.4, 0.8, -0.45], ll = Math.hypot(...light);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const wx = (p) => cx + ((p[0] - mx) * cr + (p[2] - mz) * sr) * s, wz = (p) => cz + (-(p[0] - mx) * sr + (p[2] - mz) * cr) * s, ly = (p) => p[1] * s;
  const out = model.triangles.map((t) => {
    const a = t.p[0], b = t.p[1], c = t.p[2];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(...n) || 1;
    const lit = t.emissive ? 1 : 0.35 + 0.65 * Math.max(0, (n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / (nl * ll));
    const rgb = t.color.map((k, i) => {
      let v8 = lin2srgb(k * lit);
      if (tint) v8 = v8 * 0.7 + tint[i] * lit * 0.3;
      return Math.min(255, Math.round(v8 * (1 - 0.35 * dread) + [90, 20, 26][i] * 0.35 * dread * lit));
    });
    const pts = t.p.map((p) => { const q = project(wx(p), wz(p)); return { x: q.x, y: q.y - ly(p) * unitPx * hs }; });
    const depth = (wx(a) + wz(a) + wx(b) + wz(b) + wx(c) + wz(c)) / 3 + (ly(a) + ly(b) + ly(c)) * 0.01;
    return { pts, fill: 'rgb(' + rgb.join(',') + ')', depth };
  });
  out.sort((p, q) => p.depth - q.depth);
  return out.map(({ pts, fill }) => ({ pts, fill }));
}

// ---- WebGL feed (?view=3d): the same parsed meshes, placed in metres, as flat vertex data ----

/** Floats per vertex: position(3) normal(3) colour(3) glow(1) phase(1). */
export const VERTEX_FLOATS = 11;

/** Uniform scale that fits a mesh into a piece footprint (cell metres per layout cell), 90% like the 2D mesh mode. Capped at MAX_PLACE_SCALE: meshes are authored in metres and are shrunk to fit, never enlarged. */
export function fitScale(model, piece, cell) {
  const { min, max } = model.bounds;
  return Math.min(MAX_PLACE_SCALE, 0.9 * Math.min((piece.sizeX * cell) / (max[0] - min[0] || 1), (piece.sizeZ * cell) / (max[2] - min[2] || 1)));
}

/**
 * Appends one placed mesh to the flat array `out` and returns the placed height in metres.
 * Emissive triangles get glow = opts.glow (window light on or off) and phase for flicker. tint [r,g,b] 0..255 blends 30%.
 * Fixed scale (e.g. 1 for lamp posts) via opts.scale; opts.at = [x, z] centres the mesh there instead of on the piece; opts.rot turns it about the vertical axis (radians); opts.lift raises it (a church rise).
 * opts.uvOut: an array that receives two texture coordinates per vertex (0, 0 for untextured triangles), for a textured model's own buffer.
 */
/** Window panes carry their own coordinates in the uv slot, below WINDOW_UV (so -1, the untextured marker, and atlas uvs >= 0 stay distinct). Mirrors the scene shader. */
export const WINDOW_UV = -2;
/**
 * Pane coordinates of one emissive triangle: s across the pane, t up it, both 0..1 over the triangle's extent in its own plane, encoded as
 * WINDOW_UV - s and WINDOW_UV - t. A window is a thin box, so both triangles of a face span the whole face. Faces that look up or down get the pane centre.
 */
export function windowUvs(q, n) {
  if (Math.abs(n[1]) > 0.7) return q.map(() => [WINDOW_UV - 0.5, WINDOW_UV - 0.5]);
  const hx = n[2], hz = -n[0], a = q.map((p) => p[0] * hx + p[2] * hz), y = q.map((p) => p[1]);
  const a0 = Math.min(...a), a1 = Math.max(...a), y0 = Math.min(...y), y1 = Math.max(...y);
  return q.map((p, k) => [WINDOW_UV - (a1 - a0 > 1e-6 ? (a[k] - a0) / (a1 - a0) : 0.5), WINDOW_UV - (y1 - y0 > 1e-6 ? (y[k] - y0) / (y1 - y0) : 0.5)]);
}

export function appendMeshVertices(out, model, piece, cell, { glow = 1, phase = 0, tint = null, scale = null, at = null, rot = 0, lift = 0, uvOut = null, windows = false } = {}) {
  const { min, max } = model.bounds;
  const s = scale ?? fitScale(model, piece, cell);
  const cx = at ? at[0] : (piece.x + piece.sizeX / 2) * cell, cz = at ? at[1] : (piece.z + piece.sizeZ / 2) * cell;
  const mx = (min[0] + max[0]) / 2, mz = (min[2] + max[2]) / 2;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (const t of model.triangles) {
    const q = t.p.map((p) => [cx + ((p[0] - mx) * cr + (p[2] - mz) * sr) * s, lift + p[1] * s, cz + (-(p[0] - mx) * sr + (p[2] - mz) * cr) * s]);
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], v = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nl = Math.hypot(...n) || 1; n = n.map((c) => c / nl);
    const rgb = t.color.map((c, i) => {
      const base = Math.pow(Math.max(0, Math.min(1, c)), 1 / 2.2) * 255;
      return (tint ? base * 0.7 + tint[i] * 0.3 : base) / 255;
    });
    for (const p of q) out.push(p[0], p[1], p[2], n[0], n[1], n[2], rgb[0], rgb[1], rgb[2], t.emissive ? glow : 0, phase);
    if (uvOut) {
      const pane = windows && t.emissive && !t.uv ? windowUvs(q, n) : null; // glass, frame, mullions and curtains are drawn on the pane by the shader
      for (let k = 0; k < 3; k++) {
        if (t.uv) uvOut.push(t.uv[k][0], t.uv[k][1]);
        else if (pane) uvOut.push(pane[k][0], pane[k][1]);
        else if (model.texture) uvOut.push(0, 0);
        else uvOut.push(-1, -1);
      }
    }
  }
  return lift + max[1] * s;
}
