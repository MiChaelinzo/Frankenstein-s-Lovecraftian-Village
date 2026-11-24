// Round 26: JS port of Core/InvestigationModel.cs (investigation board, authored contradictions, timeline). Golden key "investigation". Pure, no DOM.
// The data file web/data/statements.json is a byte copy of Packages/.../Data/statements.json (tools/validate_repo.py and a test check it).
import { ROLE_IDS } from './villagers.js';
import { LANDMARK_IDS, landmarkName } from './landmarks.js';
import { landmarkTitle } from './names.js';
import { MINUTES_PER_DAY } from './clock.js';
import { CLUE_ID_PREFIX } from './lore.js';
import { CORRUPTION_CORRUPTED } from './society.js';
import { ID_PREFIX as MYTHOS_ID_PREFIX, mythosStatements, mythosText, isDistorted, truthStatementId } from './mythos.js';

export const SOURCE_IDS = ['chat', 'journal', 'lore', 'clue'];
export const NEEDS_IDS = ['none', 'corrupted_speaker'];
export const [SOURCE_CHAT, SOURCE_JOURNAL, SOURCE_LORE, SOURCE_CLUE] = [0, 1, 2, 3];
export const [NEEDS_NONE, NEEDS_CORRUPTED_SPEAKER] = [0, 1];
export const [CARD_SUSPECT, CARD_VICTIM, CARD_LOCATION, CARD_CLUE, CARD_EVENT] = [0, 1, 2, 3, 4];
export const [LINK_VILLAGER_HOME, LINK_VILLAGER_FAMILY, LINK_VILLAGER_JOURNAL, LINK_VILLAGER_MISSING, LINK_LANDMARK_LEGEND, LINK_CLUE_SUBJECT] = [0, 1, 2, 3, 4, 5];
export const HOME_PLACE = 'home';
export const INVALIDATED_PENALTY = 30, MAX_KNOWLEDGE_TIER = 5;

/** Confidence (whole percent) of a statement the data file gives none: journals are written down, chats are spoken, lore is hearsay, clues are physical. Core DefaultConfidence. */
export const defaultConfidence = (source) => (source === SOURCE_JOURNAL ? 80 : source === SOURCE_LORE ? 65 : source === SOURCE_CLUE ? 90 : 60);

/**
 * Knowledge sources the evidence has earned (Core InvestigationRules.KnowledgeSources): one 'journal' per villager journal read (lore id j and two digits), one 'investigation' per clue id found,
 * one 'mythos_event' per mythos statement heard. The knowledge tier is derived from this, so it needs no save of its own.
 */
export function knowledgeSources(e) {
  const sources = [];
  for (const id of e.booksRead) if (/^j\d\d$/.test(id)) sources.push('journal');
  for (let i = 0; i < e.clueIds.size; i++) sources.push('investigation');
  const heard = new Set();
  for (const h of e.heard) if (h.statementId.startsWith('mythos:') && !heard.has(h.statementId)) { heard.add(h.statementId); sources.push('mythos_event'); }
  return sources;
}

/** Belief in a statement, whole percent 0..100: its confidence, less INVALIDATED_PENALTY when its speaker is corrupted. Core BeliefScore. */
export const beliefScore = (confidence, invalidated) => Math.max(0, Math.min(100, confidence - (invalidated ? INVALIDATED_PENALTY : 0)));
export const STATEMENT_LANGUAGES = ['en', 'fr'];
export const SUSPECT_PREFIX = 'suspect:', VICTIM_PREFIX = 'victim:', HOME_PREFIX = 'location:home:', LANDMARK_PREFIX = 'location:landmark:', CLUE_PREFIX = 'clue:', LEGEND_PREFIX = 'clue:legend:', EVENT_PREFIX = 'event:';

export const suspectId = (villager) => SUSPECT_PREFIX + villager;
export const victimId = (missing) => VICTIM_PREFIX + missing;
export const homeId = (piece) => HOME_PREFIX + piece;
export const landmarkId = (landmark) => LANDMARK_PREFIX + landmark;
export const clueCardId = (clueId) => CLUE_PREFIX + clueId;
export const eventId = (statementId) => EVENT_PREFIX + statementId;

const str = (o, key, owner) => { if (!o || typeof o[key] !== 'string' || !o[key]) throw new Error(`statements: ${owner} lacks ${key}`); return o[key]; };
const opt = (o, key) => (typeof o[key] === 'string' ? o[key] : '');
const intOf = (o, key, owner) => { if (typeof o[key] !== 'number') throw new Error(`statements: ${owner} lacks ${key}`); return Math.trunc(o[key]); };
function text(o, owner) {
  const t = {};
  for (const lang of STATEMENT_LANGUAGES) {
    if (typeof o[lang] !== 'string' || !o[lang].trim()) throw new Error(`statements: ${owner} lacks ${lang} text`);
    t[lang] = o[lang];
  }
  return t;
}
const list = (root, key) => { if (!Array.isArray(root[key])) throw new Error(`statements: missing ${key} array`); return root[key]; };

/** Parses the data file (object or text). Throws an Error naming the offending entry when it is malformed. */
export function parseStatementLibrary(input) {
  const root = typeof input === 'string' ? JSON.parse(input) : input;
  if (!root || typeof root !== 'object') throw new Error('statements: root is not an object');
  const statements = [];
  for (const o of list(root, 'statements')) {
    const id = str(o, 'id', 'statement'), source = SOURCE_IDS.indexOf(str(o, 'source', `statement ${id}`));
    if (source < 0) throw new Error(`statements: ${id} has an unknown source`);
    if (statements.some((s) => s.id === id)) throw new Error(`statements: duplicate id ${id}`);
    const s = { id, source, role: opt(o, 'role'), ref: opt(o, 'ref'), place: opt(o, 'place'), night: intOf(o, 'night', id), minute: intOf(o, 'minute', id), text: text(o, `statement ${id}`) };
    if (s.role && !ROLE_IDS.includes(s.role)) throw new Error(`statements: ${id} has an unknown role`);
    if (s.place && s.place !== HOME_PLACE && !LANDMARK_IDS.includes(s.place)) throw new Error(`statements: ${id} has an unknown place`);
    if (s.night < 0 || s.minute < 0 || s.minute >= MINUTES_PER_DAY) throw new Error(`statements: ${id} has night or minute out of range`);
    if (s.source === SOURCE_JOURNAL && !s.role) throw new Error(`statements: ${id} is a journal without a role`);
    if ((s.source === SOURCE_LORE || s.source === SOURCE_CLUE) && !s.ref) throw new Error(`statements: ${id} needs a ref`);
    s.confidence = typeof o.confidence === 'number' ? Math.trunc(o.confidence) : defaultConfidence(s.source);
    if (s.confidence < 0 || s.confidence > 100) throw new Error(`statements: ${id} has confidence outside 0 to 100`);
    statements.push(s);
  }
  const find = (id) => statements.find((s) => s.id === id) || null;
  const contradictions = list(root, 'contradictions').map((o) => {
    const id = str(o, 'id', 'contradiction'), needs = NEEDS_IDS.indexOf(str(o, 'needs', `contradiction ${id}`));
    if (needs < 0) throw new Error(`statements: contradiction ${id} has unknown needs`);
    const c = { id, a: str(o, 'a', `contradiction ${id}`), b: str(o, 'b', `contradiction ${id}`), needs, reason: text(o, `contradiction ${id}`) };
    if (c.a === c.b || !find(c.a) || !find(c.b)) throw new Error(`statements: contradiction ${id} refers to unknown or identical statements`);
    if (typeof o.resolvesAt === 'number') {
      c.resolvesAtKnowledge = Math.trunc(o.resolvesAt);
      const a = find(c.a), b = find(c.b);
      if (c.resolvesAtKnowledge < 1 || c.resolvesAtKnowledge > MAX_KNOWLEDGE_TIER) throw new Error(`statements: contradiction ${id} resolvesAt is outside 1 to the top knowledge tier`);
      if (a.night < 1 || b.night < 1 || a.night === b.night) throw new Error(`statements: contradiction ${id} resolvesAt needs statements about two different nights`);
    } else c.resolvesAtKnowledge = 0;
    return c;
  });
  return { statements, contradictions, find };
}

/** Empty evidence: clueIds and booksRead are Sets of strings, met a Set of roster indices, heard a list of { villager, statementId, night }. */
export const emptyEvidence = () => ({ clueIds: new Set(), booksRead: new Set(), met: new Set(), heard: [] });

const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const stageOf = (corruption, villager) => (corruption && villager >= 0 && villager < corruption.length ? corruption[villager] : 0);
const isCorrupted = (stage) => stage >= CORRUPTION_CORRUPTED;
const heardIndex = (e, statementId) => e.heard.findIndex((h) => h.statementId === statementId);
const journalOfRole = (lore, role) => lore.books.find((b) => b.role === role) || null;
const bookRead = (e, b) => b !== null && e.booksRead.has(b.id);

export const villagerOfRole = (roster, role) => { const v = roster.find((x) => ROLE_IDS[x.role] === role); return v ? v.index : -1; };

export function speakerOf(s, roster, e) {
  if (s.role) return villagerOfRole(roster, s.role);
  const h = heardIndex(e, s.id);
  return h < 0 ? -1 : e.heard[h].villager;
}

export function isRevealed(s, lore, e) {
  switch (s.source) {
    case SOURCE_CHAT: return heardIndex(e, s.id) >= 0;
    case SOURCE_JOURNAL: return bookRead(e, journalOfRole(lore, s.role));
    case SOURCE_LORE: return e.booksRead.has(s.ref);
    default: return e.clueIds.has(s.ref);
  }
}

/** Orders events by night, clock minute, statement id (ordinal), then villager. A total order. */
export function orderTimeline(events) {
  return events.slice().sort((x, y) => (x.night - y.night) || (x.minute - y.minute) || ordinal(x.statementId, y.statementId) || (x.villager - y.villager));
}

/**
 * Builds the board for the current evidence; corruption is the stage of each villager by roster index (or null). knowledge is the player's knowledge tier (0 by default, which gives
 * exactly the board without it): a contradiction whose resolvesAtKnowledge is at or below it moves from contradictions to resolutions (the statements speak of different nights).
 * scores lists confidence and belief of every revealed authored statement.
 */
export function buildBoard(story, lore, statements, evidence, corruption = null, mythos = null, knowledge = 0) {
  const cards = [], links = [], contradictions = [], resolutions = [], scores = [], index = new Map(), roster = story.roster;
  const addCard = (kind, id, key, revealed) => {
    const existing = index.get(id);
    if (existing) { existing.revealed = existing.revealed || revealed; return existing; }
    const card = { kind, id, key, revealed, invalidated: false };
    index.set(id, card); cards.push(card);
    return card;
  };
  const addLink = (kind, from, to, revealed) => links.push({ kind, from, to, revealed });

  for (const v of roster) addCard(CARD_SUSPECT, suspectId(v.index), String(v.index), evidence.met.has(v.index)).invalidated = isCorrupted(stageOf(corruption, v.index));
  for (let k = 0; k < story.missing.length; k++) addCard(CARD_VICTIM, victimId(k), String(k), false);

  for (const v of roster) {
    if (v.homeIndex < 0) continue;
    const home = homeId(v.homeIndex), met = evidence.met.has(v.index);
    addCard(CARD_LOCATION, home, String(v.homeIndex), met);
    addLink(LINK_VILLAGER_HOME, suspectId(v.index), home, met);
  }
  for (const fam of story.families)
    for (let a = 0; a < fam.members.length; a++)
      for (let b = a + 1; b < fam.members.length; b++)
        addLink(LINK_VILLAGER_FAMILY, suspectId(fam.members[a]), suspectId(fam.members[b]), evidence.met.has(fam.members[a]) && evidence.met.has(fam.members[b]));

  for (const book of lore.books) {
    if (!book.role) continue;
    const owner = story.journalOwner(book);
    if (owner < 0) continue;
    const read = evidence.booksRead.has(book.id), cardId = clueCardId(CLUE_ID_PREFIX + book.id);
    addCard(CARD_CLUE, cardId, book.id, read);
    addLink(LINK_VILLAGER_JOURNAL, suspectId(owner), cardId, read);
  }
  for (let k = 0; k < story.missing.length; k++) {
    const m = story.missing[k], missingBook = lore.books.find((b) => b.missing === m.id) || null, pageRead = bookRead(evidence, missingBook);
    if (missingBook) addCard(CARD_CLUE, clueCardId(CLUE_ID_PREFIX + missingBook.id), missingBook.id, pageRead);
    for (const who of [m.kinIndex, m.witnessIndex]) {
      if (who < 0) continue;
      const journalRead = lore.books.some((b) => b.role && story.journalOwner(b) === who && evidence.booksRead.has(b.id)), revealed = pageRead || journalRead;
      addLink(LINK_VILLAGER_MISSING, suspectId(who), victimId(k), revealed);
      if (revealed) index.get(victimId(k)).revealed = true;
    }
  }

  for (const landmark of LANDMARK_IDS) {
    const placeRead = lore.books.some((b) => b.place === landmark && evidence.booksRead.has(b.id));
    addCard(CARD_LOCATION, landmarkId(landmark), landmark, placeRead);
    if (!story.lib.legends.some((l) => l.id === landmark)) continue;
    addCard(CARD_CLUE, LEGEND_PREFIX + landmark, landmark, placeRead);
    addLink(LINK_LANDMARK_LEGEND, landmarkId(landmark), LEGEND_PREFIX + landmark, placeRead);
  }

  const found = [...evidence.clueIds];
  for (const id of evidence.booksRead) { const b = lore.find(id); if (b && b.clue) found.push(CLUE_ID_PREFIX + id); }
  found.sort(ordinal);
  const seen = new Set();
  for (const clueId of found) {
    if (seen.has(clueId)) continue;
    seen.add(clueId);
    const cardId = clueCardId(clueId), existed = index.has(cardId);
    addCard(CARD_CLUE, cardId, clueId, true);
    if (existed || !clueId.startsWith(CLUE_ID_PREFIX)) continue;
    const book = lore.find(clueId.slice(CLUE_ID_PREFIX.length));
    if (book && index.has(landmarkId(book.place))) addLink(LINK_CLUE_SUBJECT, cardId, landmarkId(book.place), true);
  }

  const revealed = new Set(), events = [];
  for (const s of statements.statements) {
    if (!isRevealed(s, lore, evidence)) continue;
    revealed.add(s.id);
    const speaker = speakerOf(s, roster, evidence), h = heardIndex(evidence, s.id);
    const night = s.night > 0 ? s.night : Math.max(1, h >= 0 ? evidence.heard[h].night : 1);
    const card = addCard(CARD_EVENT, eventId(s.id), s.id, true);
    card.invalidated = isCorrupted(stageOf(corruption, speaker));
    scores.push({ statementId: s.id, confidence: s.confidence, belief: beliefScore(s.confidence, card.invalidated) });
    events.push({ statementId: s.id, villager: speaker, night, minute: s.minute });
  }
  for (const c of statements.contradictions) {
    if (!revealed.has(c.a) || !revealed.has(c.b)) continue;
    if (c.needs === NEEDS_CORRUPTED_SPEAKER && !isCorrupted(stageOf(corruption, speakerOf(statements.find(c.b), roster, evidence)))) continue;
    const pair = { pairId: c.id, cardA: eventId(c.a), cardB: eventId(c.b) };
    (c.resolvesAtKnowledge > 0 && knowledge >= c.resolvesAtKnowledge ? resolutions : contradictions).push(pair);
  }
  if (mythos && mythos.current) addMythos(contradictions, mythos, evidence, corruption, addCard, events);
  return { cards, links, contradictions, resolutions, scores, timeline: orderTimeline(events) };
}

/** Round 27: an Event card for every mythos statement the player heard. A rumor passed on distorted is invalidated and contradicts the statement it distorts once that is heard too. */
function addMythos(contradictions, mythos, evidence, corruption, addCard, events) {
  for (const s of mythosStatements(mythos)) {
    const h = heardIndex(evidence, s.id);
    if (h < 0) continue;
    const speaker = evidence.heard[h].villager, distorted = isDistorted(s.rumor, speaker);
    addCard(CARD_EVENT, eventId(s.id), s.id, true).invalidated = isCorrupted(stageOf(corruption, speaker)) || distorted;
    events.push({ statementId: s.id, villager: speaker, night: s.night, minute: s.minute });
    if (!s.rumor || !distorted) continue;
    const truth = truthStatementId(s.rumor);
    if (truth && heardIndex(evidence, truth) >= 0) contradictions.push({ pairId: `${s.id}~${truth}`, cardA: eventId(s.id), cardB: eventId(truth) });
  }
}

/** The text a card shows in a language, from the story's own names (round 24 seeded landmark names through nameLib when given). */
export function cardTitle(card, story, lore, statements, nameLib, lang, mythos = null) {
  const pick = (t) => (t ? t[lang] || t.en : '');
  switch (card.kind) {
    case CARD_SUSPECT: return story.roster[Number(card.key)].name;
    case CARD_VICTIM: { const m = story.missing[Number(card.key)]; return `${pick(story.lib.missing[m.dataIndex].given)} ${story.families[m.familyIndex].surname}`; }
    case CARD_LOCATION: {
      if (card.id.startsWith(LANDMARK_PREFIX)) { const seeded = nameLib ? landmarkTitle(nameLib, story.seed, card.key) : null; return seeded ? pick(seeded) : landmarkName(card.key, lang); }
      const piece = Number(card.key), owner = piece >= 0 && piece < story.owners.length && story.owners[piece] >= 0 ? story.lib.families[story.owners[piece]].surname : '';
      return story.pieceName(piece, lang, owner);
    }
    case CARD_CLUE: {
      if (card.id.startsWith(LEGEND_PREFIX)) { const l = story.lib.legends.find((x) => x.id === card.key); if (l) return pick(l.title); }
      const book = lore.find(card.key.startsWith(CLUE_ID_PREFIX) ? card.key.slice(CLUE_ID_PREFIX.length) : card.key);
      return book ? story.bookTitle(book, lang) : card.key;
    }
    default: {
      if (mythos && card.key.startsWith(MYTHOS_ID_PREFIX)) { const ms = mythosStatements(mythos).find((x) => x.id === card.key); if (ms) return mythosText(mythos, story, ms, card.invalidated, lang); }
      const s = statements.find(card.key); return s ? pick(s.text) : card.key; }
  }
}
