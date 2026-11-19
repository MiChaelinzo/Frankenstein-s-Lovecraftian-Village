// Lore book DOM: the aged-paper page dialog, the codex lore list and the scene/marker data for the 3D and 2D views. The rules (placement, reading effects) come from
// lore.js (Core mirror). Reading applies its clue and sanity effect through deps.applyEffect from Core data only; book text is only ever written with textContent.
import { placeBooks, readBook, bookTitle, bookText, parseLoreLibrary } from './lore.js';
import { esc } from './util.js';

export const BOOK_PICK_HEIGHT = 0.25; // metres above the ground: the centre of the book prop for the view ray picker
export const LORE_ID_RE = /^[bjp]\d{2}$/; // b: found books, j: villager journals, p: missing person pages

/**
 * deps: { $, tr, lang, state (seed, layout), gridW, gridD, announce(text), applyEffect(result, book), journal(text), story() -> the village story or null, exitPointerLock(), activeElement(), keyTarget, onChange() }
 */
export function createLoreController(deps) {
  const { $, tr, state } = deps;
  const read = new Set();
  let library = null, placed = [], placedKey = '', returnFocus = null, cursor = -1, readSeed = null;

  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  function setLibrary(json) { library = json ? parseLoreLibrary(json) : null; placedKey = ''; renderList(); }
  function ensure() {
    if (readSeed !== state.seed) { read.clear(); readSeed = state.seed; cursor = -1; } // books belong to one village: a new seed starts with none read
    const story = deps.story ? deps.story() : null;
    const key = `${state.seed}|${state.layout.length}|${library ? library.books.length : 0}|${story ? story.missing.map((m) => m.id).join('+') : ''}`;
    if (key !== placedKey) { placedKey = key; placed = library && state.layout.length ? placeBooks(state.seed, deps.gridW, deps.gridD, state.layout, library, story) : []; }
    return placed;
  }
  const titleOf = (b) => { const st = deps.story ? deps.story() : null; return st ? st.bookTitle(b, lang()) : bookTitle(b, lang()); };
  const textOf = (b) => { const st = deps.story ? deps.story() : null; return st ? st.bookText(b, lang()) : bookText(b, lang()); };
  const lockedText = (b, p) => {
    const st = deps.story ? deps.story() : null, owner = st && p.place === 'journal' ? st.journalOwner(b) : -1;
    if (owner >= 0) { const v = st.roster[owner]; return tr('lore.locked.journal', { home: st.pieceName(v.homeIndex, lang(), v.name.split(' ').pop()) }); }
    return tr('lore.locked', { place: tr(`lore.place.${p.place}`) });
  };
  const spot = (id) => ensure().find((p) => p.bookId === id) || null;

  /** 3D scene entries (metres) for the renderer, the view ray picker and the prompt. */
  const scene = () => ensure().map((p) => ({ id: p.bookId, pos: [p.x, BOOK_PICK_HEIGHT, p.z], read: read.has(p.bookId) }));
  /** Minimap markers in pixels for a size x size map. */
  const markers = (size) => ensure().map((p) => ({ id: p.bookId, x: (p.x / Math.max(1, deps.gridW * 4)) * size, y: (p.z / Math.max(1, deps.gridD * 4)) * size, read: read.has(p.bookId) }));

  function renderList() {
    const el = $('loreList'), meta = $('loreMeta');
    if (!el) return;
    const list = ensure();
    if (meta) meta.textContent = tr('lore.progress', { n: list.filter((p) => read.has(p.bookId)).length, total: list.length });
    el.innerHTML = list.map((p) => {
      const b = library.find(p.bookId), place = esc(tr(`lore.place.${p.place}`));
      return read.has(p.bookId)
        ? `<li><strong>${esc(titleOf(b))}</strong> <em>${place}</em><p class="lore-text">${esc(textOf(b))}</p></li>`
        : `<li class="locked"><strong>???</strong> ${esc(lockedText(b, p))}</li>`;
    }).join('');
  }

  function showDialog(book, result) {
    $('loreTitle').textContent = titleOf(book);
    $('loreText').textContent = textOf(book);
    const effect = [];
    if (result.yieldsClue) effect.push(tr('villagerui.effect.clue'));
    if (result.sanityDelta !== 0) effect.push(tr('villagerui.effect.sanity', { n: result.sanityDelta }));
    $('loreEffect').textContent = result.firstRead ? effect.join(' ') : tr('lore.reread');
    $('loreDialog').hidden = false;
    deps.exitPointerLock?.();
    returnFocus = deps.activeElement ? deps.activeElement() : null;
    $('loreClose').focus?.();
  }

  /** Reads a book by id. The first reading applies its effects and writes the journal and codex entries. Returns the Core result, or null for an unknown id. */
  function readById(id) {
    const book = library && library.find(id), p = spot(id);
    if (!book || !p) return null;
    const result = readBook(book, read.has(id));
    cursor = ensure().indexOf(p);
    if (result.firstRead) {
      read.add(id);
      deps.applyEffect(result, book); // clue and sanity first, from Core data only
      deps.journal(tr('lore.journal', { title: titleOf(book), place: tr(`lore.place.${p.place}`) }));
      renderList();
    }
    showDialog(book, result);
    deps.announce(`${titleOf(book)}. ${textOf(book)}`);
    deps.onChange?.();
    return result;
  }

  /** Reads the next unread book (the 2D view has no player position), then the following ones in order. Null when there are no books. */
  function readNext() {
    const list = ensure();
    if (!list.length) return null;
    const order = list.map((p, i) => (i + cursor + 1) % list.length);
    const pick = order.find((i) => !read.has(list[i].bookId));
    return readById(list[pick === undefined ? order[0] : pick].bookId);
  }

  function close() {
    const dlg = $('loreDialog');
    if (!dlg || dlg.hidden !== false) return false;
    dlg.hidden = true;
    returnFocus?.focus?.(); returnFocus = null;
    return true;
  }
  const isOpen = () => { const d = $('loreDialog'); return !!d && d.hidden === false; };

  deps.keyTarget?.addEventListener?.('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' || e.code === 'KeyE' || e.key === 'e' || e.key === 'E' || e.key === 'Enter') { close(); e.preventDefault?.(); e.stopImmediatePropagation?.(); }
  }, true);
  $('loreClose')?.addEventListener?.('click', close);

  return {
    setLibrary, library: () => library, readIds: () => new Set(read), scene, markers, readById, readNext, close, isOpen, renderList,
    get hasBooks() { return ensure().length > 0; },
    snapshot: () => { ensure(); return { lore: [...read] }; },
    restore(s) { ensure(); read.clear(); for (const id of (s && s.lore) || []) if (LORE_ID_RE.test(id)) read.add(id); renderList(); },
  };
}
