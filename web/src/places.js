// Round 31 (spec 164): JS port of Core/VillagePlaces.cs. Golden key "villagePlaces". Pure, no DOM.
// The data file web/data/places.json is a byte copy of Packages/.../Data/places.json (tools/validate_repo.py and a test check it).
// Core is the source of truth: places are placed by the seed beside an anchor landmark, inside the walkable world, clear of every landmark, the city and each other,
// with a front door as the way in and a way back to the entrance point, and a tunnel that opens at the knowledge tier of Forbidden Texts.
import { SeededRandom } from './core.js';
import { INDEX_STEP } from './society.js';
import { LANDMARK_IDS, landmarks, landmarkPaths } from './landmarks.js';
import { walkBounds, CELL_M } from './dressing.js';
import { benefitsAt, realityDistortion } from './knowledge.js';

export const PLACE_LANGUAGES = ['en', 'fr'];
export const PLACE_CLUE_PREFIX = 'place@';
export const PLACE_PROMPT_IDS = ['enter', 'leave', 'hatch', 'sealed'];
export const KNOWLEDGE_SOURCE_IDS = ['journal', 'ritual', 'investigation', 'ruins', 'catacombs', 'mythos_event', 'cult_discovery'];
export const MANOR = 'manor', FOREST = 'forest', CATACOMB = 'catacomb', MINE = 'mine';
export const PLACE_STREAM = 0x504c43, TRAIL_STREAM = 0x545241, GRAPH_STREAM = 0x475248;
export const LANTERN_GAP = 4, LANTERN_REACH = 4, TRAIL_SPACING = 3, TRAIL_SIDE = 1.4, MAX_TRAIL_LENGTH = 36;
export const GAP = 2, RING_STEP = 4, MAX_DOOR_WALK = 6, RING_COUNT = 6, DIRECTION_COUNT = 8, TIERS = 3;
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
    const p = { id, anchor: str(o, 'anchor', who), radius: num(o, 'radius', who), name: text(o, who), budget: [], procedural: false, rooms: [], props: [], parts: [], discoveries: [], prompts: {}, huntingTrail: false, lanterns: [] };
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
    if (o.procedural !== undefined) { if (typeof o.procedural !== 'boolean') throw new Error(`places: ${who} procedural must be true or false`); p.procedural = o.procedural; }
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
      d.requires = ''; d.requiresBenefit = ''; d.requiresEffect = '';
      if (r.requires !== undefined) {
        d.requires = typeof r.requires === 'string' ? r.requires : '';
        if (!p.discoveries.some((e) => e.clue === d.requires)) throw new Error(`places: ${who} discovery ${d.id} requires unknown earlier clue ${d.requires}`);
      }
      if (r.requiresBenefit !== undefined) d.requiresBenefit = str(r, 'requiresBenefit', `${who} discovery`);
      if (r.requiresEffect !== undefined) d.requiresEffect = str(r, 'requiresEffect', `${who} discovery`);
      if (p.procedural && !GRAPH_ROLES.includes(d.room)) throw new Error(`places: ${who} discovery ${d.id} names a room that is no graph role: ${d.room}`);
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
const placeIndex = (id) => (id === MANOR ? 1 : id === FOREST ? 2 : id === CATACOMB ? 3 : id === MINE ? 4 : 5);

/** The placement at a given centre and facing with every point of the way in and back worked out. No validation: see checkPlacement. */
export function buildPlacement(data, seed, gridW, gridD, x, z, faceX, faceZ) {
  const p = { id: data.id, x, z, faceX, faceZ, radius: data.radius };
  p.entrance = toWorld(p, data.entrance.x, data.entrance.z);
  p.door = toWorld(p, data.door.x, data.door.z);
  p.hatch = toWorld(p, data.hatch.x, data.hatch.z);
  p.graph = data.procedural ? generateGraph(seed, placeIndex(data.id)) : null;
  if (p.graph) p.graph.theme = data.id;
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
// The seeded room graph of a procedural place. Mirrors PlaceGraph in Core/VillagePlaces.cs: integer cells, SeededRandom only, same draw order.
export const GRAPH_COLS = 3, GRAPH_ROWS = 3, GRAPH_PITCH = 3, GRAPH_MIN_ROOMS = 6, GRAPH_ENTRANCE_CELL = 1, ROOM_HALF = 1.2, CORRIDOR_HALF = 0.5;
export const ENTRANCE_ROLE = 'entrance', CHAMBER_ROLE = 'chamber', GRAPH_ROLES = ['texts', 'tear', 'prison'];
const neighbours = (cell) => {
  const c = cell % GRAPH_COLS, r = Math.floor(cell / GRAPH_COLS), out = [];
  if (r > 0) out.push(cell - GRAPH_COLS);
  if (c < GRAPH_COLS - 1) out.push(cell + 1);
  if (r < GRAPH_ROWS - 1) out.push(cell + GRAPH_COLS);
  if (c > 0) out.push(cell - 1);
  return out;
};
export const graphRoom = (g, cell) => g.rooms.find((r) => r.cell === cell) || null;
export const graphRoomWithRole = (g, role) => g.rooms.find((r) => r.role === role) || null;
export function generateGraph(seed, index) {
  const rng = new SeededRandom(seed ^ GRAPH_STREAM ^ Math.imul(index, INDEX_STEP));
  const target = GRAPH_MIN_ROOMS + rng.next(GRAPH_COLS * GRAPH_ROWS - GRAPH_MIN_ROOMS + 1);
  const g = { theme: CATACOMB, rooms: [], edges: [], loops: 0 }, present = new Array(GRAPH_COLS * GRAPH_ROWS).fill(false);
  const add = (cell, parent, depth) => g.rooms.push({ cell, x: ((cell % GRAPH_COLS) - 1) * GRAPH_PITCH, z: (1 - Math.floor(cell / GRAPH_COLS)) * GRAPH_PITCH, depth, parent, role: CHAMBER_ROLE });
  add(GRAPH_ENTRANCE_CELL, -1, 0); present[GRAPH_ENTRANCE_CELL] = true;
  while (g.rooms.length < target) {
    const candidates = [];
    for (const room of g.rooms) for (const n of neighbours(room.cell)) if (!present[n]) candidates.push([room.cell, n]);
    const pick = candidates[rng.next(candidates.length)];
    g.edges.push(pick); add(pick[1], pick[0], graphRoom(g, pick[0]).depth + 1); present[pick[1]] = true;
  }
  const hasEdge = (a, b) => g.edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  const loops = [];
  for (let a = 0; a < present.length; a++) { if (!present[a]) continue; for (const b of neighbours(a)) if (b > a && present[b] && !hasEdge(a, b)) loops.push([a, b]); }
  const addLoop = rng.next(2) === 1;
  if (addLoop && loops.length > 0) { g.edges.push(loops[rng.next(loops.length)]); g.loops = 1; }
  graphRoom(g, GRAPH_ENTRANCE_CELL).role = ENTRANCE_ROLE;
  for (const role of ['prison', 'tear', 'texts']) {
    let best = null;
    for (const r of g.rooms) { if (r.role !== CHAMBER_ROLE) continue; if (!best || r.depth > best.depth || (r.depth === best.depth && r.cell < best.cell)) best = r; }
    best.role = role;
  }
  return g;
}
/** Every room can be reached from the entrance room along the corridors. */
export function graphConnected(g) {
  const seen = new Set([GRAPH_ENTRANCE_CELL]), queue = [GRAPH_ENTRANCE_CELL];
  while (queue.length) { const cell = queue.shift(); for (const e of g.edges) { const other = e[0] === cell ? e[1] : e[1] === cell ? e[0] : -1; if (other >= 0 && !seen.has(other)) { seen.add(other); queue.push(other); } } }
  return seen.size === g.rooms.length;
}
/** The cells from a room back to the entrance room, both included; empty when the cell is no room. */
export function graphPathBack(g, cell) {
  const path = []; let room = graphRoom(g, cell);
  while (room) { path.push(room.cell); room = room.parent < 0 ? null : graphRoom(g, room.parent); }
  return path;
}
/** One line naming the whole graph for a seed (debugging and golden). */
export const graphDump = (g, seed) => `${g.theme} seed=${seed} rooms=${g.rooms.length} loops=${g.loops} |${g.rooms.map((r) => ` c${r.cell}@(${r.x},${r.z})d${r.depth} ${r.role};`).join('')} |${g.edges.map((e) => ` ${e[0]}-${e[1]}`).join('')}`;
const box = (id, x0, x1, z0, z1, y0, y1, color, glow, tier) => ({ id, x0, x1, z0, z1, y0, y1, taper: 1, color, glow, tier });
const corridor = (g, e, prefix, y0, y1, color, tier) => {
  const a = graphRoom(g, e[0]), c = graphRoom(g, e[1]), id = `${prefix}${e[0]}_${e[1]}`;
  if (a.x === c.x) return box(id, a.x - CORRIDOR_HALF, a.x + CORRIDOR_HALF, Math.min(a.z, c.z) + ROOM_HALF, Math.max(a.z, c.z) - ROOM_HALF, y0, y1, color, 0, tier);
  return box(id, Math.min(a.x, c.x) + ROOM_HALF, Math.max(a.x, c.x) - ROOM_HALF, a.z - CORRIDOR_HALF, a.z + CORRIDOR_HALF, y0, y1, color, 0, tier);
};
/** The graph's own geometry in the local frame: floors, corridor floors, role markers (tier 0), pillars (tier 1), lintels and embers (tier 2). */
export function graphParts(g) {
  if (g.theme === MINE) return mineParts(g);
  const parts = [];
  for (const r of g.rooms) parts.push(box(`floor_${r.cell}`, r.x - ROOM_HALF, r.x + ROOM_HALF, r.z - ROOM_HALF, r.z + ROOM_HALF, 0, 0.04, [0.11, 0.1, 0.12], 0, 0));
  for (const e of g.edges) parts.push(corridor(g, e, 'corridor_', 0, 0.04, [0.09, 0.08, 0.1], 0));
  for (const r of g.rooms) {
    if (r.role === 'texts') parts.push(box(`lectern_${r.cell}`, r.x - 0.3, r.x + 0.3, r.z + 0.5, r.z + 1.0, 0, 0.9, [0.2, 0.15, 0.1], 0, 0));
    else if (r.role === 'tear') parts.push(box(`tear_${r.cell}`, r.x - 0.5, r.x + 0.5, r.z + 0.75, r.z + 0.85, 0.2, 2.2, [0.35, 0.9, 0.8], 1, 0));
    else if (r.role === 'prison') parts.push(box(`cage_${r.cell}`, r.x + 0.35, r.x + 0.95, r.z - 0.95, r.z - 0.35, 0, 1.8, [0.1, 0.1, 0.12], 0, 0));
  }
  for (const r of g.rooms) {
    parts.push(box(`pillar_a_${r.cell}`, r.x - 1.1, r.x - 0.85, r.z - 1.1, r.z - 0.85, 0, 2.4, [0.18, 0.17, 0.19], 0, 1));
    parts.push(box(`pillar_b_${r.cell}`, r.x + 0.85, r.x + 1.1, r.z + 0.85, r.z + 1.1, 0, 2.4, [0.18, 0.17, 0.19], 0, 1));
  }
  for (const e of g.edges) parts.push(corridor(g, e, 'lintel_', 1.9, 2.1, [0.16, 0.15, 0.17], 2));
  for (const r of g.rooms) parts.push(box(`ember_${r.cell}`, r.x - 0.95, r.x - 0.8, r.z + 0.8, r.z + 0.95, 0, 0.2, [0.9, 0.5, 0.2], 1, 2));
  return parts;
}

/** The mine's geometry, same part counts per tier as the catacomb: rock and tunnel floors, a crystal spire (veins), a sheet of black water (lake), a rockfall (deep end), timber props, beams and small crystals. Mirrors PlaceGraph.MineParts. */
function mineParts(g) {
  const parts = [], pyramid = (p) => { p.taper = 0; return p; };
  for (const r of g.rooms) parts.push(box(`rock_${r.cell}`, r.x - ROOM_HALF, r.x + ROOM_HALF, r.z - ROOM_HALF, r.z + ROOM_HALF, 0, 0.04, [0.12, 0.11, 0.1], 0, 0));
  for (const e of g.edges) parts.push(corridor(g, e, 'tunnel_', 0, 0.04, [0.1, 0.09, 0.08], 0));
  for (const r of g.rooms) {
    if (r.role === 'texts') parts.push(pyramid(box(`vein_${r.cell}`, r.x - 0.5, r.x + 0.5, r.z + 0.4, r.z + 1.0, 0, 2.0, [0.45, 0.35, 0.95], 1, 0)));
    else if (r.role === 'tear') parts.push(box(`lake_${r.cell}`, r.x - 1.1, r.x + 1.1, r.z - 1.1, r.z + 1.1, 0.04, 0.1, [0.04, 0.12, 0.2], 1, 0));
    else if (r.role === 'prison') parts.push(pyramid(box(`rockfall_${r.cell}`, r.x - 0.8, r.x + 0.8, r.z - 0.9, r.z - 0.2, 0, 1.6, [0.14, 0.13, 0.12], 0, 0)));
  }
  for (const r of g.rooms) {
    parts.push(box(`prop_a_${r.cell}`, r.x - 1.1, r.x - 0.9, r.z - 1.1, r.z - 0.9, 0, 2.2, [0.25, 0.17, 0.1], 0, 1));
    parts.push(box(`prop_b_${r.cell}`, r.x + 0.9, r.x + 1.1, r.z + 0.9, r.z + 1.1, 0, 2.2, [0.25, 0.17, 0.1], 0, 1));
  }
  for (const e of g.edges) parts.push(corridor(g, e, 'beam_', 1.9, 2.1, [0.22, 0.15, 0.09], 2));
  for (const r of g.rooms) parts.push(pyramid(box(`crystal_${r.cell}`, r.x - 0.95, r.x - 0.75, r.z + 0.75, r.z + 0.95, 0, 0.5, [0.5, 0.4, 1.0], 1, 2)));
  return parts;
}

export const trianglesOf = (part) => (part.taper > 0 ? 10 : 8);
/** Triangles of the place's own geometry at a graphics tier (0 low, 1 medium, 2 high). */
export const triangles = (data, tier) => data.parts.reduce((n, part) => n + (part.tier <= tier ? trianglesOf(part) : 0), 0);
export const withinBudget = (data, tier) => triangles(data, tier) <= data.budget[tier];
/** Triangles at a tier of the authored parts plus the placement's room graph parts. */
export const totalTriangles = (data, p, tier) => triangles(data, tier) + (p && p.graph ? graphParts(p.graph).reduce((n, part) => n + (part.tier <= tier ? trianglesOf(part) : 0), 0) : 0);

/** Why a placement is not acceptable, or '' when it is. Mirrors VillagePlaces.Check. */
export function checkPlacement(data, p, seed, gridW, gridD, placed = null) {
  if (!inBounds(p, seed, gridW, gridD)) return 'out of bounds';
  const landmark = overlappingLandmark(p, seed, gridW, gridD);
  if (landmark) return `overlaps landmark ${landmark}`;
  if (overlapsCity(p, gridW, gridD)) return 'overlaps the city';
  const other = overlappingPlace(p, placed);
  if (other) return `overlaps place ${other}`;
  if (!roundTrip(p)) return 'no way back';
  for (let t = 0; t < TIERS; t++) if (totalTriangles(data, p, t) > data.budget[t]) return `over the triangle budget at tier ${t}`;
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
export const discoveryPoint = (p, d) => {
  const room = p.graph ? graphRoomWithRole(p.graph, d.room) : null;
  return room ? toWorld(p, room.x, room.z) : toWorld(p, d.x, d.z);
};
/** Whether a discovery can be found at a knowledge tier on a night: its clue is on the board, the tier unlocks its benefit and its effect is among tonight's reality distortions. knowledge is the parsed knowledge library. */
export function revealedAt(d, clueIds, knowledge, seed, night, tier) {
  if (!revealed(d, clueIds)) return false;
  if (d.requiresBenefit && (!knowledge || !benefitsAt(knowledge, tier).includes(d.requiresBenefit))) return false;
  if (d.requiresEffect && (!knowledge || !realityDistortion(knowledge, seed, night, tier).includes(d.requiresEffect))) return false;
  return true;
}

/** The procedural boxes drawn at a graphics tier, as world rectangles { x0, x1, z0, z1, y0, y1, taper, color, glow } (the facing is a cardinal, so each stays axis aligned). */
export function placeParts(data, p, tier) {
  const out = [];
  for (const part of data.parts.concat(p.graph ? graphParts(p.graph) : [])) {
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
