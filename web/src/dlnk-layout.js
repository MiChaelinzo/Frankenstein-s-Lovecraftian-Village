// Pure helpers for the optional "DLNK scene" mode (?pack=1&scene=<name>). No DOM access so node can test them.
// scene_layout.json lives in the git-ignored web/local-pack/ folder and is never committed.

export const LAYOUT_KINDS = ['house_a', 'house_b', 'church', 'well', 'altar', 'dead_tree', 'lamp', 'tree', 'plant', 'boat', 'rock', 'fence', 'part', 'generic'];
export const MAX_SCENE_OBJECTS = 3000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** Footprint in grid cells, wall height and the tint family a kind borrows from the pack manifest. */
export const KIND_STYLE = {
  house_a: { size: 0.9, h: 13, role: 'wall_wood' },
  house_b: { size: 1.0, h: 15, role: 'wall_plaster' },
  church: { size: 1.3, h: 26, role: 'wall_stone' },
  well: { size: 0.5, h: 6, role: 'wall_stone' },
  altar: { size: 0.55, h: 5, role: 'wall_stone' },
  dead_tree: { size: 0.35, h: 16, role: 'trunk' },
  tree: { size: 0.5, h: 18, role: 'trunk' },
  plant: { size: 0.22, h: 4, role: 'ground' },
  lamp: { size: 0.15, h: 9, role: 'wall_wood' },
  boat: { size: 0.7, h: 4, role: 'wall_wood' },
  rock: { size: 0.3, h: 5, role: 'wall_stone' },
  fence: { size: 0.4, h: 4, role: 'wall_wood' },
  part: { size: 0.2, h: 4, role: 'wall_wood' },
  generic: { size: 0.15, h: 3, role: 'ground' },
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);

function validObject(o) {
  return !!o && typeof o === 'object' && typeof o.name === 'string' && o.name.length <= 80 && LAYOUT_KINDS.includes(o.kind)
    && num(o.x) && num(o.z) && num(o.y) && num(o.rotY) && num(o.scale) && o.scale > 0
    && Math.abs(o.x) < 1e6 && Math.abs(o.z) < 1e6;
}

/** Returns { ok, errors, scenes } where scenes keeps only well-formed scenes (and their well-formed objects). */
export function validateLayout(json) {
  const errors = [];
  const scenes = {};
  if (!json || typeof json !== 'object') return { ok: false, errors: ['layout is not an object'], scenes };
  if (json.version !== 1) errors.push('unsupported layout version');
  const given = json.scenes && typeof json.scenes === 'object' && !Array.isArray(json.scenes) ? json.scenes : null;
  if (!given) errors.push('missing scenes');
  else {
    for (const [slug, s] of Object.entries(given)) {
      if (!SLUG.test(slug)) { errors.push(`${slug}: bad scene name`); continue; }
      if (!s || !Array.isArray(s.objects)) { errors.push(`${slug}: missing objects`); continue; }
      const objects = s.objects.slice(0, MAX_SCENE_OBJECTS).filter(validObject);
      if (!objects.length) { errors.push(`${slug}: no valid objects`); continue; }
      if (objects.length < Math.min(s.objects.length, MAX_SCENE_OBJECTS)) errors.push(`${slug}: dropped ${Math.min(s.objects.length, MAX_SCENE_OBJECTS) - objects.length} malformed objects`);
      scenes[slug] = { title: typeof s.title === 'string' ? s.title.slice(0, 60) : slug, total: num(s.total) ? s.total : objects.length, objects };
    }
    if (!Object.keys(scenes).length) errors.push('no usable scenes');
  }
  return { ok: Object.keys(scenes).length > 0, errors, scenes };
}

export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Scene slug for a requested name: exact slug, then slugified, then prefix match. Returns null when nothing matches. */
export function pickScene(scenes, wanted) {
  const keys = Object.keys(scenes || {}).sort();
  if (!keys.length) return null;
  const w = slugify(wanted);
  if (!w) return null;
  return keys.find((k) => k === w) || keys.find((k) => k.startsWith(w)) || keys.find((k) => slugify(scenes[k].title) === w) || null;
}

/**
 * Fits a scene into a gw x gd grid with a uniform scale (aspect kept) and returns drawable items sorted back to front.
 * Deterministic: ties on depth are ordered by source index.
 */
export function normalizeScene(scene, gw, gd, pad = 1) {
  const objs = scene.objects;
  // fit to the 3rd..97th percentile so a few far-away props do not squash the village; outliers clamp to the edge
  const pct = (vals, q) => { const v = vals.slice().sort((m, n) => m - n); return v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))]; };
  const xs = objs.map((o) => o.x), zs = objs.map((o) => o.z);
  const lo = objs.length >= 20 ? 0.03 : 0, hi = objs.length >= 20 ? 0.97 : 1;
  const minX = pct(xs, lo), maxX = pct(xs, hi), minZ = pct(zs, lo), maxZ = pct(zs, hi);
  const spanX = Math.max(1e-6, maxX - minX), spanZ = Math.max(1e-6, maxZ - minZ);
  const k = Math.min((gw - 2 * pad) / spanX, (gd - 2 * pad) / spanZ);
  const offX = (gw - spanX * k) / 2, offZ = (gd - spanZ * k) / 2;
  const items = objs.map((o, i) => {
    const st = KIND_STYLE[o.kind] || KIND_STYLE.generic;
    const grow = Math.max(0.6, Math.min(1.6, Math.sqrt(o.scale)));
    const gx = Math.max(0, Math.min(gw, offX + (Math.max(minX, Math.min(maxX, o.x)) - minX) * k));
    const gz = Math.max(0, Math.min(gd, offZ + (maxZ - Math.max(minZ, Math.min(maxZ, o.z))) * k)); // north (+z) is up-screen
    return { i, kind: o.kind, name: o.name, gx, gz, size: st.size * grow, h: st.h * grow, rot: o.rotY, role: st.role, depth: gx + gz };
  });
  items.sort((a, b) => a.depth - b.depth || a.i - b.i);
  return items;
}

/** Reads scene=<name> from a query string, falling back to a hash. Returns '' when absent. */
export function sceneFromUrl(search, hash) {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, '')).get('scene');
  if (q) return q;
  return new URLSearchParams(String(hash || '').replace(/^#/, '')).get('scene') || '';
}

export function kindCounts(scene) {
  const c = {};
  for (const o of scene.objects) c[o.kind] = (c[o.kind] || 0) + 1;
  return c;
}

export function sceneLabel(slug, scene) {
  return `DLNK scene: ${scene.title} (${scene.objects.length}${scene.total > scene.objects.length ? ` of ${scene.total}` : ''} objects)`;
}
