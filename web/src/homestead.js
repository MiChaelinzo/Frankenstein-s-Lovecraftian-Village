// Mirror of Core/HomesteadRules.cs (golden-checked, key "homestead"): the homestead data file, the plot beside the lodging house, crops that grow by village day, needs and mood of the
// animals and pets, harvest and produce into the player's inventory, and the save string. Pure, no DOM. web/data/homestead.json is a byte copy of Packages/.../Data/homestead.json.
import { landmarkDressing, landmarkPathDressing } from './landmarks.js';
import { composeDressing, dressingBoxes, plotEdgeOffsets } from './dressing.js';
import { isBlocked, HOUSE_BOOK_OFFSET } from './lore.js';
import { facingYaw } from './streets.js';
import { dayNumber, MINUTES_PER_DAY } from './clock.js';
import { CELL_M } from './dressing.js';

export const CROP_KINDS = ['normal', 'eldritch'], RESIDENT_GROUPS = ['animal', 'pet'], HOMESTEAD_LANGUAGES = ['en', 'fr'];
export const BED_COLS = 3, BED_ROWS = 2, BED_COUNT = BED_COLS * BED_ROWS, STRUCTURE_SLOTS = 4, MAX_RESIDENTS = 6, MAX_FLOCK = 3;
export const MAX_GROW_DAYS = 8, MAX_YIELD = 4, MAX_COST = 6, MAX_FED_DAYS = 4, MAX_MOOD_SANITY = 3;
export const STAGE_PLANTED = 0, STAGE_SPROUT = 1, STAGE_RIPE = 2;
export const BLIGHT_LEVEL = 3, ELDRITCH_BONUS = 1, SEED_BACK = 1, FED_GOOD = 50, FED_FULL = 90, DAILY_SANITY_CAP = 6, MAX_SAVED_NUMBER = 100000000;
export const BUILD_ITEM = 'timber', SCARECROW_ID = 'scarecrow', TROUGH_ID = 'trough';
export const BED_SPACING = 1.1, SLOT_SPACING = 1.5, RESIDENT_SPACING = 1.2, SLOT_FORWARD = 2.6, RESIDENT_FORWARD = 3.9;
export const PLOT_SIDES = [1, -1], PLOT_AHEAD = [2.2, 3.4, 5.0], PLOT_LATERAL = [0.0, 4.0, -4.0, 8.0, -8.0, 12.0, -12.0];

/** Parses the data file (object or text) against the item catalog. Throws an Error naming the offending entry when it is malformed. */
export function parseHomesteadCatalog(input, items) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('homestead: not an object');
  const arr = (k) => { if (!Array.isArray(root[k])) throw new Error(`homestead: missing ${k} array`); return root[k]; };
  const str = (o, k, owner) => { if (typeof o[k] !== 'string' || !o[k]) throw new Error(`homestead: ${owner} lacks ${k}`); return o[k]; };
  const num = (o, k, owner) => { if (typeof o[k] !== 'number') throw new Error(`homestead: ${owner} lacks number ${k}`); return Math.trunc(o[k]); };
  const texts = (o, id) => {
    const names = {}, tx = {};
    for (const l of HOMESTEAD_LANGUAGES) { const t = o[l]; if (!t || typeof t !== 'object') throw new Error(`homestead: ${id} lacks language ${l}`); names[l] = str(t, 'name', id); tx[l] = str(t, 'text', id); }
    return { names, texts: tx };
  };
  const starter = arr('starter').map((o) => {
    const item = str(o, 'item', 'starter'), count = num(o, 'count', 'starter');
    if (!items.find(item) || count < 1) throw new Error(`homestead: starter has unknown item ${item} or a count below 1`);
    return { id: item, count };
  });
  const crops = [];
  for (const o of arr('crops')) {
    const id = str(o, 'id', 'crops');
    if (crops.some((c) => c.id === id)) throw new Error(`homestead: duplicate crop ${id}`);
    const kind = str(o, 'kind', id);
    if (!CROP_KINDS.includes(kind)) throw new Error(`homestead: ${id} has unknown kind ${kind}`);
    const seed = str(o, 'seed', id), harvest = str(o, 'harvest', id);
    if (!items.find(seed) || !items.find(harvest)) throw new Error(`homestead: ${id} names an unknown item`);
    const growDays = num(o, 'growDays', id), yld = num(o, 'yield', id);
    if (growDays < 2 || growDays > MAX_GROW_DAYS) throw new Error(`homestead: ${id} needs growDays in 2..${MAX_GROW_DAYS}`);
    if (yld < 1 || yld > MAX_YIELD) throw new Error(`homestead: ${id} needs a yield in 1..${MAX_YIELD}`);
    crops.push({ id, kind, seedItem: seed, harvestItem: harvest, growDays, yield: yld, ...texts(o, id) });
  }
  const structures = [];
  for (const o of arr('structures')) {
    const id = str(o, 'id', 'structures');
    if (structures.some((s) => s.id === id)) throw new Error(`homestead: duplicate structure ${id}`);
    const cost = num(o, 'cost', id);
    if (cost < 1 || cost > MAX_COST) throw new Error(`homestead: ${id} needs a cost in 1..${MAX_COST}`);
    structures.push({ id, cost, ...texts(o, id) });
  }
  if (structures.length > STRUCTURE_SLOTS) throw new Error(`homestead: more than ${STRUCTURE_SLOTS} structures`);
  const residents = [];
  for (const o of arr('animals')) {
    const id = str(o, 'id', 'animals');
    if (residents.some((r) => r.id === id)) throw new Error(`homestead: duplicate animal ${id}`);
    const group = str(o, 'group', id), food = str(o, 'food', id), shelter = str(o, 'shelter', id);
    if (!RESIDENT_GROUPS.includes(group)) throw new Error(`homestead: ${id} has unknown group ${group}`);
    if (!items.find(food)) throw new Error(`homestead: ${id} names an unknown food`);
    if (!structures.some((s) => s.id === shelter)) throw new Error(`homestead: ${id} names an unknown shelter ${shelter}`);
    const fedDays = num(o, 'fedDays', id), sanity = num(o, 'sanity', id), every = num(o, 'every', id), cap = num(o, 'cap', id), count = num(o, 'count', id);
    const produce = typeof o.produce === 'string' ? o.produce : '';
    if (fedDays < 1 || fedDays > MAX_FED_DAYS) throw new Error(`homestead: ${id} needs fedDays in 1..${MAX_FED_DAYS}`);
    if (sanity < 0 || sanity > MAX_MOOD_SANITY) throw new Error(`homestead: ${id} needs sanity in 0..${MAX_MOOD_SANITY}`);
    if (count < 1 || count > MAX_FLOCK) throw new Error(`homestead: ${id} needs count in 1..${MAX_FLOCK}`);
    if (produce && (!items.find(produce) || every < 1 || cap < 1)) throw new Error(`homestead: ${id} has a bad produce, every or cap`);
    if (!produce && (every !== 0 || cap !== 0)) throw new Error(`homestead: ${id} produces nothing but has every or cap`);
    residents.push({ id, group, foodItem: food, shelter, fedDays, sanity, produce, every, cap, count, ...texts(o, id) });
  }
  if (residents.length > MAX_RESIDENTS) throw new Error(`homestead: more than ${MAX_RESIDENTS} animals`);
  if (!crops.length || !structures.length || !residents.length) throw new Error('homestead: crops, structures and animals must not be empty');
  return {
    crops, structures, residents, starter,
    findCrop: (id) => crops.find((c) => c.id === id) || null, findStructure: (id) => structures.find((s) => s.id === id) || null, findResident: (id) => residents.find((r) => r.id === id) || null,
  };
}
export const homesteadName = (def, lang) => def.names[lang] || def.names.en;
export const homesteadText = (def, lang) => def.texts[lang] || def.texts.en;

/** The plot beside the lodging house: beds, structure slots and resident spots, all kept clear of walls and props. exists is false when there is no lodging house or no free spot. */
export class HomesteadPlot {
  constructor() { this.exists = false; this.originX = 0; this.originZ = 0; this.side = [0, 0]; this.dir = [0, 0]; this.beds = []; this.slots = []; this.residentSpots = []; }
  at(a, b) { return [this.originX + this.side[0] * a + this.dir[0] * b, this.originZ + this.side[1] * a + this.dir[1] * b]; }
  fill() {
    this.beds = []; this.slots = []; this.residentSpots = [];
    for (let row = 0; row < BED_ROWS; row++) for (let col = 0; col < BED_COLS; col++) this.beds.push(this.at((col - 1) * BED_SPACING, row * BED_SPACING));
    for (let i = 0; i < STRUCTURE_SLOTS; i++) this.slots.push(this.at((i - 1.5) * SLOT_SPACING, SLOT_FORWARD));
    for (let i = 0; i < MAX_RESIDENTS; i++) this.residentSpots.push(this.at((i - (MAX_RESIDENTS - 1) / 2) * RESIDENT_SPACING, RESIDENT_FORWARD));
  }
  static create(seed, gridW, gridD, layout, items) {
    const plot = new HomesteadPlot(), lodging = items ? items.lodging : null;
    if (!lodging || !layout || lodging.houseIndex < 0 || lodging.houseIndex >= layout.length) return plot;
    const house = layout[lodging.houseIndex];
    const boxes = dressingBoxes([...composeDressing(seed, gridW, gridD, layout), ...landmarkDressing(seed, gridW, gridD), ...landmarkPathDressing(seed, gridW, gridD)]);
    const yaw = facingYaw(house.facing | 0), dirX = Math.sin(yaw), dirZ = Math.cos(yaw), sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
    const half = ((house.facing | 0) % 2 === 0 ? house.sizeZ : house.sizeX) * CELL_M / 2, cx = (house.x + house.sizeX / 2) * CELL_M, cz = (house.z + house.sizeZ / 2) * CELL_M;
    for (const flip of PLOT_SIDES) for (const ahead of PLOT_AHEAD) for (const lateral of PLOT_LATERAL) {
      const reach = half + (flip > 0 ? HOUSE_BOOK_OFFSET : 0) + ahead, cand = new HomesteadPlot();
      cand.originX = cx + flip * dirX * reach + sideX * lateral; cand.originZ = cz + flip * dirZ * reach + sideZ * lateral;
      cand.side = [sideX, sideZ]; cand.dir = [flip * dirX, flip * dirZ];
      cand.fill();
      const points = [...cand.beds, ...cand.slots, ...cand.residentSpots, ...plotEdgeOffsets().map(([a, b]) => cand.at(a, b))];
      if (points.every((p) => !isBlocked(p[0], p[1], layout, boxes, seed, gridW, gridD))) { cand.exists = true; return cand; }
    }
    return plot;
  }
}

const refuse = (reason) => ({ reason, count: 0, ok: false });
const done = (count) => ({ reason: '', count, ok: true });
const copyOf = (inv, Cls) => { const c = new Cls(inv.capacity); c.slots = inv.slots.map((s) => ({ ...s })); return c; };

/** The player's homestead: claimed once, then beds, structures and residents. Depends only on village ticks and days, the corruption level and the player's inventory. */
export class Homestead {
  constructor(catalog, plot) {
    this.catalog = catalog; this.plot = plot || new HomesteadPlot(); this.claimed = false; this.lastSanityDay = 0;
    this.beds = Array.from({ length: BED_COUNT }, () => ({ cropId: '', plantedDay: 0 })); this.built = new Set(); this.residents = [];
  }
  get available() { return !!this.catalog && this.plot.exists; }
  stageOf(bed, tick) {
    if (!(bed >= 0 && bed < BED_COUNT) || !this.beds[bed].cropId) return -1;
    const crop = this.catalog.findCrop(this.beds[bed].cropId);
    if (!crop) return -1;
    const days = dayNumber(tick) - this.beds[bed].plantedDay;
    return days >= crop.growDays ? STAGE_RIPE : days >= 1 ? STAGE_SPROUT : STAGE_PLANTED;
  }
  yieldAt(crop, level) {
    if (level < BLIGHT_LEVEL) return crop.yield;
    if (crop.kind === 'eldritch') return crop.yield + ELDRITCH_BONUS;
    return this.built.has(SCARECROW_ID) ? crop.yield : Math.max(1, crop.yield - 1);
  }
  plant(bed, cropId, tick, player) {
    if (!this.claimed || !this.available) return refuse('unclaimed');
    const crop = this.catalog.findCrop(cropId);
    if (!crop) return refuse('unknown');
    if (!(bed >= 0 && bed < BED_COUNT)) return refuse('bed');
    if (this.beds[bed].cropId) return refuse('occupied');
    if (player.count(crop.seedItem) < 1) return refuse('noseed');
    player.remove(crop.seedItem, 1);
    this.beds[bed] = { cropId: crop.id, plantedDay: dayNumber(tick) };
    return done(1);
  }
  harvest(bed, tick, level, player, items) {
    if (!this.claimed || !this.available) return refuse('unclaimed');
    if (!(bed >= 0 && bed < BED_COUNT)) return refuse('bed');
    const stage = this.stageOf(bed, tick);
    if (stage < 0) return refuse('empty');
    if (stage < STAGE_RIPE) return refuse('growing');
    const crop = this.catalog.findCrop(this.beds[bed].cropId), amount = this.yieldAt(crop, level), trial = copyOf(player, player.constructor);
    if (trial.add(items, crop.harvestItem, amount) < amount || trial.add(items, crop.seedItem, SEED_BACK) < SEED_BACK) return refuse('full');
    player.add(items, crop.harvestItem, amount); player.add(items, crop.seedItem, SEED_BACK);
    this.beds[bed] = { cropId: '', plantedDay: 0 };
    return done(amount);
  }
  claim(tick, player, items) {
    if (!this.available) return refuse('noplot');
    if (this.claimed) return refuse('claimed');
    const trial = copyOf(player, player.constructor);
    for (const s of this.catalog.starter) if (trial.add(items, s.id, s.count) < s.count) return refuse('full');
    for (const s of this.catalog.starter) player.add(items, s.id, s.count);
    this.claimed = true; this.lastSanityDay = dayNumber(tick);
    return done(this.catalog.starter.length);
  }
  build(structureId, player) {
    if (!this.claimed || !this.available) return refuse('unclaimed');
    const s = this.catalog.findStructure(structureId);
    if (!s) return refuse('unknown');
    if (this.built.has(s.id)) return refuse('built');
    if (player.count(BUILD_ITEM) < s.cost) return refuse('notimber');
    player.remove(BUILD_ITEM, s.cost); this.built.add(s.id);
    return done(s.cost);
  }
  residentIndexOf(id) { return this.residents.findIndex((r) => r.defId === id); }
  owns(id) { return this.residentIndexOf(id) >= 0; }
  sheltered(def) { return this.built.has(def.shelter); }
  fedPercent(def, fedTick, tick) {
    const span = (def.fedDays + (this.built.has(TROUGH_ID) ? 1 : 0)) * MINUTES_PER_DAY, elapsed = Math.min(span, Math.max(0, tick - fedTick));
    return 100 - Math.floor(elapsed * 100 / span);
  }
  mood(def, fedTick, tick, level) {
    const fed = this.fedPercent(def, fedTick, tick), housed = this.sheltered(def);
    const score = (fed >= FED_GOOD ? 1 : fed === 0 ? -1 : 0) + (housed ? 1 : -1) + (!housed && level >= BLIGHT_LEVEL ? -1 : 0);
    return score >= 1 ? 'content' : score <= -1 ? 'distressed' : 'uneasy';
  }
  feed(defId, tick, player) {
    if (!this.claimed || !this.available) return refuse('unclaimed');
    const def = this.catalog.findResident(defId);
    if (!def) return refuse('unknown');
    const at = this.residentIndexOf(defId);
    if (at >= 0 && this.fedPercent(def, this.residents[at].fedTick, tick) >= FED_FULL) return refuse('full');
    if (player.count(def.foodItem) < 1) return refuse('nofood');
    player.remove(def.foodItem, 1);
    if (at < 0) { this.residents.push({ defId, fedTick: tick, collectDay: dayNumber(tick) }); return done(1); }
    this.residents[at] = { ...this.residents[at], fedTick: tick };
    return done(0);
  }
  produceReady(def, state, tick) {
    if (!def.produce || !this.sheltered(def) || this.fedPercent(def, state.fedTick, tick) === 0) return 0;
    return Math.min(def.cap, Math.floor(Math.max(0, dayNumber(tick) - state.collectDay) / def.every));
  }
  collect(defId, tick, player, items) {
    if (!this.claimed || !this.available) return refuse('unclaimed');
    const def = this.catalog.findResident(defId), at = this.residentIndexOf(defId);
    if (!def || at < 0) return refuse('notowned');
    if (!def.produce) return refuse('noproduce');
    const n = this.produceReady(def, this.residents[at], tick);
    if (n < 1) return refuse('notready');
    if (copyOf(player, player.constructor).add(items, def.produce, n) < n) return refuse('full');
    player.add(items, def.produce, n);
    this.residents[at] = { ...this.residents[at], collectDay: dayNumber(tick) };
    return done(n);
  }
  /** Sanity for a new village day from the residents' moods, capped; applied once per day number. */
  dailySanity(tick, level) {
    const day = dayNumber(tick);
    if (!this.claimed || day <= this.lastSanityDay) return 0;
    this.lastSanityDay = day;
    let sum = 0;
    for (const r of this.residents) { const def = this.catalog.findResident(r.defId), m = this.mood(def, r.fedTick, tick, level); sum += m === 'content' ? def.sanity : m === 'distressed' ? -def.sanity : 0; }
    return Math.max(-DAILY_SANITY_CAP, Math.min(DAILY_SANITY_CAP, sum));
  }
  serialize() {
    const beds = this.beds.map((b) => (b.cropId ? `${b.cropId}.${b.plantedDay}` : '-')).join(',');
    const built = this.catalog.structures.filter((s) => this.built.has(s.id)).map((s) => s.id).join('.');
    return `hs1;${this.claimed ? 1 : 0};${this.lastSanityDay};${beds};${built};${this.residents.map((r) => `${r.defId}.${r.fedTick}.${r.collectDay}`).join(',')}`;
  }
  tryRestore(text) {
    if (typeof text !== 'string' || !text || !this.available) return false;
    const parts = text.split(';'), num = (s) => (/^\d{1,9}$/.test(s) && Number(s) <= MAX_SAVED_NUMBER ? Number(s) : null);
    if (parts.length !== 6 || parts[0] !== 'hs1' || (parts[1] !== '0' && parts[1] !== '1') || num(parts[2]) === null) return false;
    const bedParts = parts[3].split(',');
    if (bedParts.length !== BED_COUNT) return false;
    const beds = [];
    for (const b of bedParts) {
      if (b === '-') { beds.push({ cropId: '', plantedDay: 0 }); continue; }
      const bits = b.split('.');
      if (bits.length !== 2 || !this.catalog.findCrop(bits[0]) || num(bits[1]) === null) return false;
      beds.push({ cropId: bits[0], plantedDay: num(bits[1]) });
    }
    const built = new Set();
    if (parts[4]) for (const id of parts[4].split('.')) if (!this.catalog.findStructure(id) || built.has(id)) return false; else built.add(id);
    const residents = [];
    if (parts[5]) for (const e of parts[5].split(',')) {
      const bits = e.split('.');
      if (bits.length !== 3 || !this.catalog.findResident(bits[0]) || num(bits[1]) === null || num(bits[2]) === null || residents.some((r) => r.defId === bits[0])) return false;
      residents.push({ defId: bits[0], fedTick: num(bits[1]), collectDay: num(bits[2]) });
    }
    this.claimed = parts[1] === '1'; this.lastSanityDay = num(parts[2]); this.beds = beds; this.built = built; this.residents = residents;
    return true;
  }
}
