// Homestead controller and panel: owns the player's yard (homestead.js, the Core mirror), the panel DOM, the pieces for the 3D renderer and the 2D map, the daily sanity from the
// animals' moods and the save string. Rules live in homestead.js; names and texts are written through esc() or textContent only.
import { parseHomesteadCatalog, Homestead, HomesteadPlot, homesteadName, homesteadText, STAGE_RIPE, BED_COUNT } from './homestead.js';
import { growPlotEdge, corruptionLevel } from './dressing.js';
import { dayNumber } from './clock.js';
import { esc } from './util.js';

export const NEAR_PLOT_M = 12; // in 3D the yard answers only within this many metres of the plot origin
export const SECOND_HEN_OFFSET_M = 0.5; // a flock of two stands this far apart
export const CROP_ON_MOUND_M = 0.12; // crops stand on top of their soil mound, not inside it
export const CROP_SCALE = 1.5;       // crops are drawn a little larger than life so a ripe bed reads at walking distance

/**
 * deps: { $, tr, lang, state (seed, layout, sanity, night 0-based), gridW, gridD, inventory (controller: world, player, catalog, render), tickNow(), sanity() -> SanityModel, onSanity(delta),
 *   allows(actionId), announce(text), journal(text), camera() -> { x, z } | null, exitPointerLock(), activeElement(), keyTarget, onChange() }
 */
export function createHomesteadController(deps) {
  const { $, tr, state } = deps;
  let cat = null, home = new Homestead(null, null), builtKey = '', returnFocus = null, version = 0, cache = { key: '', pieces: [], edge: [] };
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);
  const items = () => deps.inventory.catalog;
  const level = () => corruptionLevel(state.sanity.dread, state.night + 1);

  function ensure() {
    const key = `${state.seed}|${state.layout.length}|${cat ? 1 : 0}|${items() ? items().items.length : 0}|${deps.places ? deps.places().length : 0}`;
    if (key === builtKey) return;
    builtKey = key; version++;
    home = cat && items() && state.layout.length ? new Homestead(cat, HomesteadPlot.create(state.seed, deps.gridW, deps.gridD, state.layout, deps.inventory.world, deps.places ? deps.places() : null)) : new Homestead(null, null);
  }
  function setCatalog(json) { cat = json && items() ? parseHomesteadCatalog(json, items()) : null; builtKey = ''; ensure(); render(); }
  const tick = () => Math.floor(deps.tickNow());
  const itemName = (id) => { const d = items() && items().find(id); return d ? (d.names[lang()] || d.names.en) : id; };
  const noteText = (text) => { const el = $('homeNote'); if (el) el.textContent = text; return text; };

  /** The pieces standing in the yard: { kind (mesh id), x, z, yaw, scale }, metres. Beds always show soil; crops show by stage; structures and residents only once built or adopted. */
  function pieces() { refresh(); return cache.pieces; }
  function computePieces() {
    if (!home.available || !home.claimed) return [];
    const out = [], t = tick(), plot = home.plot, yaw = Math.atan2(plot.dir[0], plot.dir[1]);
    home.beds.forEach((b, i) => {
      const [x, z] = plot.beds[i], stage = home.stageOf(i, t);
      out.push({ kind: 'hs_mound', x, z, yaw, scale: 1 });
      if (stage >= 1) out.push({ kind: stage === STAGE_RIPE ? `hs_${b.cropId}` : 'hs_sprout', x, y: CROP_ON_MOUND_M, z, yaw: yaw + i * 0.9, scale: CROP_SCALE });
    });
    cat.structures.forEach((s, i) => { if (home.built.has(s.id)) out.push({ kind: `hs_${s.id}`, x: plot.slots[i][0], z: plot.slots[i][1], yaw, scale: 1 }); });
    cat.residents.forEach((def, i) => {
      if (!home.owns(def.id)) return;
      const [x, z] = plot.residentSpots[i];
      for (let k = 0; k < def.count; k++) out.push({ kind: `hs_${def.id}`, x: x + plot.side[0] * k * SECOND_HEN_OFFSET_M, z: z + plot.side[1] * k * SECOND_HEN_OFFSET_M, yaw: yaw + Math.PI + k * 0.7, scale: 1 });
    });
    return out;
  }
  /** Corruption at the plot edge for the current dread and night (the Core CorruptionGrowth plot edge), as dressing items. Empty before the yard is claimed. */
  function edge() { refresh(); return cache.edge; }
  /** Recomputes the pieces and the edge only when an action, the village day or the corruption level changed them (the renderer asks every frame). */
  function refresh() {
    ensure();
    const k = `${version}|${dayNumber(tick())}|${level()}`;
    if (k === cache.key) return;
    cache = { key: k, pieces: computePieces(), edge: home.available && home.claimed ? growPlotEdge(home.plot.originX, home.plot.originZ, home.plot.side, home.plot.dir, level()) : [] };
  }
  /** A short string that changes whenever the pieces or the edge change, so the renderer rebuilds its static world exactly then. */
  const key = () => { refresh(); return cache.key; };

  function nearEnough() {
    const c = deps.camera ? deps.camera() : null;
    if (!c || !home.available) return true;
    return Math.hypot(c.x - home.plot.originX, c.z - home.plot.originZ) <= NEAR_PLOT_M;
  }
  function done(r, okKey, vars) {
    const msg = r.ok ? tr(okKey, vars) : tr(`home.refused.${r.reason}`);
    noteText(msg); deps.announce?.(msg);
    if (r.ok) deps.journal?.(msg);
    version++; deps.inventory.render?.(); render(); deps.onChange?.();
    return r;
  }
  const gate = () => { if (nearEnough()) return true; const m = noteText(tr('home.far')); deps.announce?.(m); return false; };

  function claim() { ensure(); if (!gate()) return null; return done(home.claim(tick(), deps.inventory.player, items()), 'home.note.claim'); }
  function plant(bed, cropId) {
    ensure(); if (!gate()) return null;
    const crop = cat && cat.findCrop(cropId);
    return done(home.plant(bed, cropId, tick(), deps.inventory.player), 'home.note.plant', { name: crop ? homesteadName(crop, lang()) : cropId });
  }
  function harvest(bed) {
    ensure(); if (!gate()) return null;
    const crop = cat && home.beds[bed] && cat.findCrop(home.beds[bed].cropId), r = home.harvest(bed, tick(), level(), deps.inventory.player, items());
    return done(r, 'home.note.harvest', { name: crop ? itemName(crop.harvestItem) : '', n: r.count });
  }
  function build(id) {
    ensure(); if (!gate()) return null;
    const s = cat && cat.findStructure(id);
    return done(home.build(id, deps.inventory.player), 'home.note.build', { name: s ? homesteadName(s, lang()) : id });
  }
  function feed(id) {
    ensure(); if (!gate()) return null;
    const def = cat && cat.findResident(id), r = home.feed(id, tick(), deps.inventory.player);
    return done(r, r.count ? 'home.note.adopt' : 'home.note.feed', { name: def ? homesteadName(def, lang()) : id });
  }
  function collect(id) {
    ensure(); if (!gate()) return null;
    const def = cat && cat.findResident(id), r = home.collect(id, tick(), deps.inventory.player, items());
    return done(r, 'home.note.collect', { name: def ? itemName(def.produce) : '', n: r.count });
  }

  /** Once per village day: the animals' moods move sanity (the vigil sandbox lock keeps its own sanity rules, so the day waits for it). Call about once a second. */
  function update() {
    ensure();
    if (!home.available || !home.claimed || !deps.allows('sanity_keys')) return 0;
    const delta = home.dailySanity(tick(), level());
    if (!delta) return 0;
    const s = deps.sanity(), before = s.value;
    s.apply(delta);
    const shown = Math.round(s.value - before);
    deps.onSanity?.(shown);
    const msg = tr('home.note.sanity', { n: shown > 0 ? `+${shown}` : String(shown) });
    version++; noteText(msg); deps.announce?.(msg); deps.journal?.(msg); deps.onChange?.();
    return shown;
  }

  function render() {
    const body = $('homeBody'); if (!body) return;
    ensure();
    const L = lang();
    if (!cat || !home.available) { body.innerHTML = `<p>${esc(tr('home.noplot'))}</p>`; return; }
    if (!home.claimed) { body.innerHTML = `<p>${esc(tr('home.claim.text'))}</p><button type="button" data-act="claim">${esc(tr('home.claim'))}</button>`; return; }
    const t = tick(), player = deps.inventory.player, btn = (act, id, label, extra = '') => `<button type="button" data-act="${act}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
    const beds = home.beds.map((b, i) => {
      const stage = home.stageOf(i, t), crop = b.cropId && cat.findCrop(b.cropId);
      if (!crop) {
        const opts = cat.crops.filter((c) => player.count(c.seedItem) > 0).map((c) => btn('plant', `${i}:${c.id}`, tr('home.plant', { name: homesteadName(c, L) }))).join(' ');
        return `<li>${esc(tr('home.bed', { n: i + 1 }))}: ${esc(tr('home.empty'))} ${opts}</li>`;
      }
      return `<li>${esc(tr('home.bed', { n: i + 1 }))}: ${esc(homesteadName(crop, L))}${crop.kind === 'eldritch' ? ` (${esc(tr('home.eldritch'))})` : ''}, ${esc(tr(`home.stage.${stage}`))} ${stage === STAGE_RIPE ? btn('harvest', String(i), tr('home.harvest')) : ''}</li>`;
    }).join('');
    const structures = cat.structures.map((s) => `<li>${esc(homesteadName(s, L))}: ${home.built.has(s.id) ? esc(tr('home.built')) : btn('build', s.id, tr('home.build', { name: homesteadName(s, L), cost: s.cost }))}<span class="inv-text">${esc(homesteadText(s, L))}</span></li>`).join('');
    const animals = cat.residents.map((def) => {
      const at = home.residentIndexOf(def.id), food = itemName(def.foodItem);
      if (at < 0) return `<li>${esc(homesteadName(def, L))} ${btn('feed', def.id, tr('home.adopt', { name: food }))}<span class="inv-text">${esc(homesteadText(def, L))}</span></li>`;
      const st = home.residents[at], shelter = cat.findStructure(def.shelter), ready = home.produceReady(def, st, t);
      const status = tr('home.status', { name: homesteadName(def, L), mood: tr(`home.mood.${home.mood(def, st.fedTick, t, level())}`), fed: tr('home.fed', { n: home.fedPercent(def, st.fedTick, t) }), shelter: home.sheltered(def) ? tr('home.housed') : tr('home.unhoused', { name: homesteadName(shelter, L) }) });
      return `<li>${esc(status)} ${btn('feed', def.id, tr('home.feed', { name: food }))} ${ready ? btn('collect', def.id, tr('home.collect', { name: itemName(def.produce), n: ready })) : ''}</li>`;
    }).join('');
    body.innerHTML = `<h3>${esc(tr('home.beds'))}</h3><ul class="inv-list">${beds}</ul><h3>${esc(tr('home.structures'))}</h3><ul class="inv-list">${structures}</ul><h3>${esc(tr('home.animals'))}</h3><ul class="inv-list">${animals}</ul>`;
  }

  function open() {
    const p = $('homePanel'); if (!p) return false;
    ensure();
    if (p.hidden === false) return true;
    p.hidden = false; deps.exitPointerLock?.();
    returnFocus = deps.activeElement ? deps.activeElement() : null;
    render(); $('homeClose')?.focus?.(); deps.onChange?.();
    return true;
  }
  function close() {
    const p = $('homePanel');
    if (!p || p.hidden !== false) return false;
    p.hidden = true; returnFocus?.focus?.(); returnFocus = null; deps.onChange?.();
    return true;
  }
  const isOpen = () => { const p = $('homePanel'); return !!p && p.hidden === false; };
  const toggle = () => (isOpen() ? close() : open());

  $('homePanel')?.addEventListener?.('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
    if (!b) return;
    const act = b.getAttribute('data-act'), id = b.getAttribute('data-id') || '';
    if (act === 'claim') claim();
    else if (act === 'plant') { const [bed, crop] = id.split(':'); plant(Number(bed), crop); }
    else if (act === 'harvest') harvest(Number(id));
    else if (act === 'build') build(id);
    else if (act === 'feed') feed(id);
    else if (act === 'collect') collect(id);
  });
  $('homeClose')?.addEventListener?.('click', close);
  deps.keyTarget?.addEventListener?.('keydown', (e) => {
    if (!isOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { close(); e.preventDefault?.(); e.stopImmediatePropagation?.(); }
  }, true);

  return {
    setCatalog, pieces, edge, key, update, render, open, close, toggle, isOpen, claim, plant, harvest, build, feed, collect,
    get home() { ensure(); return home; }, get plot() { ensure(); return home.plot; }, get bedCount() { return BED_COUNT; },
    daysSince: (d) => dayNumber(tick()) - d,
    snapshot: () => { ensure(); return { hs: home.available && home.claimed ? home.serialize() : '' }; },
    restore(s) {
      ensure();
      if (home.available && s && typeof s.hs === 'string') {
        if (s.hs) home.tryRestore(s.hs);
        else { builtKey = ''; ensure(); } // an empty string is how an unclaimed yard saves, so loading it must drop a yard claimed since
      }
      version++; render();
    },
  };
}
