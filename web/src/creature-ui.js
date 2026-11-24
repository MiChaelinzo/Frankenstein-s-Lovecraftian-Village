// Creature controller: owns the seeded encounter for the current phase, weather and dread (creatures.js, the Core mirror), feeds it the 3D player position each frame,
// applies the sanity drain and the lantern fuel it returns, and lays wards (salt line, chalk sigil) and the flare. No DOM beyond the status line.
// The rules live in creatures.js; this file only wires them to the app. Creature names and texts are written through textContent or esc() only.
import {
  parseCreatureCatalog, CreatureEncounter, SIGIL_RADIUS, creatureName, creatureText,
  GLIMPSE_COOLDOWN_TICKS, selectAppearances, appearanceVisible, wardTurns, witnessClueId, isWitnessClue, WITNESS_PREFIX, manifestationName, manifestationText, manifestationWitness,
} from './creatures.js';
import { landmarkDressing, landmarkPathDressing } from './landmarks.js';
import { composeDressing, dressingBoxes } from './dressing.js';
import { isBlocked } from './lore.js';
import { phaseAt, dayNumber } from './clock.js';

export const TELEGRAPH_SMOOTHING_PER_SEC = 1.2; // how fast the telegraph level follows the nearest creature: slow, so fog and sound never jump
export const TELEGRAPH_NOTE_LEVEL = 0.35;        // the status line names a creature once the telegraph passes this
export const DREAD_BUCKET = 10;                  // the encounter is rebuilt when dread crosses a ten percent step, the phase, the day or the weather changes
export const WITNESS_RANGE_M = 14;             // a village figure of the upgrade path (spec 166) is witnessed from this close; a place figure or a glimpse is witnessed at once
export const SANITY_APPLY_STEP = 0.05;           // sanity is applied in chunks of this many points so the HUD and the hash are not rewritten every frame

/**
 * deps: { $, tr, lang, state (seed, layout), gridW, gridD, sanity() -> SanityModel, onSanity(delta), allows(actionId), announce(text), journal(text),
 *   inventory (the inventory controller: player, burn), tickNow(), weather() -> name, camera() -> { x, z, yaw } | null }
 */
export function createCreatureController(deps) {
  const { $, tr, state } = deps;
  let cat = null, enc = new CreatureEncounter(null), builtKey = '', blockedFn = null, blockedKey = '', level = 0, nearestKind = '', owed = 0, lastNote = '';
  const lang = () => (typeof deps.lang === 'function' ? deps.lang() : deps.lang);

  // ---- Creature upgrade path (spec 166): appearances selected by creatures.js for the day phase and the state deps.tierState() reports. Witnessing one records a board clue and a journal line, nothing more.
  let tierList = [], tierKey = '', lastGlimpseTick = -1;
  const witnessed = new Map(), dismissed = new Set();
  const slotOf = (t) => `${dayNumber(t)}.${phaseAt(t)}`;
  const keyOf = (a) => `${slotOf(tick())}:${a.defId}`;
  function ensureTiers() {
    if (!cat || !deps.tierState || !state.layout.length) { tierList = []; tierKey = ''; return; }
    const t = tick(), ts = deps.tierState(), reduced = !!(deps.reducedMotion && deps.reducedMotion());
    const ctx = { seed: state.seed, gridW: deps.gridW, gridD: deps.gridD, tick: t, dreadPercent: Math.floor(Math.max(0, Math.min(1, state.sanity.dread)) * 100 + 1e-9), societyStage: ts.societyStage, corruptedVillager: ts.corruptedVillager, knowledgeTier: ts.knowledgeTier, cosmicOmens: ts.cosmicOmens, placeId: ts.placeId || '', lastGlimpseTick, reducedMotion: reduced };
    const key = [ctx.seed, slotOf(t), ctx.dreadPercent, ctx.societyStage, ctx.corruptedVillager, ctx.knowledgeTier, ctx.cosmicOmens, ctx.placeId, lastGlimpseTick, reduced ? 1 : 0, placeCount(), cat.manifestations.length].join('|');
    if (key === tierKey) return;
    tierKey = key;
    tierList = selectAppearances(ctx, cat, deps.places ? deps.places() : null);
  }
  function witness(a) {
    const def = cat.findManifestation(a.defId), k = keyOf(a);
    witnessed.set(k, 0);
    deps.noteClue?.(witnessClueId(a.defId));
    deps.announce?.(`${manifestationName(def, lang())}. ${manifestationText(def, lang())}`);
    deps.journal?.(tr('creature.witness', { text: manifestationWitness(def, lang()) }));
  }
  /** Advances the glimpse clocks and witnesses what the player is close enough to see. Called every 3D frame; it only reads and records, it never moves a figure toward the player. */
  function updateTiers(dt, x, z) {
    ensureTiers();
    for (const a of tierList) {
      const k = keyOf(a);
      if (dismissed.has(k)) continue;
      if (!witnessed.has(k)) {
        const near = a.placeId || a.tier === 4 || Math.hypot(a.x - x, a.z - z) <= WITNESS_RANGE_M;
        if (near) witness(a);
      } else if (a.tier === 4) {
        const elapsed = witnessed.get(k) + dt;
        witnessed.set(k, elapsed);
        if (!appearanceVisible(a, elapsed)) { dismissed.add(k); lastGlimpseTick = tick(); }
      }
    }
  }
  /** Renderer entries for the appearances in view: village figures stand where they were drawn; a glimpse is listed only while it is being witnessed. */
  function manifest() {
    ensureTiers();
    const out = [];
    for (const a of tierList) {
      const k = keyOf(a);
      if (dismissed.has(k) || (a.tier === 4 && !witnessed.has(k))) continue;
      out.push({ tier: a.tier, defId: a.defId, x: a.x, z: a.z, placeId: a.placeId, still: a.still, elapsed: witnessed.get(k) || 0, seconds: a.seconds });
    }
    return out;
  }
  /** The investigator's own line for a witness clue id in the given language, or '' for any other id. */
  function witnessTitle(clueId, l) {
    if (!cat || !isWitnessClue(clueId)) return '';
    const def = cat.findManifestation(clueId.slice(WITNESS_PREFIX.length));
    return def ? manifestationWitness(def, l) : '';
  }

  const placeCount = () => (deps.places ? deps.places().length : 0);
  function blocked() {
    const key = `${state.seed}|${state.layout.length}|${placeCount()}`;
    if (key !== blockedKey) {
      blockedKey = key;
      const boxes = dressingBoxes([...composeDressing(state.seed, deps.gridW, deps.gridD, state.layout), ...landmarkDressing(state.seed, deps.gridW, deps.gridD), ...landmarkPathDressing(state.seed, deps.gridW, deps.gridD)]);
      blockedFn = (x, z) => isBlocked(x, z, state.layout, boxes, state.seed, deps.gridW, deps.gridD, deps.places ? deps.places() : null);
    }
    return blockedFn;
  }
  const tick = () => Math.floor(deps.tickNow());
  function ensure() {
    if (!cat || !state.layout.length) { if (enc.creatures.length) enc = new CreatureEncounter(cat); return; }
    const t = tick(), key = `${state.seed}|${dayNumber(t)}|${phaseAt(t)}|${deps.weather()}|${Math.floor(state.sanity.dread * DREAD_BUCKET)}|${cat.defs.length}|${placeCount()}`;
    if (key === builtKey) return;
    builtKey = key;
    const old = enc;
    enc = CreatureEncounter.spawn(state.seed, deps.gridW, deps.gridD, t, state.sanity.dread, deps.weather(), cat, blocked(), deps.places ? deps.places() : null);
    enc.wards = old.wards; enc.flareUntilTick = old.flareUntilTick; enc.flareReadyTick = old.flareReadyTick; // wards and the flare outlast a change of weather or dread
  }

  function setCatalog(json) { cat = json ? parseCreatureCatalog(json) : null; builtKey = ''; ensure(); }

  /** One frame with the 3D player at (x, z): moves the creatures, takes the drain and the lantern fuel, and returns the step result. Does nothing under the vigil lock, which keeps its own sanity rules. */
  function update(dt, x, z) {
    ensure();
    updateTiers(dt, x, z);
    if (!cat || !enc.creatures.length || !deps.allows('sanity_keys')) { level += (0 - level) * Math.min(1, dt * TELEGRAPH_SMOOTHING_PER_SEC); return null; }
    const inv = deps.inventory.player, r = enc.step(dt, x, z, tick(), inv.fuel, blocked());
    if (r.fuelBurn) inv.burnFuel(r.fuelBurn);
    owed += r.drain;
    if (owed >= SANITY_APPLY_STEP) { const s = deps.sanity(), before = s.value; s.apply(-owed); owed = 0; deps.onSanity?.(Math.round((s.value - before) * 100) / 100); }
    level += (r.telegraph - level) * Math.min(1, dt * TELEGRAPH_SMOOTHING_PER_SEC);
    nearestKind = r.nearest >= 0 ? enc.creatures[r.nearest].defId : '';
    const el = $('creatureNote');
    if (el) {
      const note = level >= TELEGRAPH_NOTE_LEVEL && nearestKind ? creatureName(cat.find(nearestKind), lang()) : '';
      if (note !== lastNote) { lastNote = note; el.textContent = note ? tr('creature.near', { name: note }) : ''; if (note) deps.announce?.(`${note}. ${creatureText(cat.find(nearestKind), lang())}`); }
    }
    return r;
  }

  /** 3D entries for the renderer: { id, kind, pos: [x, 0, z], height, phase }. */
  function scene() {
    ensure();
    return enc.creatures.map((c, i) => ({ id: `k${i}`, kind: c.defId, pos: [c.x, 0, c.z], height: cat.find(c.defId).height, phase: i * 1.3 }));
  }

  /** Wards on the ground for the renderer: salt lines and sigils with their radius (metres). */
  const wards = () => { ensure(); return enc.wards.map((w) => ({ kind: w.kind, ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, radius: SIGIL_RADIUS })); };

  /** 2D map marks: the creatures as world positions (metres) with their kind, for the map view. */
  const marks = () => { ensure(); return enc.creatures.map((c) => ({ kind: c.defId, x: c.x, z: c.z })); };

  const noteKey = (key, vars) => { const msg = tr(key, vars); const el = $('invNote'); if (el) el.textContent = msg; deps.announce?.(msg); deps.journal?.(msg); return msg; };
  function position() { const c = deps.camera ? deps.camera() : null; return c && Number.isFinite(c.x) ? c : null; }
  const needsPlayer = () => { if (position()) return true; noteKey('creature.ward.in3d'); return false; };

  /** Lays a salt line ahead of the player (3D only: the 2D view has no player). Returns '' or the reason. */
  function laySalt() {
    ensure();
    if (!needsPlayer()) return 'view';
    const c = position(), r = enc.placeSalt(deps.inventory.player, c.x, c.z, Math.sin(c.yaw), Math.cos(c.yaw), tick());
    noteKey(r ? 'creature.ward.missing.salt' : 'creature.ward.salt');
    if (!r) deps.inventory.render?.();
    return r;
  }
  function drawSigil() {
    ensure();
    if (!needsPlayer()) return 'view';
    const c = position(), r = enc.placeSigil(deps.inventory.player, c.x, c.z, tick());
    noteKey(r ? 'creature.ward.missing.sigil' : 'creature.ward.sigil');
    if (!r) deps.inventory.render?.();
    return r;
  }
  function fireFlare() {
    ensure();
    const r = enc.useFlare(deps.inventory.player, tick());
    noteKey(r ? `creature.flare.${r}` : 'creature.flare.lit');
    if (!r) deps.inventory.render?.();
    return r;
  }
  /** Ward action by name (the satchel buttons and the 3D keys). */
  const ward = (kind) => {
    const r = kind === 'salt' ? laySalt() : kind === 'sigil' ? drawSigil() : kind === 'flare' ? fireFlare() : 'unknown';
    if (r === '') for (const a of tierList) if (wardTurns(a, kind)) dismissed.add(keyOf(a)); // only tier 1 is turned by a ward; the others are avoided or only witnessed
    if (r === '' && kind !== 'flare') deps.onWard?.(kind); // a ward really laid (not refused): villagers in view may take note
    return r;
  };

  $('invSalt')?.addEventListener?.('click', layNow('salt'));
  $('invSigil')?.addEventListener?.('click', layNow('sigil'));
  $('invFlare')?.addEventListener?.('click', layNow('flare'));
  function layNow(kind) { return () => ward(kind); }

  return {
    /** Saved as ticks elapsed since the last glimpse, because the session clock restarts on every load. A cooldown that has already ended is not saved. */
    snapshot: () => { const since = tick() - lastGlimpseTick; return { glimpse: lastGlimpseTick >= 0 && since >= 0 && since < GLIMPSE_COOLDOWN_TICKS ? `gl1;${since}` : '' }; },
    /** Rebases the saved elapsed ticks onto the new clock. A clock younger than the elapsed time clamps to tick 0, so the cooldown can only end later by the clock's age, never be skipped. */
    restore(saved) { const m = saved && typeof saved.glimpse === 'string' ? /^gl1;(\d{1,8})$/.exec(saved.glimpse) : null; lastGlimpseTick = m && Number(m[1]) < GLIMPSE_COOLDOWN_TICKS ? Math.max(0, tick() - Number(m[1])) : -1; tierKey = ''; },
    setCatalog, update, scene, wards, marks, ward, layNow, manifest, witnessTitle,
    get level() { return level; }, get nearestKind() { return nearestKind; }, get encounter() { ensure(); return enc; }, get catalog() { return cat; },
  };
}
