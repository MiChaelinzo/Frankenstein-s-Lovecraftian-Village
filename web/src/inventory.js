// Mirror of Core/Items.cs (golden-checked, key "items"): the item data file, inventory slots and stacking, use effects, seeded ground items and chests, save string. Pure, no DOM.
// The data file web/data/items.json is a byte copy of Packages/.../Data/items.json (tools/validate_repo.py and a test check it).
import { SeededRandom } from './core.js';
import { landmarkDressing, landmarkPathDressing } from './landmarks.js';
import { composeDressing, dressingBoxes } from './dressing.js';
import { isBuilding } from './streets.js';
import { frontSpots, isBlocked } from './lore.js';
import { phaseAt, wrapTick, MINUTES_PER_DAY } from './clock.js';

export const ITEM_KINDS = ['supply', 'food', 'tea', 'ward', 'key', 'letter', 'trinket'];
export const ITEM_EFFECTS = ['sanity', 'fuel', 'ward', 'none'];
export const ITEM_LANGUAGES = ['en', 'fr'];
export const MAX_STACK = 99, PLAYER_SLOTS = 12, CHEST_SLOTS = 8, FUEL_MAX = 100, FUEL_START = 60, CANDLE_FUEL_COST = 5, SLEEP_SANITY_RESTORE = 10;
export const SPAWN_SALT = 0x17e45, GROUND_COUNT = 10, FOUND_CHESTS = 3, FOUND_CHEST_STACKS = 3, MAX_FOUND_COUNT = 2, SPACING = 0.9;
export const ITEM_LATERAL = [0.75, -0.75, 2.25, -2.25], CHEST_LATERAL = [0.75, -0.75, 2.25, -2.25];
export const LODGING_STOCK = ['bread', 'tea', 'lantern_oil'];
export const ITEM_CLUE_PREFIX = 'item@';
const DUSK = 2, NIGHT = 3;

/** Parses the data file (object or text). Throws an Error naming the offending item when it is malformed. */
export function parseItemCatalog(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || !Array.isArray(root.items)) throw new Error('items: missing items array');
  const seen = new Set();
  const items = root.items.map((o) => {
    const id = o && typeof o.id === 'string' && o.id ? o.id : '?';
    if (seen.has(id)) throw new Error(`items: duplicate id ${id}`);
    seen.add(id);
    if (!ITEM_KINDS.includes(o.kind)) throw new Error(`items: ${id} has unknown kind ${o.kind}`);
    if (!ITEM_EFFECTS.includes(o.effect)) throw new Error(`items: ${id} has unknown effect ${o.effect}`);
    for (const k of ['amount', 'stack', 'weight']) if (typeof o[k] !== 'number') throw new Error(`items: ${id} lacks number ${k}`);
    const amount = Math.trunc(o.amount), stack = Math.trunc(o.stack), weight = Math.trunc(o.weight);
    if (stack < 1 || stack > MAX_STACK) throw new Error(`items: ${id} has a stack outside 1..${MAX_STACK}`);
    if (weight < 1) throw new Error(`items: ${id} needs a weight of at least 1`);
    if ((o.effect === 'sanity' || o.effect === 'fuel') !== (amount > 0)) throw new Error(`items: ${id} needs a positive amount exactly for the sanity and fuel effects`);
    const names = {}, texts = {};
    for (const lang of ITEM_LANGUAGES) {
      const t = o[lang];
      if (!t || typeof t.name !== 'string' || !t.name || typeof t.text !== 'string' || !t.text) throw new Error(`items: ${id} lacks ${lang} name or text`);
      names[lang] = t.name; texts[lang] = t.text;
    }
    return { id, kind: o.kind, effect: o.effect, amount, stack, weight, clue: o.clue === true, names, texts };
  });
  return { items, find: (id) => items.find((d) => d.id === id) || null };
}
export const itemName = (def, lang) => def.names[lang] || def.names.en;
export const itemText = (def, lang) => def.texts[lang] || def.texts.en;

/** A row of slots with stacking, plus the lantern fuel when it is the player's. Add and Move return how many items really moved. */
export class Inventory {
  constructor(capacity) { this.capacity = capacity; this.slots = []; this.fuel = FUEL_START; }
  count(id) { return this.slots.reduce((n, s) => n + (s.id === id ? s.count : 0), 0); }
  room(cat, id) {
    const d = cat.find(id);
    if (!d) return 0;
    return (this.capacity - this.slots.length) * d.stack + this.slots.reduce((n, s) => n + (s.id === id ? d.stack - s.count : 0), 0);
  }
  add(cat, id, count) {
    const d = cat.find(id);
    if (!d || !(count > 0)) return 0;
    let left = count;
    for (const s of this.slots) {
      if (s.id !== id || left <= 0) continue;
      const put = Math.min(left, d.stack - s.count);
      if (put > 0) { s.count += put; left -= put; }
    }
    while (left > 0 && this.slots.length < this.capacity) { const put = Math.min(left, d.stack); this.slots.push({ id, count: put }); left -= put; }
    return count - left;
  }
  remove(id, count) {
    let left = count;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      if (this.slots[i].id !== id) continue;
      const take = Math.min(left, this.slots[i].count);
      left -= take;
      if (take === this.slots[i].count) this.slots.splice(i, 1); else this.slots[i].count -= take;
    }
    return Math.max(0, count) - Math.max(0, left);
  }
  static move(cat, from, to, id, count) {
    const n = Math.min(count, from.count(id), to.room(cat, id));
    if (!(n > 0)) return 0;
    const moved = to.add(cat, id, n);
    from.remove(id, moved);
    return moved;
  }
  burnFuel(amount) { this.fuel = Math.max(0, this.fuel - Math.max(0, amount)); }
  /** Uses one item: sanity items restore through the SanityModel (refused at full sanity), fuel items refill the lantern (refused when full); ward items and items with no effect are kept. */
  use(cat, id, sanity) {
    const refuse = (reason) => ({ used: false, reason, sanityDelta: 0, fuelDelta: 0 });
    const d = cat.find(id);
    if (!d) return refuse('unknown');
    if (this.count(id) <= 0) return refuse('missing');
    if (d.effect === 'ward' || d.effect === 'none') return refuse(d.effect);
    if (d.effect === 'sanity') {
      if (!sanity || sanity.value >= 100) return refuse('full');
      const before = sanity.value;
      sanity.apply(d.amount);
      this.remove(id, 1);
      return { used: true, reason: '', sanityDelta: Math.round(sanity.value - before), fuelDelta: 0 };
    }
    if (this.fuel >= FUEL_MAX) return refuse('full');
    const before = this.fuel;
    this.fuel = Math.min(FUEL_MAX, this.fuel + d.amount);
    this.remove(id, 1);
    return { used: true, reason: '', sanityDelta: 0, fuelDelta: this.fuel - before };
  }
  slotsText() { return this.slots.map((s) => `${s.id}:${s.count}`).join(','); }
  /** Parses slotsText. False (and no change) when an id is unknown, a count is outside 1..stack or there are too many slots. */
  trySetSlots(cat, text) {
    const parsed = [];
    if (text) for (const part of text.split(',')) {
      const bits = part.split(':');
      if (bits.length !== 2 || !/^\d+$/.test(bits[1])) return false;
      const d = cat.find(bits[0]), n = Number(bits[1]);
      if (!d || n < 1 || n > d.stack) return false;
      parsed.push({ id: d.id, count: n });
    }
    if (parsed.length > this.capacity) return false;
    this.slots = parsed;
    return true;
  }
}

function pickItem(rng, cat, usedUnique) {
  let total = 0;
  for (const d of cat.items) if (d.stack > 1 || !usedUnique.has(d.id)) total += d.weight;
  if (total <= 0) return null;
  let r = rng.next(total);
  for (const d of cat.items) {
    if (d.stack === 1 && usedUnique.has(d.id)) continue;
    if (r < d.weight) {
      if (d.stack === 1) usedUnique.add(d.id);
      const count = d.stack === 1 ? 1 : 1 + rng.next(MAX_FOUND_COUNT);
      return { itemId: d.id, count: Math.min(count, d.stack) };
    }
    r -= d.weight;
  }
  return null;
}

function freeSpot(house, layout, laterals, boxes, taken, seed, gridW, gridD) {
  for (const c of frontSpots(layout[house], laterals)) {
    if (isBlocked(c[0], c[1], layout, boxes, seed, gridW, gridD)) continue;
    if (!taken.some((t) => Math.abs(t[0] - c[0]) < SPACING && Math.abs(t[1] - c[1]) < SPACING)) return c;
  }
  return null;
}

/** Whether sleeping is allowed now: at dusk or at night. */
export const canSleep = (tick) => { const p = phaseAt(tick); return p === DUSK || p === NIGHT; };
/** Clock minutes from the tick to the next dawn. */
export const minutesToMorning = (tick) => MINUTES_PER_DAY - wrapTick(tick);

/** The items and chests of one village plus the player's changes (picked items, chest contents). */
export class ItemWorld {
  constructor() { this.ground = []; this.chests = []; this.picked = new Set(); }
  get lodging() { return this.chests.find((c) => c.lodging) || null; }

  static create(seed, gridW, gridD, layout, cat) {
    const world = new ItemWorld();
    if (!cat || !cat.items.length || !layout || gridW <= 0 || gridD <= 0) return world;
    const boxes = dressingBoxes([...composeDressing(seed, gridW, gridD, layout), ...landmarkDressing(seed, gridW, gridD), ...landmarkPathDressing(seed, gridW, gridD)]);
    const order = [];
    layout.forEach((p, i) => { if (isBuilding(p.sizeX, p.sizeZ)) order.push(i); });
    if (!order.length) return world;
    const rng = new SeededRandom(seed ^ SPAWN_SALT);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.next(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    let lodgingAt = 0;
    for (let i = 0; i < order.length; i++) if (layout[order[i]].id.startsWith('house')) { lodgingAt = i; break; }
    const lodgingHouse = order[lodgingAt];
    order.splice(lodgingAt, 1);
    order.unshift(lodgingHouse);
    const taken = [], usedUnique = new Set();
    for (let k = 0; k < order.length && world.chests.length < 1 + FOUND_CHESTS; k++) {
      const spot = freeSpot(order[k], layout, CHEST_LATERAL, boxes, taken, seed, gridW, gridD);
      if (!spot) continue;
      const chest = { houseIndex: order[k], lodging: k === 0, x: spot[0], z: spot[1], contents: new Inventory(CHEST_SLOTS) };
      if (chest.lodging) for (const id of LODGING_STOCK) chest.contents.add(cat, id, 1);
      else for (let n = 0; n < FOUND_CHEST_STACKS; n++) { const s = pickItem(rng, cat, usedUnique); if (s) chest.contents.add(cat, s.itemId, s.count); }
      taken.push(spot);
      world.chests.push(chest);
    }
    const start = Math.min(order.length - 1, 1 + FOUND_CHESTS);
    for (let n = 0; n < GROUND_COUNT; n++) {
      const s = pickItem(rng, cat, usedUnique);
      if (!s) break;
      let spot = null;
      for (let t = 0; t < order.length && !spot; t++) spot = freeSpot(order[(start + n + t) % order.length], layout, ITEM_LATERAL, boxes, taken, seed, gridW, gridD);
      if (!spot) break;
      taken.push(spot);
      world.ground.push({ ...s, x: spot[0], z: spot[1] });
    }
    return world;
  }

  /** Picks up a ground item whole. Returns the number picked up: 0 when it is gone, unknown or does not fit (nothing changes then). */
  pickUp(index, player, cat) {
    if (!Number.isInteger(index) || index < 0 || index >= this.ground.length || this.picked.has(index)) return 0;
    const s = this.ground[index];
    if (player.room(cat, s.itemId) < s.count) return 0;
    const added = player.add(cat, s.itemId, s.count);
    this.picked.add(index);
    return added;
  }

  /** "inv1;fuel;player slots;picked indices;chest slots separated by /". */
  serialize(player) {
    return `inv1;${player.fuel};${player.slotsText()};${[...this.picked].sort((a, b) => a - b).join('.')};${this.chests.map((c) => c.contents.slotsText()).join('/')}`;
  }

  /** Restores a serialize string for this village. False (and no change) when it does not fit this village's items and chests. */
  tryRestore(text, player, cat) {
    if (typeof text !== 'string' || !text) return false;
    const parts = text.split(';');
    if (parts.length !== 5 || parts[0] !== 'inv1' || !/^\d+$/.test(parts[1]) || Number(parts[1]) > FUEL_MAX) return false;
    const chestParts = parts[4].split('/');
    if (chestParts.length !== Math.max(1, this.chests.length) || (this.chests.length === 0 && parts[4].length > 0)) return false;
    const picked = new Set();
    if (parts[3]) for (const p of parts[3].split('.')) {
      if (!/^\d+$/.test(p)) return false;
      const idx = Number(p);
      if (idx >= this.ground.length || picked.has(idx)) return false;
      picked.add(idx);
    }
    const nextPlayer = new Inventory(player.capacity);
    if (!nextPlayer.trySetSlots(cat, parts[2])) return false;
    const chestInv = [];
    for (let i = 0; i < this.chests.length; i++) {
      const c = new Inventory(this.chests[i].contents.capacity);
      if (!c.trySetSlots(cat, chestParts[i])) return false;
      chestInv.push(c);
    }
    player.fuel = Number(parts[1]); player.slots = nextPlayer.slots; this.picked = picked;
    this.chests.forEach((c, i) => { c.contents.slots = chestInv[i].slots; });
    return true;
  }
}
