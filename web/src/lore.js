// Mirror of Core/LoreBooks.cs (golden-checked, key "lore"): the lore book data file, seeded placement and the reading rules. Pure, no DOM.
// The data file web/data/lore_books.json is a byte copy of Packages/.../Data/lore_books.json (tools/validate_repo.py and a test check it).
import { SeededRandom } from './core.js';
import { landmarkDressing, landmarkPathDressing, landmarkBookSpots } from './landmarks.js';
import { composeDressing, dressingBoxes, footprintOf, dockU, walkBounds, coastToWorldAt, coastSideOf, CELL_M } from './dressing.js';
import { isBuilding, facingYaw } from './streets.js';
import { ROLE_IDS } from './villagers.js';
import { insideAnyPlace } from './places.js';

export const LORE_PLACES = ['house', 'chapel', 'inn', 'lighthouse', 'harbour', 'grave', 'cliffs', 'shipwreck', 'abbey', 'marsh', 'journal', 'standing_stones', 'hidden_cove', 'ritual_site', 'catacombs'];
export const LORE_PER_PLACE = [3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 7, 1, 1, 1, 1];
export const LORE_LANGUAGES = ['en', 'fr'];
export const PLACE_SALT_BASE = 0x10b0c, PLACE_SALT_STEP = 4099;
export const HOUSE_BOOK_OFFSET = 0.6, COAST_BOOK_V = -1.2, DOCK_BOOK_U = 1.3, GRAVE_BOOK_OFFSET = 0.6, CLEARANCE = 0.3;
export const LATERAL = [0, 1.5, -1.5];
export const CLUE_ID_PREFIX = 'book@';
export const JOURNAL_SPACING = 0.5;

/** Parses the data file (object or text). Throws an Error naming the offending book when it is malformed. */
export function parseLoreLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || !Array.isArray(root.books)) throw new Error('lore: missing books array');
  const seen = new Set();
  const books = root.books.map((o) => {
    const id = o && typeof o.id === 'string' && o.id ? o.id : '?';
    if (seen.has(id)) throw new Error(`lore: duplicate book id ${id}`);
    seen.add(id);
    if (!LORE_PLACES.includes(o.place)) throw new Error(`lore: ${id} has unknown place ${o.place}`);
    const sanity = typeof o.sanity === 'number' ? Math.trunc(o.sanity) : 0;
    if (sanity > 0) throw new Error(`lore: ${id} has a positive sanity change`);
    const titles = {}, texts = {};
    for (const lang of LORE_LANGUAGES) {
      const t = o[lang];
      if (!t || typeof t.title !== 'string' || !t.title || typeof t.text !== 'string' || !t.text) throw new Error(`lore: ${id} lacks ${lang} title or text`);
      titles[lang] = t.title; texts[lang] = t.text;
    }
    const role = typeof o.role === 'string' ? o.role : '', missing = typeof o.missing === 'string' ? o.missing : '';
    if ((o.place === 'journal') !== (role.length > 0)) throw new Error(`lore: ${id} needs a role exactly when its place is journal`);
    if (role && !ROLE_IDS.includes(role)) throw new Error(`lore: ${id} has unknown role ${role}`);
    return { id, place: o.place, sanity, clue: o.clue === true, role, missing, titles, texts };
  });
  return { books, find: (id) => books.find((b) => b.id === id) || null };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) { const j = rng.next(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
}

/** True when a book at (x, z) is outside the walkable area, inside a layout cell rectangle (0.3 m clearance), inside a solid prop's walking box or inside a place footprint plus margin (places: the placements of placeAll, may be null). */
export function isBlocked(x, z, layout, boxes, seed, gridW, gridD, places = null) {
  const b = walkBounds(seed, gridW, gridD);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
  if (insideAnyPlace(places, x, z)) return true;
  if (layout) for (const p of layout) if (x > p.x * CELL_M - CLEARANCE && x < (p.x + p.sizeX) * CELL_M + CLEARANCE && z > p.z * CELL_M - CLEARANCE && z < (p.z + p.sizeZ) * CELL_M + CLEARANCE) return true;
  return boxes.some((bx) => x > bx.minX && x < bx.maxX && z > bx.minZ && z < bx.maxZ);
}

/** The spots in front of a building (street side), each with the lateral alternatives. */
export function frontSpots(p, laterals = LATERAL) {
  const yaw = facingYaw(p.facing | 0), dirX = Math.sin(yaw), dirZ = Math.cos(yaw), sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
  const half = ((p.facing | 0) % 2 === 0 ? p.sizeZ : p.sizeX) * CELL_M / 2, cx = (p.x + p.sizeX / 2) * CELL_M, cz = (p.z + p.sizeZ / 2) * CELL_M, d = half + HOUSE_BOOK_OFFSET;
  return laterals.map((lat) => [cx + dirX * d + sideX * lat, cz + dirZ * d + sideZ * lat]);
}

function spotsFor(place, seed, gridW, gridD, buildings, items, rng) {
  const spots = [], side = coastSideOf(seed);
  const onCoast = (u) => LATERAL.map((lat) => { const w = coastToWorldAt(seed, gridW, u + lat, COAST_BOOK_V); return [w.x, w.z]; });
  if (place === 'house') {
    const order = [...buildings];
    shuffle(order, rng);
    for (const p of order) spots.push(frontSpots(p));
  } else if (place === 'chapel' || place === 'inn' || place === 'lighthouse') {
    const it = items.find((o) => o.kind === place);
    if (it) spots.push(onCoast(side === 2 ? it.x : it.z));
  } else if (place === 'harbour') {
    spots.push(onCoast(dockU(seed, gridW, gridD) + DOCK_BOOK_U));
  } else if (place === 'cliffs' || place === 'shipwreck' || place === 'abbey' || place === 'marsh' || place === 'standing_stones' || place === 'hidden_cove' || place === 'ritual_site' || place === 'catacombs') {
    spots.push(...landmarkBookSpots(place, seed, gridW, gridD, LATERAL));
  } else {
    const stones = items.filter((o) => (o.kind === 'gravestone' || o.kind === 'gravestone_cross') && o.y < 0.01);
    shuffle(stones, rng);
    for (const s of stones) { const d = footprintOf(s.kind).halfZ + GRAVE_BOOK_OFFSET; spots.push([[s.x - Math.sin(s.yaw) * d, s.z - Math.cos(s.yaw) * d]]); }
  }
  return spots;
}

/**
 * The books of one village in place order: [{ bookId, place, x, z }] in metres. Places with no free spot give no book. Without a story (buildStory) there are no journals
 * and no missing person pages; with one, each missing person's page is placed first at its landmark and each villager's journal lies in front of their home.
 */
export function placeBooks(seed, gridW, gridD, layout, library, story = null, places = null) {
  const result = [];
  if (!library || gridW <= 0 || gridD <= 0) return result;
  const items = [...composeDressing(seed, gridW, gridD, layout), ...landmarkDressing(seed, gridW, gridD), ...landmarkPathDressing(seed, gridW, gridD)], boxes = dressingBoxes(items);
  const buildings = (layout || []).filter((p) => isBuilding(p.sizeX, p.sizeZ));
  LORE_PLACES.forEach((place, pi) => {
    if (place === 'journal') { placeJournals(result, story, library, layout, boxes, seed, gridW, gridD, places); return; }
    const rng = new SeededRandom(seed ^ (PLACE_SALT_BASE + pi * PLACE_SALT_STEP));
    let books = library.books.filter((b) => b.place === place && (!b.missing || (story && story.hasMissing(b.missing))));
    shuffle(books, rng);
    books = [...books.filter((b) => b.missing), ...books.filter((b) => !b.missing)]; // missing person pages first
    const spots = spotsFor(place, seed, gridW, gridD, buildings, items, rng);
    let taken = 0;
    for (const alts of spots) {
      if (taken >= LORE_PER_PLACE[pi] || taken >= books.length) break;
      const c = alts.find((a) => !isBlocked(a[0], a[1], layout, boxes, seed, gridW, gridD, places));
      if (c) { result.push({ bookId: books[taken].id, place, x: c[0], z: c[1] }); taken++; }
    }
  });
  return result;
}

/** One journal per villager, in roster order, in front of their home; a spot already taken by another book gives way to the next lateral one. */
function placeJournals(result, story, library, layout, boxes, seed, gridW, gridD, places) {
  if (!story || !layout) return;
  for (const v of story.roster) {
    if (v.homeIndex < 0 || v.homeIndex >= layout.length) continue;
    const book = library.books.find((b) => b.place === 'journal' && b.role === ROLE_IDS[v.role]);
    if (!book) continue;
    const c = frontSpots(layout[v.homeIndex]).find((a) => !isBlocked(a[0], a[1], layout, boxes, seed, gridW, gridD, places) && !result.some((p) => Math.abs(p.x - a[0]) < JOURNAL_SPACING && Math.abs(p.z - a[1]) < JOURNAL_SPACING));
    if (c) result.push({ bookId: book.id, place: 'journal', x: c[0], z: c[1] });
  }
}

/** What reading a book does. Only the first reading has effects. */
export function readBook(book, alreadyRead) {
  if (!book || alreadyRead) return { firstRead: false, sanityDelta: 0, yieldsClue: false, clueId: '' };
  return { firstRead: true, sanityDelta: book.sanity, yieldsClue: book.clue, clueId: book.clue ? CLUE_ID_PREFIX + book.id : '' };
}

/** Display text for a language (English when the language has none). */
export const bookTitle = (book, lang) => book.titles[lang] || book.titles.en;
export const bookText = (book, lang) => book.texts[lang] || book.texts.en;
