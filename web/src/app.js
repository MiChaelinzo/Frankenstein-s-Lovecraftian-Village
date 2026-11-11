import {
  PrefabCatalog, generateLayout, SanityModel, SeededRandom, DreadEventTracker, DREAD_THRESHOLDS, tierFor,
  buildVillageReport, reportToMarkdown, reportToJson, generateCampaign,
  StaticNarrationProvider, SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
  detailLevel, doorOmen, generateRitual, ritualStageForDread,
} from './core.js';
import {
  computeView, buildWalkers, omenText, addEntry, entryLabel,
  reportFilename, wrapIndex, describeScene, postcardFilename, postcardCaption, nightFromHash, nightClampNotice, ritualHudText,
} from './scene.js';
import { nextBeat, prevBeat, nightStartIndex } from './story.js';
import { createAmbient } from './music.js';
import { shouldShowIntro } from './intro.js';
import {
  THEMES, THEME_GROUPS, parseTheme, parseCamera, effectiveCamera, cameraOverridden,
  floorCountFor, maxFloors, parseFloor, DOOR_NAMES, doorMessage, buildingKey, nearestDoor, CAMERA_LABELS,
} from './building.js';
import { parseSession, saveSession, loadSession, safeStorage, buildShareLink, sessionHash } from './session.js';
import { minimapModel } from './minimap.js';
import { buildCaseFile, caseFileHtml, caseFileName } from './casefile.js';
import { t, parseLang } from './i18n.js';
import { createPerf, perfWanted, perfText } from './perf.js';
import { createTextures } from './textures.js';
import { createRenderer } from './draw.js';
import { createStoryController } from './story-ui.js';
import { createIntroController } from './intro-ui.js';
import { esc, prettyId } from './util.js';

const GRID_W = 24, GRID_D = 24, PIECES = 80;
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1';
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
  narrationLine: '', narrationAt: 0, flash: 0, drain: false,
  theme: 'auto', camChoice: 'third', floor: 0, attempts: new Map(), shakes: new Map(), doorFocus: -1, doors: [], visible: true,
  campaign: null, ritual: null, ritualStage: -1, night: 0, tracker: new DreadEventTracker(), live: false, snap: true, journal: [], toast: null, focus: -1, eye: 0, tentacle: 0,
};

// ?narrator=https://... plugs in an AI endpoint; Safe wrapper falls back to offline text on any failure.
const narratorUrl = params.get('narrator');
const narrator = new SafeNarrationProvider(narratorUrl ? new HttpNarrationProvider(narratorUrl) : null, new StaticNarrationProvider());

const tex = createTextures({ ctx, params });
const { pack, loadPack, ensureProcPatterns, hintLabel } = tex;
const renderer = createRenderer({ canvas, ctx, state, cam, pack, tex, V, GRID_W, GRID_D, reduceMotion, currentNight: () => currentNight(), $ });
const { iso, doorPoint } = renderer;

// ---------- audio (procedural ambient soundtrack, starts only after the user opts in by gesture) ----------
let ambient = null, ambientSeed = null, volume = 0.6, muted = false;
const introWanted = shouldShowIntro(location.search, location.hash); // read before pushHash rewrites the hash
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
  $('mute').textContent = m ? 'Unmute (U)' : 'Mute (U)';
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
  state.campaign = generateCampaign(state.seed);
  state.ritual = generateRitual(state.campaign);
  state.ritualStage = -1;
  story.beats = [];
  state.night = Math.min(state.night, state.campaign.nights.length - 1);
  showNightClamp();
  renderCampaign();
  $('listen').innerHTML = '<option value="">Choose a landmark</option>' +
    state.landmarks.map((p, i) => `<option value="${i}">${esc(prettyId(p.id))}${hintLabel(p.id) ? ` [${esc(hintLabel(p.id))}]` : ''} at (${p.x}, ${p.z})</option>`).join('');
  const area = state.layout.reduce((a, p) => a + p.sizeX * p.sizeZ, 0);
  $('stats').textContent = `Seed ${state.seed}: ${state.layout.length} pieces stitched onto a ${GRID_W}x${GRID_D} grid (${area} of ${GRID_W * GRID_D} cells used). Same generator as the Unity project, so the same seed and settings (set pieceCount to ${PIECES} there) give the same layout.`;
  updateDesc();
  say(null);
  if (story.on) showBeat(story.idx);
}

// Omen-driven detail: a building's detail level (0..3) only falls as dread rises, each on its own seeded delay.
function refreshDetail() { for (const p of state.layout) p.detail = detailLevel(state.sanity.dread, p.key, state.seed); }

// ---------- campaign ----------
const currentNight = () => state.campaign && state.campaign.nights[state.night];
function renderCampaign() {
  const c = state.campaign; if (!c) return;
  $('villageName').textContent = c.villageName;
  $('night').innerHTML = c.nights.map((n, i) => `<option value="${i}">Night ${n.number}: ${esc(n.title)}</option>`).join('');
  $('night').value = String(state.night);
  const n = currentNight();
  $('nightInfo').innerHTML = `<em>${esc(n.title)}</em> (dread target ${n.dreadTargetPercent}%, ${esc(n.sky)}, ${esc(n.weather)}).<br>Rumor: ${esc(n.rumor)}<br>Lore: ${esc(n.lore)}<br>Ritual: <span id="ritualInfo"></span>`;
  renderRitual();
  updateDesc();
}
function renderRitual() {
  const el = $('ritualInfo'); if (!el) return;
  const text = ritualHudText(state.ritual, Math.round(state.sanity.dread * 100));
  if (el.textContent !== text) el.textContent = text;
}
function trackRitual() {
  const stage = ritualStageForDread(state.ritual, Math.round(state.sanity.dread * 100));
  if (stage > state.ritualStage && stage >= 0) {
    const st = state.ritual.stages[stage];
    log('omen', `The ritual advances: ${st.name} (sigil ${st.sigil}).`);
  }
  state.ritualStage = stage;
  renderRitual();
}
function selectNight(i, quiet) {
  if (!state.campaign) return;
  state.night = Math.max(0, Math.min(state.campaign.nights.length - 1, i));
  renderCampaign();
  setSanity(currentNight().sanityStart, quiet);
}

// ---------- narration + journal ----------
function log(kind, text) {
  state.journal = addEntry(state.journal, { kind, text, sanity: state.sanity.value });
  $('whispers').innerHTML = state.journal.map((e) => `<li class="e-${e.kind}">${esc(entryLabel(e))}</li>`).join('');
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
function announce(text) { const el = $('toastLive'); el.textContent = ''; el.textContent = text; }
function omen(e) {
  const text = omenText(e);
  state.toast = { text, at: performance.now(), rising: e.rising };
  announce(text); mark();
  if (e.rising && !reduceMotion && state.live) state.flash = Math.max(state.flash, 0.3 + 0.1 * e.tier);
  log('omen', text);
}
function updateDesc() {
  drawMinimap();
  const d = state.sanity.dread;
  const f = state.landmarks[state.focus];
  $('viewDesc').textContent = describeScene({
    seed: state.seed, pieces: state.layout.length, tierName: DREAD_THRESHOLDS.tierNames[tierFor(d)], dreadPercent: Math.round(d * 100),
    focus: f ? `${prettyId(f.id)} at ${f.x}, ${f.z}` : '',
  }) + (currentNight() ? ` ${state.campaign.villageName}, night ${state.night + 1} of ${state.campaign.nights.length}, ${currentNight().weather}.` : '');
}

let running = false;
function frame(now) {
  if (document.hidden) { running = false; perf.reset(); return; }
  const real = performance.now();
  for (const [k, sh] of state.shakes) if (real - sh.at > 1500) state.shakes.delete(k);
  const dread = state.sanity.dread, tier = tierFor(dread);
  const moving = renderer.updateCamera(dread);
  // Idle skip: with reduced motion nothing animates on its own, so only redraw after a change (or while a toast, flash or shake plays).
  const busy = !reduceMotion || dirty || moving || state.flash > 0 || state.toast || state.shakes.size > 0;
  if (!busy) { running = false; return; }
  if (!state.visible) { requestAnimationFrame(frame); return; }
  dirty = false;
  renderer.drawScene(now, real, dread, tier);
  tickPerf(now);
  requestAnimationFrame(frame);
}
function start() { if (running) return; running = true; requestAnimationFrame(frame); }

// ---------- session, minimap, case file, perf HUD, i18n, offline ----------
const storage = safeStorage();
const perf = createPerf();
let mapOn = false, perfOn = false, perfShownAt = 0;
function currentSession() {
  const beat = story.on ? story.idx - nightStartIndex(story.beats, state.night + 1) : 0;
  return { seed: state.seed, sanity: Math.round(state.sanity.value), night: state.night, beat, theme: state.theme, cam: state.camChoice, floor: state.floor };
}
function autosave() { if (!pack.want && state.live) saveSession(storage, currentSession()); }
function sessionNote(key) { $('sessionNote').textContent = tr(key); announce(tr(key)); }
function applySession(s) {
  const v = parseSession(s); if (!v) return;
  history.replaceState(null, '', sessionHash(v));
  applyHash();
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
  $('legend').innerHTML = m.legend.map((l) => `<li><i style="background:${l.color}"></i>${esc(l.label)} x${l.count}</li>`).join('');
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
  return buildCaseFile({ campaign: state.campaign, seed: state.seed, sanity: state.sanity.value, journal: [...state.journal].reverse(), report: { pieces: r.pieces, tier: r.tier, dreadPercent: r.dreadPercent, omen: r.omen } });
}
function applyI18n() {
  document.documentElement?.setAttribute?.('lang', lang);
  const map = { reroll: 'btn.reroll', share: 'btn.share', whisper: 'btn.whisper', church: 'btn.church', candle: 'btn.candle', postcard: 'btn.postcard', saveSession: 'btn.save', loadSession: 'btn.load', mapToggle: 'btn.map' };
  for (const [id, key] of Object.entries(map)) $(id).textContent = tr(key);
  $('dlCase').textContent = tr('btn.casefile'); $('mapTitle').textContent = tr('title.map'); $('journalTitle').textContent = tr('title.whispers');
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
  updateDesc();
  mark();
}
// Camera, floor and theme controls. The camera note explains when dread has overridden the request.
function syncViewUi() {
  const mode = effectiveCamera(state.camChoice, state.sanity.dread);
  $('camera').value = state.camChoice; $('theme').value = state.theme;
  const note = cameraOverridden(state.camChoice, state.sanity.dread) ? ' Top-down is refused at Abyss dread, so the view drops to the ground.' : '';
  $('cameraNote').textContent = `Looking: ${CAMERA_LABELS[mode]}.${note}`;
  const td = mode === 2;
  $('floor').disabled = !td; $('floorOut').textContent = td ? `Floor ${state.floor + 1}` : 'Floor (top-down only)';
  const base = THEMES.find((t) => t.id === state.theme);
  $('themeNote').textContent = base ? `${base.label}, DLNK group ${base.group}. ${themeSource(base)}` : 'Default mixed look.';
}
function themeSource(t) { return t.packRole && pack.patterns[t.packRole] ? 'Using the local pack texture.' : 'Using the procedural pattern.'; }
function pushHash() {
  const extra = (state.theme !== 'auto' ? `&theme=${state.theme}` : '') + (state.camChoice !== 'third' ? `&cam=${state.camChoice}` : '') + (state.floor ? `&floor=${state.floor}` : '') + (story.on ? `&story=1&beat=${story.idx - nightStartIndex(story.beats, state.night + 1)}` : '');
  autosave();
  history.replaceState(null, '', `${encodeHash({ seed: state.seed, sanity: state.sanity.value })}&night=${state.night + 1}${extra}`);
}
function setTheme(id) { state.theme = parseTheme(id); syncViewUi(); pushHash(); mark(); announce(`Texture theme: ${state.theme === 'auto' ? 'default' : state.theme}.`); }
function setCamera(choice) { state.camChoice = parseCamera(choice); state.snap = reduceMotion; syncViewUi(); pushHash(); mark(); announce($('cameraNote').textContent); }
function setFloor(f) { state.floor = parseFloor(f, Number($('floor').max) || 0); $('floor').value = String(state.floor); syncViewUi(); pushHash(); mark(); }
function cycle(list, cur, dir = 1) { return list[(list.indexOf(cur) + dir + list.length) % list.length]; }

function tryDoor(p) {
  if (!p) return;
  const attempt = state.attempts.get(p.key) || 0;
  state.attempts.set(p.key, attempt + 1);
  const behavior = doorOmen(state.sanity.dread, p.key, 0, attempt, state.seed);
  const text = doorMessage(behavior, p.key);
  state.shakes.set(p.key, { behavior, at: performance.now() });
  state.toast = { text, at: performance.now(), rising: behavior >= 2 };
  announce(`${text} (${DOOR_NAMES[behavior]})`);
  log('door', text);
  mark();
}
function setSanity(v, quiet) { state.sanity = new SanityModel(v); syncUi(); pushHash(); if (!quiet) say(null); }
function adjust(delta, location) { state.sanity.apply(delta); if (delta < 0 && !reduceMotion) state.flash = 0.25; syncUi(); pushHash(); say(location); }
function showNightClamp() {
  const el = $('nightClamp'); if (!el) return;
  const msg = state.campaign ? nightClampNotice(location.hash, state.campaign.nights.length) : '';
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
  setFocus(i); adjust(-2, p.id);
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
  c2.fillText(postcardCaption({ villageName: state.campaign.villageName, seed: state.seed, night: n.number, title: n.title }), out.width / 2, canvas.height + 36);
  out.toBlob((blob) => { if (blob) download(postcardFilename(state.seed, n.number), blob, 'image/png'); }, 'image/png');
}
function tryNextDoor() {
  if (!state.doors.length) return;
  state.doorFocus = (state.doorFocus + 1) % state.doors.length;
  tryDoor(state.doors[state.doorFocus]);
}
function setSound(on) { $('sound').checked = on; if (on) { if (!startAudio()) $('sound').checked = false; syncUi(); } else stopAudio(); }

const { story, storyBeats, showBeat, setPlaying, openStory, closeStory, toggleStory, applyStoryHash } = createStoryController({ $, state, reduceMotion, optParam, renderCampaign, setSanity, pushHash });
const { openIntro, introOpen } = createIntroController({ $, canvas, state, reduceMotion });

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
  const di = nearestDoor(state.doors.map(doorPoint).map((pt) => ({ x: pt.x, y: pt.y - 3 })), mx, my, 12);
  if (di >= 0) { $('hint').style.display = 'none'; state.doorFocus = di; tryDoor(state.doors[di]); return; }
  let best = null, bd = 1e9;
  state.layout.forEach((p) => { const c = iso(p.x + p.sizeX / 2, p.z + p.sizeZ / 2); const d = Math.hypot(c.x - mx, c.y - 12 - my); if (d < bd) { bd = d; best = p; } });
  if (best && bd < 60) { $('hint').style.display = 'none'; const li = state.landmarks.indexOf(best); if (li >= 0) setFocus(li); adjust(-2, best.id); }
});
canvas.addEventListener('keydown', (e) => {
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
$('share').addEventListener('click', async () => { pushHash(); try { await navigator.clipboard.writeText(!pack.want && location.origin && location.origin !== 'null' ? buildShareLink(location, currentSession()) : location.href); $('share').textContent = tr('btn.shared'); } catch { $('share').textContent = tr('btn.sharefail'); } setTimeout(() => ($('share').textContent = tr('btn.share')), 1800); });
$('sanity').addEventListener('input', () => setSanity(Number($('sanity').value)));
const doWhisper = () => adjust(-8, 'the walls');
const doChurch = () => { if (!reduceMotion) state.flash = 0.6; adjust(-15, 'church'); };
const doCandle = () => adjust(10, 'the village');
$('whisper').addEventListener('click', doWhisper);
$('church').addEventListener('click', doChurch);
$('candle').addEventListener('click', doCandle);
$('drain').addEventListener('change', (e) => { state.drain = e.target.checked; });
$('sound').addEventListener('change', (e) => setSound(e.target.checked));
$('night').addEventListener('change', () => selectNight(Number($('night').value)));
$('nightPrev').addEventListener('click', () => selectNight(state.night - 1));
$('nightNext').addEventListener('click', () => selectNight(state.night + 1));
$('postcard').addEventListener('click', postcard);
$('storyOpen').addEventListener('click', toggleStory);
$('storyExit').addEventListener('click', closeStory);
$('storyPrev').addEventListener('click', () => showBeat(prevBeat(story.idx, storyBeats().length), true));
$('storyNext').addEventListener('click', () => showBeat(nextBeat(story.idx, storyBeats().length), true));
$('storyPlay').addEventListener('click', () => setPlaying(!story.playing));
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

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (introOpen()) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (story.on) {
    const n = storyBeats().length, onCanvas = e.target === canvas;
    if (e.key === 'ArrowRight' && !onCanvas) { showBeat(nextBeat(story.idx, n), true); return; }
    if (e.key === 'ArrowLeft' && !onCanvas) { showBeat(prevBeat(story.idx, n), true); return; }
    if (e.key === '.') { showBeat(nextBeat(story.idx, n), true); return; }
    if (e.key === ',') { showBeat(prevBeat(story.idx, n), true); return; }
    if (e.key === ' ' && tag !== 'BUTTON' && !onCanvas) { setPlaying(!story.playing); e.preventDefault(); return; }
    if (e.key === 'Escape') { closeStory(); return; }
  }
  switch (e.key) {
    case 's': case 'S': toggleStory(); break;
    case 'u': case 'U': setMuted(!muted); break;
    case 'w': case 'W': doWhisper(); break;
    case 'c': case 'C': doChurch(); break;
    case 'l': case 'L': doCandle(); break;
    case 'n': case 'N': reroll(); break;
    case '[': setSanity(state.sanity.value - 5); break;
    case ']': setSanity(state.sanity.value + 5); break;
    case 'd': case 'D': $('drain').checked = !$('drain').checked; state.drain = $('drain').checked; break;
    case 'm': case 'M': setSound(!$('sound').checked); break;
    case ',': selectNight(state.night - 1); break;
    case '.': selectNight(state.night + 1); break;
    case 'p': case 'P': postcard(); break;
    case 'g': case 'G': setMap(!mapOn); break;
    case 'x': case 'X': setPerf(!perfOn); break;
    case 'o': case 'O': tryNextDoor(); break;
    case 't': case 'T': setTheme(cycle(['auto', ...THEMES.map((t) => t.id)], state.theme)); break;
    case 'v': case 'V': setCamera(cycle(['auto', 'first', 'third', 'top'], state.camChoice)); break;
    case 'f': case 'F': if (!$('floor').disabled) setFloor(state.floor >= Number($('floor').max) ? 0 : state.floor + 1); break;
    case '?': $('keys').open = !$('keys').open; break;
    default:
  }
});
addEventListener('hashchange', applyHash);
document.addEventListener?.('visibilitychange', () => { if (!document.hidden) mark(); });
if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver((es) => { state.visible = es.some((e) => e.isIntersecting); if (state.visible) mark(); }).observe(canvas);
setInterval(() => { if (state.drain && state.sanity.value > 0) { state.sanity.apply(-0.5); syncUi(); } }, 500);
setInterval(() => { if (state.drain) say(null); }, 9000);

(async function init() {
  try { await loadCatalog(); } catch (err) { $('stats').textContent = `Could not load the catalog (${err.message}). Serve this folder over HTTP, for example: python3 -m http.server -d web`; return; }
  ensureProcPatterns();
  $('theme').innerHTML = '<option value="auto">Default (mixed)</option>' + THEME_GROUPS.map((g) =>
    `<optgroup label="DLNK group: ${g}">${THEMES.filter((t) => t.group === g).map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}</optgroup>`).join('');
  if (pack.want) await loadPack();
  const resumed = resumeIfBare();
  applyHash(); pushHash(); start();
  if (resumed) $('sessionNote').textContent = tr('msg.loaded') + ' (resumed)';
  if (lang !== 'en') applyI18n();
  if (optParam('map') === '1') setMap(true);
  if (perfWanted(location.search, location.hash)) setPerf(true);
  registerOffline();
  if (introWanted) openIntro(); setTimeout(() => { state.live = true; }, 800);
})();
