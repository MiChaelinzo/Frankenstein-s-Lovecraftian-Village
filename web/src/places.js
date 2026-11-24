// Round 31 (spec 164): JS port of Core/VillagePlaces.cs. Golden key "villagePlaces". Pure, no DOM.
// The data file web/data/places.json is a byte copy of Packages/.../Data/places.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: places are placed by the seed beside an anchor landmark, inside the walkable world, clear of every landmark, the city and each other,
// with a front door as the way in and a way back to the entrance point, and a tunnel that opens at the knowledge tier of Forbidden Texts.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';
import { LANDMARK_IDS, landmarks, landmarkPaths } from './landmarks.js';
import { walkBounds, CELL_M } from './dressing.js';

export const PLACE_LANGUAGES = ['en', 'fr'];
export const PLACE_CLUE_PREFIX = 'place@';
export const PLACE_PROMPT_IDS = ['enter', 'leave', 'hatch', 'sealed'];
export const KNOWLEDGE_SOURCE_IDS = ['journal', 'ritual', 'investigation', 'ruins', 'catacombs', 'mythos_event', 'cult_discovery'];
export const MANOR = 'manor', FOREST = 'forest';
export const PLACE_STREAM = 0x504c43, TRAIL_STREAM = 0x545241;
export const LANTERN_GAP = 4, LANTERN_REACH = 4, TRAIL_SPACING = 3, TRAIL_SIDE = 1.4, MAX_TRAIL_LENGTH = 36;
export const GAP = 2, RING_STEP = 4, MAX_DOOR_WALK = 6, RING_COUNT = 4, DIRECTION_COUNT = 8, TIERS = 3;
const DIAG = Math.sqrt(0.5);
const DIRECTIONS = [[1, 0], [DIAG, DIAG], [0, 1], [-DIAG, DIAG], [-1, 0], [-DIAG, -DIAG], [0, -1], [DIAG, -DIAG]];

const text = (o, owner) => {
  const t = {};
  for (const lang of PLACE_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`places: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
};
const objects = (o, key) => {
  if (!Array.isArray(o[key])) throw new Error(`places: missing ${key} array`);
  for (const item of o[key]) if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`places: ${key} holds a non-object`);
  return o[key];
};
const sub = (o, key, owner) => { if (!o[key] || typeof o[key] !== 'object' || Array.isArray(o[key])) throw new Error(`places: ${owner} lacks ${key} object`); return o[key]; };
const str = (o, key, owner) => { if (typeof o[key] !== 'string' || !o[key]) throw new Error(`places: ${owner} lacks ${key}`); return o[key]; };
const num = (o, key, owner) => { if (typeof o[key] !== 'number') throw new Error(`places: ${owner} lacks number ${key}`); return o[key]; };

/** Parses the data file (object or text). Throws an Error naming the offending field when it is malformed. Mirrors PlaceLibrary.Parse. */
export function parsePlaceLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('places: root is not an object');
  const lib = { places: [] };
  for (const o of objects(root, 'places')) {
    const id = str(o, 'id', 'place'), who = `place ${id}`;
    if (lib.places.some((p) => p.id === id)) throw new Error(`places: duplicate place id ${id}`);
    const p = { id, anchor: str(o, 'anchor', who), radius: num(o, 'radius', who), name: text(o, who), budget: [], rooms: [], props: [], parts: [], discoveries: [], prompts: {}, huntingTrail: false, lanterns: [] };
    if (!LANDMARK_IDS.includes(p.anchor)) throw new Error(`places: ${who} has unknown anchor landmark ${p.anchor}`);
    if (p.radius <= 0) throw new Error(`places: ${who} radius must be above 0`);
    const budget = sub(o, 'budget', who);
    ['low', 'medium', 'high'].forEach((k, t) => {
      p.budget.push(Math.trunc(num(budget, k, `${who} budget`)));
      if (p.budget[t] <= 0 || (t > 0 && p.budget[t] < p.budget[t - 1])) throw new Error(`places: ${who} budget must be above 0 and not fall with the tier`);
    });
    const entrance = sub(o, 'entrance', who), door = sub(o, 'door', who);
    p.entrance = { x: num(entrance, 'x', `${who} entrance`), z: num(entrance, 'z', `${who} entrance`) };
    p.door = { x: num(door, 'x', `${who} door`), z: num(door, 'z', `${who} door`) };
    const prompts = sub(o, 'prompts', who);
    for (const k of PLACE_PROMPT_IDS) p.prompts[k] = text(sub(prompts, k, `${who} prompts`), `${who} prompt ${k}`);
    const tunnel = sub(o, 'tunnel', who), hatch = sub(tunnel, 'hatch', `${who} tunnel`);
    p.hatch = { x: num(hatch, 'x', `${who} hatch`), z: num(hatch, 'z', `${who} hatch`) };
    p.tunnelBenefit = str(tunnel, 'requiresBenefit', `${who} tunnel`);
    p.tunnelExitsTo = str(tunnel, 'exitsTo', `${who} tunnel`);
    if (!LANDMARK_IDS.includes(p.tunnelExitsTo)) throw new Error(`places: ${who} tunnel exits to unknown landmark ${p.tunnelExitsTo}`);
    p.tunnelFound = text(sub(tunnel, 'found', `${who} tunnel`), `${who} tunnel found`);
    if (o.huntingTrail !== undefined) { if (typeof o.huntingTrail !== 'boolean') throw new Error(`places: ${who} huntingTrail must be true or false`); p.huntingTrail = o.huntingTrail; }
    if (o.lanterns !== undefined) {
      for (const r of objects(o, 'lanterns')) p.lanterns.push([num(r, 'x', `${who} lantern`), num(r, 'z', `${who} lantern`)]);
      for (let i = 1; i < p.lanterns.length; i++) if (Math.hypot(p.lanterns[i][0] - p.lanterns[i - 1][0], p.lanterns[i][1] - p.lanterns[i - 1][1]) > LANTERN_GAP) throw new Error(`places: ${who} lanterns are more than ${LANTERN_GAP} m apart`);
      const last = p.lanterns[p.lanterns.length - 1];
      if (last && Math.hypot(last[0] - p.entrance.x, last[1] - p.entrance.z) > LANTERN_GAP) throw new Error(`places: ${who} lantern trail does not reach the entrance`);
    }
    for (const r of objects(o, 'rooms')) {
      const room = { id: str(r, 'id', `${who} room`), x: num(r, 'x', `${who} room`), z: num(r, 'z', `${who} room`), halfX: num(r, 'halfX', `${who} room`), halfZ: num(r, 'halfZ', `${who} room`) };
      if (p.rooms.some((x) => x.id === room.id)) throw new Error(`places: ${who} lists room ${room.id} twice`);
      if (room.halfX <= 0 || room.halfZ <= 0) throw new Error(`places: ${who} room ${room.id} needs a positive size`);
      p.rooms.push(room);
    }
    if (!p.rooms.length) throw new Error(`places: ${who} needs rooms`);
    for (const r of objects(o, 'props')) p.props.push({ kind: str(r, 'kind', `${who} prop`), x: num(r, 'x', `${who} prop`), z: num(r, 'z', `${who} prop`), yaw: num(r, 'yaw', `${who} prop`) });
    for (const r of objects(o, 'parts')) {
      const part = { id: str(r, 'id', `${who} part`), x0: num(r, 'x0', `${who} part`), x1: num(r, 'x1', `${who} part`), z0: num(r, 'z0', `${who} part`), z1: num(r, 'z1', `${who} part`),
        y0: num(r, 'y0', `${who} part`), y1: num(r, 'y1', `${who} part`), taper: num(r, 'taper', `${who} part`), glow: Math.trunc(num(r, 'glow', `${who} part`)), tier: Math.trunc(num(r, 'tier', `${who} part`)), color: r.color };
      if (!Array.isArray(part.color) || part.color.length !== 3 || part.color.some((c) => typeof c !== 'number')) throw new Error(`places: ${who} part ${part.id} needs a color of three numbers`);
      if (part.x1 <= part.x0 || part.z1 <= part.z0 || part.y1 <= part.y0) throw new Error(`places: ${who} part ${part.id} has an empty box`);
      if (part.tier < 0 || part.tier > 2) throw new Error(`places: ${who} part ${part.id} tier must be 0 to 2`);
      if (part.taper < 0) throw new Error(`places: ${who} part ${part.id} taper must not be negative`);
      p.parts.push(part);
    }
    for (const r of objects(o, 'discoveries')) {
      const d = { id: str(r, 'id', `${who} discovery`), room: str(r, 'room', `${who} discovery`), x: num(r, 'x', `${who} discovery`), z: num(r, 'z', `${who} discovery`), clue: str(r, 'clue', `${who} discovery`),
        source: str(r, 'source', `${who} discovery`), statement: str(r, 'statement', `${who} discovery`), title: text(r, `${who} discovery`), text: text(sub(r, 'text', `${who} discovery`), `${who} discovery text`) };
      if (typeof r.lead !== 'boolean') throw new Error(`places: ${who} discovery ${d.id} lacks lead`);
      d.lead = r.lead;
      d.requires = '';
      if (r.requires !== undefined) {
        d.requires = typeof r.requires === 'string' ? r.requires : '';
        if (!p.discoveries.some((e) => e.clue === d.requires)) throw new Error(`places: ${who} discovery ${d.id} requires unknown earlier clue ${d.requires}`);
      }
      if (!d.clue.startsWith(PLACE_CLUE_PREFIX)) throw new Error(`places: ${who} discovery ${d.id} clue must start with ${PLACE_CLUE_PREFIX}`);
      if (lib.places.some((x) => x.discoveries.some((y) => y.clue === d.clue)) || p.discoveries.some((y) => y.clue === d.clue)) throw new Error(`places: duplicate clue id ${d.clue}`);
      if (!KNOWLEDGE_SOURCE_IDS.includes(d.source)) throw new Error(`places: ${who} discovery ${d.id} has unknown knowledge source ${d.source}`);
      const room = p.rooms.find((x) => x.id === d.room);
      if (!room) throw new Error(`places: ${who} discovery ${d.id} names unknown room ${d.room}`);
      if (Math.abs(d.x - room.x) > room.halfX || Math.abs(d.z - room.z) > room.halfZ) throw new Error(`places: ${who} discovery ${d.id} lies outside its room`);
      p.discoveries.push(d);
    }
    if (!p.discoveries.length) throw new Error(`places: ${who} needs discoveries`);
    lib.places.push(p);
  }
  if (!lib.places.length) throw new Error('places: places must not be empty');
  return lib;
}

export const findPlace = (lib, id) => lib.places.find((p) => p.id === id) || null;
/** The discovery that records a clue id, or null. */
export const findByClue = (lib, clueId) => { for (const p of lib.places) for (const d of p.discoveries) if (d.clue === clueId) return d; return null; };

/** A point in the place's local frame (right, forward) as a world point [x, z]. */
export const toWorld = (p, lx, lz) => [p.x + p.faceZ * lx + p.faceX * lz, p.z - p.faceX * lx + p.faceZ * lz];
const placeIndex = (id) => (id === MANOR ? 1 : id === FOREST ? 2 : 3);

/** The placement at a given centre and facing with every point of the way in and back worked out. No validation: see checkPlacement. */
export function buildPlacement(data, seed, gridW, gridD, x, z, faceX, faceZ) {
  const p = { id: data.id, x, z, faceX, faceZ, radius: data.radius };
  p.entrance = toWorld(p, data.entrance.x, data.entrance.z);
  p.door = toWorld(p, data.door.x, data.door.z);
  p.hatch = toWorld(p, data.hatch.x, data.hatch.z);
  const target = landmarks(seed, gridW, gridD).find((l) => l.id === data.tunnelExitsTo);
  let dx = x - target.x, dz = z - target.z, len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) { dx = 1; dz = 0; len = 1; }
  p.tunnelExit = [target.x + (dx / len) * target.radius * 0.5, target.z + (dz / len) * target.radius * 0.5];
  return p;
}

export function pointInBounds(seed, gridW, gridD, x, z) { const b = walkBounds(seed, gridW, gridD); return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ; }
export function inBounds(p, seed, gridW, gridD) {
  const b = walkBounds(seed, gridW, gridD);
  if (p.x - p.radius < b.minX || p.x + p.radius > b.maxX || p.z - p.radius < b.minZ || p.z + p.radius > b.maxZ) return false;
  return [p.entrance, p.door, p.hatch, p.tunnelExit].every((pt) => pointInBounds(seed, gridW, gridD, pt[0], pt[1]));
}
export function overlappingLandmark(p, seed, gridW, gridD) {
  for (const l of landmarks(seed, gridW, gridD)) if (Math.sqrt((p.x - l.x) ** 2 + (p.z - l.z) ** 2) < l.radius + p.radius) return l.id;
  return null;
}
export function overlapsCity(p, gridW, gridD) {
  const w = gridW * CELL_M, d = gridD * CELL_M, nx = Math.max(0, Math.max(-p.x, p.x - w)), nz = Math.max(0, Math.max(-p.z, p.z - d));
  return Math.sqrt(nx * nx + nz * nz) < p.radius;
}
export function overlappingPlace(p, placed) {
  for (const o of placed || []) { if (o.id !== p.id && Math.sqrt((p.x - o.x) ** 2 + (p.z - o.z) ** 2) < o.radius + p.radius) return o.id; }
  return null;
}
/** Enter: the walker goes from the entrance point to just inside the door. */
export const enterPlace = (p) => p.door;
export const EXIT_DOOR = 0, EXIT_TUNNEL = 1;
/** Leave by the door (back to the entrance point) or by the tunnel (where it comes up). */
export const leavePlace = (p, exit) => (exit === EXIT_TUNNEL ? p.tunnelExit : p.entrance);
export function roundTrip(p) {
  const inside = enterPlace(p), back = leavePlace(p, EXIT_DOOR);
  if (back[0] !== p.entrance[0] || back[1] !== p.entrance[1]) return false;
  const walk = Math.sqrt((p.entrance[0] - inside[0]) ** 2 + (p.entrance[1] - inside[1]) ** 2);
  return walk > 0 && walk <= MAX_DOOR_WALK;
}
export const trianglesOf = (part) => (part.taper > 0 ? 10 : 8);
/** Triangles of the place's own geometry at a graphics tier (0 low, 1 medium, 2 high). */
export const triangles = (data, tier) => data.parts.reduce((n, part) => n + (part.tier <= tier ? trianglesOf(part) : 0), 0);
export const withinBudget = (data, tier) => triangles(data, tier) <= data.budget[tier];

/** Why a placement is not acceptable, or '' when it is. Mirrors VillagePlaces.Check. */
export function checkPlacement(data, p, seed, gridW, gridD, placed = null) {
  if (!inBounds(p, seed, gridW, gridD)) return 'out of bounds';
  const landmark = overlappingLandmark(p, seed, gridW, gridD);
  if (landmark) return `overlaps landmark ${landmark}`;
  if (overlapsCity(p, gridW, gridD)) return 'overlaps the city';
  const other = overlappingPlace(p, placed);
  if (other) return `overlaps place ${other}`;
  if (!roundTrip(p)) return 'no way back';
  for (let t = 0; t < TIERS; t++) if (!withinBudget(data, t)) return `over the triangle budget at tier ${t}`;
  return '';
}

/** Places a place in the village of the seed: the first accepted candidate on rings around the anchor landmark. Throws when nothing fits. Mirrors VillagePlaces.Place. */
export function placePlace(data, seed, gridW, gridD, placed = null) {
  const anchor = landmarks(seed, gridW, gridD).find((l) => l.id === data.anchor);
  if (!anchor) throw new Error(`places: ${data.id} has no anchor landmark ${data.anchor}`);
  const start = new SeededRandom(seed ^ PLACE_STREAM ^ Math.imul(placeIndex(data.id), INDEX_STEP)).next(DIRECTION_COUNT);
  let last = '';
  for (let ring = 0; ring < RING_COUNT; ring++) {
    const dist = anchor.radius + data.radius + GAP + ring * RING_STEP;
    for (let k = 0; k < DIRECTION_COUNT; k++) {
      const dir = DIRECTIONS[(start + k) % DIRECTION_COUNT], x = anchor.x + dir[0] * dist, z = anchor.z + dir[1] * dist, tx = anchor.x - x, tz = anchor.z - z;
      let fx = 0, fz = 0;
      if (Math.abs(tx) >= Math.abs(tz)) fx = tx < 0 ? -1 : 1; else fz = tz < 0 ? -1 : 1;
      const p = buildPlacement(data, seed, gridW, gridD, x, z, fx, fz);
      last = checkPlacement(data, p, seed, gridW, gridD, placed);
      if (!last) return p;
    }
  }
  throw new Error(`places: ${data.id} fits nowhere around ${data.anchor} (last failure: ${last})`);
}

/** The props as dressing items (existing kinds, so collision and meshes come from dressing.js), world frame. */
export function placeDressing(data, p) {
  const yaw = Math.atan2(p.faceX, p.faceZ);
  return data.props.map((prop) => { const w = toWorld(p, prop.x, prop.z); return { kind: prop.kind, x: w[0], y: 0, z: w[1], yaw: yaw + prop.yaw, scale: 1 }; });
}
/** The lantern markers in the world frame, deepest first: following them in order leads back to the entrance. */
export const lanternPoints = (data, p) => data.lanterns.map((l) => toWorld(p, l[0], l[1]));

/** The hunting trail marker points: from the nearest point of the lit paths to the entrance, one every TRAIL_SPACING m, at most MAX_TRAIL_LENGTH m, inside the walkable world. Mirrors VillagePlaces.HuntingTrail. */
export function huntingTrail(data, p, seed, gridW, gridD) {
  const pts = [];
  if (!data.huntingTrail) return pts;
  let best = Infinity, bx = 0, bz = 0;
  const ex = p.entrance[0], ez = p.entrance[1];
  for (const path of landmarkPaths(seed, gridW, gridD)) {
    for (let i = 0; i + 1 < path.points.length; i++) {
      const x0 = path.points[i][0], z0 = path.points[i][1], sx = path.points[i + 1][0] - x0, sz = path.points[i + 1][1] - z0, len2 = sx * sx + sz * sz;
      const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((ex - x0) * sx + (ez - z0) * sz) / len2));
      const qx = x0 + sx * t, qz = z0 + sz * t, d = (ex - qx) * (ex - qx) + (ez - qz) * (ez - qz);
      if (d < best) { best = d; bx = qx; bz = qz; }
    }
  }
  let dx = ex - bx, dz = ez - bz;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 1e-9) return pts;
  dx /= length; dz /= length;
  const start = Math.max(0, length - MAX_TRAIL_LENGTH);
  for (let n = 0; start + n * TRAIL_SPACING < length - TRAIL_SPACING * 0.5; n++) {
    const s = start + n * TRAIL_SPACING, x = bx + dx * s, z = bz + dz * s;
    if (pointInBounds(seed, gridW, gridD, x, z)) pts.push([x, z]);
  }
  return pts;
}
/** The hunting trail as dressing items: a rock and a stump in turn, on alternate sides of the line. */
export function trailDressing(data, p, seed, gridW, gridD) {
  const items = [], pts = huntingTrail(data, p, seed, gridW, gridD);
  for (let n = 0; n < pts.length; n++) {
    const side = (n % 2 === 0 ? 1 : -1) * TRAIL_SIDE, dx = p.entrance[0] - pts[n][0], dz = p.entrance[1] - pts[n][1], len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-9) continue;
    items.push({ kind: n % 2 === 0 ? 'rock' : 'stump', x: pts[n][0] - (dz / len) * side, y: 0, z: pts[n][1] + (dx / len) * side, yaw: n * 0.7, scale: 1 });
  }
  return items;
}
/** Whether a discovery can be found: no earlier clue needed, or that clue is in the Set clueIds. */
export const revealed = (d, clueIds) => !d.requires || !!(clueIds && clueIds.has(d.requires));
export const discoveryPoint = (p, d) => toWorld(p, d.x, d.z);

/** The procedural boxes drawn at a graphics tier, as world rectangles { x0, x1, z0, z1, y0, y1, taper, color, glow } (the facing is a cardinal, so each stays axis aligned). */
export function placeParts(data, p, tier) {
  const out = [];
  for (const part of data.parts) {
    if (part.tier > tier) continue;
    const a = toWorld(p, part.x0, part.z0), b = toWorld(p, part.x1, part.z1);
    out.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), y0: part.y0, y1: part.y1, taper: part.taper, color: part.color, glow: part.glow });
  }
  return out;
}

/** The hidden tunnel opens once the knowledge tier unlocks the benefit the place names. benefits is the list from knowledge.js benefitsAt. */
export const tunnelOpen = (data, benefits) => benefits.includes(data.tunnelBenefit);
/** The knowledge source a place clue earns, or null. */
export const sourceOfClue = (lib, clueId) => { const d = lib ? findByClue(lib, clueId) : null; return d ? d.source : null; };
/** The missing person (index) whose trail a place's lead belongs to, -1 when there are none. */
export function trailMissing(seed, placeId, missingCount) {
  if (missingCount <= 0) return -1;
  return new SeededRandom(seed ^ TRAIL_STREAM ^ Math.imul(placeIndex(placeId), INDEX_STEP)).next(missingCount);
}
/** Leads the found place clues give on one missing person. */
export function leadsFor(lib, clueIds, seed, missingCount, missingIndex) {
  if (!lib || !clueIds) return 0;
  let leads = 0;
  for (const place of lib.places) {
    if (trailMissing(seed, place.id, missingCount) !== missingIndex) continue;
    for (const d of place.discoveries) if (d.lead && clueIds.has(d.clue)) leads++;
  }
  return leads;
}
