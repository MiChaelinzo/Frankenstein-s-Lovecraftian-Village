// Inventory DOM: the satchel panel (use, drop, store, take, sleep), the scene data for found items and chests, and the save string. The rules (placement, stacking, use effects,
// sleeping) come from inventory.js (Core mirror). Item names and texts are only ever written through esc() or textContent.
import { parseItemCatalog, Inventory, ItemWorld, itemName, itemText, canSleep, minutesToMorning, PLAYER_SLOTS, FUEL_MAX, CANDLE_FUEL_COST, SLEEP_SANITY_RESTORE, ITEM_CLUE_PREFIX } from './inventory.js';
import { esc } from './util.js';

export const PICKUP_HEIGHT = 0.15; // metres above the ground: the centre of an item for the view ray picker
export const PICKUP_ID_RE = /^[gc]\d{1,2}$/; // g: ground item, c: chest

/**
 * deps: { $, tr, lang, state (seed, layout), gridW, gridD, sanity() -> SanityModel, onSanity(delta), allows(actionId) -> bool (the vigil sandbox rule), clue(id), journal(text), announce(text),
 *   houseName(layoutIndex, lang) -> string, tickNow(), skipClock(minutes, done), in3d() -> bool, exitPointerLock(), activeElement(), keyTarget, onChange() }
 */
export function createInventoryController(deps) {
  const { $, tr, state } = deps;
  let cat = null, world = new ItemWorld(), player = new Inventory(PLAYER_SLOTS), builtKey = '', openChest = -1, gatherCursor = -1, chestCursor = -1, returnFocus = null, sleeping = false;

  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  const nameOf = (id) => { const d = cat && cat.find(id); return d ? itemName(d, lang()) : id; };

  function ensure() {
    const key = `${state.seed}|${state.layout.length}|${cat ? cat.items.length : 0}`;
    if (key === builtKey) return;
    builtKey = key; openChest = -1; gatherCursor = -1; chestCursor = -1;
    world = cat && state.layout.length ? ItemWorld.create(state.seed, deps.gridW, deps.gridD, state.layout, cat) : new ItemWorld();
    player = new Inventory(PLAYER_SLOTS);
  }
  function setCatalog(json) { cat = json ? parseItemCatalog(json) : null; builtKey = ''; render(); }
  const note = (key, vars) => { const el = $('invNote'); if (el) el.textContent = tr(key, vars); return tr(key, vars); };
  const chestLabel = (c) => tr(c.lodging ? 'inv.lodging' : 'inv.chest', { house: deps.houseName ? deps.houseName(c.houseIndex, lang()) : '' }).trim();

  /** 3D scene entries (metres) for the renderer and the view ray picker: items still on the ground and the chests. */
  function scene() {
    ensure();
    const out = [];
    world.ground.forEach((g, i) => { if (!world.picked.has(i)) out.push({ id: `g${i}`, pos: [g.x, PICKUP_HEIGHT, g.z], label: `${nameOf(g.itemId)}${g.count > 1 ? ` x${g.count}` : ''}` }); });
    world.chests.forEach((c, i) => out.push({ id: `c${i}`, pos: [c.x, PICKUP_HEIGHT, c.z], chest: true, lodging: c.lodging, label: chestLabel(c) }));
    return out;
  }

  function render() {
    const list = $('invList'); if (!list) return;
    ensure();
    const chest = openChest >= 0 ? world.chests[openChest] : null;
    const fuel = $('invFuel');
    if (fuel) fuel.textContent = tr('inv.fuel', { n: player.fuel, max: FUEL_MAX });
    const row = (s, buttons) => `<li><span class="inv-name">${esc(nameOf(s.id))}</span> <span class="inv-count">x${s.count}</span> ${buttons}</li>`;
    const btn = (act, id, key, extra = '') => `<button type="button" data-act="${act}" data-id="${esc(id)}" aria-label="${esc(tr(key))} ${esc(nameOf(id))}">${esc(tr(key))}</button>${extra}`;
    list.innerHTML = player.slots.length
      ? player.slots.map((s) => {
        const d = cat.find(s.id), usable = d && (d.effect === 'sanity' || d.effect === 'fuel');
        return row(s, `${usable ? btn('use', s.id, 'inv.use') : ''} ${chest ? btn('store', s.id, 'inv.store') : ''} ${btn('drop', s.id, 'inv.drop')}<span class="inv-text">${d ? esc(itemText(d, lang())) : ''}</span>`);
      }).join('')
      : `<li class="inv-empty">${esc(tr('inv.empty'))}</li>`;
    const ct = $('invChestTitle'), cl = $('invChestList'), sl = $('invSleep');
    if (ct) { ct.hidden = !chest; ct.textContent = chest ? chestLabel(chest) : ''; }
    if (cl) {
      cl.hidden = !chest;
      cl.innerHTML = chest ? (chest.contents.slots.length ? chest.contents.slots.map((s) => row(s, btn('take', s.id, 'inv.take'))).join('') : `<li class="inv-empty">${esc(tr('inv.chestempty'))}</li>`) : '';
    }
    if (sl) sl.hidden = !(chest && chest.lodging);
    const in3d = deps.in3d ? deps.in3d() : false;
    for (const id of ['invGather', 'invChestNext']) { const el = $(id); if (el) el.hidden = in3d; }
  }

  function open() {
    const p = $('invPanel'); if (!p) return false;
    ensure();
    if (p.hidden === false) return true;
    p.hidden = false;
    deps.exitPointerLock?.();
    returnFocus = deps.activeElement ? deps.activeElement() : null;
    render();
    $('invClose')?.focus?.();
    deps.onChange?.();
    return true;
  }
  function close() {
    const p = $('invPanel');
    if (!p || p.hidden !== false) return false;
    p.hidden = true; openChest = -1;
    returnFocus?.focus?.(); returnFocus = null;
    deps.onChange?.();
    return true;
  }
  const isOpen = () => { const p = $('invPanel'); return !!p && p.hidden === false; };
  const toggle = () => (isOpen() ? close() : open());

  /** Picks up a ground item by scene id (g<index>). Returns the Core count (0 when full, gone or unknown). */
  function pickUpById(id) {
    ensure();
    const m = /^g(\d{1,2})$/.exec(id || '');
    if (!m || !cat) return 0;
    const i = Number(m[1]), g = world.ground[i];
    if (!g) return 0;
    const n = world.pickUp(i, player, cat);
    if (n === 0) { if (!world.picked.has(i)) { const msg = note('inv.note.full'); deps.announce?.(msg); } return 0; }
    const def = cat.find(g.itemId), text = tr('inv.note.pick', { name: nameOf(g.itemId), n });
    if ($('invNote')) $('invNote').textContent = text;
    if (def.clue) deps.clue?.(ITEM_CLUE_PREFIX + def.id);
    deps.journal?.(text);
    deps.announce?.(`${text} ${itemText(def, lang())}`);
    render(); deps.onChange?.();
    return n;
  }

  function openChestById(id) {
    ensure();
    const m = /^c(\d{1,2})$/.exec(id || '');
    if (!m || !world.chests[Number(m[1])]) return false;
    openChest = Number(m[1]);
    chestCursor = openChest;
    open(); render();
    deps.announce?.(chestLabel(world.chests[openChest]));
    return true;
  }
  /** Interact entry for the 3D view: an item id (g) picks up, a chest id (c) opens. */
  const interactById = (id) => (id && id[0] === 'c' ? openChestById(id) : pickUpById(id) > 0);

  /** The 2D view has no player position: gather the next item still on the ground, in order. */
  function gatherNext() {
    ensure();
    const n = world.ground.length;
    for (let k = 1; k <= n; k++) { const i = (gatherCursor + k) % n; if (!world.picked.has(i)) { gatherCursor = i; return pickUpById(`g${i}`); } }
    note('inv.note.nothing');
    return 0;
  }
  function chestNext() {
    ensure();
    if (!world.chests.length) { note('inv.note.nochest'); return false; }
    chestCursor = (chestCursor + 1) % world.chests.length;
    return openChestById(`c${chestCursor}`);
  }

  function useItem(id) {
    ensure();
    const d = cat && cat.find(id);
    if (!d) return null;
    if (d.effect === 'sanity' && !deps.allows('sanity_keys')) return null; // the vigil keeps its own sanity rules
    const r = player.use(cat, id, deps.sanity());
    if (!r.used) { const msg = note(`inv.refused.${r.reason}`, { name: nameOf(id) }); deps.announce?.(msg); render(); return r; }
    if (r.sanityDelta) deps.onSanity?.(r.sanityDelta);
    const msg = note('inv.note.used', { name: nameOf(id) });
    deps.journal?.(msg); deps.announce?.(msg);
    render(); deps.onChange?.();
    return r;
  }
  function dropItem(id) {
    ensure();
    if (!player.count(id)) return 0;
    const n = player.remove(id, 1);
    note('inv.note.dropped', { name: nameOf(id) });
    render(); deps.onChange?.();
    return n;
  }
  function storeItem(id) {
    ensure();
    const chest = openChest >= 0 ? world.chests[openChest] : null;
    if (!chest || !cat) return 0;
    const n = Inventory.move(cat, player, chest.contents, id, 1);
    note(n ? 'inv.note.stored' : 'inv.note.chestfull', { name: nameOf(id) });
    render(); deps.onChange?.();
    return n;
  }
  function takeItem(id) {
    ensure();
    const chest = openChest >= 0 ? world.chests[openChest] : null;
    if (!chest || !cat) return 0;
    const n = Inventory.move(cat, chest.contents, player, id, 1);
    note(n ? 'inv.note.taken' : 'inv.note.full', { name: nameOf(id) });
    const def = cat.find(id);
    if (n && def && def.clue) deps.clue?.(ITEM_CLUE_PREFIX + def.id);
    render(); deps.onChange?.();
    return n;
  }

  /** Sleeps in the lodging bed when its chest is open: dusk or night only, the clock runs to dawn and some sanity returns. The vigil lock refuses it like skipping the night. */
  function sleep() {
    ensure();
    const chest = openChest >= 0 ? world.chests[openChest] : null;
    if (!chest || !chest.lodging || sleeping) return false;
    const tick = deps.tickNow();
    if (!canSleep(tick)) { const msg = note('inv.note.notired'); deps.announce?.(msg); return false; }
    if (!deps.allows('night_step')) return false;
    sleeping = true;
    deps.skipClock(minutesToMorning(tick), () => {
      sleeping = false;
      const s = deps.sanity(), before = s.value;
      s.apply(SLEEP_SANITY_RESTORE);
      deps.onSanity?.(Math.round(s.value - before));
      const msg = note('inv.note.slept');
      deps.journal?.(msg); deps.announce?.(msg);
      deps.onChange?.();
    });
    return true;
  }

  /** Lighting a candle burns lantern fuel; it never blocks the candle. */
  function burnCandle() { ensure(); player.burnFuel(CANDLE_FUEL_COST); if (isOpen()) render(); }

  $('invPanel')?.addEventListener?.('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!b) return;
    const act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
    ({ use: useItem, drop: dropItem, store: storeItem, take: takeItem })[act]?.(id);
  });
  $('invClose')?.addEventListener?.('click', close);
  $('invGather')?.addEventListener?.('click', gatherNext);
  $('invChestNext')?.addEventListener?.('click', chestNext);
  $('invSleep')?.addEventListener?.('click', sleep);
  deps.keyTarget?.addEventListener?.('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' || ((e.key === 'i' || e.key === 'I') && deps.in3d && deps.in3d())) { close(); e.preventDefault?.(); e.stopImmediatePropagation?.(); }
  }, true);

  return {
    setCatalog, scene, render, open, close, toggle, isOpen, pickUpById, openChestById, interactById, gatherNext, chestNext, useItem, dropItem, storeItem, takeItem, sleep, burnCandle,
    get fuel() { ensure(); return player.fuel; }, get world() { ensure(); return world; }, get player() { ensure(); return player; },
    snapshot: () => { ensure(); return { inv: cat && world.chests.length + world.ground.length ? world.serialize(player) : '' }; },
    restore(s) { ensure(); if (cat && s && typeof s.inv === 'string' && s.inv) world.tryRestore(s.inv, player, cat); render(); },
  };
}
