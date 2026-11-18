// JS port of Core/VillageLandmarks.cs: the six landmarks of the wider world, the lit paths, the props at the landmarks, the church rise and the lore book spots.
// Core is the source of truth; keep the numbers and the order of everything identical to the C# file. Golden-checked ("landmarks").
import { CELL_M, coastSideOf, hiOf, lightU, churchRise, coastToWorldAt, alongShoreYaw } from './dressing.js'; // a cycle with dressing.js, which is fine: both only use the other inside functions

export const LANDMARK_IDS = Object.freeze(['cliffs', 'shipwreck', 'abbey', 'cemetery', 'marsh', 'grove']);
const NAMES_EN = ['Lighthouse Cliffs', 'Wreck of the Marguerite', 'Abbey Ruins', 'The Cemetery', 'The Black Marsh', 'The Cursed Grove'];
const NAMES_FR = ['Falaises du phare', 'Epave de la Marguerite', "Ruines de l'abbaye", 'Le cimetiere', 'Le marais noir', 'Le bosquet maudit'];
const RADII = [14, 9, 12, 22, 12, 11];
export const WORLD_MARGIN = 60, GROVE_SETBACK = 13, ABBEY_SETBACK = 36;
export const CLIFF_ANCHOR_U = 10.5, MARSH_ANCHOR_U = 11.5, WRECK_ANCHOR_U = 34;
export const CLIFF_ANCHOR_V = -0.3, MARSH_ANCHOR_V = -2.3, WRECK_ANCHOR_V = 1.3;
export const COAST_PATH_V = -0.8, SEA_STACK_V = 4.4, GATE_INSET = 1.5, GROVE_GATE_STOP = 9.5;
export const STONE_SPACING = 2.2, LAMP_SPACING = 14, LAMP_SIDE = 1.7, STONE_LIFT = 0.04;
export const HILL_RX = 25, HILL_RZ = 23, HILL_PLATEAU = 0.4, HILL_FOOT = -0.5, CHURCH_TOWER_OFFSET = 7.1;
/** Kinds that only exist as collision boxes: the renderer draws the church on its rise itself, so these have no mesh. */
export const COLLISION_ONLY_KINDS = Object.freeze(['church_nave', 'church_tower']);

export function landmarkName(id, lang) {
  const i = LANDMARK_IDS.indexOf(id);
  return i < 0 ? '' : lang === 'fr' ? NAMES_FR[i] : NAMES_EN[i];
}
export const cliffDir = (seed, gridW, gridD) => (lightU(seed, gridW, gridD) < hiOf(seed, gridW, gridD) / 2 ? -1 : 1);
export const cliffEndU = (seed, gridW, gridD) => (cliffDir(seed, gridW, gridD) < 0 ? 0 : hiOf(seed, gridW, gridD));
export const marshEndU = (seed, gridW, gridD) => (cliffDir(seed, gridW, gridD) < 0 ? hiOf(seed, gridW, gridD) : 0);

/** The cursed grove centre, behind the village on the side away from the sea. */
export function groveCentre(seed, gridW, gridD) {
  const side = coastSideOf(seed);
  if (side === 0) return { x: gridW * CELL_M + GROVE_SETBACK, z: gridD * CELL_M * 0.85 };
  if (side === 1) return { x: -GROVE_SETBACK, z: gridD * CELL_M * 0.85 };
  return { x: gridW * CELL_M * 0.6, z: gridD * CELL_M + GROVE_SETBACK };
}
/** The abbey centre and the unit direction from it toward the city side, which its entrance arch faces. */
export function abbeySite(seed, gridW, gridD) {
  const side = coastSideOf(seed), w = gridW * CELL_M, d = gridD * CELL_M;
  if (side === 2) {
    const churchEast = churchRise(seed, gridW, gridD).faceX < 0;
    return { x: churchEast ? -ABBEY_SETBACK : w + ABBEY_SETBACK, z: d * 0.72, faceX: churchEast ? 1 : -1, faceZ: 0 };
  }
  return { x: w * (side === 0 ? 0.4 : 0.6), z: d + ABBEY_SETBACK, faceX: 0, faceZ: -1 };
}

/** The six landmarks in LANDMARK_IDS order: { id, x, z, radius }. */
export function landmarks(seed, gridW, gridD) {
  const dir = cliffDir(seed, gridW, gridD), cliffEnd = cliffEndU(seed, gridW, gridD), marshEnd = marshEndU(seed, gridW, gridD);
  const at = (u, v) => coastToWorldAt(seed, gridW, u, v), church = churchRise(seed, gridW, gridD), abbey = abbeySite(seed, gridW, gridD), grove = groveCentre(seed, gridW, gridD);
  const pts = [at(cliffEnd + dir * CLIFF_ANCHOR_U, CLIFF_ANCHOR_V), at(marshEnd - dir * WRECK_ANCHOR_U, WRECK_ANCHOR_V), abbey, church, at(marshEnd - dir * MARSH_ANCHOR_U, MARSH_ANCHOR_V), grove];
  return LANDMARK_IDS.map((id, i) => ({ id, x: pts[i].x, z: pts[i].z, radius: RADII[i] }));
}
/** The id of the landmark whose radius holds (x, z), the one the point is deepest inside; null elsewhere. */
export function landmarkAt(seed, gridW, gridD, x, z) {
  let best = null, bestRatio = 1;
  for (const l of landmarks(seed, gridW, gridD)) {
    const ratio = Math.hypot(x - l.x, z - l.z) / l.radius;
    if (ratio < bestRatio) { bestRatio = ratio; best = l.id; }
  }
  return best;
}

// ---------- the church rise ----------
const hillStep = (t) => t * t * (3 - 2 * t);
/** Height of the church rise at an offset (metres) from its centre: a flat summit, a smooth shoulder and gentle lumps, never below the foot. */
export function hillHeight(hill, dx, dz) {
  const rho = Math.hypot(dx / HILL_RX, dz / HILL_RZ), t = Math.max(0, Math.min(1, (rho - HILL_PLATEAU) / (1 - HILL_PLATEAU)));
  const lumps = 0.9 * Math.sin(dx * 0.55 + dz * 0.2) * Math.cos(dz * 0.43) * t * (1 - t) * 4;
  return Math.max(HILL_FOOT, hill * (1 - hillStep(t)) + lumps + HILL_FOOT * hillStep(t));
}
/** The height the explorer stands on at (x, z): the rise inside its ellipse (never below the flat ground), flat 0 elsewhere. */
export function groundHeight(seed, gridW, gridD, x, z) {
  const c = churchRise(seed, gridW, gridD), dx = x - c.x, dz = z - c.z;
  if (Math.abs(dx) > HILL_RX || Math.abs(dz) > HILL_RZ) return 0;
  return Math.max(0, hillHeight(c.hill, dx, dz));
}
/** The offset of the pale winding path along the face of the rise at an x offset from the church. */
export const hillPathZ = (dx) => Math.sin(dx * 0.22) * 2.6;

// ---------- props ----------
const STACK_U = [17, 21, 25, 29], STACK_V = [0, 0.2, -0.2, 0.4], STACK_SCALE = [0.5, 0.6, 0.5, 0.45], STACK_YAW = [0, 2.1, 4.2, 6.3];
const MARSH_POOLS = [[5.5, -4.6, 1.0], [11.5, -5.4, 1.1], [17.0, -4.4, 0.9]];
const MARSH_REEDS = [[4.0, -3.6], [7.2, -3.8], [9.0, -2.4], [13.6, -3.0], [15.2, -3.6], [19.0, -2.8]];
/** Abbey props in the local frame (right, forward) with a yaw offset: kind, x, z, yaw. Forward is toward the city, so the arch is the entrance. */
const ABBEY_PROPS = [
  ['abbey_wall', -3.0, -7.3, 0], ['abbey_wall', 3.0, -7.3, 0], ['abbey_wall', -5.8, -2.9, Math.PI / 2], ['abbey_wall', 5.8, -2.9, Math.PI / 2],
  ['abbey_arch', 0, 3, 0],
  ['abbey_pillar', -2.7, -0.4, 0], ['abbey_pillar', 2.7, -0.4, Math.PI], ['abbey_pillar', -2.7, -4.1, Math.PI], ['abbey_pillar', 2.7, -4.1, 0],
];

/** The props at the landmarks: sea stacks, the wreck, marsh pools and reeds, the abbey ruins and the invisible church collision boxes. Mirrors VillageLandmarks.Dressing. */
export function landmarkDressing(seed, gridW, gridD) {
  const items = [], dir = cliffDir(seed, gridW, gridD), cliffEnd = cliffEndU(seed, gridW, gridD), marshEnd = marshEndU(seed, gridW, gridD);
  const at = (u, v) => coastToWorldAt(seed, gridW, u, v);
  for (let i = 0; i < STACK_U.length; i++) { const p = at(cliffEnd + dir * STACK_U[i], SEA_STACK_V + STACK_V[i]); items.push({ kind: 'cliff_rock', x: p.x, y: 0, z: p.z, yaw: STACK_YAW[i], scale: STACK_SCALE[i] }); }
  const wreck = at(marshEnd - dir * WRECK_ANCHOR_U, WRECK_ANCHOR_V);
  items.push({ kind: 'shipwreck', x: wreck.x, y: 0, z: wreck.z, yaw: alongShoreYaw(seed), scale: 1 });
  for (const [a, v, s] of MARSH_POOLS) { const p = at(marshEnd - dir * a, v); items.push({ kind: 'marsh_pool', x: p.x, y: 0, z: p.z, yaw: a * 0.7, scale: s }); }
  MARSH_REEDS.forEach(([a, v], i) => { const p = at(marshEnd - dir * a, v); items.push({ kind: 'reeds', x: p.x, y: 0, z: p.z, yaw: i * 1.3, scale: 1 }); });
  const abbey = abbeySite(seed, gridW, gridD), abbeyYaw = Math.atan2(abbey.faceX, abbey.faceZ);
  for (const [kind, lx, lz, yaw] of ABBEY_PROPS) items.push({ kind, x: abbey.x + abbey.faceZ * lx + abbey.faceX * lz, y: 0, z: abbey.z - abbey.faceX * lx + abbey.faceZ * lz, yaw: abbeyYaw + yaw, scale: 1 });
  const church = churchRise(seed, gridW, gridD);
  items.push({ kind: 'church_nave', x: church.x, y: church.hill, z: church.z, yaw: 0, scale: 1 });
  items.push({ kind: 'church_tower', x: church.x, y: church.hill, z: church.z + CHURCH_TOWER_OFFSET, yaw: 0, scale: 1 });
  return items;
}

// ---------- paths ----------
function coastPath(seed, gridW, target, fromU, toward, length) {
  const along = [0, length * 0.7, length], v = [COAST_PATH_V, COAST_PATH_V, COAST_PATH_V - 0.3];
  return { target, points: along.map((a, i) => { const p = coastToWorldAt(seed, gridW, fromU + toward * a, v[i]); return [p.x, p.z]; }) };
}
/** The lit paths in landmark order: the coast road on to the cliffs and to the wreck, then the city edge to the abbey, the cemetery and the grove. */
export function landmarkPaths(seed, gridW, gridD) {
  const dir = cliffDir(seed, gridW, gridD), w = gridW * CELL_M, d = gridD * CELL_M, list = [];
  list.push(coastPath(seed, gridW, 'cliffs', cliffEndU(seed, gridW, gridD), dir, CLIFF_ANCHOR_U + 6));
  list.push(coastPath(seed, gridW, 'shipwreck', marshEndU(seed, gridW, gridD), -dir, WRECK_ANCHOR_U - 4));
  const abbey = abbeySite(seed, gridW, gridD), ex = abbey.x + abbey.faceX * 6.5, ez = abbey.z + abbey.faceZ * 6.5;
  const gx = abbey.faceX !== 0 ? (abbey.faceX > 0 ? -GATE_INSET : w + GATE_INSET) : abbey.x, gz = abbey.faceX !== 0 ? abbey.z : d + GATE_INSET;
  list.push({ target: 'abbey', points: [[gx, gz], [ex, ez]] });
  const church = churchRise(seed, gridW, gridD), gateX = church.faceX < 0 ? w + GATE_INSET : -GATE_INSET, summitX = church.x + church.faceX * 5, steps = Math.ceil(Math.abs(summitX - gateX) / 2), up = [];
  for (let i = 0; i <= steps; i++) {
    const x = gateX + ((summitX - gateX) * i) / steps, weight = Math.max(0, Math.min(1, (HILL_RX - Math.abs(x - church.x)) / 6));
    up.push([x, church.z + hillPathZ(x - church.x) * weight]);
  }
  list.push({ target: 'cemetery', points: up });
  const g = groveCentre(seed, gridW, gridD), side = coastSideOf(seed);
  if (side === 0) list.push({ target: 'grove', points: [[w + GATE_INSET, g.z], [g.x - GROVE_GATE_STOP, g.z]] });
  else if (side === 1) list.push({ target: 'grove', points: [[-GATE_INSET, g.z], [g.x + GROVE_GATE_STOP, g.z]] });
  else list.push({ target: 'grove', points: [[g.x, d + GATE_INSET], [g.x, g.z - GROVE_GATE_STOP]] });
  return list;
}
/** Path stones every STONE_SPACING m along each path and a lamp post every LAMP_SPACING m, alternating sides: the lit path network. */
export function landmarkPathDressing(seed, gridW, gridD) {
  const items = [];
  for (const path of landmarkPaths(seed, gridW, gridD)) {
    let travelled = 0, nextStone = 0, nextLamp = LAMP_SPACING / 2, lampCount = 0;
    for (let i = 0; i + 1 < path.points.length; i++) {
      const [x0, z0] = path.points[i], [x1, z1] = path.points[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 1e-9) continue;
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len, yaw = Math.atan2(-dz, dx);
      while (nextStone <= travelled + len) {
        const t = nextStone - travelled, x = x0 + dx * t, z = z0 + dz * t;
        items.push({ kind: 'path_stone', x, y: groundHeight(seed, gridW, gridD, x, z) + STONE_LIFT, z, yaw, scale: 1 });
        nextStone += STONE_SPACING;
      }
      while (nextLamp <= travelled + len) {
        const t = nextLamp - travelled, side = (lampCount++ % 2 === 0 ? 1 : -1) * LAMP_SIDE, x = x0 + dx * t - dz * side, z = z0 + dz * t + dx * side;
        items.push({ kind: 'lamp', x, y: groundHeight(seed, gridW, gridD, x, z), z, yaw: 0, scale: 1 });
        nextLamp += LAMP_SPACING;
      }
      travelled += len;
    }
  }
  return items;
}

/** Candidate spots (each with lean alternatives) of the lore book of a landmark place; empty for places that are not landmarks. */
export function landmarkBookSpots(place, seed, gridW, gridD, lateral) {
  const dir = cliffDir(seed, gridW, gridD), cliffEnd = cliffEndU(seed, gridW, gridD), marshEnd = marshEndU(seed, gridW, gridD);
  const onCoast = (u, v) => lateral.map((lat) => { const p = coastToWorldAt(seed, gridW, u + lat, v); return [p.x, p.z]; });
  if (place === 'cliffs') return [onCoast(cliffEnd + dir * CLIFF_ANCHOR_U, -1.2)];
  if (place === 'shipwreck') return [onCoast(marshEnd - dir * WRECK_ANCHOR_U, -1.2)];
  if (place === 'marsh') return [onCoast(marshEnd - dir * 6, -0.9)];
  if (place === 'abbey') { const a = abbeySite(seed, gridW, gridD); return [lateral.map((lx) => [a.x + a.faceZ * lx + a.faceX * -2.8, a.z - a.faceX * lx + a.faceZ * -2.8])]; }
  return [];
}
