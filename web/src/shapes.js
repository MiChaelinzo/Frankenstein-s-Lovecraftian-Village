// Pure reader for data/village_shapes.json, the shape source shared with tools/blender/mesh_defs.py and the Unity builder.
// Builds the same model the GLB reader returns ({ triangles, bounds, stats }), so a mesh whose GLB fails to load can still be drawn.
// Source coordinates are Z-up (Blender); the model is glTF Y-up: (x, y, z) becomes (x, z, -y). Deterministic, no DOM, no randomness.
export const SHAPE_KINDS = ['box', 'wedge', 'cylinder', 'cone', 'hull'];

const boxGeometry = (cx, cy, z0, sx, sy, sz) => {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z1 = z0 + sz;
  return {
    v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]],
  };
};

const wedgeGeometry = (cx, cy, z0, sx, sy, rise, overhang) => {
  const x0 = cx - sx / 2 - overhang, x1 = cx + sx / 2 + overhang, y0 = cy - sy / 2 - overhang, y1 = cy + sy / 2 + overhang, zr = z0 + rise;
  return {
    v: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, cy, zr], [x1, cy, zr]],
    f: [[0, 3, 2, 1], [0, 1, 5, 4], [2, 3, 4, 5], [0, 4, 3], [1, 2, 5]],
  };
};

const cylinderGeometry = (cx, cy, z0, r0, r1, h, n) => {
  const ring = (r, z) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n), z]);
  const v = ring(r0, z0), f = [];
  if (r1 > 0) {
    v.push(...ring(r1, z0 + h));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; f.push([i, j, n + j, n + i]); }
    f.push(Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i));
  } else {
    v.push([cx, cy, z0 + h]);
    for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n]);
    f.push(Array.from({ length: n }, (_, i) => n - 1 - i));
  }
  return { v, f };
};

const hullGeometry = (length, width, depth, z0, bottom) => {
  const hl = length / 2, hw = width / 2, ring = [[-hl, -1], [0, -1], [hl, 0], [0, 1], [-hl, 1]];
  const v = [...ring.map(([x, y]) => [x, y * hw * bottom, z0]), ...ring.map(([x, y]) => [x, y * hw, z0 + depth])];
  const f = Array.from({ length: 5 }, (_, i) => [i, (i + 1) % 5, 5 + ((i + 1) % 5), 5 + i]);
  f.push([0, 4, 3, 2, 1]);
  return { v, f };
};

function partGeometry(spec) {
  const [cx, cy, z0] = spec.at;
  let g;
  if (spec.shape === 'box') g = boxGeometry(cx, cy, z0, ...spec.size);
  else if (spec.shape === 'wedge') g = wedgeGeometry(cx, cy, z0, ...spec.size, spec.overhang ?? 0.15);
  else if (spec.shape === 'cylinder') g = cylinderGeometry(cx, cy, z0, spec.radii[0], spec.radii[1], spec.height, spec.sides ?? 8);
  else if (spec.shape === 'cone') g = cylinderGeometry(cx, cy, z0, spec.radius, 0, spec.height, spec.sides ?? 8);
  else if (spec.shape === 'hull') g = hullGeometry(...spec.size, z0, spec.bottom ?? 0.55);
  else throw new Error(`shapes: unknown shape "${spec.shape}" in part ${spec.name}`);
  let v = g.v;
  if (spec.shear) { const { dx, from, height } = spec.shear; v = v.map(([x, y, z]) => [x + (dx * Math.max(0, z - from)) / height, y, z]); }
  if (spec.yaw) {
    const c = Math.cos((spec.yaw * Math.PI) / 180), s = Math.sin((spec.yaw * Math.PI) / 180);
    v = v.map(([x, y, z]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c, z]);
  }
  return { v, f: g.f };
}

/** Kind ids in file order, grouped as in the data file. */
export function shapeKinds(data) {
  const pick = (g) => data.meshes.filter((m) => m.group === g).map((m) => m.id);
  return { catalog: pick('catalog'), prop: pick('prop'), village: pick('village'), all: data.meshes.map((m) => m.id) };
}

/** Builds one mesh model from the shapes document; throws a clear error for an unknown kind, shape or material. */
export function buildShapeModel(data, kind) {
  const mesh = data.meshes.find((m) => m.id === kind);
  if (!mesh) throw new Error(`shapes: unknown kind "${kind}"`);
  const triangles = [];
  for (const spec of mesh.parts) {
    const rgba = data.palette[spec.material];
    if (!rgba) throw new Error(`shapes: unknown material "${spec.material}" in ${kind}/${spec.name}`);
    const emissive = spec.material.startsWith('glow') || spec.material.startsWith('rune');
    const { v, f } = partGeometry(spec);
    const up = v.map(([x, y, z]) => [x, z, -y]);
    for (const face of f) for (let i = 1; i < face.length - 1; i++) {
      triangles.push({ p: [up[face[0]], up[face[i]], up[face[i + 1]]], color: [rgba[0], rgba[1], rgba[2]], emissive });
    }
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of triangles) for (const q of t.p) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], q[k]); max[k] = Math.max(max[k], q[k]); }
  const materials = new Set(mesh.parts.map((p) => p.material)).size;
  return { triangles, bounds: { min, max }, stats: { triangles: triangles.length, materials } };
}
