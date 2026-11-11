import {
  PrefabCatalog, generateLayout, SanityModel, SeededRandom, DreadEventTracker, tierFor,
  buildVillageReport, reportToMarkdown, reportToJson, generateCampaign,
  SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
  detailLevel, doorOmen, generateRitual, ritualProgress, Investigator, InteractionRules, VIGIL_ENDING_IDS,
} from './core.js';
import {
  computeView, buildWalkers,
  reportFilename, wrapIndex, postcardFilename, nightFromHash, applyFlash, toastMayReplace,
} from './scene.js';
import { nextBeat, prevBeat, nightStartIndex } from './story.js';
import { createAmbient } from './music.js';
import { shouldShowTitle, BACKDROP_BEATS } from './title.js';
import {
  THEMES, THEME_GROUPS, parseTheme, parseCamera, effectiveCamera, cameraOverridden,
  floorCountFor, maxFloors, parseFloor, doorMessage, buildingKey, nearestDoor, meshesWanted,
} from './building.js';
import { loadMeshSet } from './glb.js';
import { createView3d } from './view3d.js';
import { view3dWanted } from './view3d-math.js';
import { parseSession, saveSession, loadSession, safeStorage, buildShareLink, sessionHash } from './session.js';
import { minimapModel } from './minimap.js';
import { buildCaseFile, caseFileHtml, caseFileName } from './casefile.js';
import { t, parseLang } from './i18n.js';
import { createPerf, perfWanted, perfText } from './perf.js';
import { createTextures } from './textures.js';
import { createRenderer } from './draw.js';
import { createStoryController } from './story-ui.js';
import { createTitleController } from './title-ui.js';
import { tourWanted } from './tour.js';
import { createTourController } from './tour-ui.js';
import { esc } from './util.js';
import { createProgressController } from './progress-ui.js';
import { createVigilController } from './vigil-ui.js';
import { loadEndingsFound } from './vigil-view.js';
import { newJournal, addJournalEntry, selectJournalTab, tabForKey, TABS } from './journal.js';
import { dailyVillage, dailyWanted } from './daily.js';
import { normalizeScene, pickScene, sceneFromUrl } from './dlnk-layout.js';
import { contrastWanted, loadContrast, saveContrast } from './access.js';
import { texturePlan } from './pack.js';
import { cinematicFrame, cinematicWanted, flythroughCamera } from './cinematic.js';
import { cinemaExitKey, gateAction, mapGamepad, mapSwipe, normalizeDevice, showCinemaExit, snapshotPad } from './input.js';
import { restoreAction, shouldStepInvestigator, snapshotPlayback } from './investigator-state.js';
import {
  LocalizedNarrationProvider, locName, tierLabel, themeLabel, cameraLabel, doorName, omenTextL, entryLabelL, doorMessageL,
  describeSceneL, describeVillageL, describeInvestigatorL, ritualHudTextL, ritualScheduleTextL, nightClampNoticeL, postcardCaptionL,
} from './i18n-text.js';

const GRID_W = 24, GRID_D = 24, PIECES = 80;
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1' || params.get('capture') === '1';
if (reduceMotion) document.documentElement?.classList?.add('reduced');

const V = computeView(canvas.width, canvas.height, GRID_W, GRID_D);
// Camera projection state: k squashes the board vertically, hs scales building heights. Eases between modes.
const cam = { mode: 1, k: 1, hs: 1, settled: true };
const optParam = (name) => new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get(name) ?? params.get(name);
const lang = parseLang(optParam('lang'));
const tr = (k, v) => t(k, lang, v);
let dirty = true;
const mark = () => { dirty = true; start(); };


const state = {
  seed: 1818, sanity: new SanityModel(100), layout: [], landmarks: [], walkers: [], drawOrder: [], catalog: null,
  narrationLine: '', narrationAt: 0, flash: 0, flashAt: null, flashLevel: 0, drain: false,
  theme: 'auto', camChoice: 'third', floor: 0, attempts: new Map(), shakes: new Map(), doorFocus: -1, doors: [], visible: true,
  campaign: null, ritual: null, ritualStage: -1, night: 0, tracker: new DreadEventTracker(), live: false, snap: true, journal: newJournal(), toast: null, focus: -1, eye: 0, tentacle: 0,
  investigatorOn: false, investigator: null, cinema: null,
};

// ?narrator=https://... plugs in an AI endpoint; Safe wrapper falls back to offline text on any failure.
const narratorUrl = params.get('narrator');
const narrator = new SafeNarrationProvider(narratorUrl ? new HttpNarrationProvider(narratorUrl) : null, new LocalizedNarrationProvider(lang));

const tex = createTextures({ ctx, params, tr });
const { pack, loadPack, ensureProcPatterns, hintLabel } = tex;
const meshes = new Map(); // filled only by ?meshes=1; empty means the procedural drawing
const renderer = createRenderer({ canvas, ctx, state, cam, pack, tex, V, GRID_W, GRID_D, reduceMotion, currentNight: () => currentNight(), lang, $, meshes });
let meshesLoaded = Promise.resolve(); // settles when ?meshes=1 GLBs are in; the loading veil waits for it
if (meshesWanted(location.search, location.hash)) meshesLoaded = loadMeshSet(fetch.bind(globalThis), 'assets/meshes/').then((set) => { set.forEach((m, k) => meshes.set(k, m)); mark(); });
const { iso, doorPoint } = renderer;

// ---------- opt-in first-person 3D view (?view=3d or the button); 2D isometric stays the default ----------
const packTint = (...roles) => { const r = pack.want && pack.roles && roles.map((n) => pack.roles[n]).find(Boolean); return r ? r.tint : null; };
const cam3dParam = optParam('cam3d'); // read once: pushHash rewrites the hash later. With ?cinematic=1 an explicit cam3d keeps the camera still (stills for screenshots)
const view3d = createView3d({
  canvas: $('view3d'), prompt: $('view3dPrompt'), reduced: reduceMotion, capture: params.get('capture') === '1', camParam: cam3dParam,
  getScene: () => ({
    layout: state.layout, seed: state.seed, gridW: GRID_W, gridD: GRID_D, dread: state.sanity.dread,
    night: currentNight() || { number: 1, sky: 'night', weather: 'clear' },
    categoryOf: (id) => (state.catalog && state.catalog.get(id) ? state.catalog.get(id).category : ''),
    lamps: vigil.lampTargets(),
    labelFor: (p, kind) => (kind === 'lamp' ? tr(p.lit ? 'view3d.prompt.lamplit' : 'view3d.prompt.lamp') : tr(`view3d.prompt.${kind}`, { name: locName(lang, p.id) })),
    tintFor: (id) => (id === 'house_a' || id === 'house_b' ? packTint('wall_plaster', 'wall_wood') : id === 'dead_tree' ? packTint('trunk') : packTint('wall_stone')),
    groundTint: packTint('ground'),
    fly: backdropKind === '3d' ? flythroughCamera(performance.now() - backdropT0, BACKDROP_BEATS, { gridW: GRID_W, gridD: GRID_D, seed: state.seed }, reduceMotion) : cine.on && view3d.active && !cam3dParam ? flythroughCamera(performance.now() - cine.t0, cine.durations, { gridW: GRID_W, gridD: GRID_D, seed: state.seed }, reduceMotion) : null,
  }),
  onPerf: (st, c) => { if (perfOn) $('perfHud').textContent = `3D ${perfText(st)} | ${Math.round((c.building + c.ground + c.sea + c.coast + c.tentacle) / 3)} tris | ${c.halo} halos`; },
  packTextures: () => (pack.want && pack.roles ? texturePlan(pack.roles) : null),
  onInteract: (p, kind) => interact3d(p, kind),
  onExit: () => setView3d(false),
  notice: (key) => { $('sessionNote').textContent = tr(key); },
});
function setView3d(on) {
  if (on && !state.catalog) return;
  if (on) { $('view3d').hidden = false; if (!view3d.enter()) { $('view3d').hidden = true; return; } $('view').style.visibility = 'hidden'; $('hint').textContent = tr('view3d.hint'); }
  else { view3d.exit(); $('view3d').hidden = true; $('view').style.visibility = ''; $('hint').textContent = tr('hint.view'); mark(); }
  $('view3dBtn').setAttribute('aria-pressed', String(on)); $('view3dBtn').textContent = tr(on ? 'btn.view3dexit' : 'btn.view3d');
}
function interact3d(p, kind) {
  progress.arm();
  if (kind === 'door') { tryDoor(p); return; }
  if (kind === 'lamp') { vigil.lightLamp(p.lampId); return; }
  vigil.clue(`${p.id}@${p.x}.${p.z}`);
  if (kind === 'landmark') { progress.note.listen(); const li = state.landmarks.indexOf(p); if (li >= 0) setFocus(li); } else progress.note.whisper();
  adjust(InteractionRules.sanityDelta(kind), p.id);
}

// ---------- audio (procedural ambient soundtrack, starts only after the user opts in by gesture) ----------
let ambient = null, ambientSeed = null, volume = 0.6, muted = false;
const tourOn = tourWanted(location.search, location.hash); // opt-in only: ?tour=1
const titleWanted = !tourOn && shouldShowTitle(location.search, location.hash); // read before pushHash rewrites the hash
const cinemaWanted = cinematicWanted(location.search, location.hash);
function startAudio() {
  if (ambient && ambientSeed !== state.seed) { ambient.dispose(); ambient = null; }
  if (!ambient) {
    ambient = createAmbient(window.AudioContext || window.webkitAudioContext, { seed: state.seed, reduced: reduceMotion, volume });
    ambientSeed = state.seed;
    if (muted) ambient.mute();
  }
  return ambient.start();
}
function updateAudio(dread) { if (ambient) ambient.setDread(dread); }
function stopAudio() { if (ambient) ambient.stop(); }
function setMuted(m) {
  muted = m;
  if (ambient) (m ? ambient.mute() : ambient.unmute());
  $('mute').textContent = tr(m ? 'btn.unmute' : 'btn.mute');
  $('mute').setAttribute?.('aria-pressed', String(m));
}
function setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (ambient) ambient.setVolume(volume); }

// ---------- data + layout ----------
async function loadCatalog() {
  const res = await fetch('data/village_catalog.json');
  const json = await res.json();
  state.catalog = new PrefabCatalog(json.entries);
}
function rebuild() {
  state.layout = generateLayout(state.catalog, GRID_W, GRID_D, PIECES, state.seed);
  state.layout.forEach((p, i) => {
    const r = new SeededRandom(state.seed * 31 + i * 7919 + 1); // visual-only variation, separate from layout RNG
    p.vis = { h: r.next(100) / 100, tilt: r.next(100) / 100, lit: r.next(100) / 100, phase: r.next(1000), lit2: r.next(100) / 100 };
    p.depth = p.x + p.sizeX + p.z + p.sizeZ;
    p.key = buildingKey(p);
    p.floors = floorCountFor(p.id, p.vis.h, p.vis.tilt);
  });
  state.attempts.clear(); state.shakes.clear(); state.doorFocus = -1;
  state.doors = state.layout.filter((p) => p.id === 'house_a' || p.id === 'house_b');
  refreshDetail();
  const mf = maxFloors(state.layout);
  $('floor').max = String(mf - 1);
  state.floor = parseFloor(state.floor, mf - 1);
  $('floor').value = String(state.floor);
  state.drawOrder = [...state.layout].sort((a, b) => a.depth - b.depth);
  state.landmarks = state.layout.filter((p) => p.id === 'church' || p.id === 'altar' || p.id === 'well');
  state.walkers = buildWalkers(state.layout, GRID_W, GRID_D, state.seed);
  state.focus = -1;
  stopInvestigator();
  state.campaign = generateCampaign(state.seed);
  state.ritual = generateRitual(state.campaign);
  state.ritualStage = -1;
  vigil.reset();
  story.beats = [];
  state.night = Math.min(state.night, state.campaign.nights.length - 1);
  showNightClamp();
  renderCampaign();
  $('listen').innerHTML = `<option value="">${esc(tr('opt.landmark'))}</option>` +
    state.landmarks.map((p, i) => `<option value="${i}">${esc(tr('opt.landmarkitem', { name: locName(lang, p.id), hint: hintLabel(p.id) ? ` [${hintLabel(p.id)}]` : '', x: p.x, z: p.z }))}</option>`).join('');
  const area = state.layout.reduce((a, p) => a + p.sizeX * p.sizeZ, 0);
  $('stats').textContent = tr('msg.stats', { seed: state.seed, pieces: state.layout.length, w: GRID_W, d: GRID_D, area, cells: GRID_W * GRID_D, count: PIECES });
  if (state.investigatorOn) startInvestigator();
  updateDesc();
  say(null);
  progress.update();
  if (story.on) showBeat(story.idx);
}

// Omen-driven detail: a building's detail level (0..3) only falls as dread rises, each on its own seeded delay.
function refreshDetail() { for (const p of state.layout) p.detail = detailLevel(state.sanity.dread, p.key, state.seed); }

// ---------- campaign ----------
const currentNight = () => state.campaign && state.campaign.nights[state.night];
function renderCampaign() {
  const c = state.campaign; if (!c) return;
  $('villageName').textContent = c.villageName;
  $('night').innerHTML = c.nights.map((n, i) => `<option value="${i}">${esc(tr('opt.nightitem', { n: n.number, title: n.title }))}</option>`).join('');
  $('night').value = String(state.night);
  const n = currentNight();
  $('nightInfo').innerHTML = `<em>${esc(n.title)}</em> ${esc(tr('night.target', { pct: n.dreadTargetPercent, sky: n.sky, weather: n.weather }))}.<br>${esc(tr('label.rumor'))}: ${esc(n.rumor)}<br>${esc(tr('label.lore'))}: ${esc(n.lore)}<br>${esc(tr('label.ritual'))}: <span id="ritualInfo"></span>`;
  renderRitual();
  updateDesc();
}
function renderRitual() {
  const el = $('ritualInfo'); if (!el) return;
  const text = ritualHudTextL(state.ritual, Math.round(state.sanity.dread * 100), lang, state.night + 1);
  if (el.textContent !== text) el.textContent = text;
}
function trackRitual() {
  const prog = ritualProgress(state.ritual, state.night + 1, Math.round(state.sanity.dread * 100));
  const stage = prog.effective;
  if (stage > state.ritualStage && stage >= 0) {
    const st = state.ritual.stages[stage];
    log('omen', tr('log.ritual', { name: st.name, sigil: st.sigil }) + ritualScheduleTextL(prog, state.ritual.stages.length, lang));
  }
  state.ritualStage = stage;
  renderRitual();
  progress.update();
}
function playerNight(i) { progress.arm(); selectNight(i); }
function selectNight(i, quiet) {
  if (!state.campaign) return;
  state.night = Math.max(0, Math.min(state.campaign.nights.length - 1, i));
  progress.note.night(state.night); progress.update();
  renderCampaign();
  setSanity(currentNight().sanityStart, quiet);
}

// ---------- narration + journal ----------
function log(kind, text) {
  progress.note.kind(kind);
  state.journal = addJournalEntry(state.journal, { kind, text, sanity: state.sanity.value });
  renderJournal();
}
function renderJournal() {
  const j = state.journal;
  const fill = (id, list, empty) => { $(id).innerHTML = list.length ? list.map((e) => `<li class="e-${e.kind}">${esc(entryLabelL(e, lang))}</li>`).join('') : `<li class="empty">${esc(tr(empty))}</li>`; };
  fill('whispers', j.story, 'empty.whispers');
  fill('progressLog', j.progress, 'empty.progresslog');
  for (const tab of TABS) {
    const on = j.tab === tab;
    $(`tab-${tab}`).setAttribute?.('aria-selected', String(on)); $(`tab-${tab}`).tabIndex = on ? 0 : -1;
    $(`pane-${tab}`).hidden = !on;
  }
  $('progressBadge').hidden = j.unseen === 0;
  $('progressBadge').textContent = tr('journal.badge', { n: j.unseen });
}
function pickJournalTab(tab, focus) { state.journal = selectJournalTab(state.journal, tab); renderJournal(); if (focus) $(`tab-${tab}`).focus?.(); }
for (const tab of TABS) {
  $(`tab-${tab}`).addEventListener('click', () => pickJournalTab(tab));
  $(`tab-${tab}`).addEventListener('keydown', (e) => { const next = tabForKey(tab, e.key); if (next) { e.preventDefault(); pickJournalTab(next, true); } });
}
function say(locationId) {
  const line = narrator.narrate(locationId, state.sanity.dread);
  state.narrationLine = line;
  state.narrationAt = performance.now();
  $('narration').textContent = line;
  $('narration').style.opacity = 1;
  const at = state.narrationAt; setTimeout(() => { if (state.narrationAt === at) $('narration').style.opacity = 0.35; }, 7000);
  log('narration', line);
}
/** Starts a full-screen flash through the shared gate (capped, never inside the minimum gap, never with reduced motion). */
function requestFlash(level) {
  if (reduceMotion) return;
  applyFlash(state, level, performance.now());
}
/** Shows a banner unless a recent one should keep the screen. The screen reader announcement is separate and always happens. */
function showToast(text, rising) {
  const now = performance.now();
  if (toastMayReplace(state.toast, { rising }, now)) state.toast = { text, at: now, rising };
}
function announce(text) { const el = $('toastLive'); el.textContent = ''; el.textContent = text; }
function omen(e) {
  const text = omenTextL(e, lang);
  if (e.rising) progress.note.tier(e.tier);
  showToast(text, e.rising);
  announce(text); mark();
  if (e.rising && state.live) requestFlash(0.1 + 0.05 * e.tier);
  log('omen', text);
}
function updateDesc() {
  drawMinimap();
  const d = state.sanity.dread;
  const f = state.landmarks[state.focus];
  $('viewDesc').textContent = describeSceneL({
    seed: state.seed, pieces: state.layout.length, tier: tierFor(d), dreadPercent: Math.round(d * 100),
    focus: f ? tr('desc.focus', { name: locName(lang, f.id), x: f.x, z: f.z }) : '',
  }, lang) + describeVillageL(state.layout, lang) + describeInvestigatorL(state.investigator, lang) + (currentNight() ? ` ${state.campaign.villageName}, night ${state.night + 1} of ${state.campaign.nights.length}, ${currentNight().weather}.` : '');
}

let running = false;
function frame(now) {
  if (document.hidden || view3d.active) { running = false; perf.reset(); return; }
  const real = performance.now();
  for (const [k, sh] of state.shakes) if (real - sh.at > 1500) state.shakes.delete(k);
  const dread = state.sanity.dread, tier = tierFor(dread);
  const moving = renderer.updateCamera(dread);
  // Idle skip: with reduced motion nothing animates on its own, so only redraw after a change (or while a toast, flash or shake plays).
  const busy = !reduceMotion || cine.on || dirty || moving || state.flash > 0 || state.toast || state.shakes.size > 0;
  if (!busy) { running = false; return; }
  if (!state.visible) { requestAnimationFrame(frame); return; }
  dirty = false;
  renderer.drawScene(now, real, dread, tier);
  if (!state.dlnk) vigil.drawLamps(ctx, iso);
  tickPerf(now);
  requestAnimationFrame(frame);
}
function start() { if (view3d.active) view3d.refresh(); if (running) return; running = true; requestAnimationFrame(frame); }

// ---------- session, minimap, case file, perf HUD, i18n, offline ----------
const storage = safeStorage();
const perf = createPerf();
let mapOn = false, perfOn = false, perfShownAt = 0;
function currentSession() {
  const beat = story.on ? story.idx - nightStartIndex(story.beats, state.night + 1) : 0;
  return { seed: state.seed, sanity: Math.round(state.sanity.value), night: state.night, beat, theme: state.theme, cam: state.camChoice, floor: state.floor, stage: state.ritualStage, vigil: vigil.serialize(), ...progress.snapshot() };
}
function autosave() { if (!pack.want && state.live) saveSession(storage, currentSession()); }
function sessionNote(key) { $('sessionNote').textContent = tr(key); announce(tr(key)); }
function applySession(s) {
  const v = parseSession(s); if (!v) return;
  progress.disarm(); // restoring is a preview: saved ids return, nothing new is awarded or announced
  history.replaceState(null, '', sessionHash(v));
  applyHash();
  state.ritualStage = Math.max(state.ritualStage, Math.min(v.stage, state.ritual.stages.length - 1));
  progress.restore(v); progress.update();
  if (v.seed === state.seed) vigil.restore(v.vigil);
  if (story.on && v.beat > 0) showBeat(nightStartIndex(storyBeats(), state.night + 1) + Math.min(v.beat, storyBeats().length - 1));
}
function drawMinimap() {
  if (!mapOn) return;
  const c = $('minimap'), g = c.getContext('2d');
  const sel = state.focus >= 0 ? state.landmarks[state.focus] : null;
  const m = minimapModel(state.layout, GRID_W, GRID_D, c.width, sel);
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0b1012'; g.fillRect(0, 0, c.width, c.height);
  for (const k of m.cells) { g.fillStyle = k.color; g.fillRect(k.x, k.y, k.w, k.h); }
  for (const k of m.cells) if (k.selected) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(k.x - 1, k.y - 1, k.w + 2, k.h + 2); }
  if (state.investigator && state.investigator.route.length) {
    const sc = c.width / GRID_W, pos = state.investigator.position;
    g.fillStyle = '#ffd68c'; g.beginPath(); g.arc((pos.x + 0.5) * sc, (pos.z + 0.5) * sc, Math.max(3, sc * 0.7), 0, 6.283); g.fill();
    g.strokeStyle = '#000000'; g.lineWidth = 1; g.stroke();
  }
  $('legend').innerHTML = m.legend.map((l) => `<li><i style="background:${l.color}"></i>${esc(l.label)} x${l.count}</li>`).join('');
}
// ---------- investigator (Core Investigator, off by default) ----------
const INV_STEP_MS = 700;
let invTimer = 0;
function stopInvestigator() { clearInterval(invTimer); invTimer = 0; state.investigator = null; }
function startInvestigator() {
  stopInvestigator();
  state.investigator = new Investigator(state.layout, GRID_W, GRID_D, state.seed);
  log('investigator', tr('log.investigatorstart'));
  invTimer = setInterval(stepInvestigator, INV_STEP_MS);
}
function setInvestigator(on) {
  state.investigatorOn = on;
  $('invToggle').setAttribute?.('aria-pressed', String(on));
  if (on) startInvestigator(); else stopInvestigator();
  updateDesc(); mark();
}
function stepInvestigator() {
  const inv = state.investigator; if (!inv || !shouldStepInvestigator({ investigator: inv, hidden: document.hidden, cinemaOn: cine.on })) return; // paused during a cinematic take so it stays repeatable
  const hit = inv.step();
  if (hit) {
    state.sanity.apply(-hit.sanityLoss);
    requestFlash(0.2);
    syncUi(); pushHash();
    const text = tr('log.investigator', { site: tr(`kind.${hit.siteId}`), n: hit.sanityLoss });
    log('investigator', text); announce(text); updateDesc();
  }
  if (inv.finished) { clearInterval(invTimer); invTimer = 0; log('investigator', tr('log.investigatorend')); progress.note.investigatorDone(); progress.update(); updateDesc(); }
  drawMinimap(); mark();
}
function setMap(on) { mapOn = on; $('mapPanel').hidden = !on; $('mapToggle').setAttribute?.('aria-pressed', String(on)); drawMinimap(); }
function setPerf(on) { perfOn = on; perf.reset(); $('perfHud').hidden = !on; $('perfHud').textContent = perfText(perf.stats()); $('perfToggle').setAttribute?.('aria-pressed', String(on)); if (on) mark(); }
function tickPerf(now) {
  if (!perfOn) return;
  perf.sample(now);
  if (now - perfShownAt > 500) { perfShownAt = now; $('perfHud').textContent = perfText(perf.stats()); }
}
function caseMarkdown() {
  const r = report();
  return buildCaseFile({ campaign: state.campaign, seed: state.seed, sanity: state.sanity.value, night: state.night + 1, journal: [...state.journal.story].reverse(), report: { pieces: r.pieces, tier: r.tier, dreadPercent: r.dreadPercent, omen: r.omen } });
}
// Applies the language to every static label declared in index.html. English is the markup itself, so it is left untouched.
function applyI18n() {
  document.documentElement?.setAttribute?.('lang', lang);
  if (lang === 'en') return;
  document.title = `${tr('page.title')} | Kiroween 2026`;
  document.querySelector?.('meta[name="description"]')?.setAttribute('content', tr('page.description'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = tr(el.getAttribute('data-i18n'));
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.getAttribute('data-i18n-html'));
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', tr(el.getAttribute('data-i18n-aria')));
}
const isSecureHost = (loc) => loc.protocol === 'https:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
function registerOffline() {
  if (pack.want || typeof navigator === 'undefined' || !navigator.serviceWorker || !isSecureHost(location)) return;
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}
function resumeIfBare() {
  if (pack.want || /seed=/.test(location.hash)) return false;
  const s = loadSession(storage); if (!s) return false;
  history.replaceState(null, '', sessionHash(s));
  return true;
}

// ---------- controls ----------
function syncUi() {
  const s = state.sanity.value, d = state.sanity.dread;
  $('sanity').value = s; $('sanityOut').textContent = Math.round(s);
  $('dreadBar').style.width = `${(d * 100).toFixed(0)}%`; $('dreadOut').textContent = tr('label.dread', { n: (d * 100).toFixed(0) });
  updateAudio(d);
  refreshDetail();
  syncViewUi();
  state.tracker.update(d).forEach(omen);
  trackRitual();
  vigil.sync();
  updateDesc();
  mark();
}
// Camera, floor and theme controls. The camera note explains when dread has overridden the request.
function syncViewUi() {
  const mode = effectiveCamera(state.camChoice, state.sanity.dread);
  $('camera').value = state.camChoice; $('theme').value = state.theme;
  const note = cameraOverridden(state.camChoice, state.sanity.dread) ? ' Top-down is refused at Abyss dread, so the view drops to the ground.' : '';
  $('cameraNote').textContent = tr('note.looking', { mode: cameraLabel(lang, mode) }) + note;
  const td = mode === 2;
  $('floor').disabled = !td; $('floorOut').textContent = td ? tr('label.floor', { n: state.floor + 1 }) : tr('label.floortop');
  const base = THEMES.find((t) => t.id === state.theme);
  $('themeNote').textContent = base ? tr('note.theme', { label: themeLabel(lang, base), group: tr(`group.${base.group}`), source: themeSource(base) }) : tr('note.themedefault');
}
function themeSource(t) { return t.packRole && pack.patterns[t.packRole] ? tr('note.srcpack') : tr('note.srcproc'); }
function pushHash() {
  const extra = (state.theme !== 'auto' ? `&theme=${state.theme}` : '') + (state.camChoice !== 'third' ? `&cam=${state.camChoice}` : '') + (state.floor ? `&floor=${state.floor}` : '') + (story.on ? `&story=1&beat=${story.idx - nightStartIndex(story.beats, state.night + 1)}` : '');
  autosave();
  history.replaceState(null, '', `${encodeHash({ seed: state.seed, sanity: state.sanity.value })}&night=${state.night + 1}${extra}`);
}
function setTheme(id) { state.theme = parseTheme(id); syncViewUi(); pushHash(); mark(); announce(tr('announce.theme', { name: state.theme === 'auto' ? tr('theme.default') : tr(`theme.${state.theme}`) })); }
function setCamera(choice) { state.camChoice = parseCamera(choice); state.snap = reduceMotion; syncViewUi(); pushHash(); mark(); announce($('cameraNote').textContent); }
function setFloor(f) { state.floor = parseFloor(f, Number($('floor').max) || 0); $('floor').value = String(state.floor); syncViewUi(); pushHash(); mark(); }
function cycle(list, cur, dir = 1) { return list[(list.indexOf(cur) + dir + list.length) % list.length]; }

function tryDoor(p) {
  if (!p) return;
  const attempt = state.attempts.get(p.key) || 0;
  state.attempts.set(p.key, attempt + 1);
  const behavior = doorOmen(state.sanity.dread, p.key, 0, attempt, state.seed);
  const text = doorMessageL(doorMessage(behavior, p.key), lang);
  state.shakes.set(p.key, { behavior, at: performance.now() });
  showToast(text, behavior >= 2);
  if (view3d.active) { $('narration').textContent = text; $('narration').style.opacity = 1; }
  announce(`${text} (${doorName(lang, behavior)})`);
  log('door', text);
  progress.note.door(); progress.update();
  mark();
}
function setSanity(v, quiet) { state.sanity = new SanityModel(v); syncUi(); pushHash(); if (!quiet) say(null); }
function adjust(delta, location) { progress.arm(); state.sanity.apply(delta); if (delta < 0) requestFlash(0.15); syncUi(); pushHash(); say(location); }
function showNightClamp() {
  const el = $('nightClamp'); if (!el) return;
  const msg = state.campaign ? nightClampNoticeL(location.hash, state.campaign.nights.length, lang) : '';
  el.textContent = msg; el.hidden = !msg;
}
function applyHash() {
  state.theme = parseTheme(optParam('theme')); state.camChoice = parseCamera(optParam('cam'));
  state.floor = parseFloor(optParam('floor'), Number($('floor').max) || 8);
  const h = decodeHash(location.hash);
  state.seed = h.seed; $('seed').value = h.seed; state.sanity = new SanityModel(h.sanity);
  state.night = nightFromHash(location.hash, 9);
  if (state.catalog) rebuild();
  // a shared night link without an explicit sanity starts at that night's sanity
  if (state.catalog && /night=/.test(location.hash) && !/sanity=/.test(location.hash)) state.sanity = new SanityModel(currentNight().sanityStart);
  syncUi();
  applyStoryHash();
}
function reroll() { state.seed = (Math.random() * 2147483647) | 0; $('seed').value = state.seed; rebuild(); selectNight(state.night, true); pushHash(); if (ambient?.running) startAudio(); }
function setFocus(i) { state.focus = i; $('listen').value = i >= 0 ? String(i) : ''; updateDesc(); mark(); }
function listen(i) {
  const p = state.landmarks[i]; if (!p) return;
  progress.note.listen();
  vigil.clue(`${p.id}@${p.x}.${p.z}`);
  setFocus(i); adjust(-SanityModel.FOCUS_COST, p.id);
}
function download(name, text, mime) {
  const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function report() { return buildVillageReport(state.catalog, state.layout, GRID_W, GRID_D, state.seed, state.sanity.dread); }
function postcard() {
  const n = currentNight(); if (!n) return;
  const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height + 56;
  const c2 = out.getContext('2d');
  c2.fillStyle = '#05080a'; c2.fillRect(0, 0, out.width, out.height);
  c2.drawImage(canvas, 0, 0);
  c2.fillStyle = '#0c1214'; c2.fillRect(0, canvas.height, out.width, 56);
  c2.textAlign = 'center'; c2.fillStyle = '#cfd8d3'; c2.font = 'italic 24px Georgia, serif';
  c2.fillText(postcardCaptionL({ villageName: state.campaign.villageName, seed: state.seed, night: n.number, title: n.title }, lang), out.width / 2, canvas.height + 36);
  out.toBlob((blob) => { if (blob) download(postcardFilename(state.seed, n.number), blob, 'image/png'); }, 'image/png');
}
function tryNextDoor() {
  if (!state.doors.length) return;
  state.doorFocus = (state.doorFocus + 1) % state.doors.length;
  tryDoor(state.doors[state.doorFocus]);
}
function setSound(on) { $('sound').checked = on; if (on) { if (!startAudio()) $('sound').checked = false; syncUi(); } else stopAudio(); }

const { story, storyBeats, showBeat, setPlaying, openStory, closeStory, toggleStory, applyStoryHash } = createStoryController({ $, tr, lang, state, reduceMotion, optParam, renderCampaign, setSanity, pushHash });
const progress = createProgressController({ $, tr, state, log, announce, fetchJson: (u) => fetch(u).then((r) => r.json()) });
const vigil = createVigilController({
  $, tr, state, progress, storage, announce, reduceMotion,
  notice: (text) => { $('narration').textContent = text; $('narration').style.opacity = 1; announce(text); },
  adjust: (delta, where) => adjust(delta, where),
  setSanity: (v, quiet) => setSanity(v, quiet), selectNight: (i, quiet) => selectNight(i, quiet),
  syncUi: () => syncUi(), pushHash: () => pushHash(),
  canPlay: () => !cine.on && !tourOpen() && !titleOpen() && !helpIsOpen && !story.on && !vigil.endingOpen(),
  exit3d: () => { if (view3d.active) setView3d(false); },
  reroll: () => reroll(),
  download: (name, blob, mime) => download(name, blob, mime),
  shareLink: () => (!pack.want && location.origin && location.origin !== 'null' ? buildShareLink(location, currentSession()) : ''),
});
// Title screen backdrop: the existing deterministic 3D fly-through at the renderer's adaptive scale (no second renderer), or the 2D
// map with a slow CSS drift. Both stop the moment the player chooses a view.
let backdropKind = null, backdropT0 = 0;
function startBackdrop(kind) {
  document.documentElement?.classList?.add('title-backdrop');
  if (kind === '3d' && state.catalog) {
    $('view3d').hidden = false; backdropT0 = performance.now();
    if (view3d.enter()) { backdropKind = '3d'; $('view').style.visibility = 'hidden'; return; }
    $('view3d').hidden = true;
  }
  backdropKind = '2d';
}
function stopBackdrop() {
  document.documentElement?.classList?.remove('title-backdrop');
  if (backdropKind === '3d') { view3d.exit(); $('view3d').hidden = true; $('view').style.visibility = ''; mark(); }
  backdropKind = null;
}
const { open: openTitle, isOpen: titleOpen } = createTitleController({
  $, tr, lang, state, canvas, reduceMotion, startBackdrop, stopBackdrop,
  enter3d: () => setView3d(true), enter2d: () => mark(),
  openHelp: () => setHelp(true), setSound: (on) => setSound(on),
  endings: () => ({ found: loadEndingsFound(storage).length, total: VIGIL_ENDING_IDS.length }),
});
const { openTour, closeTour, tourOpen, pauseTour, resumeTour } = createTourController({ $, tr, canvas, reduceMotion, announce });
// About dialog: native <dialog> (focus trap and Esc come from the browser); falls back to the open attribute.
let aboutIsOpen = false; // the dialog's 'close' event (Esc, button) resets it
const aboutOpen = () => aboutIsOpen;
function setAbout(on) {
  const d = $('about');
  aboutIsOpen = on;
  if (on) pauseTour(); else resumeTour();
  if (on) { if (d.showModal) d.showModal(); else d.setAttribute?.('open', ''); $('aboutClose').focus?.(); }
  else if (d.close) d.close(); else d.removeAttribute?.('open');
}
$('about').addEventListener('close', () => { aboutIsOpen = false; resumeTour(); });
// Help dialog: native <dialog> like About. The device line and the pad/touch prompts follow the last input device used.
let helpIsOpen = false, helpPrevFocus = null;
function setHelp(on) {
  const d = $('help');
  if (on === helpIsOpen) return;
  helpIsOpen = on;
  if (on) {
    helpPrevFocus = document.activeElement || null;
    $('helpDevice').textContent = tr(`help.device.${inputDevice}`);
    for (const p of $('helpDevices').querySelectorAll?.('[data-device]') || []) p.classList.toggle('current', p.getAttribute('data-device') === inputDevice);
    pauseTour();
    if (d.showModal) d.showModal(); else d.setAttribute?.('open', '');
    $('helpClose').focus?.();
  } else {
    resumeTour();
    if (d.close) d.close(); else d.removeAttribute?.('open');
    helpPrevFocus?.focus?.();
  }
}
$('help').addEventListener('close', () => { if (helpIsOpen) { helpIsOpen = false; resumeTour(); helpPrevFocus?.focus?.(); } });
$('help').addEventListener('keydown', (e) => e.stopPropagation()); // Escape closes the dialog, not the 3D view behind it
$('helpBtn').addEventListener('click', () => setHelp(true));
$('helpClose').addEventListener('click', () => setHelp(false));
$('aboutBtn').addEventListener('click', () => setAbout(true));
$('aboutClose').addEventListener('click', () => setAbout(false));

canvas.addEventListener('click', (e) => {
  if (state.dlnk) return; // scene mode draws schematic solids instead of the village; do not select hidden pieces
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
  const di = nearestDoor(state.doors.map(doorPoint).map((pt) => ({ x: pt.x, y: pt.y - 3 })), mx, my, 12);
  if (di >= 0) { $('hint').style.display = 'none'; state.doorFocus = di; tryDoor(state.doors[di]); return; }
  let best = null, bd = 1e9;
  state.layout.forEach((p) => { const c = iso(p.x + p.sizeX / 2, p.z + p.sizeZ / 2); const d = Math.hypot(c.x - mx, c.y - 12 - my); if (d < bd) { bd = d; best = p; } });
  if (best && bd < 60) { $('hint').style.display = 'none'; const li = state.landmarks.indexOf(best); if (li >= 0) setFocus(li); vigil.clue(`${best.id}@${best.x}.${best.z}`); adjust(-SanityModel.FOCUS_COST, best.id); }
});
canvas.addEventListener('keydown', (e) => {
  if (state.dlnk) return;
  const n = state.landmarks.length;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setFocus(wrapIndex(state.focus, n, 1)); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setFocus(wrapIndex(state.focus < 0 ? 0 : state.focus, n, -1)); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { if (state.focus >= 0) listen(state.focus); e.preventDefault(); }
  else if (e.key === 'Escape') { setFocus(-1); state.doorFocus = -1; mark(); }
});
$('listen').addEventListener('change', () => { const v = $('listen').value; if (v === '') setFocus(-1); else listen(Number(v)); });
$('seed').addEventListener('change', () => { const v = Number.parseInt($('seed').value, 10); state.seed = Number.isFinite(v) ? v | 0 : 1818; $('seed').value = state.seed; rebuild(); selectNight(state.night, true); pushHash(); });
$('reroll').addEventListener('click', reroll);
$('theme').addEventListener('change', () => setTheme($('theme').value));
$('camera').addEventListener('change', () => setCamera($('camera').value));
$('floor').addEventListener('input', () => setFloor(Number($('floor').value)));
$('door').addEventListener('click', tryNextDoor);
$('view3dBtn').addEventListener('click', () => setView3d(!view3d.active));
$('share').addEventListener('click', async () => { pushHash(); try { await navigator.clipboard.writeText(!pack.want && location.origin && location.origin !== 'null' ? buildShareLink(location, currentSession()) : location.href); $('share').textContent = tr('btn.shared'); } catch (err) { console.warn(`[share] clipboard write failed: ${err.message}`); $('share').textContent = tr('btn.sharefail'); } setTimeout(() => ($('share').textContent = tr('btn.share')), 1800); });
$('sanity').addEventListener('input', () => { progress.arm(); setSanity(Number($('sanity').value)); });
const doWhisper = () => { progress.note.whisper(); vigil.clue('walls'); adjust(-SanityModel.WHISPER_COST, 'the walls'); };
const doChurch = () => { vigil.clue('church-nave'); requestFlash(0.3); adjust(-SanityModel.CHURCH_COST, 'church'); };
// With a live vigil the candle lights the next unlit lantern (limited by the lamps); otherwise it is the free-roam candle.
const doCandle = () => { if (!vigil.candle()) adjust(SanityModel.CANDLE_RESTORE, 'the village'); };
$('whisper').addEventListener('click', doWhisper);
$('church').addEventListener('click', doChurch);
$('candle').addEventListener('click', doCandle);
$('drain').addEventListener('change', (e) => { state.drain = e.target.checked; });
$('sound').addEventListener('change', (e) => setSound(e.target.checked));
$('night').addEventListener('change', () => playerNight(Number($('night').value)));
$('nightPrev').addEventListener('click', () => playerNight(state.night - 1));
$('nightNext').addEventListener('click', () => playerNight(state.night + 1));
$('postcard').addEventListener('click', postcard);
$('storyOpen').addEventListener('click', toggleStory);
$('storyExit').addEventListener('click', closeStory);
$('storyPrev').addEventListener('click', () => { progress.arm(); showBeat(prevBeat(story.idx, storyBeats().length), true); });
$('storyNext').addEventListener('click', () => { progress.arm(); showBeat(nextBeat(story.idx, storyBeats().length), true); });
$('storyPlay').addEventListener('click', () => { progress.arm(); setPlaying(!story.playing); });
$('volume').addEventListener('input', () => setVolume(Number($('volume').value) / 100));
$('mute').addEventListener('click', () => setMuted(!muted));
$('dlMd').addEventListener('click', () => download(reportFilename(state.seed, 'md'), reportToMarkdown(report()), 'text/markdown'));
$('dlJson').addEventListener('click', () => download(reportFilename(state.seed, 'json'), reportToJson(report()), 'application/json'));

$('dlCase').addEventListener('click', () => download(caseFileName(state.seed, 'md'), caseMarkdown(), 'text/markdown'));
$('dlCaseHtml').addEventListener('click', () => download(caseFileName(state.seed, 'html'), caseFileHtml(caseMarkdown()), 'text/html'));
$('saveSession').addEventListener('click', () => sessionNote(saveSession(storage, currentSession()) ? 'msg.saved' : 'msg.nosave'));
$('loadSession').addEventListener('click', () => { const s = loadSession(storage); if (s) { applySession(s); sessionNote('msg.loaded'); } else sessionNote('msg.nosave'); });
$('mapToggle').addEventListener('click', () => setMap(!mapOn));
$('perfToggle').addEventListener('click', () => setPerf(!perfOn));
$('invToggle').addEventListener('click', () => setInvestigator(!state.investigatorOn));
$('cinemaToggle').addEventListener('click', () => setCinematic(!cine.on));

// ---------- codex, stitch panel, high contrast, daily village (all opt-in) ----------
function setContrast(on, persist) {
  document.documentElement?.classList?.toggle?.('hc', on);
  $('contrastToggle').setAttribute?.('aria-pressed', String(on));
  if (persist) { saveContrast(storage, on); $('sessionNote').textContent = tr(on ? 'msg.contrast.on' : 'msg.contrast.off'); announce($('sessionNote').textContent); }
  mark();
}
function noteDaily(d) { const text = tr('msg.daily', { key: d.key }); $('sessionNote').textContent = text; announce(text); }
function applyDaily() {
  const d = dailyVillage();
  if (!d) { $('sessionNote').textContent = tr('msg.dailyfail'); return; }
  state.seed = d.seed; $('seed').value = d.seed; rebuild(); selectNight(state.night, true); pushHash(); if (ambient?.running) startAudio();
  noteDaily(d);
}
$('codexToggle').addEventListener('click', () => progress.setCodex(!progress.isCodexOn()));
$('stitchToggle').addEventListener('click', () => progress.setStitch(!progress.isStitchOn()));
$('contrastToggle').addEventListener('click', () => setContrast(!document.documentElement.classList.contains('hc'), true));
$('dailyBtn').addEventListener('click', applyDaily);

// ---------- cinematic capture mode (pure timeline in cinematic.js; this only drives it) ----------
// Last input device seen, so the exit hint names the control the player actually has.
let inputDevice = 'keyboard';
const setDevice = (d) => { inputDevice = normalizeDevice(d); };
const cine = { on: false, beats: [], durations: [], t0: 0, beat: -1, timer: 0, hadStory: false, hadPlaying: false };
function cinemaStep() {
  const f = cinematicFrame(performance.now() - cine.t0, cine.durations, reduceMotion);
  state.cinema = f.cam;
  if (f.beat !== cine.beat) {
    cine.beat = f.beat;
    const b = cine.beats[f.beat];
    if (b) { showBeat(b.index); $('cinemaCaption').textContent = b.text; announce(b.text); }
  }
  if (f.done) { setCinematic(false); return; }
  if (view3d.active) view3d.refresh();
  mark();
}
function setCinematic(on) {
  if (on === cine.on) return;
  cine.on = on;
  $('cinemaToggle').setAttribute?.('aria-pressed', String(on));
  document.documentElement?.classList?.toggle?.('cinema', on);
  $('cinemaCaption').hidden = !on;
  clearInterval(cine.timer);
  if (!on) { state.cinema = null; cine.beat = -1; const act = restoreAction(cine); if (act === 'close') closeStory(); else if (act === 'resume') setPlaying(true); $('cinemaExit').hidden = true; mark(); return; }
  const all = storyBeats(), start = nightStartIndex(all, state.night + 1);
  cine.beats = all.filter((b) => b.nightNumber === all[start].nightNumber);
  cine.durations = cine.beats.map((b) => b.durationMs);
  Object.assign(cine, snapshotPlayback(story)); cine.beat = -1; cine.t0 = performance.now();
  if (!story.on) openStory(start);
  setPlaying(false);
  $('cinemaExit').hidden = !showCinemaExit(inputDevice);
  announce(tr(cinemaExitKey(inputDevice)));
  cinemaStep();
  cine.timer = setInterval(cinemaStep, 100);
}

// ---------- gamepad (polled in rAF) and touch swipes, mapped by the pure functions in input.js ----------
function doAction(raw) {
  const a = gateAction(raw, cine.on); if (!a) return;
  const n = state.landmarks.length;
  switch (a) {
    case 'listen': if (state.focus >= 0) listen(state.focus); break;
    case 'door': tryNextDoor(); break;
    case 'whisper': doWhisper(); break;
    case 'candle': doCandle(); break;
    case 'focusNext': setFocus(wrapIndex(state.focus, n, 1)); break;
    case 'focusPrev': setFocus(wrapIndex(state.focus < 0 ? 0 : state.focus, n, -1)); break;
    case 'cinematic': setCinematic(!cine.on); break;
    case 'story': toggleStory(); break;
    case 'nextBeat': if (story.on) showBeat(nextBeat(story.idx, storyBeats().length), true); break;
    case 'prevBeat': if (story.on) showBeat(prevBeat(story.idx, storyBeats().length), true); break;
    default:
  }
}
// Polling starts only once a pad connects and stops when none is left, so a keyboard or touch session pays nothing.
let padPrev = null, padPolling = false;
function pollPad() {
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads() || []).filter(Boolean) : [];
  if (!pads.length) { padPolling = false; padPrev = null; return; }
  const cur = snapshotPad(pads[0]);
  if (!titleOpen() && !helpIsOpen && !vigil.endingOpen() && !document.hidden && !view3d.active) for (const a of mapGamepad(padPrev, cur)) { setDevice('pad'); doAction(a); }
  padPrev = cur;
  requestAnimationFrame(pollPad);
}
let touch0 = null;
canvas.addEventListener('touchstart', (e) => { setDevice('touch'); const p = e.changedTouches[0]; touch0 = e.touches.length === 1 && p ? { x: p.clientX, y: p.clientY, t: performance.now() } : null; }, { passive: true });
canvas.addEventListener('touchcancel', () => { touch0 = null; }, { passive: true });
canvas.addEventListener('touchend', (e) => {
  const p = e.changedTouches[0]; if (!touch0 || !p) return;
  const a = mapSwipe(p.clientX - touch0.x, p.clientY - touch0.y, performance.now() - touch0.t); touch0 = null;
  if (a) doAction(a);
}, { passive: true });
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setDevice('touch'); else if (e.pointerType === 'mouse' || e.pointerType === 'pen') setDevice('keyboard'); }, { passive: true });
$('cinemaExit').addEventListener('click', () => setCinematic(false));
addEventListener('gamepadconnected', () => { if (!padPolling) { padPolling = true; padPrev = null; requestAnimationFrame(pollPad); } });

addEventListener('keydown', (e) => {
  setDevice('keyboard');
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '?' && !helpIsOpen && !titleOpen() && !(e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) { setHelp(true); return; }
  if (view3d.active) return; // the 3D view owns WASD, E and Escape while open
  if (titleOpen()) return;
  if (tourOpen()) { if (e.key === 'Escape') closeTour(); return; }
  if (aboutOpen() || helpIsOpen || vigil.endingOpen()) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (cine.on) { if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') setCinematic(false); return; }
  if (story.on) {
    const n = storyBeats().length, onCanvas = e.target === canvas;
    if (e.key === 'ArrowRight' && !onCanvas) { progress.arm(); showBeat(nextBeat(story.idx, n), true); return; }
    if (e.key === 'ArrowLeft' && !onCanvas) { progress.arm(); showBeat(prevBeat(story.idx, n), true); return; }
    if (e.key === '.') { progress.arm(); showBeat(nextBeat(story.idx, n), true); return; }
    if (e.key === ',') { progress.arm(); showBeat(prevBeat(story.idx, n), true); return; }
    if (e.key === ' ' && tag !== 'BUTTON' && !onCanvas) { setPlaying(!story.playing); e.preventDefault(); return; }
    if (e.key === 'Escape') { closeStory(); return; }
  }
  switch (e.key) {
    case 's': case 'S': toggleStory(); break;
    case 'u': case 'U': setMuted(!muted); break;
    case 'w': case 'W': doWhisper(); break;
    case 'c': case 'C': doChurch(); break;
    case 'l': case 'L': doCandle(); break;
    case 'e': case 'E': vigil.endure(); break;
    case 'n': case 'N': reroll(); break;
    case '[': progress.arm(); setSanity(state.sanity.value - 5); break;
    case ']': progress.arm(); setSanity(state.sanity.value + 5); break;
    case 'd': case 'D': $('drain').checked = !$('drain').checked; state.drain = $('drain').checked; break;
    case 'm': case 'M': setSound(!$('sound').checked); break;
    case ',': playerNight(state.night - 1); break;
    case '.': playerNight(state.night + 1); break;
    case 'p': case 'P': postcard(); break;
    case 'g': case 'G': setMap(!mapOn); break;
    case 'i': case 'I': setInvestigator(!state.investigatorOn); break;
    case 'b': case 'B': setCinematic(true); break;
    case 'x': case 'X': setPerf(!perfOn); break;
    case 'k': case 'K': progress.setCodex(!progress.isCodexOn()); break;
    case 'y': case 'Y': progress.setStitch(!progress.isStitchOn()); break;
    case 'h': case 'H': setContrast(!document.documentElement.classList.contains('hc'), true); break;
    case 'z': case 'Z': applyDaily(); break;
    case 'a': case 'A': setAbout(true); break;
    case 'o': case 'O': tryNextDoor(); break;
    case 't': case 'T': setTheme(cycle(['auto', ...THEMES.map((t) => t.id)], state.theme)); break;
    case 'v': case 'V': setCamera(cycle(['auto', 'first', 'third', 'top'], state.camChoice)); break;
    case 'f': case 'F': if (!$('floor').disabled) setFloor(state.floor >= Number($('floor').max) ? 0 : state.floor + 1); break;
    case '?': setHelp(true); break;
    default:
  }
});
addEventListener('hashchange', () => { progress.disarm(); applyHash(); });
document.addEventListener?.('visibilitychange', () => { if (!document.hidden) mark(); });
if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver((es) => { state.visible = es.some((e) => e.isIntersecting); if (state.visible) mark(); }).observe(canvas);
const DRAIN_TICK_MS = 500;
setInterval(() => { if (state.drain && state.sanity.value > 0) { state.sanity.apply(-SanityModel.DRAIN_PER_SECOND * DRAIN_TICK_MS / 1000); syncUi(); } }, DRAIN_TICK_MS);
setInterval(() => { if (state.drain) say(null); }, 9000);

// ---------- DLNK scene mode: ?pack=1&scene=<name>, only when local-pack/scene_layout.json exists ----------
function setDlnkScene(slug) {
  const scene = slug && pack.layout ? pack.layout[slug] : null;
  state.dlnk = scene ? { slug, scene, items: normalizeScene(scene, GRID_W, GRID_D) } : null;
  const sel = $('dlnkScene'); if (sel) sel.value = state.dlnk ? slug : '';
  const q = new URLSearchParams(location.search);
  if (state.dlnk) q.set('scene', slug); else q.delete('scene');
  history.replaceState(null, '', `${location.pathname}?${q.toString()}${location.hash}`);
  mark();
}
function setupDlnk() {
  if (!pack.layout) return;
  const row = $('theme').parentNode;
  const label = document.createElement('label'); label.htmlFor = 'dlnkScene'; label.textContent = tr('label.dlnkscene');
  const sel = document.createElement('select'); sel.id = 'dlnkScene';
  sel.innerHTML = `<option value="">${esc(tr('opt.dlnknone'))}</option>` + Object.entries(pack.layout).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `<option value="${esc(k)}">${esc(v.title)}</option>`).join('');
  sel.addEventListener('change', () => setDlnkScene(sel.value));
  row.append(label, sel);
  const wanted = sceneFromUrl(location.search, location.hash);
  if (!wanted) return;
  const slug = pickScene(pack.layout, wanted);
  if (slug) setDlnkScene(slug); else $('sessionNote').textContent = tr('msg.dlnkmissing', { name: wanted });
}

// Loading veil (role=status in index.html): up until the catalog and layout are ready and, when requested, the GLB meshes.
const hideVeil = () => { $('loading').hidden = true; };
// A narrow screen starts with the secondary control groups folded; seed, sanity, sound and help stay in view.
function foldGroupsOnNarrow() {
  if (!matchMedia('(max-width: 700px)').matches) return;
  for (const d of document.querySelectorAll?.('details.collapsible') || []) d.open = false;
}
(async function init() {
  applyI18n(); renderJournal(); foldGroupsOnNarrow();
  try { await loadCatalog(); } catch (err) { $('stats').textContent = tr('msg.catalogfail', { err: err.message }); hideVeil(); return; }
  ensureProcPatterns();
  $('theme').innerHTML = `<option value="auto">${esc(tr('opt.themeauto'))}</option>` + THEME_GROUPS.map((g) =>
    `<optgroup label="${esc(tr('opt.group', { g: tr(`group.${g}`) }))}">${THEMES.filter((t) => t.group === g).map((t) => `<option value="${t.id}">${esc(themeLabel(lang, t))}</option>`).join('')}</optgroup>`).join('');
  if (pack.want) await loadPack();
  if (pack.want) setupDlnk();
  state.investigatorOn = optParam('investigator') === '1';
  $('invToggle').setAttribute?.('aria-pressed', String(state.investigatorOn));
  setContrast(contrastWanted(location.search, location.hash, loadContrast(storage)), false);
  const daily = dailyWanted(location.search, location.hash) && !/seed=/.test(location.hash) ? dailyVillage() : null; // opt-in only
  if (daily) history.replaceState(null, '', `#seed=${daily.seed}`);
  const saved = pack.want ? null : loadSession(storage);
  const resumed = resumeIfBare();
  applyHash();
  if (saved) { progress.restore(saved.seed === state.seed ? saved : { ach: saved.ach }); if (saved.seed === state.seed) vigil.restore(saved.vigil); } // before pushHash, whose autosave would overwrite the stored codex/ach
  pushHash(); start();
  if (daily) noteDaily(daily);
  if (resumed) $('sessionNote').textContent = `${tr('msg.loaded')} ${tr('msg.resumed')}`;
  if (optParam('map') === '1') setMap(true);
  if (optParam('codex') === '1') progress.setCodex(true);
  if (optParam('stitch') === '1') progress.setStitch(true);
  if (perfWanted(location.search, location.hash)) setPerf(true);
  requestAnimationFrame(pollPad);
  if (view3dWanted(location.search, location.hash)) setView3d(true);
  if (cinemaWanted) setCinematic(true);
  registerOffline();
  if (tourOn) openTour();
  await meshesLoaded; hideVeil();
  if (titleWanted) openTitle(); setTimeout(() => { state.live = true; }, 800);
})();
