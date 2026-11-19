// Opt-in first-person WebGL view (?view=3d). Dependency-free WebGL 1. All maths is in view3d-math.js, the village layout comes from
// core.js, meshes from glb.js and the interaction rules from InteractionRules in core.js. This file only owns GL objects, shaders,
// input listeners and the frame loop. Original shaders and geometry only: no DLNK assets or footage are used.
import { InteractionRules } from './core.js';
import { composeDressing, growCorruption, corruptionLevel, dressingBoxes, DRESSING_KINDS, walkBounds, coastToWorldAt, hiOf } from './dressing.js';
import { landmarkDressing, landmarkPathDressing, hillHeight as landmarkHillHeight, hillPathZ, groundHeight, HILL_RX, HILL_RZ, HILL_FOOT } from './landmarks.js';
import { streetSurfaces, facingYaw } from './streets.js';
import { beamYaw, beamDirection, lighthouseSite, beamStrengthFor, BEAM_COLOR, LIGHTHOUSE_HALO_SCALE, HALF_ANGLE as BEAM_HALF_ANGLE, LAMP_HEIGHT as BEAM_LAMP_HEIGHT, BEAM_LENGTH } from './lighthouse.js';
import { appendMeshVertices, loadMeshSet, loadThirdPartyModels, loadAlienModels, atlasModel, shrinkUv, ATLAS_GRID, VERTEX_FLOATS } from './glb.js';
import { validateAlienManifest } from './pack.js';
import { proceduralTexture } from './proc-textures.js';
import { mapGamepad, padAxes3d, snapshotPad, touchDrive, combineDrive, isTap, lookDelta } from './input.js';
import { createPerf } from './perf.js';
import {
  CELL, EYE_HEIGHT, FAR, INV_TILE, resolveCollisions, BODY_RADIUS, sanitizeViewSettings, fovRadians, HALO_FLOATS, MAX_LIGHTS, cullCell, lightCullRadius, lightsWithin, pointsWithin, DOCK_SEGMENT, FENCE_SEGMENT, LAMP_KINDS, coastProps, lampKind, carriedLantern, cameraBasis, coldFill, contactRings, lanternPool, lanternState, moonBoost, churchSite, coastFeatures, blendCamera, coastToWorld, eyeParams, fogLayers, fireflyCount, fireflySeeds, fireflyStyle, seaParams, smoothDrive, footfall, surfaceAt, coastCloseness, FIREFLY_FLOATS,
  forwardVector, frameCost, hazedSky, headBob, haloSprites, lanternColor, lanternFlicker, lanternLights, moonParams, nearestLights, postParams, nextScale, omenBlendWeight, omenFraming,
  particleCounts, particleSeeds, windState, precipitationStyle, flashSky, decayFlash, weatherLook, parseCamParam, pickBox, pickLamp, renderSize, screenRay, spawnPoint, stepCamera, tentacleBases, terrainRects,
  viewProjection, windowLit, worldBounds, worldBoxes, postLampBoxes, partitionChunks, frustumPlanes, visibleRanges, fogCullDistance, fogFloorFor, chunkCullDistance, gradeParams, closeFog, windowMood, rimLight, projectToScreen, godRayAmount, shoreLine, wetness, blobShadows, MAX_BLOBS,
  LIFE, LIFE_KIND, lifeParams, lifeSeeds, chimneySites,
} from './view3d-math.js';
import { TALK_PICK_RADIUS, nearestVillager } from './villager-view.js';
const PICKUP_PICK_RADIUS = 0.5; // metres: items and chests lie on the ground like books
const BOOK_PICK_RADIUS = 0.7; // metres: a book lies on the ground, so the pick sphere is generous
import { omenTargets, stormFlash, thunderDelayMs, applyFlash } from './scene.js';
import { birdCounts, flockPlan, createFlocks, advanceFlockTo, roofPerches, buildBirds } from './birds.js';
import { lookAt } from './daylight.js';
import { tierFor } from './core.js';
import { tierSettings } from './quality.js';

const BOX_COLORS = { house_a: [0.42, 0.35, 0.3], house_b: [0.38, 0.33, 0.3], church: [0.4, 0.4, 0.42], well: [0.35, 0.36, 0.36], altar: [0.3, 0.3, 0.32], dead_tree: [0.2, 0.17, 0.14] };
const MESH_FOR = { house_a: 'house_a', house_b: 'house_b', church: 'church', well: 'well', altar: 'altar', dead_tree: 'dead_tree' };

// ---------- geometry (pure, tested without a GL context) ----------

function pushQuad(out, x0, z0, x1, z1, y, color, phase) {
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) out.push(x, y, z, 0, 1, 0, color[0], color[1], color[2], 0, phase);
}
function pushBox(out, p, cell, h, color) {
  const x0 = p.x * cell + 0.2, x1 = (p.x + p.sizeX) * cell - 0.2, z0 = p.z * cell + 0.2, z1 = (p.z + p.sizeZ) * cell - 0.2;
  const faces = [[[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1]], [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1]],
    [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0]], [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0]], [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0]]];
  for (const [a, b, c, d, n] of faces) for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], n[0], n[1], n[2], color[0], color[1], color[2], 0, 0);
}

/** What C talks to: the nearest villager in range; only when nobody is in range does it fall back to a book at your feet (reading proper stays on E, so a villager beside a book never costs a first-read sanity hit). */
export function chatTarget(villagers, books, x, z) {
  const v = nearestVillager(villagers || [], x, z, InteractionRules.RANGE);
  if (v) return { kind: 'villager', id: v.id };
  const b = nearestVillager(books || [], x, z, InteractionRules.RANGE);
  return b ? { kind: 'book', id: b.id } : null;
}

/** A lore book lying on the ground: a dark cover, pages that glow (glow 1 draws like a lit window) and a thin shaft of light above it so it reads from across the street. Yaw comes from the id so books do not all line up. */
function pushBook(out, x, z, id, read = false) {
  const turn = ((id.charCodeAt(id.length - 1) * 7 + id.charCodeAt(id.length - 2) * 3) % 8) / 8 * Math.PI, c = Math.cos(turn), s = Math.sin(turn);
  const rot = (dx, dz) => [x + dx * c - dz * s, z + dx * s + dz * c];
  const quad = (hx, hz, y0, y1, color, glow) => { const a = rot(-hx, -hz), b = rot(hx, -hz), d = rot(hx, hz), e = rot(-hx, hz); pushFrustum(out, Math.min(a[0], b[0], d[0], e[0]), Math.min(a[1], b[1], d[1], e[1]), Math.max(a[0], b[0], d[0], e[0]), Math.max(a[1], b[1], d[1], e[1]), y0, y1, 1, color, glow, 0); };
  quad(0.3, 0.22, 0.0, 0.07, [0.16, 0.07, 0.05], 0);
  if (read) { quad(0.26, 0.18, 0.07, 0.12, [0.32, 0.28, 0.2], 0); return; } // a read book keeps its cover and dull pages but loses the glow and the light shaft
  quad(0.26, 0.18, 0.07, 0.12, [0.95, 0.82, 0.5], 1);
  pushFrustum(out, x - 0.025, z - 0.025, x + 0.025, z + 0.025, 0.12, 0.8, 0.4, [0.95, 0.82, 0.5], 1, 0);
}

/** A found item (a small bundle with a teal glint) or a chest (a dark wooden box with a lid and a latch; the lodging chest's latch glows warm). Yaw comes from the id. */
function pushPickup(out, x, z, id, chest, lodging) {
  const turn = ((id.charCodeAt(id.length - 1) * 5 + id.charCodeAt(0) * 3) % 8) / 8 * Math.PI, c = Math.cos(turn), s = Math.sin(turn);
  const box = (hx, hz, y0, y1, color, glow) => { const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([dx, dz]) => [x + dx * c - dz * s, z + dx * s + dz * c]); pushFrustum(out, Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])), y0, y1, 1, color, glow, 0); };
  if (chest) {
    box(0.42, 0.28, 0, 0.42, [0.22, 0.13, 0.07], 0);
    box(0.44, 0.3, 0.42, 0.52, [0.3, 0.19, 0.1], 0);
    box(0.06, 0.32, 0.18, 0.34, lodging ? [0.95, 0.7, 0.35] : [0.55, 0.5, 0.4], lodging ? 1 : 0);
    return;
  }
  box(0.16, 0.12, 0, 0.13, [0.28, 0.24, 0.18], 0);
  box(0.1, 0.07, 0.13, 0.2, [0.45, 0.78, 0.74], 1);
}

// Frustum from a rectangle on the ground: the top rectangle is the base scaled about its centre by `taper` (0 = pyramid, 1 = box, >1 = flares out).
function pushFrustum(out, x0, z0, x1, z1, y0, y1, taper, color, glow = 0, phase = 0) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const b = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], t = [[cx - hx * taper, y1, cz - hz * taper], [cx + hx * taper, y1, cz - hz * taper], [cx + hx * taper, y1, cz + hz * taper], [cx - hx * taper, y1, cz + hz * taper]];
  const vert = (v, n) => out.push(v[0], v[1], v[2], n[0], n[1], n[2], color[0], color[1], color[2], glow, phase);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = b[i], c = b[j], d = t[j], e = t[i];
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], w = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    for (const v of [a, c, d, a, d, e]) vert(v, nn);
  }
  if (taper > 0) for (const v of [t[0], t[1], t[2], t[0], t[2], t[3]]) vert(v, [0, 1, 0]);
}
/** Box in coast-local metres: u along the shore, v out to sea. Placed on whichever side the coast is. */
function pushCoastBlock(out, f, u0, u1, v0, v1, y0, y1, color, taper = 1) {
  const a = coastToWorld(f, u0, v0), b = coastToWorld(f, u1, v1);
  pushFrustum(out, Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), y0, y1, taper, color);
}

/** Added to the phase of foliage vertices (trees, bushes, reeds): the scene vertex shader bends them with the wind and removes the marker again. */
export const FOLIAGE_PHASE = 1000;
const FOLIAGE_KINDS = new Set(['tree', 'bush', 'reeds', 'grass_tuft', 'crop_row', 'tentacle_tree', 'tentacle_sapling']);
/** Added on top of FOLIAGE_PHASE for plants that grow from the ground: the scene shader colours them from the ground palette under them. */
export const GROUND_PLANT_PHASE = 300;
const GROUND_PLANT_KINDS = new Set(['reeds', 'grass_tuft']);
/** Added to the phase of hanging props (signs, laundry, nets, wall lanterns): the vertex shader swings them gently and removes the marker again. */
export const HANG_PHASE = 2000;
const HANG_KINDS = new Set(['sign', 'laundry_line', 'net', 'wall_lantern']);
/** Dressing kinds whose emissive parts are windows (glass, frame, curtains in the shader); lamp and lantern glass stays plain glow. */
export const WINDOW_KINDS = new Set(['cottage_thatch', 'cottage_tall', 'inn', 'chapel']);
const STREET_Y = 0.06, STREET_COLOR = [0.3, 0.29, 0.28], STREET_PHASE = -5; // phase below -3 marks cobbled street quads for the ground shader
const WOOD = [0.2, 0.15, 0.11], WOOD_DARK = [0.11, 0.08, 0.06], ROCK = [0.17, 0.17, 0.19], FOAM = [0.46, 0.52, 0.54], SILHOUETTE = [0.05, 0.05, 0.08], EARTH = [0.07, 0.085, 0.07];

/** Width of a model along its long (X) axis in metres. */
const modelLength = (m) => m.bounds.max[0] - m.bounds.min[0] || 1;

/**
 * Shoreline foam, a plank dock on posts, two moored boats and a pair of stepped cliffs, plus fence runs on the land side. Original geometry,
 * all seeded by coastFeatures. With `meshes` (the committed Blender GLBs) the dock, boats, cliffs and fences use them; a missing mesh falls back
 * to the procedural boxes, so the shore is never empty.
 */
export function buildCoast({ gridW, gridD, seed, cell = CELL, meshes = null }) {
  const out = [], { frame: f, dock, boats, cliffs } = coastFeatures(gridW, gridD, seed, cell), props = coastProps(gridW, gridD, seed, cell);
  const along = f.axis === 'x' ? Math.PI / 2 : 0, seaward = f.axis === 'x' ? 0 : Math.PI / 2; // long axis along the shore, and out to sea
  const place = (kind, u, v, scale, rot) => {
    const w = coastToWorld(f, u, v);
    appendMeshVertices(out, meshes.get(kind), null, cell, { glow: 1, phase: u, scale, at: [w.x, w.z], rot });
  };
  const foam = [coastToWorld(f, f.lo - 12, 0), coastToWorld(f, f.hi + 12, 2.2)];
  pushQuad(out, Math.min(foam[0].x, foam[1].x), Math.min(foam[0].z, foam[1].z), Math.max(foam[0].x, foam[1].x), Math.max(foam[0].z, foam[1].z), -0.3, FOAM, 0);
  if (meshes && meshes.has('dock')) for (const seg of props.dockSegments) place('dock', seg.u, seg.v, DOCK_SEGMENT / modelLength(meshes.get('dock')), seaward);
  else {
    pushCoastBlock(out, f, dock.u - dock.width / 2, dock.u + dock.width / 2, -1, dock.length, 0.3, dock.deck + 0.3, WOOD);
    for (let i = 0; i < dock.posts; i++) for (const side of [-1, 1]) {
      const v = i * 3, u = dock.u + side * (dock.width / 2 + 0.1);
      pushCoastBlock(out, f, u - 0.15, u + 0.15, v - 0.15, v + 0.15, -0.8, 1.1, WOOD_DARK);
    }
  }
  if (meshes && meshes.has('fence')) for (const fe of props.fences) place('fence', fe.u, fe.v, FENCE_SEGMENT / modelLength(meshes.get('fence')), along);
  for (const b of boats) {
    if (meshes && meshes.has('boat')) { place('boat', b.u, b.v, b.len / modelLength(meshes.get('boat')), along + b.tilt * 0.2); continue; }
    pushCoastBlock(out, f, b.u - b.len / 2, b.u + b.len / 2, b.v - b.wid / 2, b.v + b.wid / 2, -0.25, 0.55, WOOD_DARK, 1.2);
    pushCoastBlock(out, f, b.u + b.tilt * b.len * 0.12 - 0.35, b.u + b.tilt * b.len * 0.12 + 0.35, b.v - 0.3, b.v + 0.3, 0.55, 1.25, WOOD);
    pushCoastBlock(out, f, b.u - 0.05, b.u + 0.05, b.v - 0.05, b.v + 0.05, 0.55, 3.1, WOOD_DARK);
  }
  if (meshes && meshes.has('cliff_rock')) {
    cliffs.forEach((c, i) => place('cliff_rock', c.u, c.v, c.h / (meshes.get('cliff_rock').bounds.max[1] || 1), i * 2.1));
    return new Float32Array(out);
  }
  cliffs.forEach((c, i) => {
    let y = -0.6, w = c.w, d = c.d;
    for (let tier = 0; tier < 3; tier++) {
      const h = (c.h * (tier === 0 ? 0.45 : 0.3)), shift = c.step * tier * 1.1, g = 0.9 + 0.1 * ((i + tier) % 2);
      pushCoastBlock(out, f, c.u + shift - w / 2, c.u + shift + w / 2, c.v - d / 2, c.v + d / 2, y, y + h, ROCK.map((v) => v * g), 0.78);
      y += h; w *= 0.62; d *= 0.62;
    }
  });
  return new Float32Array(out);
}

const HILL_STEPS = 26; // the rise itself (radii, plateau, foot and height function) is Core ruled: landmarks.js mirrors VillageLandmarks
const GRASS = [0.13, 0.17, 0.11], GRASS_DRY = [0.2, 0.2, 0.13], HILL_ROCK = [0.24, 0.24, 0.25], HILL_PATH = [0.36, 0.33, 0.27];
/** Height of the church rise at an offset (metres) from its centre c: the shared Core function of landmarks.js. */
export const hillHeight = (c, dx, dz) => landmarkHillHeight(c.hill, dx, dz);
/** A winding path climbs the village side of the rise: its lateral offset from the centre line at a given x offset. */
const pathZ = (c, dx) => hillPathZ(dx);
/** The rise as a smooth heightmap: grass and dry turf by height, rock on steep slopes, and a pale path from the foot to the summit on the side that faces the village. */
function pushHillSurface(out, c) {
  const n = HILL_STEPS, xs = [], at = (i, j) => {
    const dx = (i / n - 0.5) * 2 * HILL_RX, dz = (j / n - 0.5) * 2 * HILL_RZ, h = hillHeight(c, dx, dz);
    const sx = (hillHeight(c, dx + 0.5, dz) - hillHeight(c, dx - 0.5, dz)), sz = (hillHeight(c, dx, dz + 0.5) - hillHeight(c, dx, dz - 0.5)), nl = Math.hypot(sx, 1, sz);
    const slope = Math.min(1, Math.hypot(sx, sz) / 1.1), high = Math.max(0, Math.min(1, h / c.hill)), grain = 0.9 + 0.1 * Math.sin(dx * 1.7) * Math.sin(dz * 1.3);
    let col = GRASS.map((g, k) => (g + (GRASS_DRY[k] - g) * high) * grain);
    col = col.map((v, k) => v + (HILL_ROCK[k] - v) * slope * 0.8);
    const toward = dx * c.faceX, lateral = Math.abs(dz - pathZ(c, dx));
    if (toward > 5 && toward < HILL_RX * 0.98 && lateral < 1.15 && h > HILL_FOOT + 0.2) { const k = 1 - lateral / 1.15; col = col.map((v, m) => v + (HILL_PATH[m] - v) * Math.min(1, k * 2)); }
    return [c.x + dx, h, c.z + dz, -sx / nl, 1 / nl, -sz / nl, col[0], col[1], col[2]];
  };
  for (let i = 0; i <= n; i++) { xs.push([]); for (let j = 0; j <= n; j++) xs[i].push(at(i, j)); }
  const push = (v) => out.push(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], 0, 0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const v of [xs[i][j], xs[i][j + 1], xs[i + 1][j + 1], xs[i][j], xs[i + 1][j + 1], xs[i + 1][j]]) push(v);
}

/** A hill and a church standing on it, drawn as a near black silhouette against the haze, with two dim lit windows. Original geometry. */
export function buildChurchHill({ gridW, gridD, seed, cell = CELL }) {
  const out = [], c = churchSite(gridW, gridD, seed, cell), x = c.x, z = c.z;
  pushHillSurface(out, c);
  const y0 = c.hill;
  pushFrustum(out, x - 2.6, z - 5.5, x + 2.6, z + 5.5, y0, y0 + 4.6, 1, SILHOUETTE);
  pushFrustum(out, x - 3, z - 5.9, x + 3, z + 5.9, y0 + 4.6, y0 + 7.4, 0.12, SILHOUETTE);
  pushFrustum(out, x - 1.6, z + 5.5, x + 1.6, z + 8.7, y0, y0 + 11.5, 1, SILHOUETTE);
  pushFrustum(out, x - 1.9, z + 5.3, x + 1.9, z + 8.9, y0 + 11.5, y0 + 18, 0, SILHOUETTE);
  const face = x + c.faceX * 2.65, depth = 0.1;
  for (const wz of [z - 3, z + 0.2]) pushFrustum(out, Math.min(face, face + c.faceX * depth), wz - 0.45, Math.max(face, face + c.faceX * depth), wz + 0.45, y0 + 1.3, y0 + 3.2, 1, [0.9, 0.6, 0.28], 1, wz);
  return new Float32Array(out);
}

/**
 * Tentacles standing in the sea off the coast: tapered five sided tubes that sway (unless reduced) and redden with dread.
 * grow is the shared omen strength 0..1 (omenTargets), so they appear exactly when the 2D canvas shows them.
 */
export function buildTentacles({ bases, grow, dread, timeSec = 0, reduced = false }) {
  const out = [], SEG = 14, SIDES = 5, tint = [0.13, 0.17, 0.21].map((v, k) => v + ([0.38, 0.09, 0.15][k] - v) * Math.max(0, Math.min(1, dread)));
  bases.forEach((b, bi) => {
    const g = Math.max(0, Math.min(1, grow * 1.4 - bi * 0.25));
    if (g <= 0) return;
    const H = 13 * g, rings = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, sway = reduced ? 0 : Math.sin(timeSec / 1.1 + b.phase + t * 3.2);
      const cx = b.x + (Math.sin(t * 2.4 + b.phase) * 1.8 + sway * 1.1 + b.lean * 5) * t, cz = b.z + Math.cos(t * 1.9 + b.phase) * 1.2 * t;
      rings.push({ cx, cz, y: -0.4 + t * H, r: 0.6 * (1 - t) + 0.07 });
    }
    const pt = (ring, k) => { const a = (k / SIDES) * Math.PI * 2; return [ring.cx + Math.cos(a) * ring.r, ring.y, ring.cz + Math.sin(a) * ring.r, Math.cos(a), Math.sin(a)]; };
    for (let i = 0; i < SEG; i++) for (let k = 0; k < SIDES; k++) {
      const p = pt(rings[i], k), q = pt(rings[i], k + 1), r = pt(rings[i + 1], k + 1), s = pt(rings[i + 1], k);
      for (const v of [p, q, r, p, r, s]) out.push(v[0], v[1], v[2], v[3], 0.2, v[4], tint[0], tint[1], tint[2], 0, 0);
    }
  });
  return new Float32Array(out);
}

export const VILLAGER_HEIGHT_SCALE = 1;    // the villager mesh is authored 1.7 m tall (PERSON_HEIGHT), so it is placed unscaled
export const VILLAGER_SWAY_RAD = 0.05;     // idle sway amplitude in radians; zero with reduced motion
const VILLAGER_SWAY_STEP = 0.1;            // seconds; sway is sampled so the dynamic buffer is rebuilt at most ten times a second

export const VILLAGER_STRIDE_M = 0.7;        // metres per full leg swing cycle half: one step every 0.7 m walked
export const VILLAGER_LEG_SWING_RAD = 0.55;  // hip swing amplitude while walking
export const VILLAGER_HIP_HEIGHT = 0.85;     // metres: below this the figure's legs swing
export const VILLAGER_BOB_M = 0.035;         // metres the body rises at mid step

/**
 * Walking pose for one figure, applied to its freshly appended vertices (floats per vertex as in glb.js): the legs below the hip swing in
 * opposite directions along the facing, the whole body bobs, and a fade under 1 (a door swallowing or releasing the villager) narrows the
 * body across its width to nothing. Pure on the array. Exported for tests.
 */
export function poseWalker(out, from, cx, cz, yaw, stride, fade, reduced = false) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx; // facing and right on the ground
  const step = stride / VILLAGER_STRIDE_M * Math.PI, swing = reduced ? 0 : Math.sin(step) * VILLAGER_LEG_SWING_RAD, bob = reduced ? 0 : Math.abs(Math.sin(step)) * VILLAGER_BOB_M;
  const narrow = Math.max(0, Math.min(1, fade));
  for (let i = from; i < out.length; i += VERTEX_FLOATS) {
    const dx = out[i] - cx, dz = out[i + 2] - cz, side = dx * rx + dz * rz;
    let along = dx * fx + dz * fz, y = out[i + 1];
    if (y < VILLAGER_HIP_HEIGHT && swing !== 0) along += (VILLAGER_HIP_HEIGHT - y) * Math.tan(swing * (side >= 0 ? 1 : -1));
    const w = side * narrow;
    out[i] = cx + fx * along + rx * w; out[i + 2] = cz + fz * along + rz * w; out[i + 1] = y + bob;
  }
}

/** Vertices for the villagers (metres). Idle sway turns each figure slightly; walking villagers swing their legs and bob; reduced motion holds the pose still. Empty without the mesh. */
export function buildVillagers({ villagers, model, cell = CELL, timeSec = 0, reduced = false }) {
  const out = [];
  if (!model) return new Float32Array(0);
  const t = Math.floor(timeSec / VILLAGER_SWAY_STEP) * VILLAGER_SWAY_STEP;
  for (const v of villagers) {
    const walking = !!v.walking, fade = v.fade ?? 1, sway = reduced || walking ? 0 : Math.sin(t * 0.9 + v.id * 1.7) * VILLAGER_SWAY_RAD, rot = v.yaw + sway, first = out.length;
    appendMeshVertices(out, model, null, cell, { glow: v.lantern ? 1 : 0.12, phase: v.id * 1.3, scale: VILLAGER_HEIGHT_SCALE, at: [v.pos[0], v.pos[2]], rot });
    if (walking || fade < 1) poseWalker(out, first, v.pos[0], v.pos[2], rot, walking ? v.stride || 0 : 0, fade, reduced);
  }
  return new Float32Array(out);
}


// ---------- creatures: pale shapes that stand, crawl or wheel; their sway is the vertex shader's hanging-prop sway ----------

export const CREATURE_SWAY_PHASE = 2000;   // vertex phase of the hanging-prop sway (the shader swings these more with height); the shader's uSway is 0 under reduced motion
export const CREATURE_GLOW = 0.45;         // dim, steady eyes
export const FLYER_ORBIT_M = 3.0, FLYER_ORBIT_RAD_PER_SEC = 0.35;

/**
 * Vertices for the creatures (metres): each faces the player (facing = sin yaw, cos yaw like the villagers), flyers hang at their mesh height and wheel slowly in a small circle
 * (still under reduced motion). entries: { id, kind, pos: [x, y, z], yaw, height, phase }; models: Map kind -> model. Pure and deterministic. Empty without the meshes.
 */
export const MAX_PLAYER_DT = 0.25; // seconds: a stalled frame never makes a creature jump
export const CREATURE_FOG_GAIN = 0.6, CREATURE_FLICKER_DEPTH = 0.35, CREATURE_STEADY_DIM = 0.12;
/** The held lantern's brightness factor while a creature is near: it gutters with closeness; under reduced motion it only dims a little, steadily. */
export const creatureFlicker = (near, timeSec, reduced) => (reduced ? 1 - CREATURE_STEADY_DIM * near : 1 - CREATURE_FLICKER_DEPTH * near * (0.5 + 0.5 * Math.sin(timeSec * 23)));
export const WARD_KEYS = Object.freeze({ KeyZ: 'salt', KeyV: 'sigil', KeyF: 'flare' });
export function buildCreatures({ creatures, models, timeSec = 0, reduced = false }) {
  const out = [];
  if (!models) return new Float32Array(0);
  for (const c of creatures || []) {
    const model = models.get(c.kind);
    if (!model) continue;
    const a = reduced ? 0 : timeSec * FLYER_ORBIT_RAD_PER_SEC + c.phase, wheel = c.height > 0 ? FLYER_ORBIT_M : 0;
    const x = c.pos[0] + Math.cos(a) * wheel, z = c.pos[2] + Math.sin(a) * wheel, yaw = wheel ? a + Math.PI / 2 : c.yaw;
    appendMeshVertices(out, model, null, CELL, { glow: CREATURE_GLOW, phase: CREATURE_SWAY_PHASE + c.phase, scale: 1, at: [x, z], rot: yaw, lift: c.height });
  }
  return new Float32Array(out);
}

// ---------- the lighthouse beam: crossed soft sheets turning with the Core clock ----------

/** Floats per beam vertex: x, y, z and the alpha of the sheet there (bright on the axis, zero at the edges and the far end). */
export const BEAM_FLOATS = 4;
const BEAM_SHEETS = 4, BEAM_STATIONS = [[0.45, 0.4], [1, 0.06]]; // [distance as a fraction of the length, centre alpha]

/**
 * Four soft sheets that cross along the beam axis (so the cone reads from every side), each a fan from the lamp. pos is the lamp [x, y, z], yaw the Core beam yaw.
 * Pure and deterministic: 24 triangles. The renderer draws them additively, so a sheet seen edge on adds almost nothing.
 */
export function buildBeam({ pos, yaw, halfAngle = BEAM_HALF_ANGLE, length = BEAM_LENGTH }) {
  const [dx, dz] = beamDirection(yaw), side = [-dz, 0, dx], up = [0, 1, 0], out = [];
  const vert = (a, d, w, across, alpha) => out.push(pos[0] + dx * d + a[0] * w * across, pos[1] + a[1] * w * across, pos[2] + dz * d + a[2] * w * across, alpha);
  for (let k = 0; k < BEAM_SHEETS; k++) {
    const t = (k / BEAM_SHEETS) * Math.PI, c = Math.cos(t), sn = Math.sin(t);
    const axis = [side[0] * c + up[0] * sn, side[1] * c + up[1] * sn, side[2] * c + up[2] * sn];
    const apex = () => out.push(pos[0], pos[1], pos[2], 0.6);
    const rows = BEAM_STATIONS.map(([f, a]) => ({ d: f * length, w: f * length * Math.tan(halfAngle), a }));
    const at = (r, across) => (across === 0 ? [r.d, r.w, 0, r.a] : [r.d, r.w, across, 0]);
    const [r1, r2] = rows;
    for (const [aL, aR] of [[-1, 0], [0, 1]]) { apex(); vert(axis, ...at(r1, aL)); vert(axis, ...at(r1, aR)); }
    for (const [aL, aR] of [[-1, 0], [0, 1]]) {
      vert(axis, ...at(r1, aL)); vert(axis, ...at(r2, aL)); vert(axis, ...at(r1, aR));
      vert(axis, ...at(r1, aR)); vert(axis, ...at(r2, aL)); vert(axis, ...at(r2, aR));
    }
  }
  return new Float32Array(out);
}

// ---------- the explorer's own lantern, held low at the right of the view ----------

/** Where the held lantern hangs in camera space (metres: right, up, forward of the eye). Low and to the right, so only its glass and cap sit in the corner. */
export const HELD_LANTERN_OFFSET = Object.freeze([0.4, -0.42, 0.8]);
export const HELD_LANTERN_SWING_RAD = 0.06; // walking swing amplitude in radians; zero with reduced motion
const HELD_METAL = [0.09, 0.08, 0.07], HELD_GLASS = [0.95, 0.7, 0.38], HELD_FLAME = [1, 0.95, 0.75];
/** Vertex phase marks read by the held lantern in the fragment shader (mode 3): flame part (above 1.5) and glass part. */
export const HELD_FLAME_PHASE = 2, HELD_GLASS_PHASE = 0.7;

/**
 * A small original hand lantern (about 0.24 m tall, 0.11 m wide: base, glowing glass, cap and ring) placed in front of the eye.
 * basis is cameraBasis(eye); swingPhase is the walking phase (bobPhase), ignored when reduced. Pure and deterministic.
 */
export function buildHeldLantern({ eye, basis, swingPhase = 0, reduced = false }) {
  const local = [];
  pushFrustum(local, -0.055, -0.055, 0.055, 0.055, 0, 0.025, 1, HELD_METAL);                       // base plate
  pushFrustum(local, -0.026, -0.026, 0.026, 0.026, 0.03, 0.12, 0.55, HELD_FLAME, 1, HELD_FLAME_PHASE); // the flame, white hot at its heart, seen between the cage posts
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {                                     // four cage posts at the corners of the open lower half
    const cx = sx * 0.043, cz = sz * 0.043;
    pushFrustum(local, cx - 0.006, cz - 0.006, cx + 0.006, cz + 0.006, 0.025, 0.1, 1, HELD_METAL);
  }
  pushFrustum(local, -0.047, -0.047, 0.047, 0.047, 0.1, 0.17, 0.85, HELD_GLASS, 0.8, HELD_GLASS_PHASE); // amber glass of the upper half, shaded by its angle in the fragment shader
  pushFrustum(local, -0.06, -0.06, 0.06, 0.06, 0.17, 0.21, 0.3, HELD_METAL);                         // cap
  pushFrustum(local, -0.012, -0.012, 0.012, 0.012, 0.21, 0.245, 1, HELD_METAL);                     // ring the hand holds
  const swing = reduced ? 0 : Math.sin(swingPhase * 3.75) * HELD_LANTERN_SWING_RAD, cs = Math.cos(swing), sn = Math.sin(swing);
  const [ox, oy, oz] = HELD_LANTERN_OFFSET, { r, u, f } = basis, out = new Float32Array(local.length);
  const place = (x, y, z, dst, at) => { for (let c = 0; c < 3; c++) dst[at + c] = r[c] * x + u[c] * y + f[c] * z; };
  for (let i = 0; i < local.length; i += VERTEX_FLOATS) {
    // swing about the ring (local y 0.245) in the camera's right/up plane, then hang the ring at the offset
    const x = local[i], y = local[i + 1] - 0.245, z = local[i + 2], nx = local[i + 3], ny = local[i + 4];
    place(ox + x * cs - y * sn, oy + 0.245 + x * sn + y * cs, oz + z, out, i);
    out[i] += eye.x; out[i + 1] += eye.y; out[i + 2] += eye.z;
    place(nx * cs - ny * sn, nx * sn + ny * cs, local[i + 5], out, i + 3);
    for (let k = 6; k < VERTEX_FLOATS; k++) out[i + k] = local[i + k];
  }
  return out;
}

/**
 * Shared prop batching: appends every placed item { kind, x, y, z, yaw, scale } as its mesh into one static vertex array `out` (and one
 * uv pair per vertex into `uv`, -1 for untextured vertices), so any number of props of any kinds costs no extra draw call. One rule for
 * every kind, no per-kind code; foliage gets the sway phase offset. Run once per world build; the result is chunked and culled like the houses.
 * Items whose mesh is missing are skipped. Returns the number of items placed.
 */
export function batchProps(out, uv, items, meshes, cell = CELL) {
  const padUv = () => { while (uv.length < (out.length / VERTEX_FLOATS) * 2) uv.push(-1, -1); }; // -1 marks an untextured vertex
  let placed = 0;
  if (meshes) for (const it of items) {
    const model = meshes.get(it.kind);
    if (!model) continue;
    const windows = WINDOW_KINDS.has(it.kind);
    if (model.texture || windows) padUv();
    appendMeshVertices(out, model, null, cell, { glow: 1, phase: it.x * 0.37 + it.z * 0.11 + (FOLIAGE_KINDS.has(it.kind) ? FOLIAGE_PHASE + (GROUND_PLANT_KINDS.has(it.kind) ? GROUND_PLANT_PHASE : 0) : HANG_KINDS.has(it.kind) ? HANG_PHASE : 0), scale: it.scale, at: [it.x, it.z], rot: it.yaw, lift: it.y, uvOut: model.texture || windows ? uv : null, windows });
    placed++;
  }
  padUv();
  return placed;
}

/**
 * Static world: houses, landmarks and props as placed GLB meshes (boxes when a mesh is missing), lamp posts at lit houses.
 * Returns { building: Float32Array, ground, sea, heights, lights }. Deterministic: same layout, details and meshes give the same bytes.
 */
export function buildWorld({ layout, meshes, seed, gridW, gridD, tintFor = () => null, groundTint = null, cell = CELL, books = [], pickups = [], corruption = 0 }) {
  const out = [], heights = [], uv = [];
  for (const p of layout) {
    const model = meshes && meshes.get(MESH_FOR[p.id]);
    const lit = p.id === 'house_a' || p.id === 'house_b' ? (windowLit(p) ? 1 : 0) : 1;
    const phase = p.vis ? p.vis.phase : 0;
    if (model) { while (uv.length < (out.length / VERTEX_FLOATS) * 2) uv.push(-1, -1); heights.push(appendMeshVertices(out, model, p, cell, { glow: lit, phase: p.id === 'dead_tree' ? phase + FOLIAGE_PHASE : phase, tint: tintFor(p.id), rot: facingYaw(p.facing | 0), uvOut: uv, windows: true })); }
    else { heights.push(3); pushBox(out, p, cell, 3, BOX_COLORS[p.id] || [0.3, 0.3, 0.3]); }
  }
  const lights = lanternLights(layout, cell);
  if (meshes) for (const l of lights) {
    const lamp = l.post && (meshes.get(lampKind(l)) || meshes.get('lamp'));
    if (lamp) appendMeshVertices(out, lamp, null, cell, { glow: 1, phase: l.phase, scale: 1, at: [l.pos[0], l.pos[2]] });
  }
  const dressing = composeDressing(seed, gridW, gridD, layout);
  batchProps(out, uv, dressing, meshes, cell);
  const landmarkItems = [...landmarkDressing(seed, gridW, gridD), ...landmarkPathDressing(seed, gridW, gridD)];
  batchProps(out, uv, landmarkItems, meshes, cell); // the wider world: sea stacks, wreck, marsh, abbey ruins, lit paths
  if (corruption > 0) batchProps(out, uv, growCorruption(seed, gridW, gridD, corruption), meshes, cell); // tentacle trees, fungi and spires at the Core ruled sites; they grow with dread and night
  for (const b of books) pushBook(out, b.pos[0], b.pos[2], b.id, !!b.read);
  for (const q of pickups) pushPickup(out, q.pos[0], q.pos[2], q.id, !!q.chest, !!q.lodging);
  while (uv.length < (out.length / VERTEX_FLOATS) * 2) uv.push(-1, -1); // books come after the last textured prop; without this padding partitionChunks drops the uv reorder and every textured vertex samples the wrong texel
  const t = terrainRects(gridW, gridD, seed, cell), g = t.ground, ground = [], sea = [];
  const gc = groundTint ? groundTint.map((v) => (v / 255) * 0.7) : [0.2, 0.21, 0.17];
  pushQuad(ground, g.minX, g.minZ, g.maxX, g.maxZ, 0, gc, -1);
  for (const r of contactRings(layout, lights, cell)) pushQuad(ground, r.x0, r.z0, r.x1, r.z1, r.y, gc.map((v) => v * r.shade), -1);
  for (const r of streetSurfaces(gridW, gridD, cell)) pushQuad(ground, r[0], r[1], r[2], r[3], STREET_Y, STREET_COLOR, STREET_PHASE);
  { // the coast road: a cobbled strip along the shore between the cottage fronts and the foam
    const a = coastToWorldAt(seed, gridW, 0, -2.0), b = coastToWorldAt(seed, gridW, hiOf(seed, gridW, gridD), -0.3);
    pushQuad(ground, Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), STREET_Y, STREET_COLOR, STREET_PHASE);
  }
  pushQuad(sea, t.sea.minX, t.sea.minZ, t.sea.maxX, t.sea.maxZ, t.sea.y, [0.02, 0.05, 0.08], -2);
  const coast = new Float32Array([...buildCoast({ gridW, gridD, seed, cell, meshes }), ...buildChurchHill({ gridW, gridD, seed, cell })]);
  return { building: new Float32Array(out), buildingUv: new Float32Array(uv), ground: new Float32Array(ground), sea: new Float32Array(sea), coast, halos: haloSprites(lights), heights, lights, coastSide: t.side, dressingBoxes: dressingBoxes([...dressing, ...landmarkItems]) };
}

// ---------- shaders ----------

const NO_BLOBS = new Float32Array(MAX_BLOBS * 4);
const FRAG_HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const SCENE_VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute float aGlow; attribute float aPhase; attribute vec2 aUv;
uniform mat4 uVP; uniform vec4 uWind; uniform float uWindT; uniform float uSway; varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase; varying float vFol; varying vec2 vUv;
void main(){
  float hang = step(1500.0, aPhase), fol = step(500.0, aPhase) - hang; vec3 p = aPos;
  // wind: foliage leans along uWind.xy by strength (uWind.z, gust included) and sways a little; bend grows with height, roots stay put
  float bend = fol * uWind.z * 0.08 * p.y; float sw = fol * uWind.w * 0.03 * p.y * sin(uWindT * 1.9 + aPhase * 0.7);
  p.xz += uWind.xy * bend + vec2(sw, -sw);
  p.xz += hang * uSway * (0.025 + 0.05 * uWind.z) * p.y * sin(uWindT * 1.5 + aPhase * 0.9) * vec2(0.8, 0.6); // hanging props swing a little, more in wind; uSway is 0 under reduced motion
  vPos=p; vNormal=aNormal; vColor=aColor; vGlow=aGlow; vPhase=aPhase - fol * 1000.0 - hang * 2000.0; vFol=fol; vUv=aUv; gl_Position=uVP*vec4(p,1.0); }`;
const SCENE_FS = `${FRAG_HEAD}varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase; varying float vFol; varying vec2 vUv;
uniform vec3 uCam; uniform vec3 uFogColor; uniform float uFog; uniform vec3 uAmbient; uniform vec3 uMoonDir; uniform vec3 uMoonColor;
uniform vec4 uLight[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}]; uniform vec3 uGlowColor; uniform float uTime; uniform float uFlicker; uniform float uMode;
uniform float uGroundFog; uniform float uFogSheets; uniform float uDetail; uniform float uWet; uniform vec4 uBlob[${MAX_BLOBS}]; uniform vec3 uShore; uniform float uLap; uniform float uGroundH; uniform vec2 uFogOff; uniform float uWaterT; uniform float uRipple; uniform float uFresnel; uniform vec3 uSeaTint; uniform float uMoonGain; uniform float uLampGain; uniform vec3 uZenith; uniform vec3 uHorizon; uniform sampler2D uWallTex; uniform sampler2D uGroundTex; uniform sampler2D uStoneTex; uniform sampler2D uRoofTex; uniform sampler2D uCobbleTex; uniform sampler2D uPropTex; uniform vec3 uRim; uniform vec2 uWin; uniform float uPacked; uniform float uHasWall; uniform float uHasGround;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float lumi(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
// The hand tuned ground palette (mossy grass, bare earth, dry straw), shared by the ground and the grass tufts and reeds that grow from it.
float groundNoise(vec2 xz){ return vnoise(xz * 0.23) * 0.6 + vnoise(xz * 0.9) * 0.3 + vnoise(xz * 3.7) * 0.1; }
vec3 groundPalette(vec2 xz, float gn){
  vec3 moss = vec3(0.85, 1.25, 0.72), earth = vec3(1.25, 1.0, 0.8), straw = vec3(1.4, 1.25, 0.8);
  return mix(mix(earth, moss, smoothstep(0.35, 0.6, gn)), straw, smoothstep(0.66, 0.8, vnoise(xz * 0.11 + 7.0)) * 0.6);
}
// Bump from the albedo: two extra taps give the height gradient along the texture axes tu and tv (no derivatives extension needed).
vec3 bump(vec3 n, sampler2D tex, vec2 uv, float texel, vec3 tu, vec3 tv, float k){
  float h0 = lumi(texture2D(tex, uv).rgb), hu = lumi(texture2D(tex, uv + vec2(texel, 0.0)).rgb), hv = lumi(texture2D(tex, uv + vec2(0.0, texel)).rgb);
  return normalize(n - (tu * (hu - h0) + tv * (hv - h0)) * k);
}
vec3 duskFog(vec3 fc, vec3 V) { if (uDetail < 0.5) return fc; float lowSun = exp(-abs(V.y) * 7.0); fc = mix(fc, fc * vec3(0.9, 0.92, 1.18) + vec3(0.004, 0.0, 0.012), 0.35); return fc + uHorizon * vec3(0.16, 0.09, 0.02) * lowSun * (uDetail > 1.5 ? 1.0 : 0.6); }
void main(){
  vec3 toCam = uCam - vPos; float dist = length(toCam); vec3 V = toCam / max(dist, 0.001);
  float fogEarly = 1.0 - exp(-pow(dist * uFog, 2.0));
  if (fogEarly > 0.995) { gl_FragColor = vec4(duskFog(uFogColor + (uDetail > 0.5 ? uMoonColor * 0.22 * pow(max(dot(-V, uMoonDir), 0.0), 6.0) : vec3(0.0)), V), 1.0); return; } // early fog cutoff: fully fogged pixels skip texture, noise and light work
  vec3 n = normalize(vNormal); if (dot(n, V) < 0.0) n = -n;
  vec3 base = vColor; float gloss = 0.0; // gloss: how much wet sheen this surface takes (stone, cobbles, slate)
  if (uMode > 0.5 && uMode < 1.5) {
    if (vPhase < -3.0) { // cobbled lanes and square
      vec2 cuv = vPos.xz * ${INV_TILE.cobble};
      base *= mix(vec3(1.0), texture2D(uCobbleTex, cuv).rgb * 1.6, 0.9); gloss = 1.0;
      if (uDetail > 0.5 && dist < 40.0) n = bump(n, uCobbleTex, cuv, 1.0 / 128.0, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), 3.0 * (1.0 - dist / 40.0));
    }
    else {
      base *= 0.94 + 0.08 * hash(floor(vPos.xz * 1.5)) + 0.04 * sin(vPos.x * 0.21) * sin(vPos.z * 0.17);
      if (uDetail > 0.5 && dist < 60.0) { // hand tuned ground palette (far ground is fog by then: distance LOD): mossy grass, bare earth and dry straw patches instead of one flat tone
        float gn = groundNoise(vPos.xz);
        base = base * groundPalette(vPos.xz, gn) * 1.12 + vec3(0.012, 0.02, 0.008) * (0.5 + gn);
      }
      if (uHasGround > 0.5) base *= mix(vec3(1.0), texture2D(uGroundTex, vPos.xz * ${INV_TILE.ground}).rgb * 1.6, 0.9);
      gloss = 0.35; // packed earth only darkens and glints a little
    }
  }
  if (uMode < 0.5 && vFol > 0.5 && vPhase > ${GROUND_PLANT_PHASE - 50}.0) base = mix(base, vec3(0.14, 0.2, 0.11), 0.5) * groundPalette(vPos.xz, groundNoise(vPos.xz)) * (0.4 + 0.35 * smoothstep(0.0, 0.5, vPos.y)); // tufts and reeds take the colour of the patch they grow from, darker at the root
  if (vUv.x > -0.5) base *= texture2D(uPropTex, vUv).rgb; // CC0 prop: its own base colour from the atlas (vColor is its white factor)
  else if (vUv.x > -1.5 && uMode < 0.5 && uHasWall > 0.5) { // window panes (vUv below -1.5) keep their own colour
    float sat = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));
    if (uPacked > 0.5) base *= mix(vec3(1.0), texture2D(uWallTex, vec2(vPos.x + vPos.z, vPos.y) * ${INV_TILE.wall}).rgb * 1.6, 0.85);
    else if (vNormal.y > 0.35 && vPos.y > 2.2) { base *= mix(vec3(1.0), texture2D(uRoofTex, vPos.xz * ${INV_TILE.roof}).rgb * 1.6, 0.9); gloss = 0.8; } // slate and shingle on roof slopes
    else if (sat < 0.06) { // stone blocks on grey masonry, with mortar joints pressed in by the bump
      vec2 suv = vec2(vPos.x + vPos.z, vPos.y) * ${INV_TILE.stone};
      base *= mix(vec3(1.0), texture2D(uStoneTex, suv).rgb * 1.6, 0.9); gloss = 0.6;
      if (uDetail > 0.5 && dist < 30.0 && abs(n.y) < 0.5) { vec3 tu = normalize(cross(vec3(0.0, 1.0, 0.0), n)); n = bump(n, uStoneTex, suv, 1.0 / 128.0, tu, vec3(0.0, 1.0, 0.0), 2.4 * (1.0 - dist / 30.0)); }
    }
    else base *= mix(vec3(1.0), texture2D(uWallTex, vec2(vPos.x + vPos.z, vPos.y) * ${INV_TILE.timber}).rgb * 1.6, 0.9);                   // timber framed plaster, one bay and storey per tile
  }
  float wet = uDetail > 0.5 ? uWet * gloss * (uDetail > 1.5 ? 0.65 + 0.35 * vnoise(vPos.xz * 0.45) : 1.0) : 0.0; // puddled patches at detail 2
  base *= 1.0 - 0.3 * wet; // wet stone is darker
  if (uDetail > 0.5 && gloss > 0.0 && uMode > 0.5 && uMode < 1.5) { float seam = vnoise(vPos.xz * 2.3) * vnoise(vPos.xz * 0.7 + 4.0); base = mix(base, base * vec3(0.62, 0.86, 0.5) + vec3(0.0, 0.012, 0.0), smoothstep(0.34, 0.62, seam) * 0.5 * (uDetail > 1.5 ? 1.0 : 0.7)); base *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.5, vnoise(vPos.xz * 5.0))); } // moss creeping into the cobble seams, damp-dark joints (Medium and High)
  float skyUp = n.y * 0.5 + 0.5;
  vec3 lightSum = uAmbient * (0.55 + 0.75 * skyUp) + uMoonColor * max(dot(n, uMoonDir), 0.0);
  float shade = 1.0;
  if (uMode > 0.5 && uMode < 1.5 && uDetail > 0.5) for (int i = 0; i < ${MAX_BLOBS}; i++) { // soft contact shadows under people
    vec4 B = uBlob[i]; if (B.w <= 0.0) continue;
    shade *= 1.0 - B.w * (1.0 - smoothstep(B.z * 0.35, B.z, length(vPos.xz - B.xy)));
  }
  vec3 spec = vec3(0.0);
  if (wet > 0.0) spec += uMoonColor * pow(max(dot(reflect(-uMoonDir, n), V), 0.0), 60.0) * wet * 1.6;
  if (vFol > 0.5) base = base * 1.35 + vec3(0.02, 0.035, 0.012) * (0.4 + 0.6 * skyUp); // grass, reeds and bushes: dark moss colours get a lift and skip the wall base shadow, so tufts read as grass instead of black spikes
  else if (uMode < 0.5 || uMode > 2.5) base *= mix(uDetail > 0.5 ? 0.34 : 0.5, 1.0, smoothstep(0.0, 1.8, vPos.y)) * (uDetail > 0.5 && uMode < 0.5 ? 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.9, vPos.y)) * vnoise(vec2(vPos.x + vPos.z, vPos.y) * 3.0) : 1.0); // contact shadow and grime at wall bases
  if (uDetail > 0.5 && vFol < 0.5 && (uMode < 0.5 || uMode > 2.5) && n.y < 0.6) { float mg = (1.0 - smoothstep(0.0, uDetail > 1.5 ? 1.7 : 1.2, vPos.y)) * (0.45 + 0.55 * vnoise(vec2(vPos.x + vPos.z, vPos.y * 2.0) * 2.6)); base = mix(base, base * vec3(0.55, 0.78, 0.42) + vec3(0.004, 0.016, 0.004), clamp(mg, 0.0, 1.0) * 0.55); } // damp moss and green grime climbing the lower walls
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uLight[i]; if (L.w <= 0.0) continue;
    vec3 d = L.xyz - vPos; float r2 = dot(d, d); float att = clamp(1.0 - r2 / (L.w * L.w), 0.0, 1.0); att *= att / (1.0 + r2 * 0.08); // windowed inverse square
    if (att <= 0.0) continue; // outside this lantern's reach (its ground pool ends there too)
    vec3 Ld = normalize(d); float nl = max(dot(n, Ld), 0.0) * 0.75 + 0.25; lightSum += uLightCol[i] * att * nl * 1.35;
    if (wet > 0.0) spec += uLightCol[i] * att * pow(max(dot(reflect(-Ld, n), V), 0.0), 24.0) * wet * 1.2; // lantern streaks on wet cobbles
    if (uMode > 0.5 && uMode < 1.5 && uDetail > 0.5) lightSum += uLightCol[i] * exp(-r2 / (L.w * L.w * 0.09)) * 0.55 * smoothstep(0.0, 1.2, abs(L.y - vPos.y)); // a warm pool on the ground under each lantern
  }
  if (uDetail > 0.5 && (uMode < 0.5 || uMode > 2.5)) lightSum += uRim * pow(1.0 - max(dot(n, V), 0.0), 3.0) * (0.4 + 0.6 * skyUp); // rim light on edges facing away from the eye
  vec3 col = (base + 0.045) * lightSum * shade + spec * shade;
  if (uMode > 1.5 && uMode < 2.5) {
    // moving ripples: three crossed wave trains give the normal; zero speed (reduced motion) leaves them still
    vec2 p = vPos.xz; float t = uWaterT;
    vec2 g = vec2(sin(p.x * 0.9 + t * 1.1) * 0.5 + sin((p.x + p.y) * 1.7 - t * 1.6) * 0.35 + sin(p.y * 3.1 + t * 2.3) * 0.15,
                  cos(p.y * 0.8 + t * 0.9) * 0.5 + cos((p.x - p.y) * 1.5 + t * 1.3) * 0.35 + cos(p.x * 2.9 - t * 2.1) * 0.15) * uRipple;
    if (uDetail > 1.5) g += vec2(sin(p.x * 6.3 - p.y * 2.1 + t * 3.1), cos(p.y * 5.7 + p.x * 1.3 - t * 2.7)) * 0.08 * uRipple; // fine chop
    vec3 sn = normalize(vec3(g.x, 1.0, g.y));
    float fres = pow(1.0 - max(dot(sn, V), 0.0), uFresnel);
    vec3 R = reflect(-V, sn);
    vec3 skyRefl = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
    float shoreOff = uShore.y > -9000.0 ? clamp(((uShore.x > 0.5 ? vPos.x : vPos.z) - uShore.y) * uShore.z, 0.0, 60.0) : 60.0;
    vec3 deep = uSeaTint * (1.0 + lightSum * 2.0), shallow = uSeaTint * vec3(1.6, 3.4, 3.0) * (1.0 + lightSum * 2.2);
    col = mix(mix(shallow, deep, smoothstep(0.0, 28.0, shoreOff)), skyRefl, 0.1 + 0.85 * fres); // depth gradient: teal shallows into black water
    col += uMoonColor * pow(max(dot(R, uMoonDir), 0.0), 70.0) * uMoonGain;
    if (uDetail > 1.5) col += uMoonColor * pow(max(dot(R, uMoonDir), 0.0), 900.0) * uMoonGain * 3.0; // sharp glints on the moon path
    if (uDetail > 0.5) col += uMoonColor * pow(max(dot(R, uMoonDir), 0.0), 18.0) * uMoonGain * 0.7 * smoothstep(0.55, 0.8, vnoise(vec2(p.x * 0.7, p.y * 3.6) + vec2(t * 0.7, -t * 0.5))) * (0.6 + 0.4 * sin(t * 3.0 + p.x * 4.0)); // broken glitter path
    if (uDetail > 0.5) { // shore foam: a broken band that pulses with the swell along the ground edge
      float off = ((uShore.x > 0.5 ? vPos.x : vPos.z) - uShore.y) * uShore.z;
      vec2 sp = uShore.x > 0.5 ? vPos.zx : vPos.xz; // along the shore, out to sea: foam stretches along the beach in lines instead of round blobs
      float brk = vnoise(vec2(sp.x * 0.22, sp.y * 1.3) + vec2(t * 0.15, 0.0)) * 0.6 + vnoise(vec2(sp.x * 0.7, sp.y * 3.2) - t * 0.3) * 0.4;
      off -= uLap * 1.2 * (0.5 + 0.5 * sin(t * 0.7 + (uShore.x > 0.5 ? vPos.z : vPos.x) * 0.12)); // waves lap up the shore and draw back
      float band = (1.0 - smoothstep(0.0, 3.5, off + brk * 1.6)) * smoothstep(-0.5, 0.2, off) * (0.6 + 0.4 * sin(off * 2.2 - t * 1.4));
      col = mix(col, vec3(0.62, 0.68, 0.7) * (0.35 + lightSum * 1.5), clamp(band * smoothstep(0.35, 0.7, brk + 0.2), 0.0, 0.85));
    }
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec4 L = uLight[i]; if (L.w <= 0.0) continue;
      vec3 d = L.xyz - vPos; float att = clamp(1.0 - dot(d, d) / (L.w * L.w * 9.0), 0.0, 1.0);
      col += uLightCol[i] * pow(max(dot(R, normalize(d)), 0.0), 40.0) * att * uLampGain;
    }
  }
  if (uMode > 1.5 && uMode < 2.5 && uDetail > 0.5) col = mix(col, mix(uHorizon, uZenith, 0.12) * 1.05, (1.0 - smoothstep(0.0, 0.1, abs(V.y))) * 0.75); // the far water melts into the sky haze: no hard line at the horizon
  float peak = max(col.r, max(col.g, col.b)); // hue-preserving soft shoulder: lit walls keep their colour under a lantern instead of clipping to white
  if (peak > 0.55) col *= (0.55 + 0.33 * (1.0 - exp(-(peak - 0.55) / 0.33))) / peak;
  if (vGlow > 0.0 || vUv.x < -1.5) {
    float storey = floor(max(vPos.y - 0.5, 0.0) / 2.9); float fl = 1.0 - uFlicker * 0.12 * (0.5 + 0.5 * sin(uTime * 6.0 + vPhase * 2.3 + storey * 1.9));
    float on = 1.0, hw = hash(vec2(vPhase * 1.7 + storey * 5.3, floor((vPos.x + vPos.z) * 0.8))); // one state per house, storey and bay
    if (uWin.x > 0.0 && uMode < 0.5) { on = step(uWin.x, hw); float gut = step(1.0 - uWin.y, fract(hw * 7.31)) * on; fl *= 1.0 - gut * uFlicker * (0.45 + 0.45 * sin(uTime * 17.0 + hw * 90.0) * sin(uTime * 7.3 + hw * 40.0)); }
    vec3 lit = uGlowColor * (uDetail > 0.5 ? vec3(1.5, 1.38, 1.1) : vec3(1.4)) * (1.0 - 0.05 * storey) * (0.85 + 0.3 * hash(vec2(hw * 40.0, storey))); // warm, each window a little different
    if (vUv.x < -1.5 && uMode < 0.5) { // a real window: whole floors are lit or dark, warm glass with curtains and a timber cross, or black glass holding the sky
      float floorOn = step(max(uWin.x, 0.22), hash(vec2(vPhase * 3.1 + storey * 11.7, storey + 0.5))); on = on * floorOn * step(0.001, vGlow); // a house whose lights are out (vGlow 0) shows only dark panes
      vec2 w = vec2(-2.0) - vUv; // pane coordinates 0..1
      float frame = 1.0 - step(0.08, w.x) * step(w.x, 0.92) * step(0.07, w.y) * step(w.y, 0.93);
      float bar = max(1.0 - step(0.025, abs(w.x - 0.5)), 1.0 - step(0.025, abs(w.y - 0.58)));
      float drape = smoothstep(0.26, 0.2, w.x - 0.04 * sin(w.y * 9.0)) + smoothstep(0.74, 0.8, w.x + 0.04 * sin(w.y * 9.0 + 1.3)); // curtains gathered at both sides
      float fold = 0.75 + 0.25 * sin(w.x * 70.0);
      vec3 room = lit * (0.75 + 0.45 * (1.0 - abs(w.x - 0.5) * 1.6) * smoothstep(0.0, 0.6, w.y)); // the lamp inside: brighter in the middle and upper pane
      vec3 cloth = lit * vec3(0.95, 0.42, 0.22) * 0.75 * fold;
      vec3 dark = mix(uHorizon, uZenith, 0.5 + 0.5 * n.y) * 0.18 + uMoonColor * 0.05 * pow(max(dot(reflect(-V, n), uMoonDir), 0.0), 8.0); // unlit glass: cold sky in black panes
      vec3 darkCloth = vec3(0.06, 0.035, 0.03) * fold;
      vec3 glassCol = mix(mix(dark, room, on * fl), mix(darkCloth, cloth, on * fl), clamp(drape, 0.0, 1.0));
      vec3 wood = vec3(0.07, 0.05, 0.035) * (0.6 + lightSum * 0.6);
      col = mix(glassCol, wood, max(frame, bar));
    } else {
      if (uMode > 2.5) { float gp = max(uGlowColor.r, max(uGlowColor.g, uGlowColor.b)); vec3 hue = uGlowColor / max(gp, 0.001); float face = abs(dot(n, V)); float core = step(1.5, vPhase); lit = mix(hue * (0.55 + 0.75 * face), mix(hue, vec3(1.0, 0.94, 0.78), 0.65) * 1.5, core) * (0.92 + 0.08 * fl); } // the held lantern burns by itself: its glass keeps the lantern hue at full strength, whatever the world lamp gain is (it was darkened by a low dusk/day gain)
      col = mix(col, mix(col * 0.55, lit, on), clamp(vGlow, 0.0, 1.0) * mix(1.0, fl, on));
    }
  }
  float f = 1.0 - exp(-pow(dist * uFog, 2.0));
  float sheet = uFogSheets > 0.5 ? 0.6 + 0.8 * vnoise(vPos.xz * 0.06 + uFogOff) * (0.6 + 0.4 * vnoise(vPos.xz * 0.19 - uFogOff * 1.7)) : 1.0; // drifting sheets (tier fogSheets) or a flat layer
  float mist = (1.0 - exp(-dist * uGroundFog * sheet)) * exp(-max(vPos.y, 0.0) / uGroundH) * 0.9;
  f = 1.0 - (1.0 - f) * (1.0 - mist);
  vec3 fogCol = uFogColor + (uDetail > 0.5 ? uMoonColor * 0.22 * pow(max(dot(-V, uMoonDir), 0.0), 6.0) : vec3(0.0)); // moonlight scattered in the haze toward the moon
  fogCol = duskFog(fogCol, V); // dusky blue-violet haze with a warm lamp-lit band toward the horizon (Medium and High)
  gl_FragColor = vec4(mix(col, fogCol, clamp(f, 0.0, 1.0)), 1.0);
}`;
const SKY_VS = 'attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }';
const SKY_FS = `${FRAG_HEAD}varying vec2 vNdc; uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uTy; uniform float uAspect;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform float uMoonSize; uniform float uSun; uniform float uStars; uniform float uCloud; uniform float uTime;
uniform vec3 uEyeDir; uniform vec4 uEye; uniform float uEyeOpen; uniform float uPupil; uniform float uDetail;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(uF + uR * vNdc.x * uTy * uAspect + uU * vNdc.y * uTy);
  float h = d.y; vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  col = mix(col, uZenith * 0.6, smoothstep(0.35, 1.0, h) * 0.35); // darker, more dramatic crown of the sky
  if (h < 0.0) col = uHorizon * 0.8;
  vec2 uv = d.xz / (abs(h) + 0.2) * 0.8 + vec2(uTime * 0.009, uTime * 0.002);
  float cl = (vnoise(uv * 2.0) * 0.6 + vnoise(uv * 5.0) * 0.3 + vnoise(uv * 11.0) * 0.1);
  if (uDetail > 1.5) cl = cl * 0.9 + vnoise(uv * 23.0 - uTime * 0.01) * 0.1; // wispy edges
  float c = smoothstep(0.42, 0.78, cl) * uCloud * clamp(h * 5.0, 0.0, 1.0);
  if (uDetail > 0.5) { // a second, higher cloud deck drifting the other way
    vec2 uv2 = d.xz / (abs(h) + 0.35) * 1.3 + vec2(-uTime * 0.005, uTime * 0.004) + 31.0;
    c = max(c, smoothstep(0.5, 0.85, vnoise(uv2 * 1.7) * 0.65 + vnoise(uv2 * 4.1) * 0.35) * uCloud * 0.8 * clamp(h * 4.0, 0.0, 1.0));
  }
  float mlit = pow(max(dot(d, uMoonDir), 0.0), 5.0) * step(0.0001, uMoonColor.z); // clouds near the moon catch a silver edge
  col = mix(col, uHorizon * 0.55 + 0.03 + uMoonColor * mlit * (1.0 - smoothstep(0.42, 0.9, cl)) * (uDetail > 0.5 ? 0.9 : 0.0), c * 0.7);
  vec3 g = floor(d * 160.0); float sh = hash(g.xy + g.z * 7.31); float s = step(0.9972, sh) * uStars * (1.0 - c) * smoothstep(0.04, 0.3, h) * (0.65 + 0.35 * sin(uTime * 2.1 + sh * 600.0));
  col += vec3(0.8, 0.85, 1.0) * s;
  if (uDetail > 0.5) { vec3 g2 = floor(d * 70.0); float sh2 = hash(g2.xy * 1.7 + g2.z * 3.13); float big = step(0.9985, sh2) * uStars * (1.0 - c) * smoothstep(0.08, 0.35, h) * (0.7 + 0.3 * sin(uTime * 1.3 + sh2 * 900.0)); col += mix(vec3(1.0, 0.82, 0.62), vec3(0.7, 0.8, 1.0), fract(sh2 * 311.0)) * big * 1.4; } // a few large warm and cold stars
  float m = dot(d, uMoonDir); float disc = smoothstep(cos(uMoonSize), cos(uMoonSize * 0.9), m);
  float halo = pow(max(m, 0.0), 220.0) * 0.4 + pow(max(m, 0.0), 40.0) * 0.1 + pow(max(m, 0.0), 6.0) * 0.04;
  float moonOn = (1.0 - c * 0.75) * step(0.0001, uMoonColor.z);
  col += uMoonColor * 0.9 * halo * moonOn;
  vec3 discCol = mix(vec3(0.6, 0.66, 0.78), normalize(uMoonColor + 0.001) * 1.25, uSun);
  vec3 mu = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir) + vec3(0.0001, 0.0, 0.0)); vec3 mv = cross(uMoonDir, mu); vec2 ml = vec2(dot(d, mu), dot(d, mv)) / sin(uMoonSize); // position on the disc, -1 to 1: marks that stay on the moon instead of streaking across the sky
  float maria = vnoise(ml * 2.6 + 7.0) * 0.6 + vnoise(ml * 6.5) * 0.4, crater = uDetail > 0.5 ? smoothstep(0.62, 0.7, vnoise(ml * 14.0 + 3.0)) * 0.1 : 0.0;
  vec3 surf = discCol * (0.97 - 0.13 * smoothstep(0.4, 0.75, maria) - crater * 0.5) * (1.0 - 0.22 * dot(ml, ml)); // dark seas and a darkened limb
  col = mix(col, surf, disc * moonOn); // the disc replaces the sky behind it, so it stays a pale moon instead of adding up to white
  col += uMoonColor * pow(max(m, 0.0), 900.0) * 0.5 * moonOn; // a tight bloom hugging the limb
  if (uDetail > 0.5) col = mix(col, uHorizon * 1.05, 0.5 * exp(-abs(h) * 22.0) * (0.75 + 0.25 * vnoise(vec2(d.x * 9.0 + uTime * 0.02, 3.0)))); // tidal haze lying on the horizon
  col += uHorizon * 0.35 * exp(-abs(h) * 9.0) * (0.6 + 0.4 * uMoonColor.z);
  if (uEyeOpen > 0.01 && dot(d, uEyeDir) > 0.0) {
    vec3 tR = normalize(cross(vec3(0.0, 1.0, 0.0), uEyeDir)); vec3 tU = cross(uEyeDir, tR);
    vec2 e = vec2(dot(d, tR) / uEye.x, dot(d, tU) / uEye.y);
    float lid = uEyeOpen * (1.0 - e.x * e.x);
    float glowR = exp(-dot(e, e) * 0.05);
    col += vec3(0.55, 0.08, 0.07) * glowR * 0.5 * uEyeOpen;
    if (abs(e.x) < 1.0 && abs(e.y) < lid) {
      vec3 eyeCol = vec3(0.87, 0.69, 0.47) * (1.0 - 0.5 * abs(e.y) / max(lid, 0.01));
      float pup = 1.0 - smoothstep(0.16, 0.2, length(vec2((e.x - uPupil) * 1.0, e.y / max(lid, 0.05) * 0.45)));
      col = mix(eyeCol, vec3(0.07, 0.0, 0.015), pup);
      col = mix(col, vec3(0.1, 0.0, 0.0), smoothstep(0.85, 1.0, abs(e.y) / max(lid, 0.01)));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const HALO_VS = `attribute vec4 aHalo; attribute float aSize; uniform mat4 uVP; uniform float uScale; uniform float uTime; uniform float uReduced; uniform vec3 uCam;
varying float vFlick; varying float vDist;
void main(){
  gl_Position = uVP * vec4(aHalo.xyz, 1.0); vDist = length(aHalo.xyz - uCam);
  gl_PointSize = clamp(aSize * uScale / max(gl_Position.w, 0.5), 2.0, 140.0);
  vFlick = uReduced > 0.5 ? 1.0 : 0.85 + 0.15 * sin(uTime * 5.3 + aHalo.w * 1.7);
}`;
const HALO_FS = `${FRAG_HEAD}uniform vec3 uColor; uniform float uFog; uniform float uCore; varying float vFlick; varying float vDist;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float k = clamp(1.0 - r, 0.0, 1.0); float a = (pow(k, 2.2) * 0.85 + pow(k, 7.0) * uCore) * vFlick * (1.0 - clamp(1.0 - exp(-pow(vDist * uFog, 2.0)), 0.0, 0.85));
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.82, 0.5), clamp(pow(k, 5.0) * uCore, 0.0, 1.0)), min(a, 1.0)); }`;
const BEAM_VS = `attribute vec4 aBeam; uniform mat4 uVP; uniform vec3 uCam; varying float vA; varying float vDist;
void main(){ gl_Position = uVP * vec4(aBeam.xyz, 1.0); vA = aBeam.w; vDist = length(aBeam.xyz - uCam); }`;
const BEAM_FS = `${FRAG_HEAD}uniform vec3 uColor; uniform float uStrength; uniform float uFog; varying float vA; varying float vDist;
void main(){ float seen = 1.0 - clamp(1.0 - exp(-pow(vDist * uFog * 0.5, 2.0)), 0.0, 0.8); gl_FragColor = vec4(uColor, clamp(vA, 0.0, 1.0) * uStrength * seen); }`;
const PART_VS = `attribute vec3 aSeed; uniform mat4 uVP; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel; uniform float uTime; uniform float uSize; uniform float uScale;
varying float vFade;
void main(){
  vec3 l = mod(aSeed * uBox + uVel * uTime, uBox);
  vec3 w = vec3(uCam.x + l.x - uBox.x * 0.5, l.y, uCam.z + l.z - uBox.z * 0.5);
  gl_Position = uVP * vec4(w, 1.0); gl_PointSize = clamp(uSize * uScale / max(gl_Position.w, 0.5), 1.0, 90.0);
  vFade = clamp(1.0 - length(w.xz - uCam.xz) / (uBox.x * 0.5), 0.0, 1.0);
}`;
const PART_FS = `${FRAG_HEAD}uniform vec3 uColor; uniform float uAlpha; varying float vFade;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = clamp(1.0 - r, 0.0, 1.0) * uAlpha * vFade; gl_FragColor = vec4(uColor, a); }`;

const POST_VS = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';
// One pass: optional FXAA, thresholded multi-tap bloom (two spiral rings), radial chromatic shift, filmic (ACES fit) tone map,
// cold shadow and warm highlight grade, vignette, film grain.
const POST_FS = `${FRAG_HEAD}varying vec2 vUv; uniform sampler2D uScene; uniform float uAspect; uniform float uVignette; uniform float uGrain; uniform float uGrainT;
uniform float uBloom; uniform float uBloomTaps; uniform float uThreshold; uniform float uChroma; uniform float uFxaa; uniform vec2 uTexel; uniform float uExposure;
uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uSat; uniform float uContrast; uniform vec3 uGodPos; uniform vec3 uGodCol;
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
// FXAA-style edge blend: find the local luma edge from four neighbours and average along it. Cheap (five taps), no extension.
vec3 fxaa(vec2 uv){
  vec3 m = texture2D(uScene, uv).rgb; float lm = luma(m);
  float ln = luma(texture2D(uScene, uv + vec2(0.0, uTexel.y)).rgb), ls = luma(texture2D(uScene, uv - vec2(0.0, uTexel.y)).rgb);
  float le = luma(texture2D(uScene, uv + vec2(uTexel.x, 0.0)).rgb), lw = luma(texture2D(uScene, uv - vec2(uTexel.x, 0.0)).rgb);
  float range = max(max(ln, ls), max(max(le, lw), lm)) - min(min(ln, ls), min(min(le, lw), lm));
  if (range < max(0.04, lm * 0.15)) return m;
  vec2 dir = normalize(vec2(ls - ln, le - lw) + 1e-5) * uTexel; // along the edge: perpendicular to the luma gradient
  return (texture2D(uScene, uv + dir * 0.5).rgb + texture2D(uScene, uv - dir * 0.5).rgb + m) / 3.0;
}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 bright(vec2 uv){ vec3 c = texture2D(uScene, uv).rgb; float l = max(c.r, max(c.g, c.b)); return c * max(l - uThreshold, 0.0) / max(1.0 - uThreshold, 0.1); }
void main(){
  vec2 uv = vUv, dir = uv - 0.5;
  vec3 col = uFxaa > 0.5 ? fxaa(uv) : texture2D(uScene, uv).rgb;
  col.r = mix(col.r, texture2D(uScene, uv + dir * uChroma).r, step(0.00001, uChroma)); col.b = mix(col.b, texture2D(uScene, uv - dir * uChroma).b, step(0.00001, uChroma));
  vec2 px = vec2(1.0 / uAspect, 1.0); vec3 glow = vec3(0.0);
  for (int i = 0; i < 10; i++) { if (float(i) >= uBloomTaps) break; float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / uBloomTaps);
    glow += bright(uv + vec2(cos(a), sin(a)) * r * 0.022 * px) * 1.1 + bright(uv + vec2(cos(a + 1.0), sin(a + 1.0)) * r * 0.06 * px) * 0.55; }
  col += glow * (uBloom / uBloomTaps) * vec3(1.0, 0.92, 0.8);
  if (uGodPos.z > 0.0) { // moon shafts (High tier): a short radial blur of the bright pixels toward the moon
    vec2 step1 = (uGodPos.xy - uv) / 9.0; vec3 rays = vec3(0.0); float wgt = 1.0;
    for (int i = 0; i < 9; i++) { rays += bright(uv + step1 * (float(i) + hash(gl_FragCoord.xy) )) * wgt; wgt *= 0.9; }
    col += rays * uGodCol * (uGodPos.z / 9.0);
  }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * uShadowTint, col * uHighTint, smoothstep(0.15, 0.7, lum)); // curve grade: tint by luminance, no LUT texture
  // filmic toe and shoulder in linear light: the scene writes display values, so decode, tone map, re-encode. Blacks sink, lantern cores roll off
  col = pow(aces(pow(max(col, 0.0), vec3(2.2)) * uExposure * 0.95), vec3(1.0 / 2.2));
  float v = smoothstep(0.35, 0.95, length(dir * vec2(uAspect * 0.8, 1.0)) * 1.25);
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uSat); col = (col - 0.45) * uContrast + 0.45;
  col *= 1.0 - uVignette * v;
  col += (hash(gl_FragCoord.xy + uGrainT) - 0.5) * uGrain;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const FLY_VS = `attribute vec4 aFly; uniform mat4 uVP; uniform vec3 uCam; uniform float uTime; uniform float uRise; uniform float uSize; uniform float uScale; uniform float uFog; uniform vec2 uLifeWind; uniform vec3 uFlyColor; uniform vec3 uHaze;
varying float vTwinkle; varying float vFade; varying vec3 vCol; varying float vDark;
// One point draw for fireflies and embers (kind 0), moths (1), falling leaves (2) and chimney smoke (3): the integer part of aFly.w is the kind, the fraction its phase.
// Motion formulas mirror lifePosition in view3d-math.js (constants are injected from LIFE).
void main(){
  float kind = floor(aFly.w + 0.001), ph = aFly.w - kind, t = uTime; vec3 w; float size = uSize; vDark = 0.0; vCol = uFlyColor; vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 3.0 + ph * 40.0), 2.0); float life = 1.0;
  if (kind < 0.5) {
    w = aFly.xyz + vec3(sin(t * 0.6 + ph * 6.28) * 0.9, sin(t * 0.9 + ph * 9.0) * 0.35 + uRise * fract(t * 0.12 + ph) * 2.2, cos(t * 0.5 + ph * 5.0) * 0.9);
    life = 1.0 - uRise * fract(t * 0.12 + ph);
  } else if (kind < 1.5) { // moth: pale, erratic flutter around a lantern
    float r = ${LIFE.mothRadius.toFixed(2)};
    w = aFly.xyz + vec3(sin(t * 2.3 + ph * 40.0) * r * 0.6 + sin(t * 5.1 + ph * 17.0) * r * 0.3, sin(t * 1.7 + ph * 23.0) * 0.35, cos(t * 2.9 + ph * 31.0) * r * 0.6 + cos(t * 4.3 + ph * 11.0) * r * 0.3);
    size = 0.07; vCol = vec3(0.95, 0.9, 0.75); vTwinkle = 0.5 + 0.5 * sin(t * 24.0 + ph * 90.0); // wing beat
  } else if (kind < 2.5) { // leaf: tumbles down in a box around the eye and drifts with the wind
    float B = ${LIFE.leafBox.toFixed(1)}, H = ${LIFE.leafHeight.toFixed(1)};
    vec3 l = vec3(mod(aFly.x * B + uLifeWind.x * t * ${LIFE.leafDrift.toFixed(2)} + sin(t * 0.9 + ph * 20.0) * 1.2, B), mod(aFly.y * H - ${LIFE.leafFall.toFixed(2)} * t, H), mod(aFly.z * B + uLifeWind.y * t * ${LIFE.leafDrift.toFixed(2)} + cos(t * 0.8 + ph * 17.0) * 1.2, B));
    w = vec3(uCam.x + l.x - B * 0.5, l.y, uCam.z + l.z - B * 0.5); size = 0.09; vCol = vec3(0.42, 0.3, 0.12); vDark = 0.55; vTwinkle = 0.6 + 0.4 * sin(t * 3.0 + ph * 50.0); // tumbling flash
    life = smoothstep(0.0, 0.6, l.y) * (1.0 - smoothstep(H - 1.5, H, l.y));
  } else { // chimney smoke: a puff rises, leans with the wind, widens and thins
    float age = fract(t / ${LIFE.smokePeriod.toFixed(1)} + ph);
    w = aFly.xyz + vec3(uLifeWind.x * age * age * 3.0 + sin(age * 6.0 + ph * 9.0) * 0.15, age * ${LIFE.smokeRise.toFixed(1)}, uLifeWind.y * age * age * 3.0 + cos(age * 5.0 + ph * 7.0) * 0.15);
    size = 0.5 + age * 1.6; vCol = uHaze * 0.85; vDark = 0.6; vTwinkle = 0.55; life = smoothstep(0.0, 0.12, age) * (1.0 - age);
  }
  gl_Position = uVP * vec4(w, 1.0); gl_PointSize = clamp(size * uScale / max(gl_Position.w, 0.5), 1.5, 40.0);
  float dist = length(w - uCam);
  vFade = (1.0 - clamp(1.0 - exp(-pow(dist * uFog, 2.0)), 0.0, 0.9)) * life;
}`;
const FLY_FS = `${FRAG_HEAD}varying float vTwinkle; varying float vFade; varying vec3 vCol; varying float vDark;
// premultiplied: additive glow for fireflies and moths (alpha 0), a soft darkening veil for leaves and smoke (vDark)
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * vTwinkle * vFade; gl_FragColor = vec4(vCol * a * (1.0 - vDark * 0.5), a * vDark); }`;

function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); // attribute 0 must always be an enabled array in WebGL 1; aUv is sometimes a constant
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(p));
  const uniforms = {};
  return { p, u: (name) => (name in uniforms ? uniforms[name] : (uniforms[name] = gl.getUniformLocation(p, name))) };
}

// ---------- GL renderer ----------

/** Texture units of the material photos that may replace a procedural texture (unit 0 timber walls and unit 5 the prop atlas are not in it). */
const MATERIAL_UNITS = Object.freeze({ ground: 1, stone: 2, roof: 3, cobble: 4 });
/** CC0 photo textures (512 px, see THIRD_PARTY_ASSETS.md). Timber walls stay procedural: the photo plaster has no oak frame. */
export const THIRD_PARTY_TEXTURES = Object.freeze({ ground: 'textures/ground.jpg', stone: 'textures/stone.jpg', roof: 'textures/roof.jpg', cobble: 'textures/cobble.jpg' });
export const THIRD_PARTY_BASE = 'assets/third_party/';

/** Owns the GL programs and buffers. frame = the per-frame values computed by the controller; nothing here decides gameplay. */
export function createGlRenderer(gl) {
  const scene = program(gl, SCENE_VS, SCENE_FS), sky = program(gl, SKY_VS, SKY_FS), part = program(gl, PART_VS, PART_FS), halo = program(gl, HALO_VS, HALO_FS), beam = program(gl, BEAM_VS, BEAM_FS), fly = program(gl, FLY_VS, FLY_FS);
  const post = (() => { try { return program(gl, POST_VS, POST_FS); } catch (err) { console.warn('[view3d] post pass disabled, drawing directly: ' + err.message); return null; } })();
  let fbo = null, fboTex = null, fboDepth = null, fboSize = '', postBroken = !post;
  // Offscreen target for the post pass. Any failure (incomplete framebuffer, allocation error) disables post for good and warns once.
  function ensureTarget(w, h) {
    if (postBroken) return false;
    if (fbo && fboSize === `${w}x${h}`) return true;
    try {
      fbo ||= gl.createFramebuffer(); fboTex ||= gl.createTexture(); fboDepth ||= gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, fboTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer status ' + status);
      fboSize = `${w}x${h}`; return true;
    } catch (err) {
      postBroken = true; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      console.warn('[view3d] post pass disabled, drawing directly: ' + err.message); return false;
    }
  }
  const skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const uvBuf = gl.createBuffer(); let uvCount = 0, buildingChunks = [], buildingDrawn = 0, buildingRanges = 0;
  const bufs = { building: gl.createBuffer(), ground: gl.createBuffer(), sea: gl.createBuffer(), coast: gl.createBuffer(), tentacle: gl.createBuffer(), villager: gl.createBuffer(), held: gl.createBuffer(), rain: gl.createBuffer(), mist: gl.createBuffer(), halo: gl.createBuffer(), beam: gl.createBuffer(), fly: gl.createBuffer() };
  const counts = { building: 0, ground: 0, sea: 0, coast: 0, tentacle: 0, villager: 0, held: 0, rain: 0, mist: 0, halo: 0, beam: 0, fly: 0 };
  // unit 0 = wall texture, unit 1 = ground texture; original procedural stone and ground by default, replaced only by ?pack=1 textures
  const makeTex = (unit, kind) => {
    const t = gl.createTexture(), px = proceduralTexture(kind, { size: 128 });
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, px.size, px.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, px.data);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  };
  const texs = [makeTex(0, 'timber'), makeTex(1, 'ground'), makeTex(2, 'stone'), makeTex(3, 'roof'), makeTex(4, 'cobble'), makeTex(5, 'wood')], hasTex = [1, 1];
  const packedUnits = new Set();
  /** Uploads a power of two image (canvas or ImageBitmap) to a texture unit, repeating and mipmapped. */
  const setImage = (unit, img) => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  };
  let packed = 0;
  const lightPos = new Float32Array(MAX_LIGHTS * 4), lightCol = new Float32Array(MAX_LIGHTS * 3);
  let size = [1, 1];
  const FLOATS = { rain: 3, mist: 3, beam: BEAM_FLOATS, halo: HALO_FLOATS, fly: FIREFLY_FLOATS };
  const upload = (name, data, usage = gl.STATIC_DRAW) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, data, usage); counts[name] = data.length / (FLOATS[name] || VERTEX_FLOATS); };
  const attrs = [['aPos', 3, 0], ['aNormal', 3, 3], ['aColor', 3, 6], ['aGlow', 1, 9], ['aPhase', 1, 10]];
  function bindScene(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [name, size, off] of attrs) { const loc = gl.getAttribLocation(scene.p, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VERTEX_FLOATS * 4, off * 4); }
  }
  function drawParticles(name, f, opt) {
    if (!counts[name]) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]);
    const loc = gl.getAttribLocation(part.p, 'aSeed'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
    gl.uniform3fv(part.u('uBox'), opt.box); gl.uniform3fv(part.u('uVel'), opt.vel); gl.uniform1f(part.u('uSize'), opt.size);
    gl.uniform3fv(part.u('uColor'), opt.color); gl.uniform1f(part.u('uAlpha'), opt.alpha);
    gl.drawArrays(gl.POINTS, 0, counts[name]);
  }
  return {
    setWorld(w) {
      const chunked = partitionChunks(w.building, w.buildingUv, VERTEX_FLOATS); // static, so cut into chunks once here and culled per frame in drawScene
      buildingChunks = chunked.chunks;
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, chunked.uv || new Float32Array(0), gl.STATIC_DRAW); uvCount = chunked.uv ? chunked.uv.length / 2 : 0; upload('building', chunked.vertices); upload('ground', w.ground); upload('sea', w.sea); upload('coast', w.coast); upload('halo', w.halos);
    },
    /** Rebuilt every frame while the omen is visible (the tentacles sway), so it is a dynamic buffer. */
    setFireflies(data) { upload('fly', data); },
    setHalos(data) { upload('halo', data); },
    /** The lighthouse beam turns, so it is rebuilt every frame it is drawn (24 triangles). An empty array hides it. */
    setBeam(data) { upload('beam', data, gl.DYNAMIC_DRAW); },
    setTentacles(data) { upload('tentacle', data, gl.DYNAMIC_DRAW); },
    setVillagers(data) { upload('villager', data, gl.DYNAMIC_DRAW); },
    /** The held lantern moves with the camera, so it is rebuilt every drawn frame (under 100 triangles). */
    setHeld(data) { upload('held', data, gl.DYNAMIC_DRAW); },
    /** Images already cut to power of two canvases; null keeps the procedural default. Only ever called under ?pack=1. */
    setPackTextures(wall, ground) {
      [wall, ground].forEach((img, unit) => {
        if (!img) return;
        setImage(unit, img); packedUnits.add(unit);
        hasTex[unit] = 1; packed = 1;
      });
    },
    /** CC0 material photos (THIRD_PARTY_TEXTURES) replacing the procedural ground, stone, roof and cobble; null keeps the procedural one. A pack texture already set wins. */
    setMaterialTextures(images) {
      for (const [name, img] of Object.entries(images)) {
        const unit = MATERIAL_UNITS[name];
        if (img && unit !== undefined && !packedUnits.has(unit)) setImage(unit, img);
      }
    },
    /** The CC0 props' base colour atlas (unit 5); building vertices with uv >= 0 sample it. */
    setPropAtlas(img) { setImage(5, img); },
    setParticles(rainSeeds, mistSeeds) { upload('rain', rainSeeds); upload('mist', mistSeeds); },
    resize(w, h) { size = [w, h]; gl.viewport(0, 0, w, h); },
    /** True when the post pass is available (shader compiled and the framebuffer is complete). */
    get postReady() { return !postBroken; },
    /** Vertex, point and draw-call counts of what was uploaded: feeds frameCost for the budget test and the perf label. */
    counts: () => ({ ...counts, buildingDrawn, buildingRanges, buildingChunks: buildingChunks.length }),
    /** Draws the frame; with f.post.enabled the scene goes through the offscreen target and the single post pass, else straight to the canvas. */
    draw(f) {
      const usePost = !!(f.post && f.post.enabled) && ensureTarget(size[0], size[1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? fbo : null); gl.viewport(0, 0, size[0], size[1]);
      this.drawScene(f);
      if (!usePost) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(post.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      const pl = gl.getAttribLocation(post.p, 'aPos'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 8, 0);
      gl.uniform1i(post.u('uScene'), 0); gl.uniform1f(post.u('uAspect'), f.aspect); gl.uniform1f(post.u('uVignette'), f.post.vignette); gl.uniform1f(post.u('uGrain'), f.post.grain);
      gl.uniform1f(post.u('uGrainT'), f.post.grainMotion ? (Math.floor(f.time * 24) % 97) * 13.7 : 0);
      gl.uniform1f(post.u('uFxaa'), f.post.fxaa ? 1 : 0); gl.uniform2f(post.u('uTexel'), 1 / size[0], 1 / size[1]); gl.uniform1f(post.u('uExposure'), f.post.exposure ?? 1);
      const gr = f.grade || { shadow: [0.9, 1, 1.1], highlight: [1.06, 1, 0.92], sat: 1, contrast: 1 }, gp = f.godRays || [0.5, 0.5, 0];
      gl.uniform3fv(post.u('uShadowTint'), gr.shadow); gl.uniform3fv(post.u('uHighTint'), gr.highlight); gl.uniform1f(post.u('uSat'), gr.sat); gl.uniform1f(post.u('uContrast'), gr.contrast); gl.uniform3fv(post.u('uGodPos'), gp); gl.uniform3fv(post.u('uGodCol'), f.godColor || [1, 1, 1]);
      gl.uniform1f(post.u('uBloom'), f.post.bloom); gl.uniform1f(post.u('uBloomTaps'), Math.max(1, f.post.bloomTaps)); gl.uniform1f(post.u('uThreshold'), f.post.bloomThreshold); gl.uniform1f(post.u('uChroma'), f.post.chroma);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    drawScene(f) {
      gl.clearColor(f.fogColor[0], f.fogColor[1], f.fogColor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // world
      gl.enable(gl.DEPTH_TEST); gl.useProgram(scene.p);
      lightPos.fill(0); lightCol.fill(0);
      f.lights.slice(0, MAX_LIGHTS).forEach((l, i) => { lightPos.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4); lightCol.set(l.color, i * 3); });
      gl.uniformMatrix4fv(scene.u('uVP'), false, f.vp); gl.uniform3fv(scene.u('uCam'), f.camPos); gl.uniform3fv(scene.u('uFogColor'), f.fogColor);
      gl.uniform1f(scene.u('uFog'), f.fog); gl.uniform1f(scene.u('uGroundFog'), f.groundFog); gl.uniform1f(scene.u('uFogSheets'), f.fogSheets ?? 1); gl.uniform1f(scene.u('uDetail'), f.detail ?? 1); gl.uniform1f(scene.u('uWet'), f.wet || 0); gl.uniform4fv(scene.u('uBlob'), f.blobs || NO_BLOBS); gl.uniform3fv(scene.u('uShore'), f.shore || [1, -1e4, -1]); gl.uniform1f(scene.u('uGroundH'), f.groundHeight);
      gl.uniform2fv(scene.u('uFogOff'), f.fogOffset); gl.uniform1f(scene.u('uWaterT'), f.waterTime); gl.uniform1f(scene.u('uRipple'), f.sea.ripple); gl.uniform1f(scene.u('uFresnel'), f.sea.fresnel);
      gl.uniform3fv(scene.u('uSeaTint'), f.sea.tint); gl.uniform1f(scene.u('uMoonGain'), f.sea.moonGain); gl.uniform1f(scene.u('uLampGain'), f.sea.lanternGain);
      gl.uniform3fv(scene.u('uZenith'), f.sky.zenith); gl.uniform3fv(scene.u('uHorizon'), f.sky.horizon);
      gl.uniform1i(scene.u('uWallTex'), 0); gl.uniform1i(scene.u('uGroundTex'), 1); gl.uniform1i(scene.u('uStoneTex'), 2); gl.uniform1i(scene.u('uRoofTex'), 3); gl.uniform1i(scene.u('uCobbleTex'), 4); gl.uniform1i(scene.u('uPropTex'), 5); gl.uniform1f(scene.u('uPacked'), packed); gl.uniform1f(scene.u('uHasWall'), hasTex[0]); gl.uniform1f(scene.u('uHasGround'), hasTex[1]);
      for (const unit of [0, 1, 2, 3, 4, 5]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]); } gl.uniform3fv(scene.u('uAmbient'), f.sky.ambient); gl.uniform3fv(scene.u('uRim'), f.rim || [0, 0, 0]); gl.uniform2fv(scene.u('uWin'), f.win || [0, 0]); gl.uniform3fv(scene.u('uMoonDir'), f.moon.dir);
      gl.uniform3fv(scene.u('uMoonColor'), f.moonLight); gl.uniform4fv(scene.u('uLight'), lightPos); gl.uniform3fv(scene.u('uLightCol'), lightCol);
      gl.uniform4fv(scene.u('uWind'), f.windU); gl.uniform1f(scene.u('uSway'), f.life ? f.life.sway : 0); gl.uniform1f(scene.u('uLap'), f.life ? f.life.lap : 0); gl.uniform1f(scene.u('uWindT'), f.time); gl.uniform3fv(scene.u('uGlowColor'), f.glowColor); gl.uniform1f(scene.u('uTime'), f.time); gl.uniform1f(scene.u('uFlicker'), f.reduced ? 0 : 1);
      const planes = frustumPlanes(f.vp);
      for (const [name, mode] of [['building', 0], ['coast', 3], ['tentacle', 3], ['villager', 3], ['ground', 1], ['sea', 2]]) { // near occluders first, the big ground and sea quads last: the depth test rejects what is already covered before their heavy shaders run
        if (!counts[name]) continue;
        gl.uniform1f(scene.u('uMode'), mode); bindScene(bufs[name]);
        // only the building buffer has per vertex uv (CC0 props); every other buffer reads the constant -1, untextured
        const uvLoc = gl.getAttribLocation(scene.p, 'aUv');
        if (name === 'building' && uvCount === counts.building) { gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 8, 0); }
        else { gl.disableVertexAttribArray(uvLoc); gl.vertexAttrib2f(uvLoc, -1, -1); }
        if (name === 'building') { // static props and houses: only the chunks in the frustum and not yet lost in the fog
          const ranges = visibleRanges(buildingChunks, planes, f.camPos, chunkCullDistance(f.fog, f.drawDistance));
          buildingDrawn = 0; buildingRanges = ranges.length;
          for (const r of ranges) { gl.drawArrays(gl.TRIANGLES, r.first, r.count); buildingDrawn += r.count; }
        } else gl.drawArrays(gl.TRIANGLES, 0, counts[name]);
      }
      gl.disableVertexAttribArray(gl.getAttribLocation(scene.p, 'aUv'));
      // sky: drawn after the opaque world at depth 0.9999, so it only shades the pixels nothing covered (the fill-rate saving of an early depth reject)
      gl.depthMask(false); gl.disable(gl.BLEND); gl.useProgram(sky.p);
      const b = f.basis; gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      const sl = gl.getAttribLocation(sky.p, 'aPos'); gl.enableVertexAttribArray(sl); gl.vertexAttribPointer(sl, 2, gl.FLOAT, false, 8, 0);
      gl.uniform3fv(sky.u('uF'), b.f); gl.uniform3fv(sky.u('uR'), b.r); gl.uniform3fv(sky.u('uU'), b.u);
      gl.uniform1f(sky.u('uTy'), Math.tan(f.fovY / 2)); gl.uniform1f(sky.u('uAspect'), f.aspect);
      gl.uniform3fv(sky.u('uZenith'), f.sky.zenith); gl.uniform3fv(sky.u('uHorizon'), f.sky.horizon);
      gl.uniform3fv(sky.u('uMoonDir'), f.moon.dir); gl.uniform3fv(sky.u('uMoonColor'), f.moon.color); gl.uniform1f(sky.u('uMoonSize'), f.moon.size);
      gl.uniform3fv(sky.u('uEyeDir'), f.eye.dir); gl.uniform4f(sky.u('uEye'), f.eye.width, f.eye.height, 0, 0); gl.uniform1f(sky.u('uEyeOpen'), f.eye.open); gl.uniform1f(sky.u('uPupil'), f.reduced ? 0 : Math.sin(f.time / 2.6) * 0.2);
      gl.uniform1f(sky.u('uDetail'), f.detail ?? 1); gl.uniform1f(sky.u('uSun'), f.sunWeight); gl.uniform1f(sky.u('uStars'), f.sky.stars); gl.uniform1f(sky.u('uCloud'), f.sky.cloud); gl.uniform1f(sky.u('uTime'), f.reduced ? 0 : f.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      // lantern halos: additive soft sprites, depth tested so walls hide them
      if (counts.halo) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.useProgram(halo.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.halo);
        const hl = gl.getAttribLocation(halo.p, 'aHalo'), sl2 = gl.getAttribLocation(halo.p, 'aSize');
        gl.enableVertexAttribArray(hl); gl.vertexAttribPointer(hl, 4, gl.FLOAT, false, HALO_FLOATS * 4, 0);
        gl.enableVertexAttribArray(sl2); gl.vertexAttribPointer(sl2, 1, gl.FLOAT, false, HALO_FLOATS * 4, 16);
        gl.uniformMatrix4fv(halo.u('uVP'), false, f.vp); gl.uniform3fv(halo.u('uCam'), f.camPos); gl.uniform1f(halo.u('uScale'), f.pointScale);
        gl.uniform1f(halo.u('uTime'), f.time); gl.uniform1f(halo.u('uReduced'), f.reduced ? 1 : 0); gl.uniform1f(halo.u('uFog'), f.fog); gl.uniform3fv(halo.u('uColor'), f.glowColor); gl.uniform1f(halo.u('uCore'), f.lampCore);
        gl.drawArrays(gl.POINTS, 0, counts.halo);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // lighthouse beam: additive soft sheets, depth tested so a house hides it
      if (counts.beam && f.beam) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.useProgram(beam.p); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.beam);
        const bl = gl.getAttribLocation(beam.p, 'aBeam'); gl.enableVertexAttribArray(bl); gl.vertexAttribPointer(bl, 4, gl.FLOAT, false, BEAM_FLOATS * 4, 0);
        gl.uniformMatrix4fv(beam.u('uVP'), false, f.vp); gl.uniform3fv(beam.u('uCam'), f.camPos); gl.uniform3fv(beam.u('uColor'), f.beam.color); gl.uniform1f(beam.u('uStrength'), f.beam.strength); gl.uniform1f(beam.u('uFog'), f.fog);
        gl.drawArrays(gl.TRIANGLES, 0, counts.beam);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // fireflies near warm lanterns (embers at high dread): additive glow points
      if (counts.fly) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(fly.p); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.fly);
        const fl = gl.getAttribLocation(fly.p, 'aFly'); gl.enableVertexAttribArray(fl); gl.vertexAttribPointer(fl, 4, gl.FLOAT, false, FIREFLY_FLOATS * 4, 0);
        gl.uniformMatrix4fv(fly.u('uVP'), false, f.vp); gl.uniform3fv(fly.u('uCam'), f.camPos); gl.uniform1f(fly.u('uTime'), f.time); gl.uniform1f(fly.u('uRise'), f.flies.rise);
        gl.uniform1f(fly.u('uSize'), f.flies.size); gl.uniform1f(fly.u('uScale'), f.pointScale); gl.uniform1f(fly.u('uFog'), f.fog); gl.uniform3fv(fly.u('uFlyColor'), f.flies.color);
        gl.uniform2fv(fly.u('uLifeWind'), f.lifeWind || [0, 0]); gl.uniform3fv(fly.u('uHaze'), f.fogColor.map((v) => Math.min(1, v * 1.3)));
        gl.drawArrays(gl.POINTS, 0, counts.fly);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // rain and mist
      if (counts.rain || counts.mist) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(part.p);
        gl.uniformMatrix4fv(part.u('uVP'), false, f.vp); gl.uniform3fv(part.u('uCam'), f.camPos); gl.uniform1f(part.u('uTime'), f.time); gl.uniform1f(part.u('uScale'), f.pointScale);
        drawParticles('rain', f, { box: [40, 16, 40], vel: f.rain.vel, size: f.rain.size, color: [0.6, 0.68, 0.8], alpha: f.rain.alpha });
        drawParticles('mist', f, { box: [70, 5, 70], vel: [0.5, 0, 0.3], size: 5, color: f.fogColor.map((v) => Math.min(1, v * 1.3)), alpha: 0.12 });
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // the held lantern last, over a cleared depth buffer, so a wall the explorer stands against never cuts through it
      if (counts.held) {
        gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(scene.p); gl.uniform1f(scene.u('uMode'), 3); bindScene(bufs.held);
        const uvLoc = gl.getAttribLocation(scene.p, 'aUv'); gl.disableVertexAttribArray(uvLoc); gl.vertexAttrib2f(uvLoc, -1, -1);
        gl.drawArrays(gl.TRIANGLES, 0, counts.held);
      }
    },
  };
}

// ---------- controller: input, frame loop, interaction ----------

const KEY_MOVE = { KeyW: ['forward', 1], ArrowUp: ['forward', 1], KeyS: ['forward', -1], ArrowDown: ['forward', -1], KeyA: ['strafe', -1], KeyD: ['strafe', 1], ArrowLeft: ['turn', -1], ArrowRight: ['turn', 1] };

/** Loads a local pack image and cuts it to a 256 square canvas (WebGL 1 needs power of two sizes to repeat and mipmap). Resolves null when it cannot load. */
function loadPackImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(im, 0, 0, 256, 256); resolve(c); };
    im.onerror = () => { console.warn(`[view3d] pack texture not loaded: ${url}`); resolve(null); };
    im.src = url;
  });
}

/** Decodes image bytes off the DOM (no object URL, so CSP img-src is not involved). Resolves null and warns when it cannot. */
async function decodeImage(bytes, mimeType, label) {
  try { return await createImageBitmap(new Blob([bytes], { type: mimeType })); } catch (err) { console.warn(`[third-party] ${label} not decoded (${err.message}); keeping the original`); return null; }
}
async function fetchImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await decodeImage(await res.arrayBuffer(), 'image/jpeg', url);
  } catch (err) { console.warn(`[third-party] ${url} failed (${err.message}); keeping the procedural texture`); return null; }
}
/**
 * Lazy CC0 upgrade, fetched only once the 3D view has its original meshes (never precached by sw.js): material photos replace the procedural
 * ground, stone, roof and cobble, and the props in THIRD_PARTY_MODELS replace their original meshes in `meshes`. Every failure is a
 * console.warn and leaves the original in place. Resolves the number of props upgraded.
 */
async function loadThirdParty(renderer, meshes, { cc0 = true, wantAlien = false } = {}) {
  let props = [], bitmaps = [];
  if (cc0) {
    const names = Object.keys(THIRD_PARTY_TEXTURES), imgs = await Promise.all(names.map((n) => fetchImage(THIRD_PARTY_BASE + THIRD_PARTY_TEXTURES[n])));
    renderer.setMaterialTextures(Object.fromEntries(names.map((n, i) => [n, imgs[i]])));
    props = await loadThirdPartyModels(fetch.bind(globalThis), THIRD_PARTY_BASE + 'models/', meshes);
    bitmaps = await Promise.all(props.map((p) => decodeImage(p.texture.bytes, p.texture.mimeType, p.kind)));
  }
  const ok = props.filter((_, i) => bitmaps[i]);
  const alien = wantAlien ? await loadAlienPack(meshes) : [];
  if (!ok.length && !alien.length) return 0;
  const slotPx = 512, grid = alien.length ? ATLAS_GRID * 2 : ATLAS_GRID, atlas = document.createElement('canvas'); atlas.width = atlas.height = slotPx * grid;
  const ctx = atlas.getContext('2d');
  // with the Alien pack the 2 x 2 CC0 atlas stays as the top left quarter of a 4 x 4 atlas; the Alien models take the other slots
  const taken = (s) => s % grid < ATLAS_GRID && Math.floor(s / grid) < ATLAS_GRID, freeSlots = Array.from({ length: grid * grid }, (_, s) => s).filter((s) => !taken(s));
  props.forEach((p, i) => { if (bitmaps[i]) ctx.drawImage(bitmaps[i], (p.slot % ATLAS_GRID) * slotPx, Math.floor(p.slot / ATLAS_GRID) * slotPx, slotPx, slotPx); });
  for (const p of ok) meshes.set(p.kind, alien.length ? shrinkUv(p.model, ATLAS_GRID / grid) : p.model);
  let placed = ok.length;
  for (const a of alien) {
    let model = a.model;
    if (a.texture) {
      const bmp = await decodeImage(a.texture.bytes, a.texture.mimeType, a.kind), slot = freeSlots.shift();
      if (bmp && slot !== undefined) { ctx.drawImage(bmp, (slot % grid) * slotPx, Math.floor(slot / grid) * slotPx, slotPx, slotPx); model = atlasModel(model, slot, grid); }
      else model = { ...model, texture: null, triangles: model.triangles.map(({ uv, ...flat }) => flat) }; // no room or no bitmap: flat colour
    }
    meshes.set(a.kind, model);
    placed++;
  }
  renderer.setPropAtlas(atlas);
  return placed;
}

/**
 * Local horror area, only under ?pack=1: the Alien Terrain Pack look-alikes of the corruption kinds from the git-ignored local-pack/alien/.
 * No manifest (the usual case on any other machine) or a bad one logs one console warning and leaves every original mesh in place.
 */
async function loadAlienPack(meshes) {
  try {
    const res = await fetch('local-pack/alien/manifest.json');
    if (!res.ok) throw new Error(`no local-pack/alien/manifest.json (HTTP ${res.status}); run python3 tools/build_alien_pack.py`);
    const v = validateAlienManifest(await res.json());
    if (!v.ok) throw new Error('bad manifest: ' + v.errors.join('; '));
    return await loadAlienModels(fetch.bind(globalThis), 'local-pack/alien/', v.models, meshes);
  } catch (err) {
    console.warn(`[alien-pack] ${err.message}; keeping the original meshes`);
    return [];
  }
}

/** Capture stills are rendered at one fixed moment so every effect (ripples, fireflies, grain) is visible and repeatable. */
const STILL_TIME = 3.7;
let meshPromise = null;
const loadMeshesOnce = () => (meshPromise ||= loadMeshSet(fetch.bind(globalThis), 'assets/meshes/', [...new Set(Object.values(MESH_FOR)), ...LAMP_KINDS, 'boat', 'dock', 'fence', 'cliff_rock', 'villager', 'shore_crawler', 'hollow_watcher', 'deep_one', 'cliff_flyer', ...DRESSING_KINDS], console.warn, 'data/village_shapes.json'));

/**
 * getScene() -> { layout, lamps: [{id, pos, lit}] (vigil lanterns that can be lit), seed, gridW, gridD, dread, night: {number, sky, weather}, categoryOf(id), labelFor(piece, kind), tintFor(id), groundTint,
 *   fly: camera {x,y,z,yaw,pitch} while the ?cinematic=1 fly-through runs (it replaces walking), else null }
 * packTextures(): null, or { wall, ground } image URLs (only under ?pack=1, served from the git-ignored web/local-pack).
 * alienPack(): true only under ?pack=1, then the local Alien models replace the corruption look-alikes when local-pack/alien/ exists.
 * thirdParty: false keeps only the original procedural textures and Blender meshes (?thirdparty=0), else the CC0 upgrade loads lazily after the meshes.
 * onInteract(piece, kind) applies the sanity change and shows the line; onExit() leaves the view; notice(key) reports status text.
 */
export function createView3d({ canvas, prompt, getScene, onInteract, onExit, notice, reduced = false, capture = false, grain = true, camParam = null, packTextures = () => null, alienPack = () => false, post = true, thirdParty = true, onPerf = null, fixedScale = false, onStep = null, onCoast = null, onThunder = null, modal = null, onInventory = null, onPlayer = null, onWard = null, quality = 'medium', onGpu = null, highContrast = () => false, now = () => performance.now() }) {
  let gl = null, renderer = null, active = false, rafId = 0, running = false;
  let lighthouse = { x: 0, z: 0 }; // ground position of the lighthouse lamp, set with each world build
  let layoutCount = 0, cam = null, world = null, worldKey = '', boxes = [], bounds = null, meshes = null, lights = [], rainKey = '', lastHalos = null, lastFlies = null;
  let flocks = null, flockKey = '', perches = [], birdCountsNow = null, lastBirds = '', flashState = { flash: 0, flashAt: null, flashLevel: 0 }, lastFlashAt = 0, lastLightningSlot = -1;
  let tierName = quality, tier = tierSettings(quality); // graphics quality tier (quality.js), set by the app
  let settings = sanitizeViewSettings(null); // eye height and field of view, set by the app from localStorage
  let peopleDrawn = 0, lastVillagers = '', perfAt = 0, packLoaded = false, thirdPartyStarted = false, upgraded = 0, omen = { eye: 0, tentacle: 0 }, lastTent = '';
  let lastDraw = 0, last = 0, t0 = 0, dirty = true, scale = 1, lastSize = '', lastUse = -Infinity, bobPhase = 0, locked = false, pendingMouse = null;
  const keys = new Set(), perf = createPerf(), touches = new Map();
  let drive = { forward: 0, strafe: 0 }, stick = { forward: 0, strafe: 0 }, smooth = { forward: 0, strafe: 0 }, coastAt = -1, look = { dx: 0, dy: 0 }, padPrev = null, mouseDown = null, lockedBeforeDown = false;

  const wake = () => { dirty = true; if (active && !running) { running = true; last = 0; rafId = requestAnimationFrame(loop); } };
  const isTyping = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target && e.target.tagName);

  function ensureWorld(s) {
    const key = [s.seed, meshes ? meshes.size : 0, upgraded, s.layout.map((p) => p.detail).join(''), (s.books || []).map((b) => b.id + (b.read ? 'r' : '')).join(','), (s.pickups || []).map((q) => q.id).join(','), corruptionLevel(s.dread, s.night.number)].join('|');
    if (key === worldKey) return;
    worldKey = key;
    lighthouse = lighthouseSite(s.seed, s.gridW, s.gridD); lastHalos = null; lastFlies = null; world = buildWorld({ layout: s.layout, meshes, seed: s.seed, gridW: s.gridW, gridD: s.gridD, tintFor: s.tintFor, groundTint: s.groundTint, books: s.books || [], pickups: s.pickups || [], corruption: corruptionLevel(s.dread, s.night.number) });
    boxes = [...worldBoxes(s.layout, world.heights), ...world.dressingBoxes, ...postLampBoxes(world.lights)]; layoutCount = s.layout.length; bounds = walkBounds(s.seed, s.gridW, s.gridD);
    lights = world.lights; renderer.setWorld(world); lastTent = ''; flockKey = '';
    perches = roofPerches(s.layout, world.heights, s.seed, 6);
    if (!cam) {
      const sp = spawnPoint(s.layout, s.gridW, s.gridD), override = parseCamParam(camParam);
      cam = override ? { x: override.x, y: EYE_HEIGHT, z: override.z, yaw: override.yaw, pitch: override.pitch } : { x: sp.x, y: EYE_HEIGHT, z: sp.z, yaw: 0, pitch: -0.04 };
    }
  }
  let shoreKey = '', shoreVec = null;
  /** The sea shader's shoreline, recomputed only when the village changes. */
  function shore(s) {
    const k = `${s.seed}|${s.gridW}|${s.gridD}`;
    if (k !== shoreKey) { shoreKey = k; const l = shoreLine(s.gridW, s.gridD, s.seed); shoreVec = [l.axis, l.line, l.sign]; }
    return shoreVec;
  }
  function ensureParticles(s) {
    const base = particleCounts({ weather: s.night.weather, dread: s.dread, reduced }), counts = { rain: Math.round(base.rain * tier.particles), mist: Math.round(base.mist * tier.particles) };
    const key = `${s.seed}|${counts.rain}|${counts.mist}`;
    if (key === rainKey) return;
    rainKey = key; renderer.setParticles(particleSeeds(s.seed, counts.rain, 1), particleSeeds(s.seed, counts.mist, 2));
  }

  /** The fly-through drifts at street level, so it must not pass through a wall: slide it out of any box it overlaps. */
  function streetFly(c) {
    const p = resolveCollisions(c.x, c.z, BODY_RADIUS * 2, boxes);
    return { ...c, x: p.x, z: p.z };
  }
  function centerRay() { return forwardVector(cam.yaw, cam.pitch); }
  function target(ray, s) {
    const origin = [cam.x, cam.y, cam.z], hit = pickBox(origin, ray, boxes, 60);
    // Vigil lamps share the same view ray; a lamp wins when it is not clearly behind the wall it hangs beside.
    const lampHit = s.lamps && s.lamps.length ? pickLamp(origin, ray, s.lamps, 60) : null;
    if (lampHit && (!hit || lampHit.distance <= hit.distance + 0.6)) {
      const lamp = s.lamps[lampHit.index];
      return { piece: { id: 'lamp', lampId: lamp.id, lit: !!lamp.lit }, kind: 'lamp', distance: lampHit.distance, inRange: InteractionRules.inRange(lampHit.distance) };
    }
    // Villagers share the view ray; one wins when it is not clearly behind the wall it stands beside.
    const vs = s.villagers || [];
    const vHit = vs.length ? pickLamp(origin, ray, vs, 60, TALK_PICK_RADIUS) : null;
    if (vHit && (!hit || vHit.distance <= hit.distance + 0.6)) {
      const v = vs[vHit.index];
      return { piece: { id: 'villager', villagerIndex: v.id, name: v.name }, kind: 'villager', distance: vHit.distance, inRange: InteractionRules.inRange(vHit.distance) };
    }
    // Lore books lie on the ground and share the view ray the same way.
    const bs = s.books || [];
    const bHit = bs.length ? pickLamp(origin, ray, bs, 60, BOOK_PICK_RADIUS) : null;
    if (bHit && (!hit || bHit.distance <= hit.distance + 0.6)) {
      const b = bs[bHit.index];
      return { piece: { id: 'book', bookId: b.id, read: !!b.read }, kind: 'book', distance: bHit.distance, inRange: InteractionRules.inRange(bHit.distance) };
    }
    // Found items and chests share the view ray too.
    const qs = s.pickups || [];
    const qHit = qs.length ? pickLamp(origin, ray, qs, 60, PICKUP_PICK_RADIUS) : null;
    if (qHit && (!hit || qHit.distance <= hit.distance + 0.6)) {
      const q = qs[qHit.index];
      return { piece: { id: 'pickup', pickupId: q.id, label: q.label, lodging: !!q.lodging }, kind: q.chest ? 'chest' : 'item', distance: qHit.distance, inRange: InteractionRules.inRange(qHit.distance) };
    }
    if (!hit || hit.index >= layoutCount) return null; // a dressing prop only blocks the view
    const piece = s.layout[hit.index], kind = InteractionRules.kindForCategory(s.categoryOf(piece.id));
    return { piece, kind, distance: hit.distance, inRange: InteractionRules.inRange(hit.distance) };
  }
  function interact(ray) {
    if (modal && modal.isOpen()) { modal.close(); return; } // an open dialogue takes the next interact (E, Enter, tap, pad button) to close
    const s = getScene(), tt = now() / 1000;
    const hit = target(ray, s);
    if (!hit || !hit.inRange) return;
    if (!InteractionRules.cooldownElapsed(tt, lastUse)) return;
    lastUse = tt; onInteract(hit.piece, hit.kind); wake();
  }
  /** Chats with the villager nearest the camera within range (C key, touch button, gamepad left trigger). Pressing again moves to the next topic. */
  function chatNearest() {
    if (!active || !cam) return;
    const s = getScene(), t = chatTarget(s.villagers, s.books, cam.x, cam.z);
    if (!t) return;
    if (t.kind === 'book') { onInteract({ id: 'book', bookId: t.id }, 'book'); wake(); return; }
    const v = s.villagers.find((e) => e.id === t.id);
    onInteract({ id: 'villager', villagerIndex: v.id, name: v.name }, 'villager-chat'); wake();
  }
  /** Talks to the villager nearest the camera within range, whatever the view direction (touch button, gamepad trigger). */
  function talkNearest() {
    if (!active || !cam) return;
    if (modal && modal.isOpen()) { modal.close(); return; }
    const s = getScene(), near = nearestVillager(s.villagers || [], cam.x, cam.z, InteractionRules.RANGE);
    if (!near) return;
    const v = s.villagers.find((e) => e.id === near.id);
    onInteract({ id: 'villager', villagerIndex: v.id, name: v.name }, 'villager'); wake();
  }
  function updatePrompt(s) {
    const hit = cam ? target(centerRay(), s) : null;
    const text = hit && hit.inRange ? s.labelFor(hit.piece, hit.kind) : '';
    if (prompt.textContent !== text) prompt.textContent = text;
    prompt.hidden = !text;
  }

  const updatePromptOff = () => { if (!prompt.hidden) prompt.hidden = true; };

  function currentInput() {
    const inp = { ...combineDrive(drive, stick), turn: 0, look: 0 }; // canvas gesture and on-screen stick are separate sources, so two fingers never fight
    for (const code of keys) { const m = KEY_MOVE[code]; if (m) inp[m[0]] = Math.max(-1, Math.min(1, inp[m[0]] + m[1])); }
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []).filter(Boolean) : [];
    if (pads.length) {
      const snap = snapshotPad(pads[0]), ax = padAxes3d(snap);
      inp.forward += ax.forward; inp.strafe += ax.strafe; inp.turn += ax.turn; inp.look += ax.look;
      const acts = mapGamepad(padPrev, snap); padPrev = snap;
      if (acts.includes('chat')) chatNearest();
      else if (acts.includes('talk')) talkNearest();
      else if (acts.includes('listen') || acts.includes('door')) interact(centerRay());
      if (acts.includes('inventory') && onInventory) onInventory();
      if (acts.includes('whisper')) onExit();
    }
    return inp;
  }

  function loop(ts) {
    rafId = 0;
    if (!active) { running = false; return; }
    if (document.hidden) { rafId = requestAnimationFrame(loop); return; }
    const dt = last ? (ts - last) / 1000 : 0.016; last = ts;
    const s = getScene();
    ensureWorld(s); ensureParticles(s);
    const raw = currentInput();
    smooth = smoothDrive(smooth, raw, dt); // eased walking; turning and looking stay direct (no mouse smoothing)
    const inp = { ...raw, forward: smooth.forward, strafe: smooth.strafe }, mouse = look.dx || look.dy || pendingMouse ? { dx: look.dx + (pendingMouse ? pendingMouse.dx : 0), dy: look.dy + (pendingMouse ? pendingMouse.dy : 0) } : null;
    const before = cam;
    cam = s.fly ? streetFly(s.fly) : stepCamera(cam, inp, dt, boxes, bounds, mouse);
    if (!s.fly) cam = { ...cam, y: settings.eye + groundHeight(s.seed, s.gridW, s.gridD, cam.x, cam.z) }; // the walking eye height setting; the ground is flat inside the walkable bounds, so there is no terrain offset
    look = { dx: 0, dy: 0 }; pendingMouse = null;
    const moved = cam.x !== before.x || cam.z !== before.z || cam.yaw !== before.yaw || cam.pitch !== before.pitch;
    const speed = Math.min(1, Math.hypot(inp.forward, inp.strafe)), moving = speed > 0.01 || !!(raw.forward || raw.strafe);
    if (speed > 0.05) {
      const prevPhase = bobPhase; bobPhase += dt * speed;
      if (onStep && !s.fly && footfall(prevPhase, bobPhase)) onStep(surfaceAt(cam.x, cam.z, s.gridW, s.gridD, s.seed));
    }
    if (onCoast && !s.fly) { const c = Math.round(coastCloseness(cam.x, cam.z, s.gridW, s.gridD, s.seed) * 10) / 10; if (c !== coastAt) { coastAt = c; onCoast(c); } }
    if (onPlayer && !s.fly) onPlayer({ x: cam.x, z: cam.z, yaw: cam.yaw, dt: Math.min(dt, MAX_PLAYER_DT) });
    const padOn = navigator.getGamepads && Array.from(navigator.getGamepads() || []).some(Boolean);
    const animated = !reduced && !capture;
    if (s.fly) updatePromptOff();
    if (animated || dirty || moved || moving) { const c0 = now(); draw(s, ts); perf.cpuSample(now() - c0); dirty = false; if (moved) updatePrompt(s); }
    const stay = animated || moving || moved || padOn || keys.size > 0 || touches.size > 0 || dirty;
    if (stay) rafId = requestAnimationFrame(loop); else running = false;
  }

  function draw(s, ts) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = renderSize(rect.width || canvas.width, rect.height || canvas.height, dpr, scale, tier.maxPixels);
    if (`${size.width}x${size.height}` !== lastSize) { lastSize = `${size.width}x${size.height}`; canvas.width = size.width; canvas.height = size.height; renderer.resize(size.width, size.height); }
    perf.sample(ts);
    if (onPerf && ts - perfAt > 500) { perfAt = ts; onPerf(perf.stats(), { ...renderer.counts(), people: peopleDrawn, scale, tier: tierName, size: lastSize }); }
    if (!reduced && !fixedScale) { const st = perf.stats(), ns = nextScale(scale, st.avgMs, st.frames, tier.minScale); if (ns !== scale) { scale = ns; perf.reset(); } }
    const time = capture ? STILL_TIME : (ts - t0) / 1000, aspect = canvas.width / canvas.height;
    const targets = omenTargets(tierFor(s.dread)), step = reduced || capture ? 1 : Math.min(1, (ts - (lastDraw || ts)) / 1000 * 3);
    lastDraw = ts; omen = { eye: omen.eye + (targets.eye - omen.eye) * step, tentacle: omen.tentacle + (targets.tentacle - omen.tentacle) * step };
    if (Math.abs(omen.eye - targets.eye) < 0.01) omen.eye = targets.eye;
    if (Math.abs(omen.tentacle - targets.tentacle) < 0.01) omen.tentacle = targets.tentacle;
    // Fly-through at Dire and Abyss: turn toward the sea so the risen tentacles and the open eye are both in frame.
    let view = cam;
    const omenW = omenBlendWeight(!!s.fly, omen.tentacle);
    if (omenW > 0) {
      const framing = omenFraming({ gridW: s.gridW, gridD: s.gridD, seed: s.seed, nightNumber: s.night.number, grow: omen.tentacle, eyeOpen: omen.eye, aspect });
      view = blendCamera(cam, framing, omenW);
    }
    const eye = { ...view, y: view.y + headBob(bobPhase, Math.min(1, Math.hypot(smooth.forward, smooth.strafe)), reduced) };
    const night = { sky: hazedSky(s.night.sky, s.night.weather, s.dread, s.night.number), moon: moonParams(s.seed, s.night.number, s.night.sky, s.night.weather) };
    const day = lookAt(Number.isFinite(s.tick) ? s.tick : 0, night.sky, night.moon, s.dread), moon = day.moon;
    // Weather: wind bends foliage and slants rain; a storm's lightning goes through the shared capped, rate-limited flash gate (never with reduced motion).
    const weather = s.night.weather, wlook = weatherLook(weather), wind = windState({ weather, seed: s.seed, timeSec: time, reduced });
    if (capture) flashState.flash = weather === 'storm' ? 0.18 : 0; // a still shows one fixed moment of the storm
    else {
      flashState.flash = decayFlash(flashState.flash, lastFlashAt ? (ts - lastFlashAt) / 1000 : 0); lastFlashAt = ts;
      const level = stormFlash(s.seed, ts, weather, reduced), slot = Math.floor(ts / 400);
      if (level > 0 && slot !== lastLightningSlot) { lastLightningSlot = slot; if (applyFlash(flashState, level, ts) && onThunder) onThunder(thunderDelayMs(s.seed, ts)); }
    }
    const sk = flashSky(day.sky, flashState.flash); // the clock blends the night look toward day; full night is unchanged
    const lc = lanternColor(s.dread), carried = carriedLantern(s.dread), fwd = forwardVector(view.yaw, view.pitch);
    const states = lights.map((l) => lanternState(l, s.lamps)), cc = cullCell(eye.x, eye.z), cullR = lightCullRadius(tier.drawDistance), haloKey = states.join(',') + '|' + tier.lampHalo + '|' + cc.key; // lights lost in the fog are not drawn: the set follows the camera cell
    const lifeNow = lifeParams({ tier, reduced, weather, dread: Math.round(s.dread * 4) / 4 }), fliesStyle = fireflyStyle(s.dread, reduced), fliesKey = `${haloKey}|${fliesStyle.kind}|${reduced}|${tier.fireflies}`;
    if (fliesKey !== lastFlies) {
      lastFlies = fliesKey;
      const warm = lights.filter((l, i) => states[i] !== 'unlit');
      const fl = pointsWithin(fireflySeeds(warm, s.seed, Math.round(fireflyCount({ lights: warm.length, reduced }) * tier.fireflies)), FIREFLY_FLOATS, cc.x, cc.z, cullR), lf = lifeSeeds({ seed: s.seed, lights: warm, chimneys: world ? chimneySites(s.layout, world.heights) : [], counts: lifeNow }), all = new Float32Array(fl.length + lf.length);
      all.set(fl); all.set(lf, fl.length); renderer.setFireflies(all);
    }
    if (haloKey !== lastHalos) { // lit and unlit vigil lanterns glow differently; the halo buffer is rebuilt only when that changes
      lastHalos = haloKey; const near = lightsWithin(lights, cc.x, cc.z, cullR).map((i) => ({ ...lights[i], haloScale: lanternPool(states[i], s.dread).halo * tier.lampHalo }));
      renderer.setHalos(haloSprites([...near, { pos: [lighthouse.x, BEAM_LAMP_HEIGHT, lighthouse.z], phase: 0.5, post: true, haloScale: LIGHTHOUSE_HALO_SCALE }])); // the lamp room glows even where the beam is off (Low tier, reduced motion, day)
    }
    const bc = birdCounts({ weather, dread: s.dread, reduced, perches: perches.length }), counts = { ...bc, gulls: Math.round(bc.gulls * tier.birds), circling: Math.round(bc.circling * tier.birds) }, plan = flockPlan({ seed: s.seed, gridW: s.gridW, gridD: s.gridD, layout: s.layout });
    const nextFlockKey = `${s.seed}|${s.layout.length}|${counts.gulls}|${counts.circling}|${counts.silhouettes}`;
    if (nextFlockKey !== flockKey) { flockKey = nextFlockKey; flocks = createFlocks({ seed: s.seed, plan, counts }); }
    if (!reduced) for (const k of ['gulls', 'crows', 'silhouettes']) if (flocks[k]) advanceFlockTo(flocks[k], time);
    const birdSlot = reduced ? 0 : Math.floor(time * 15), birds = world ? buildBirds({ flocks, perches, counts, timeSec: birdSlot / 15, reduced }) : new Float32Array(0);
    const fogs = fogLayers({ dread: s.dread, weather: s.night.weather, timeSec: time, reduced }); fogs.density *= day.fogScale; fogs.ground *= day.fogScale;
    const hc = !!highContrast(), cf = closeFog({ fog: sk.fog, dread: s.dread, tier, w: day.w }); // Silent Hill style close fog: denser by tier, colour from the sky
    fogs.density *= cf.density; fogs.ground *= cf.ground; fogs.groundHeight *= cf.groundHeight;
    const near = Math.max(0, Math.min(1, s.creatureNear || 0)); fogs.density *= 1 + CREATURE_FOG_GAIN * near; fogs.ground *= 1 + CREATURE_FOG_GAIN * near; // a creature close by: the fog thickens
    fogs.density = Math.max(fogs.density, fogFloorFor(tier.drawDistance)); // the city's far chunks are not drawn (chunkCullDistance), so the fog must hide them first
    const grade = gradeParams({ tick: s.tick, dread: s.dread, weather: s.night.weather, tier, highContrast: hc });
    const seen = fogCullDistance(fogs.density); // villagers lost in the fog are not rebuilt or drawn
    const vsc = [...(s.villagers || []), ...(s.folk || []).map((w) => ({ id: 1000 + w.id, pos: [w.x, 0, w.z], yaw: w.yaw, lantern: w.lantern }))].filter((v) => Math.hypot(v.pos[0] - eye.x, v.pos[2] - eye.z) <= seen), cvs = (s.creatures || []).filter((c) => Math.hypot(c.pos[0] - eye.x, c.pos[2] - eye.z) <= seen), vkey = `${cvs.map((c) => `${c.id}:${c.pos[0].toFixed(1)},${c.pos[2].toFixed(1)}`).join('|')}|${vsc.map((v) => `${v.id}:${v.pos[0].toFixed(1)},${v.pos[2].toFixed(1)}:${v.lantern ? 1 : 0}:${v.walking ? 1 : 0}:${(v.fade ?? 1).toFixed(2)}`).join('|')}|${meshes ? 1 : 0}|${reduced ? 0 : Math.floor(time / 0.1)}|${nextFlockKey}|${birdSlot}`;
    if (vkey !== lastVillagers) { lastVillagers = vkey; { const v3 = buildVillagers({ villagers: vsc, model: meshes && meshes.get('villager'), timeSec: time, reduced }), cr = buildCreatures({ creatures: cvs.map((c) => ({ ...c, yaw: Math.atan2(eye.x - c.pos[0], eye.z - c.pos[2]) })), models: meshes, timeSec: time, reduced }), all = new Float32Array(v3.length + cr.length + birds.length); all.set(v3); all.set(cr, v3.length); all.set(birds, v3.length + cr.length); renderer.setVillagers(all); peopleDrawn = v3.length > 0 ? vsc.filter((v) => v.id < 1000).length : 0; } } // peopleDrawn: named villagers (not street walkers) in the buffer, for the perf HUD and the browser check
    const lanternBearers = vsc.filter((v) => v.lantern).map((v) => ({ pos: [v.pos[0], 1.0, v.pos[2]], radius: 6, phase: v.id * 1.3, post: false }));
    const lit = nearestLights([...lights, ...lanternBearers], view).map((l) => {
      const k = lanternFlicker(l.phase, time, s.dread, reduced) * (1 - 0.3 * s.dread);
      const pool = lanternPool(lanternState(l, s.lamps), s.dread);
      return { pos: l.pos, radius: l.radius * wlook.pool, color: pool.color.map((v) => v * pool.gain * day.lampGain * k) };
    });
    const k0 = lanternFlicker(0.7, time, s.dread, reduced) * creatureFlicker(near, time, reduced);
    const basis = cameraBasis(eye), [hx, hy, hz] = HELD_LANTERN_OFFSET, heldAt = [0, 1, 2].map((c) => [eye.x, eye.y, eye.z][c] + basis.r[c] * hx + basis.u[c] * (hy + 0.1) + basis.f[c] * hz);
    renderer.setHeld(s.fly ? new Float32Array(0) : buildHeldLantern({ eye, basis, swingPhase: bobPhase, reduced })); // no hand in the fly-through
    lit.push({ pos: s.fly ? [eye.x + fwd[0] * 0.4, eye.y - 0.25, eye.z + fwd[2] * 0.4] : heldAt, radius: carried.radius, color: carried.color.map((v) => v * 0.9 * k0 * day.lampGain) });
    const tentKey = omen.tentacle > 0.01 ? `${omen.tentacle.toFixed(3)}|${reduced ? 0 : time.toFixed(2)}|${s.dread.toFixed(2)}` : '';
    if (tentKey !== lastTent) {
      lastTent = tentKey;
      renderer.setTentacles(tentKey ? buildTentacles({ bases: tentacleBases(s.gridW, s.gridD, s.seed), grow: omen.tentacle, dread: s.dread, timeSec: time, reduced }) : new Float32Array(0));
    }
    const postP = { ...postParams({ dread: s.dread, reduced, quality: scale, tier }) }; if (!grain) postP.grain = 0; if (hc) { postP.grain = 0; postP.chroma = 0; } postP.vignette = Math.max(0, postP.vignette + grade.vignetteBoost); if (!post) postP.enabled = false; // ?post=0 forces direct rendering (QA and low-end switch)
    // the beam turns with the Core clock; Low tier and reduced motion keep only the static glow, daylight hides it
    const beamStrength = beamStrengthFor({ sunWeight: day.sunWeight, fog: fogs.density, quality: tier.detail, reduced });
    renderer.setBeam(beamStrength > 0 ? buildBeam({ pos: [lighthouse.x, BEAM_LAMP_HEIGHT, lighthouse.z], yaw: beamYaw(s.seed, time) }) : new Float32Array(0));
    renderer.draw({
      beam: { color: BEAM_COLOR, strength: beamStrength },
      vp: viewProjection(eye, aspect, fovRadians(settings.fovDeg)), fovY: fovRadians(settings.fovDeg), basis, camPos: [eye.x, eye.y, eye.z], aspect, time, reduced, sky: { ...sk, ambient: coldFill(sk.ambient) }, moon, moonLight: moonBoost(moon.color), lights: lit,
      fog: fogs.density, drawDistance: tier.drawDistance, groundFog: fogs.ground, groundHeight: fogs.groundHeight, eye: { ...eyeParams(s.seed, s.night.number, s.gridW, s.gridD), open: omen.eye }, fogColor: cf.color, grade, rim: rimLight({ horizon: sk.horizon, moonColor: moon.color, dread: s.dread, tier }), win: (({ unlit, flicker }) => [unlit, flicker])(windowMood({ dread: s.dread, tier })), godColor: moon.color.map((v) => Math.min(1, v * 0.8)), godRays: (() => { const sp = projectToScreen(viewProjection(eye, aspect, fovRadians(settings.fovDeg)), [eye.x + moon.dir[0] * 300, eye.y + moon.dir[1] * 300, eye.z + moon.dir[2] * 300]); return [sp.u, sp.v, godRayAmount(grade.godRays, sp) * 0.6]; })(), glowColor: lc.map((v) => v * day.lampGain * wlook.glow), windU: [wind.dir[0], wind.dir[1], wind.strength, reduced ? 0 : wind.base], life: lifeNow, lifeWind: [wind.dir[0] * wind.strength, wind.dir[1] * wind.strength], rain: precipitationStyle(weather, wind), sunWeight: day.sunWeight, post: postP, sea: seaParams({ dread: s.dread, weather: s.night.weather, reduced }), waterTime: reduced ? 0 : time, flies: { ...fliesStyle, rise: fliesStyle.rise }, fogOffset: [fogs.drift[0] * time * 0.06, fogs.drift[1] * time * 0.06], pointScale: canvas.height * 0.5, detail: tier.detail, lampCore: tier.lampCore, fogSheets: tier.fogSheets ? 1 : 0, wet: wetness(weather), blobs: tier.detail > 0 ? blobShadows(vsc, eye) : null, shore: shore(s),
    });
  }

  // ----- input -----
  const onKeyDown = (e) => {
    if (!active || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { if (locked) document.exitPointerLock(); else onExit(); e.preventDefault(); return; }
    if (e.code === 'KeyC') { chatNearest(); e.preventDefault(); return; }
    if (onWard && WARD_KEYS[e.code]) { onWard(WARD_KEYS[e.code]); e.preventDefault(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { interact(centerRay()); e.preventDefault(); return; }
    if (KEY_MOVE[e.code]) { keys.add(e.code); e.preventDefault(); wake(); }
  };
  const onKeyUp = (e) => { keys.delete(e.code); };
  const onMouseMove = (e) => { if (locked) { pendingMouse = { dx: (pendingMouse ? pendingMouse.dx : 0) + e.movementX, dy: (pendingMouse ? pendingMouse.dy : 0) + e.movementY }; wake(); } };
  const onLockChange = () => { locked = document.pointerLockElement === canvas; wake(); };
  const onPointerDown = (e) => {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer already ended; click and drag still work without capture */ }
    const r = canvas.getBoundingClientRect();
    if (e.pointerType === 'touch') {
      const left = e.clientX - r.left < r.width * 0.4;
      touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now(), role: left ? 'drive' : 'look' });
      wake(); return;
    }
    lockedBeforeDown = locked; mouseDown = { x: e.clientX, y: e.clientY, moved: false };
    if (!locked && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported: drag-look and click picking still work */ } }
  };
  const onPointerMove = (e) => {
    const tch = touches.get(e.pointerId);
    if (tch) {
      if (tch.role === 'drive') drive = touchDrive({ x: tch.x0, y: tch.y0 }, { x: e.clientX, y: e.clientY });
      else { const d = lookDelta(e.clientX - tch.x, e.clientY - tch.y); look.dx += d.dx; look.dy += d.dy; }
      tch.x = e.clientX; tch.y = e.clientY; wake(); return;
    }
    if (mouseDown && !locked && e.buttons) { look.dx += e.movementX || 0; look.dy += e.movementY || 0; mouseDown.moved = true; wake(); }
  };
  const onPointerUp = (e) => {
    const tch = touches.get(e.pointerId);
    if (tch) {
      touches.delete(e.pointerId);
      if (tch.role === 'drive') drive = { forward: 0, strafe: 0 };
      if (isTap(tch.x0, tch.y0, e.clientX, e.clientY, now() - tch.t0)) {
        const r = canvas.getBoundingClientRect();
        interact(screenRay(cam, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, canvas.width / canvas.height, fovRadians(settings.fovDeg)));
      }
      wake(); return;
    }
    const md = mouseDown; mouseDown = null;
    if (!md || md.moved) return;
    if (lockedBeforeDown) interact(centerRay());
    else if (!canvas.requestPointerLock || document.pointerLockElement !== canvas) {
      const r = canvas.getBoundingClientRect();
      interact(screenRay(cam, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, canvas.width / canvas.height, fovRadians(settings.fovDeg)));
    }
  };
  const onResize = () => wake();
  const onVisible = () => { if (!document.hidden) wake(); };

  const listeners = [[window, 'keydown', onKeyDown], [window, 'keyup', onKeyUp], [document, 'mousemove', onMouseMove], [document, 'pointerlockchange', onLockChange],
    [canvas, 'pointerdown', onPointerDown], [canvas, 'pointermove', onPointerMove], [canvas, 'pointerup', onPointerUp], [canvas, 'pointercancel', onPointerUp],
    [window, 'resize', onResize], [document, 'visibilitychange', onVisible], [window, 'gamepadconnected', wake]];

  return {
    get active() { return active; },
    /** Returns false (and reports why) when WebGL or shader compilation is unavailable. */
    enter() {
      if (active) return true;
      try {
        gl ||= canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: capture }) || canvas.getContext('experimental-webgl');
        if (!gl) { notice('view3d.nogl'); return false; }
        renderer ||= createGlRenderer(gl);
      } catch (err) { console.warn('[view3d] ' + err.message); notice('view3d.nogl'); return false; }
      if (onGpu) { // the unmasked renderer name feeds the Auto quality tier; browsers that hide it report nothing
        const ext = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
        onGpu(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '');
      }
      active = true; worldKey = ''; t0 = now(); lastUse = -Infinity;
      for (const [target_, type, fn] of listeners) target_.addEventListener(type, fn);
      loadMeshesOnce().then((set) => {
        meshes = set; worldKey = ''; wake();
        if ((!thirdParty && !alienPack()) || thirdPartyStarted) return;
        thirdPartyStarted = true;
        loadThirdParty(renderer, set, { cc0: thirdParty, wantAlien: alienPack() }).then((n) => { upgraded = n; worldKey = ''; wake(); }, (err) => console.warn('[third-party] upgrade failed: ' + err.message));
      });
      const plan = packLoaded ? null : packTextures();
      if (plan) {
        packLoaded = true;
        Promise.all([plan.wall ? loadPackImage(plan.wall) : null, plan.ground ? loadPackImage(plan.ground) : null])
          .then(([wall, ground]) => { renderer.setPackTextures(wall, ground); wake(); });
      }
      wake(); return true;
    },
    exit() {
      if (!active) return;
      active = false; keys.clear(); touches.clear(); drive = { forward: 0, strafe: 0 }; stick = { forward: 0, strafe: 0 }; prompt.hidden = true;
      if (rafId) cancelAnimationFrame(rafId); rafId = 0; running = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      for (const [target_, type, fn] of listeners) target_.removeEventListener(type, fn);
    },
    /** Called by the app when layout, dread or night changed while the view is open. */
    refresh: wake,
    /** On-screen controls: a held joystick vector, look drag deltas and an interact at the screen centre. */
    setTouchDrive(v) { stick = { forward: v.forward, strafe: v.strafe }; wake(); },
    addTouchLook(dx, dy) { look.dx += dx; look.dy += dy; wake(); },
    talkNearest, chatNearest,
    interactCenter() { if (active && cam) interact(centerRay()); },
    /** Eye height (m) and field of view (deg) from the saved settings; values are clamped. */
    setSettings(next) { settings = sanitizeViewSettings(next); wake(); },
    /** Graphics quality tier name (low, medium, high); resets the resolution governor so the new tier starts from full scale. */
    setQuality(name) { tierName = name; tier = tierSettings(name); scale = 1; perf.reset(); rainKey = ''; lastFlies = null; flockKey = ''; wake(); },
    get quality() { return tierName; },
    get settings() { return settings; },
    get camera() { return cam; },
  };
}
