// Pure helpers for the optional local "pack mode" (?pack=1). No DOM access so node can test them.
// The manifest and textures live in the git-ignored web/local-pack/ folder and are never committed.

export const PACK_ROLES = ['wall_wood', 'wall_brick', 'wall_plaster', 'wall_stone', 'roof', 'trunk', 'ground', 'ground_stones'];

const isByte = (n) => Number.isInteger(n) && n >= 0 && n <= 255;
const safeRel = (s) => typeof s === 'string' && /^textures\/[A-Za-z0-9_.-]+\.png$/.test(s);

/** Returns { ok, errors, roles } where roles keeps only well-formed entries for known role names. */
export function validateManifest(json) {
  const errors = [];
  const roles = {};
  if (!json || typeof json !== 'object') return { ok: false, errors: ['manifest is not an object'], roles };
  if (!json.source || typeof json.source.package !== 'string') errors.push('missing source.package');
  const given = json.roles && typeof json.roles === 'object' ? json.roles : null;
  if (!given) errors.push('missing roles');
  else {
    for (const name of PACK_ROLES) {
      const r = given[name];
      if (!r) continue;
      if (!safeRel(r.texture)) { errors.push(`${name}: bad texture path`); continue; }
      if (!Array.isArray(r.tint) || r.tint.length !== 3 || !r.tint.every(isByte)) { errors.push(`${name}: bad tint`); continue; }
      roles[name] = { texture: r.texture, tint: r.tint.slice(), sourcePathname: String(r.sourcePathname || '') };
    }
    if (!Object.keys(roles).length) errors.push('no usable roles');
  }
  return { ok: Object.keys(roles).length > 0, errors, roles };
}

/** Pick a role, falling back through the list to the first one the pack has. Returns the role name or null. */
export function pickRole(roles, ...names) {
  for (const n of names) if (roles && roles[n]) return n;
  return null;
}

/** Real prefab name for a catalog id, or '' when the manifest has none. */
export function hintFor(json, id) {
  const h = json && json.prefabHints && json.prefabHints[id];
  return typeof h === 'string' ? h : '';
}

export function badgeText(json) {
  const name = json && json.source && json.source.package;
  return `Pack mode: local textures from ${name || 'unknown package'}`;
}

/** Multiplies a grayscale value (0..255) by a tint channel (0..255). */
export const tintChannel = (gray, tint) => Math.round((gray * tint) / 255);
