// Mirror of Core/CreatureRules.cs (golden-checked, key "creatures"): the creature data file, seeded bounded spawns, exposure (range and line of sight) and the counters
// (lantern, salt line, chalk sigil, flare). Pure, no DOM. web/data/creatures.json is a byte copy of Packages/.../Data/creatures.json (tools/validate_repo.py and a test check it).
import { SeededRandom } from './core.js';
import { phaseAt, MINUTES_PER_DAY } from './clock.js';
import { CELL_M, coastToWorldAt, dockU, hiOf } from './dressing.js';
import { landmarks } from './landmarks.js';
import { insideAnyPlace } from './places.js';
import { CAUSE_IDS, causeHolds } from './director.js';

export const CREATURE_HABITATS = ['shore', 'fog', 'harbour', 'cliffs'];
export const CREATURE_PHASE_RULES = ['night', 'dusk_night', 'any'];
export const CREATURE_LANGUAGES = ['en', 'fr'];
export const MAX_CREATURES = 8, MAX_DRAIN_PER_SECOND = 2.0, HOME_SALT = 0x5ea70, KIND_STEP = 0x9e37, HOME_TRIES = 12;
export const SHORE_MARGIN = 3.0, SHORE_V = -1.4, HARBOUR_V = -1.6, HARBOUR_SPREAD = 10.0, CLIFF_SPREAD = 0.8;
export const LEASH = 26.0, CLOSE_STOP = 1.2, RETURN_SPEED = 1.0, LOS_STEP = 1.0, TELEGRAPH_RANGE = 30.0;
export const LANTERN_RANGE = 7.0, LANTERN_PUSH = 3.0, LANTERN_FUEL_PER_SECOND = 0.5, FLARE_RANGE = 16.0, FLARE_PUSH = 7.0;
export const FLARE_FUEL_COST = 30, FLARE_MINUTES = 20, FLARE_COOLDOWN_MINUTES = 120;
export const SALT_LENGTH = 6.0, SALT_AHEAD = 1.5, SIGIL_RADIUS = 4.0, SALT_MINUTES = 180, SIGIL_MINUTES = 360, MAX_WARDS = 6;
const DUSK = 2, NIGHT = 3;

/** Parses the data file (object or text). Throws an Error naming the offending creature when it is malformed. */
export function parseCreatureCatalog(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || !Array.isArray(root.creatures)) throw new Error('creatures: missing creatures array');
  const seen = new Set();
  const defs = root.creatures.map((o) => {
    const id = o && typeof o.id === 'string' && o.id ? o.id : '?';
    if (seen.has(id)) throw new Error(`creatures: duplicate id ${id}`);
    seen.add(id);
    if (!CREATURE_HABITATS.includes(o.habitat)) throw new Error(`creatures: ${id} has unknown habitat ${o.habitat}`);
    if (!CREATURE_PHASE_RULES.includes(o.phase)) throw new Error(`creatures: ${id} has unknown phase rule ${o.phase}`);
    const weather = typeof o.weather === 'string' ? o.weather : '';
    if (weather !== '' && weather !== 'fog') throw new Error(`creatures: ${id} has unknown weather rule ${weather}`);
    for (const k of ['minDread', 'max', 'drain', 'range', 'speed', 'hunt', 'height']) if (typeof o[k] !== 'number') throw new Error(`creatures: ${id} lacks number ${k}`);
    const minDread = Math.trunc(o.minDread), max = Math.trunc(o.max);
    if (minDread < 0 || minDread > 100) throw new Error(`creatures: ${id} has minDread outside 0..100`);
    if (max < 1 || max > MAX_CREATURES) throw new Error(`creatures: ${id} has max outside 1..${MAX_CREATURES}`);
    if (!(o.drain > 0) || o.drain > MAX_DRAIN_PER_SECOND) throw new Error(`creatures: ${id} has drain outside (0..${MAX_DRAIN_PER_SECOND}]`);
    if (!(o.range > 0) || o.range > TELEGRAPH_RANGE) throw new Error(`creatures: ${id} has range outside (0..${TELEGRAPH_RANGE}]`);
    if (o.speed < 0 || o.hunt < 0 || o.height < 0) throw new Error(`creatures: ${id} has a negative speed, hunt or height`);
    const names = {}, texts = {};
    for (const lang of CREATURE_LANGUAGES) {
      const t = o[lang];
      if (!t || typeof t.name !== 'string' || !t.name || typeof t.text !== 'string' || !t.text) throw new Error(`creatures: ${id} lacks ${lang} name or text`);
      names[lang] = t.name; texts[lang] = t.text;
    }
    return { id, habitat: o.habitat, phase: o.phase, weather, minDread, max, drain: o.drain, range: o.range, needsLos: o.los === true, speed: o.speed, hunt: o.hunt, height: o.height, names, texts };
  });
  const manifestations = Array.isArray(root.manifestations) ? parseManifestations(root.manifestations, seen) : [];
  return { defs, manifestations, find: (id) => defs.find((d) => d.id === id) || null, findManifestation: (id) => manifestations.find((d) => d.id === id) || null };
}

export const TIER_COUNT = 4, TIER_SALT = 0x544952, STATE_STEP = 40503, POSITION_TRIES = 12;
export const GLIMPSE_SECONDS = 3.0, GLIMPSE_REDUCED_SECONDS = 2.0, MAX_GLIMPSE_SECONDS = 4.0;
export const GLIMPSE_COOLDOWN_TICKS = 2 * MINUTES_PER_DAY;
export const WITNESS_PREFIX = 'witness@';
export const TIER_CONTEXTS = ['village', 'place', 'any'];
export const TIER_WARD_KINDS = ['warded', 'avoided', 'witnessed'];
export const TIER_WARD_ACTIONS = ['salt', 'sigil', 'flare', 'lantern'];
const MAX_CORRUPTION_STAGE = 4, MAX_KNOWLEDGE_TIER = 5;

function parseManifestations(list, seen) {
  const result = list.map((o) => {
    const id = o && typeof o.id === 'string' && o.id ? o.id : '?';
    if (seen.has(id)) throw new Error(`manifestations: duplicate id ${id}`);
    seen.add(id);
    for (const k of ['tier', 'minDread', 'society', 'knowledge', 'omens', 'chance']) if (typeof o[k] !== 'number') throw new Error(`manifestations: ${id} lacks number ${k}`);
    const tier = Math.trunc(o.tier);
    if (tier < 1 || tier > TIER_COUNT) throw new Error(`manifestations: ${id} has tier outside 1..${TIER_COUNT}`);
    if (o.minDread < 0 || o.minDread > 100) throw new Error(`manifestations: ${id} has minDread outside 0..100`);
    if (!CREATURE_PHASE_RULES.includes(o.phase)) throw new Error(`manifestations: ${id} has unknown phase rule ${o.phase}`);
    if (o.society < 0 || o.society > MAX_CORRUPTION_STAGE) throw new Error(`manifestations: ${id} has society outside 0..4`);
    if (o.knowledge < 0 || o.knowledge > MAX_KNOWLEDGE_TIER) throw new Error(`manifestations: ${id} has knowledge outside 0..${MAX_KNOWLEDGE_TIER}`);
    if (o.omens < 0) throw new Error(`manifestations: ${id} has negative omens`);
    if (!TIER_CONTEXTS.includes(o.context)) throw new Error(`manifestations: ${id} has unknown context ${o.context}`);
    if (o.chance < 1 || o.chance > 100) throw new Error(`manifestations: ${id} has chance outside 1..100`);
    if (!CAUSE_IDS.includes(o.cause) || o.cause === 'omen_passed') throw new Error(`manifestations: ${id} has unknown cause ${o.cause}`);
    if (!TIER_WARD_KINDS.includes(o.ward)) throw new Error(`manifestations: ${id} has unknown ward kind ${o.ward}`);
    const names = {}, texts = {}, witness = {};
    for (const lang of CREATURE_LANGUAGES) {
      const t = o[lang];
      if (!t || ['name', 'text', 'witness'].some((k) => typeof t[k] !== 'string' || !t[k])) throw new Error(`manifestations: ${id} lacks ${lang} name, text or witness`);
      names[lang] = t.name; texts[lang] = t.text; witness[lang] = t.witness;
    }
    return { id, tier, minDread: Math.trunc(o.minDread), phase: o.phase, society: Math.trunc(o.society), knowledge: Math.trunc(o.knowledge), omens: Math.trunc(o.omens), context: o.context, chance: Math.trunc(o.chance), cause: o.cause, ward: o.ward, names, texts, witness };
  });
  for (let t = 1; t <= TIER_COUNT; t++) if (!result.some((d) => d.tier === t)) throw new Error(`manifestations: tier ${t} has no entry`);
  return result;
}

export const creatureName = (def, lang) => def.names[lang] || def.names.en;
export const creatureText = (def, lang) => def.texts[lang] || def.texts.en;

export const dist = (ax, az, bx, bz) => Math.sqrt((ax - bx) * (ax - bx) + (az - bz) * (az - bz));
const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
/** Proper crossing of two segments (touching ends do not count). */
export function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1 = cross(ax, az, bx, bz, cx, cz), d2 = cross(ax, az, bx, bz, dx, dz), d3 = cross(cx, cz, dx, dz, ax, az), d4 = cross(cx, cz, dx, dz, bx, bz);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Samples the segment every LOS_STEP metres, ends excluded; a null predicate means open ground. */
export function hasLineOfSight(ax, az, bx, bz, blocked) {
  if (!blocked) return true;
  const len = dist(ax, az, bx, bz), n = Math.floor(len / LOS_STEP);
  for (let i = 1; i <= n; i++) {
    const t = i * LOS_STEP / len;
    if (t >= 1.0) break;
    if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}
function toward(p, tx, tz, amount) {
  const dx = tx - p.x, dz = tz - p.z, len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1e-9) return;
  p.x += dx / len * amount; p.z += dz / len * amount;
}

/** Whether a kind appears at this tick, dread percent and weather. */
export function isCreatureActive(def, tick, dreadPercent, weather) {
  const phase = phaseAt(tick);
  const phaseOk = def.phase === 'any' || (def.phase === 'night' && phase === NIGHT) || (def.phase === 'dusk_night' && (phase === DUSK || phase === NIGHT));
  const weatherOk = def.weather === '' || weather === 'fog' || weather === 'mist';
  return phaseOk && weatherOk && dreadPercent >= def.minDread;
}

function homeOf(def, rng, seed, gridW, gridD, blocked, places) {
  const w = gridW * CELL_M, d = gridD * CELL_M, shore = hiOf(seed, gridW, gridD);
  let x = 0, z = 0;
  for (let t = 0; t < HOME_TRIES; t++) {
    if (def.habitat === 'shore') {
      const u = SHORE_MARGIN + rng.next(1000) / 1000.0 * Math.max(0.0, shore - 2 * SHORE_MARGIN);
      ({ x, z } = coastToWorldAt(seed, gridW, u, SHORE_V));
    } else if (def.habitat === 'harbour') {
      const u = dockU(seed, gridW, gridD) + (rng.next(2001) - 1000) / 1000.0 * HARBOUR_SPREAD;
      ({ x, z } = coastToWorldAt(seed, gridW, u, HARBOUR_V));
    } else if (def.habitat === 'cliffs') {
      const cliffs = landmarks(seed, gridW, gridD)[0];
      const a = rng.next(1000) / 1000.0 * 2.0 * Math.PI, r = Math.sqrt(rng.next(1000) / 1000.0) * cliffs.radius * CLIFF_SPREAD;
      x = cliffs.x + Math.cos(a) * r; z = cliffs.z + Math.sin(a) * r;
    } else {
      x = rng.next(1000) / 1000.0 * w; z = rng.next(1000) / 1000.0 * d;
    }
    if (!insideAnyPlace(places, x, z) && (def.habitat !== 'fog' || !blocked || !blocked(x, z))) break;
  }
  return { x, z };
}

const r3 = (v) => String(Math.round(v * 1000) / 1000);
/** The creatures of one village and the player's counterplay; see Core CreatureEncounter. Same inputs in the same order give the same state. */
export class CreatureEncounter {
  constructor(cat) { this.cat = cat; this.creatures = []; this.wards = []; this.flareUntilTick = -1; this.flareReadyTick = 0; this.fuelDebt = 0; }

  /** The creatures that appear for this phase, weather and dread (0..1), at their seeded homes. blocked(x, z) may be null. */
  static spawn(seed, gridW, gridD, tick, dread, weather, cat, blocked, places = null) {
    const enc = new CreatureEncounter(cat);
    if (!cat || gridW <= 0 || gridD <= 0) return enc;
    const dreadPercent = Math.floor(Math.max(0, Math.min(1, Number.isNaN(dread) ? 0 : dread)) * 100.0 + 1e-9);
    cat.defs.forEach((def, k) => {
      if (!isCreatureActive(def, tick, dreadPercent, weather)) return;
      const count = Math.max(1, 1 + Math.trunc((def.max - 1) * dreadPercent / 100));
      const rng = new SeededRandom(seed ^ HOME_SALT ^ (k * KIND_STEP));
      for (let i = 0; i < def.max; i++) {
        const h = homeOf(def, rng, seed, gridW, gridD, blocked, places);
        if (i >= count || enc.creatures.length >= MAX_CREATURES) continue;
        enc.creatures.push({ defId: def.id, homeX: h.x, homeZ: h.z, x: h.x, z: h.z });
      }
    });
    return enc;
  }

  describe(c) { return `${c.defId}@${r3(c.x)},${r3(c.z)}`; }

  /** Lays a salt line across the way the player faces (hx, hz; (0,1) when zero). Uses one salt; returns '' or 'missing'. */
  placeSalt(player, px, pz, hx, hz, tick) {
    let len = Math.sqrt(hx * hx + hz * hz);
    if (len < 1e-9) { hx = 0; hz = 1; len = 1; }
    hx /= len; hz /= len;
    if (player.remove('salt', 1) < 1) return 'missing';
    const cx = px + hx * SALT_AHEAD, cz = pz + hz * SALT_AHEAD, half = SALT_LENGTH / 2.0;
    this.#addWard({ kind: 'salt', ax: cx - hz * half, az: cz + hx * half, bx: cx + hz * half, bz: cz - hx * half, expiresTick: tick + SALT_MINUTES });
    return '';
  }
  /** Draws a chalk sigil under the player. Uses one sigil chalk; returns '' or 'missing'. */
  placeSigil(player, px, pz, tick) {
    if (player.remove('sigil_chalk', 1) < 1) return 'missing';
    this.#addWard({ kind: 'sigil', ax: px, az: pz, bx: px, bz: pz, expiresTick: tick + SIGIL_MINUTES });
    return '';
  }
  #addWard(w) { this.wards.push(w); while (this.wards.length > MAX_WARDS) this.wards.shift(); }
  /** The last resort: burns lantern fuel for a short, strong push. Returns '', 'cooldown' or 'fuel'. */
  useFlare(player, tick) {
    if (tick < this.flareReadyTick) return 'cooldown';
    if (player.fuel < FLARE_FUEL_COST) return 'fuel';
    player.burnFuel(FLARE_FUEL_COST);
    this.flareUntilTick = tick + FLARE_MINUTES;
    this.flareReadyTick = tick + FLARE_COOLDOWN_MINUTES;
    return '';
  }
  flareActive(tick) { return tick < this.flareUntilTick; }
  inSigil(x, z) { return this.wards.some((w) => w.kind === 'sigil' && dist(x, z, w.ax, w.az) <= SIGIL_RADIUS); }
  saltBetween(ax, az, bx, bz) { return this.wards.some((w) => w.kind === 'salt' && segmentsCross(ax, az, bx, bz, w.ax, w.az, w.bx, w.bz)); }

  /** Advances every creature by dt seconds with the player at (px, pz) and `fuel` lantern fuel; see Core CreatureEncounter.Step. */
  step(dt, px, pz, tick, fuel, blocked) {
    const result = { drain: 0, fuelBurn: 0, telegraph: 0, nearest: -1, pushed: false, blocked: false };
    if (!(dt > 0)) return result;
    this.wards = this.wards.filter((w) => tick < w.expiresTick);
    const lanternLit = fuel > 0, flare = this.flareActive(tick), sheltered = this.inSigil(px, pz);
    let drain = 0, fuelUse = 0, nearest = Number.MAX_VALUE;
    this.creatures.forEach((c, i) => {
      const def = this.cat.find(c.defId);
      let d = dist(px, pz, c.x, c.z);
      const lanternPush = lanternLit && d <= LANTERN_RANGE, flarePush = flare && d <= FLARE_RANGE;
      const n = { x: c.x, z: c.z };
      if (lanternPush || flarePush) {
        toward(n, px, pz, -(flarePush ? FLARE_PUSH : LANTERN_PUSH) * dt);
        if (lanternPush) fuelUse += LANTERN_FUEL_PER_SECOND * dt;
        result.pushed = true;
      } else if (def.hunt > 0 && d <= def.hunt && !sheltered) {
        toward(n, px, pz, Math.min(def.speed * dt, Math.max(0.0, d - CLOSE_STOP)));
      } else if (c.x !== c.homeX || c.z !== c.homeZ) {
        toward(n, c.homeX, c.homeZ, Math.min(Math.max(def.speed, RETURN_SPEED) * dt, dist(c.x, c.z, c.homeX, c.homeZ)));
      }
      if (this.saltBetween(c.x, c.z, n.x, n.z)) { n.x = c.x; n.z = c.z; result.blocked = true; }
      const home = dist(n.x, n.z, c.homeX, c.homeZ);
      if (home > LEASH) { n.x = c.homeX + (n.x - c.homeX) * LEASH / home; n.z = c.homeZ + (n.z - c.homeZ) * LEASH / home; }
      for (const w of this.wards) {
        if (w.kind !== 'sigil') continue;
        const s = dist(n.x, n.z, w.ax, w.az);
        if (s < SIGIL_RADIUS) {
          if (s < 1e-9) { n.x = w.ax + SIGIL_RADIUS; n.z = w.az; } else { const k = SIGIL_RADIUS / s; n.x = w.ax + (n.x - w.ax) * k; n.z = w.az + (n.z - w.az) * k; }
        }
      }
      c.x = n.x; c.z = n.z;
      d = dist(px, pz, c.x, c.z);
      if (d < nearest) { nearest = d; result.nearest = i; }
      const held = sheltered || (lanternLit && d <= LANTERN_RANGE) || (flare && d <= FLARE_RANGE) || this.saltBetween(c.x, c.z, px, pz);
      if (d <= def.range && !held && (!def.needsLos || hasLineOfSight(c.x, c.z, px, pz, blocked))) drain += def.drain * (1.0 - d / def.range) * dt;
    });
    result.drain = Math.min(drain, MAX_DRAIN_PER_SECOND * dt);
    this.fuelDebt += fuelUse;
    const burn = Math.floor(this.fuelDebt);
    this.fuelDebt -= burn;
    result.fuelBurn = Math.min(burn, Math.max(0, fuel));
    result.telegraph = result.nearest < 0 ? 0.0 : Math.max(0.0, Math.min(1.0, 1.0 - nearest / TELEGRAPH_RANGE));
    return result;
  }
}

// ---- Creature upgrade path (spec 166). Mirrors Core CreatureTiers: four tiers unlocked by state, seeded once per day phase, every appearance with a narrative cause the director accepts.

/** The director input a tier context stands for (Core DirectorInputFor). */
export const directorInputFor = (c) => ({ tick: c.tick, sanity: 1000 - Math.max(0, Math.min(100, c.dreadPercent)) * 10, knowledge: c.knowledgeTier * 200, stress: 0, safeZoneTicks: 0, clueProgress: 0, cultExposure: c.societyStage * 250, encounters: 0 });

/** The most corrupted villager: { stage, index } with the first roster index holding the highest stage; { 0, -1 } when nobody has reached Uneasy. */
export function mostCorrupted(society, rosterLength, night, dread, ritualStage) {
  let best = 0, index = -1;
  for (let i = 0; i < rosterLength; i++) { const s = society.corruptionAt(i, night, dread, ritualStage); if (s > best) { best = s; index = i; } }
  return { stage: best, index };
}

/** Whether the context meets every unlock condition of the entry. Context: { seed, gridW, gridD, tick, dreadPercent, societyStage, corruptedVillager, knowledgeTier, cosmicOmens, placeId, lastGlimpseTick, reducedMotion }. */
export function tierUnlocked(def, c) {
  const phase = phaseAt(c.tick);
  const phaseOk = def.phase === 'any' || (def.phase === 'night' && phase === NIGHT) || (def.phase === 'dusk_night' && (phase === DUSK || phase === NIGHT));
  const inPlace = !!c.placeId;
  const contextOk = def.context === 'any' || (def.context === 'place' ? inPlace : !inPlace);
  const cooled = def.tier !== 4 || c.lastGlimpseTick < 0 || c.tick - c.lastGlimpseTick >= GLIMPSE_COOLDOWN_TICKS;
  const subjectOk = def.tier !== 2 || c.corruptedVillager >= 0;
  return phaseOk && contextOk && cooled && subjectOk && c.dreadPercent >= def.minDread && c.societyStage >= def.society && c.knowledgeTier >= def.knowledge && c.cosmicOmens >= def.omens;
}

/** The appearances for the current day phase, at most one per tier in tier order. places (may be null) keeps village spawns out of place footprints; rejected (may be null) collects dropped entries. */
export function selectAppearances(c, cat, places = null, rejected = null) {
  const result = [];
  if (!cat || !cat.manifestations.length || c.gridW <= 0 || c.gridD <= 0) return result;
  const day = Math.floor(c.tick / MINUTES_PER_DAY);
  const slot = day * 4 + phaseAt(c.tick);
  const input = directorInputFor(c);
  for (let tier = 1; tier <= TIER_COUNT; tier++) {
    const eligible = cat.manifestations.filter((d) => d.tier === tier && tierUnlocked(d, c));
    if (!eligible.length) continue;
    const rng = new SeededRandom((c.seed ^ TIER_SALT ^ Math.imul(slot, STATE_STEP) ^ Math.imul(tier, KIND_STEP)) | 0);
    const def = eligible[rng.next(eligible.length)];
    if (rng.next(100) >= def.chance) continue;
    if (!causeHolds(def.cause, input)) { if (rejected) rejected.push(`${def.id}: cause ${def.cause} does not hold`); continue; }
    const a = { defId: def.id, tier, cause: def.cause, ward: def.ward, still: !!c.reducedMotion, subject: -1, placeId: '', x: 0, z: 0, seconds: 0 };
    if (tier === 2 || def.id === 'doubled_villager') a.subject = c.corruptedVillager;
    if (def.context === 'place') a.placeId = c.placeId || '';
    else {
      const w = c.gridW * CELL_M, d = c.gridD * CELL_M;
      let x = 0, z = 0;
      for (let t = 0; t < POSITION_TRIES; t++) {
        x = rng.next(1000) / 1000.0 * w; z = rng.next(1000) / 1000.0 * d;
        if (!insideAnyPlace(places, x, z)) break;
      }
      a.x = x; a.z = z;
    }
    a.seconds = tier === 4 ? (c.reducedMotion ? GLIMPSE_REDUCED_SECONDS : GLIMPSE_SECONDS) : 0.0;
    result.push(a);
  }
  return result;
}

/** Whether the appearance is still on screen after elapsedSeconds. Tier 4 ends at its capped exposure. */
export const appearanceVisible = (a, elapsedSeconds) => a.tier !== 4 || (elapsedSeconds >= 0 && elapsedSeconds < Math.min(a.seconds, MAX_GLIMPSE_SECONDS));

/** Only tier 1 is warded; tier 2 is avoided by distance and tiers 3 and 4 are only witnessed. */
export const wardTurns = (a, action) => a.ward === 'warded' && TIER_WARD_ACTIONS.includes(action);

export const witnessClueId = (defId) => WITNESS_PREFIX + defId;
export const isWitnessClue = (id) => typeof id === 'string' && id.startsWith(WITNESS_PREFIX);
export const manifestationName = (def, lang) => def.names[lang] || def.names.en;
export const manifestationText = (def, lang) => def.texts[lang] || def.texts.en;
export const manifestationWitness = (def, lang) => def.witness[lang] || def.witness.en;
