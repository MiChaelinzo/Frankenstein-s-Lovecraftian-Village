// Pure helpers for the web demo's DLNK-style building features: texture themes, floor counts, door
// interactions, camera modes and omen-driven detail. No DOM access so node can test them. The shared
// policy itself (detailLevel, doorOmen, allowedCamera, ...) lives in core.js and is golden-checked.
import { queryParam } from './util.js';
import { stableHash, allowedCamera, suggestedCamera, floorVisible, clampFloor } from './core.js';

// Our own grouping of the pack's material families, using the three DLNK groups. The pack role is the
// local-pack texture used in ?pack=1 mode when present; every theme also has a procedural fallback.
export const THEME_GROUPS = ['Construction', 'Manmade', 'Nature'];
export const THEMES = [
  { id: 'bricks', label: 'Bricks', group: 'Construction', packRole: 'wall_brick' },
  { id: 'plaster', label: 'Plaster', group: 'Construction', packRole: 'wall_plaster' },
  { id: 'tiles', label: 'Tiles', group: 'Manmade', packRole: 'roof' },
  { id: 'wood', label: 'Wood', group: 'Manmade', packRole: 'wall_wood' },
  { id: 'rocks', label: 'Rocks', group: 'Nature', packRole: 'wall_stone' },
  { id: 'water', label: 'Water', group: 'Nature', packRole: null },
];
export const THEME_IDS = ['auto', ...THEMES.map((t) => t.id)];

/** Returns a theme id or 'auto' for anything unknown, so a bad URL never breaks the page. */
export function parseTheme(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return THEME_IDS.includes(v) ? v : 'auto';
}
export const themeById = (id) => THEMES.find((t) => t.id === id) || null;

/** Which role to paint with: the pack role when the pack has it, else the procedural pattern key. */
export function themeRole(id, packRoles) {
  const t = themeById(id);
  if (!t) return null;
  if (t.packRole && packRoles && packRoles[t.packRole]) return t.packRole;
  return `proc_${t.id}`;
}

/** Base wall colours for the procedural fallback and the tint under the texture. [lit, shaded]. */
const THEME_COLORS = {
  bricks: [[112, 62, 52], [78, 40, 36]],
  plaster: [[150, 140, 120], [104, 96, 84]],
  tiles: [[84, 98, 110], [56, 68, 80]],
  wood: [[104, 78, 52], [70, 50, 34]],
  rocks: [[96, 100, 98], [64, 68, 68]],
  water: [[40, 84, 100], [24, 54, 70]],
};
export function themeColors(id) {
  return THEME_COLORS[id] || null;
}

// ---- camera ----

export const CAMERA_CHOICES = ['auto', 'first', 'third', 'top'];
const CAMERA_INT = { first: 0, third: 1, top: 2 };
export const CAMERA_LABELS = ['First-person look', 'Third-person', 'Top-down cutaway'];

export function parseCamera(value) {
  const v = String(value == null ? '' : value).trim().toLowerCase();
  return CAMERA_CHOICES.includes(v) ? v : 'third';
}

/** The CameraMode int actually used: auto follows dread, others go through allowedCamera. */
export function effectiveCamera(choice, dread) {
  if (choice === 'auto') return allowedCamera(suggestedCamera(dread), dread);
  return allowedCamera(CAMERA_INT[choice] ?? 1, dread);
}

/** Projection per camera int. k squashes the board vertically, hs scales building heights. */
export function cameraProfile(mode) {
  return mode === 0 ? { k: 0.62, hs: 1.45 } : mode === 2 ? { k: 1, hs: 0.85 } : { k: 1, hs: 1 };
}

/** True when the requested choice was overridden by dread (top-down is refused at Abyss). */
export const cameraOverridden = (choice, dread) => choice !== 'auto' && effectiveCamera(choice, dread) !== (CAMERA_INT[choice] ?? 1);

// ---- floors ----

/** Floors per building. Deterministic from the id and the per-piece visual rolls (0..1). Mirrors DreadBuildingPolicy.FloorCountFor (golden-checked). */
export function floorCountFor(id, roll, roll2) {
  if (id === 'house_a') return roll < 0.5 ? 1 : 2;
  if (id === 'house_b') return roll2 < 0.35 ? 2 : 3;
  if (id === 'church') return 2;
  return 1;
}
export const maxFloors = (pieces) => pieces.reduce((m, p) => Math.max(m, p.floors || 1), 1);

/** Floor indexes that draw, in order. */
export function visibleFloors(floorCount, activeFloor, topDown) {
  const out = [];
  for (let f = 0; f < floorCount; f++) if (floorVisible(f, activeFloor, floorCount, topDown)) out.push(f);
  return out;
}
export { clampFloor };

export function parseFloor(value, max = 8) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

// ---- detail ----

/** What a building draws at a detail level (0 ruin .. 3 full). Never gains features as detail drops. */
export function detailFeatures(detail) {
  const d = Math.max(0, Math.min(3, detail | 0));
  return { roof: d >= 1, windows: d >= 1, lit: d >= 2, door: d >= 2, floorLines: d >= 2, texture: d >= 2, chimney: d >= 3, trim: d >= 3 };
}

// ---- doors ----

export const DOOR_NAMES = ['Normal', 'Creak', 'Slam', 'Refuse'];
const DOOR_TEXT = [
  ['The door swings open on an empty room.', 'The latch lifts. Nothing waits inside.'],
  ['The door creaks open by itself.', 'The hinges complain, slowly, as if in pain.'],
  ['The door slams in your face.', 'Something on the other side throws the door shut.'],
  ['The door will not open. It is not locked.', 'You push. The wood pushes back.'],
];
export function doorMessage(behavior, buildingId) {
  const b = Math.max(0, Math.min(3, behavior | 0));
  const list = DOOR_TEXT[b];
  return list[Math.abs(stableHash(buildingId)) % list.length];
}

export const buildingKey = (p) => `${p.id}@${p.x},${p.z}`;

/** Nearest door point within radius of (mx, my), or -1. points: [{x, y}]. */
export function nearestDoor(points, mx, my, radius = 14) {
  let best = -1, bd = radius;
  points.forEach((pt, i) => {
    const d = Math.hypot(pt.x - mx, pt.y - my);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}

/** Pixel offset for a door reaction, age in ms. Slam is one hard jolt, Creak a slow sway, others none. */
export function doorShake(behavior, ageMs, reduced) {
  if (reduced || behavior < 1 || ageMs < 0 || ageMs > 700) return { dx: 0, dy: 0 };
  const fade = 1 - ageMs / 700;
  if (behavior === 1) return { dx: Math.sin(ageMs / 60) * 1.2 * fade, dy: 0 };
  if (behavior === 2) return { dx: Math.sin(ageMs / 25) * 3.5 * fade, dy: Math.cos(ageMs / 31) * 1.5 * fade };
  return { dx: Math.sin(ageMs / 40) * 1.6 * fade, dy: 0 };
}
export const DOOR_RING = ['rgba(95,143,120,.9)', 'rgba(230,180,90,.9)', 'rgba(220,60,60,.95)', 'rgba(160,100,220,.95)'];

// ---- GLB mesh mode (?meshes=1, opt-in only) ----

/** Village piece id to committed Blender mesh kind. Pieces without a mesh keep the procedural drawing. */
const MESH_KINDS = { house_a: 'house_a', house_b: 'house_b', church: 'church', well: 'well', altar: 'altar', dead_tree: 'dead_tree' };
export const meshKindFor = (pieceId) => MESH_KINDS[pieceId] || null;

/** True only for an explicit meshes=1 in the query or hash. */
export function meshesWanted(search, hash) {
  return (queryParam(hash, 'meshes') ?? queryParam(search, 'meshes')) === '1';
}
