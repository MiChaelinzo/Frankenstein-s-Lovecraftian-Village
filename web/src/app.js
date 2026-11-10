import {
  PrefabCatalog, generateLayout, SanityModel, SeededRandom, DreadEventTracker, DREAD_THRESHOLDS, tierFor,
  buildVillageReport, reportToMarkdown, reportToJson, generateCampaign,
  StaticNarrationProvider, SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
  detailLevel, doorOmen,
} from './core.js';
import {
  computeView, buildWalkers, walkerPos, cultistCount, windowState, omenText, addEntry, entryLabel,
  reportFilename, wrapIndex, describeScene, skyTint, weatherFor, postcardFilename, postcardCaption, nightFromHash,
} from './scene.js';
import { buildStory, clampBeat, nextBeat, prevBeat, nightStartIndex, parseStoryParam } from './story.js';
import { createAmbient } from './music.js';
import { shouldShowIntro, buildIntroSlides, advanceSlide, slideDelayMs } from './intro.js';
import { validateManifest, pickRole, hintFor, badgeText, tintChannel } from './pack.js';
import {
  THEMES, THEME_GROUPS, parseTheme, themeRole, themeColors, parseCamera, effectiveCamera, cameraProfile, cameraOverridden,
  floorCountFor, maxFloors, visibleFloors, parseFloor, detailFeatures, DOOR_NAMES, doorMessage, buildingKey, nearestDoor,
  doorShake, DOOR_RING, CAMERA_LABELS,
} from './building.js';

const GRID_W = 24, GRID_D = 24, PIECES = 80;
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1';
if (reduceMotion) document.documentElement?.classList?.add('reduced');

const V = computeView(canvas.width, canvas.height, GRID_W, GRID_D);
const TW = V.tw, TH = V.th;
const BOARD_CY = V.oy + ((GRID_W + GRID_D) * TH) / 4;
// Camera projection state: k squashes the board vertically, hs scales building heights. Eases between modes.
const cam = { mode: 1, k: 1, hs: 1, settled: true };
const optParam = (name) => new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get(name) ?? params.get(name);
let dirty = true;
const mark = () => { dirty = true; start(); };

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${lerp(c1[0], c2[0], t) | 0},${lerp(c1[1], c2[1], t) | 0},${lerp(c1[2], c2[2], t) | 0})`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prettyId = (id) => id.replace(/_/g, ' ');

const state = {
  seed: 1818, sanity: new SanityModel(100), layout: [], landmarks: [], walkers: [], drawOrder: [], catalog: null,
  narrationLine: '', narrationAt: 0, flash: 0, drain: false,
  theme: 'auto', camChoice: 'third', floor: 0, attempts: new Map(), shakes: new Map(), doorFocus: -1, doors: [], visible: true,
  campaign: null, night: 0, tracker: new DreadEventTracker(), live: false, snap: true, journal: [], toast: null, focus: -1, eye: 0, tentacle: 0,
};

// ?narrator=https://... plugs in an AI endpoint; Safe wrapper falls back to offline text on any failure.
const narratorUrl = params.get('narrator');
const narrator = new SafeNarrationProvider(narratorUrl ? new HttpNarrationProvider(narratorUrl) : null, new StaticNarrationProvider());

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
  story.beats = [];
  state.night = Math.min(state.night, state.campaign.nights.length - 1);
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
  $('nightInfo').innerHTML = `<em>${esc(n.title)}</em> (dread target ${n.dreadTargetPercent}%, ${esc(n.sky)}, ${esc(n.weather)}).<br>Rumor: ${esc(n.rumor)}<br>Lore: ${esc(n.lore)}`;
  updateDesc();
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
  const d = state.sanity.dread;
  const f = state.landmarks[state.focus];
  $('viewDesc').textContent = describeScene({
    seed: state.seed, pieces: state.layout.length, tierName: DREAD_THRESHOLDS.tierNames[tierFor(d)], dreadPercent: Math.round(d * 100),
    focus: f ? `${prettyId(f.id)} at ${f.x}, ${f.z}` : '',
  }) + (currentNight() ? ` ${state.campaign.villageName}, night ${state.night + 1} of ${state.campaign.nights.length}, ${currentNight().weather}.` : '');
}

// ---------- drawing helpers ----------
function iso(x, z) { const y = V.oy + (x + z) * TH / 2; return { x: V.ox + (x - z) * TW / 2, y: BOARD_CY + (y - BOARD_CY) * cam.k }; }
const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const rise = (p, h) => ({ x: p.x, y: p.y - h });
const riseH = (p, h) => rise(p, h * cam.hs);

// ---------- optional local pack mode (?pack=1), textures come from the git-ignored web/local-pack/ ----------
const pack = { want: params.get('pack') === '1', manifest: null, roles: {}, patterns: {}, notice: '' };
const PACK_SCALE = { wall_wood: 0.3, wall_brick: 0.3, wall_plaster: 0.3, wall_stone: 0.3, roof: 0.3, trunk: 0.25, ground: 0.5, ground_stones: 0.5 };
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`cannot load ${src}`)); im.src = src; }); }
async function loadPack() {
  try {
    const res = await fetch('local-pack/manifest.json');
    if (!res.ok) throw new Error(`no local-pack/manifest.json (HTTP ${res.status}); run python3 tools/build_local_pack.py`);
    const json = await res.json();
    const v = validateManifest(json);
    if (!v.ok) throw new Error(`bad manifest: ${v.errors.join('; ')}`);
    for (const [name, r] of Object.entries(v.roles)) {
      const im = await loadImage(`local-pack/${r.texture}`);
      const off = document.createElement('canvas'); off.width = im.width; off.height = im.height;
      const o = off.getContext('2d');
      o.fillStyle = `rgb(${r.tint.map((t) => tintChannel(255, t)).join(',')})`; o.fillRect(0, 0, off.width, off.height);
      o.globalCompositeOperation = 'multiply'; o.drawImage(im, 0, 0);
      const pat = ctx.createPattern(off, 'repeat');
      if (pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(PACK_SCALE[name] || 0.3));
      pack.patterns[name] = pat;
    }
    pack.roles = v.roles; pack.manifest = json;
  } catch (err) {
    pack.patterns = {}; pack.manifest = null;
    pack.notice = 'Pack mode requested but no local pack found. Showing the procedural demo.';
    console.warn(`[pack] ${err.message}`);
  }
}
// Procedural texture library (no assets): one small seamless pattern per theme, built once on a tiny offscreen canvas.
const procPatterns = {};
function buildProcPattern(id) {
  const [lit, shaded] = themeColors(id);
  const S = 64, off = document.createElement('canvas'); off.width = S; off.height = S;
  const o = off.getContext('2d'), r = new SeededRandom(id.length * 977 + id.charCodeAt(0));
  const c = (a, t = 0) => `rgb(${a.map((v) => Math.max(0, Math.min(255, v + t)) | 0).join(',')})`;
  o.fillStyle = c(lit); o.fillRect(0, 0, S, S);
  o.lineWidth = 1;
  if (id === 'bricks') {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 4; col++) {
      o.fillStyle = c(lit, r.next(30) - 15); o.fillRect(col * 16 + (row % 2) * 8, row * 8, 15, 7);
    }
    o.fillStyle = c(shaded, -20); for (let row = 0; row < 8; row++) o.fillRect(0, row * 8 + 7, S, 1);
  } else if (id === 'plaster') {
    for (let i = 0; i < 160; i++) { o.fillStyle = c(i % 2 ? shaded : lit, r.next(24) - 12); o.fillRect(r.next(S), r.next(S), 1 + r.next(3), 1 + r.next(2)); }
  } else if (id === 'tiles') {
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) { o.fillStyle = c(lit, r.next(24) - 12); o.fillRect(col * 16 + 1, row * 16 + 1, 14, 14); }
    o.fillStyle = c(shaded, -25); for (let i = 0; i < 4; i++) { o.fillRect(0, i * 16, S, 1); o.fillRect(i * 16, 0, 1, S); }
  } else if (id === 'wood') {
    for (let p = 0; p < 8; p++) { o.fillStyle = c(lit, r.next(30) - 15); o.fillRect(p * 8, 0, 8, S); o.fillStyle = c(shaded, -20); o.fillRect(p * 8, 0, 1, S); }
    o.strokeStyle = c(shaded); for (let i = 0; i < 14; i++) { const x = r.next(S); o.beginPath(); o.moveTo(x, 0); o.lineTo(x + r.next(3) - 1, S); o.stroke(); }
  } else if (id === 'rocks') {
    for (let i = 0; i < 26; i++) { o.fillStyle = c(r.next(2) ? lit : shaded, r.next(30) - 15); o.beginPath(); o.ellipse(r.next(S), r.next(S), 5 + r.next(8), 4 + r.next(6), r.next(31) / 10, 0, 7); o.fill(); }
  } else {
    o.strokeStyle = c(shaded, 30); for (let row = 0; row < 8; row++) { o.beginPath(); for (let x = 0; x <= S; x += 4) o.lineTo(x, row * 8 + 4 + Math.sin((x / S) * 6.283 * 2 + row) * 2); o.stroke(); }
  }
  return ctx.createPattern(off, 'repeat');
}
function ensureProcPatterns() { for (const t of THEMES) if (!procPatterns[`proc_${t.id}`]) procPatterns[`proc_${t.id}`] = buildProcPattern(t.id); }
const resolvePattern = (role) => pack.patterns[role] || procPatterns[role] || null;
const surf = (role, color, shade = 0) => (role && resolvePattern(role) ? { role, color, shade } : color);
const hintLabel = (id) => (pack.manifest ? hintFor(pack.manifest, id) : '');
function paintSurface(s) {
  ctx.fillStyle = resolvePattern(s.role); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = s.color; ctx.fill();
  if (s.shade) { ctx.globalAlpha = s.shade; ctx.fillStyle = '#000'; ctx.fill(); }
  ctx.restore();
}

function poly(points, fill, stroke) {
  ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  if (typeof fill === 'object') paintSurface(fill); else { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function box(cx, cy, sx, sz, h, top, left, right) {
  const a = iso(cx, cy), b = iso(cx + sx, cy), c = iso(cx + sx, cy + sz), d = iso(cx, cy + sz);
  const up = (p) => ({ x: p.x, y: p.y - h * cam.hs });
  poly([d, c, up(c), up(d)], left); // left-facing wall (z+ edge)
  poly([b, c, up(c), up(b)], right);
  if (top) poly([up(a), up(b), up(c), up(d)], top);
  return { a, b, c, d, up };
}

// Gradients are cached at the origin and drawn through a translate, so nothing is allocated per piece per frame.
const gradCache = new Map();
function cachedGrad(key, make) { let g = gradCache.get(key); if (!g) { g = make(); gradCache.set(key, g); } return g; }
function glow(x, y, r, rgb, alpha, sy = 1) {
  const key = `g${rgb}:${r | 0}`;
  const g = cachedGrad(key, () => { const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(1, `rgba(${rgb},0)`); return gr; });
  ctx.save(); ctx.translate(x, y); if (sy !== 1) ctx.scale(1, sy); ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.restore();
}

function gableRoof(bx, rh, alongX, front, back, gable) {
  const ua = bx.up(bx.a), ub = bx.up(bx.b), uc = bx.up(bx.c), ud = bx.up(bx.d);
  if (alongX) {
    const m1 = riseH(lerpPt(ud, ua, 0.5), rh), m2 = riseH(lerpPt(uc, ub, 0.5), rh);
    poly([ua, ub, m2, m1], back); poly([ub, uc, m2], gable); poly([ud, uc, m2, m1], front);
    return { m1, m2 };
  }
  const m1 = riseH(lerpPt(ua, ub, 0.5), rh), m2 = riseH(lerpPt(ud, uc, 0.5), rh);
  poly([ua, ud, m2, m1], back); poly([ud, uc, m2], gable); poly([ub, uc, m2, m1], front);
  return { m1, m2 };
}

function windowAt(pt, w, hh, st, dread, flick) {
  if (st === 'off') { ctx.fillStyle = 'rgba(4,6,8,.85)'; ctx.fillRect(pt.x - w / 2, pt.y, w, hh); return; }
  const warm = st === 'warm';
  glow(pt.x, pt.y + hh / 2, 14, warm ? '255,190,110' : '255,40,40', (warm ? 0.35 : 0.5) * flick);
  ctx.fillStyle = warm ? `rgba(255,${200 - 90 * dread | 0},${120 - 60 * dread | 0},${(0.95 * flick).toFixed(2)})` : `rgba(255,50,40,${(0.7 + 0.3 * flick).toFixed(2)})`;
  ctx.fillRect(pt.x - w / 2, pt.y, w, hh);
}

const topDownNow = () => cam.mode === 2;
function doorPoint(p) { const m = 0.05; return lerpPt(iso(p.x + m, p.z + p.sizeZ - m), iso(p.x + p.sizeX - m, p.z + p.sizeZ - m), 0.2); }

function drawPiece(p, dread, time) {
  const v = p.vis;
  const feat = detailFeatures(p.detail);
  const topDown = topDownNow();
  const flick = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(time / (140 + v.phase % 90) + v.phase) * (0.6 + dread);
  const wall = mix([66, 74, 78], [70, 30, 36], dread);
  const wallR = mix([46, 54, 60], [48, 18, 24], dread);
  const roofF = mix([58, 44, 48], [44, 12, 20], dread);
  const roofB = mix([40, 32, 36], [28, 8, 14], dread);
  const slab = mix([62, 56, 50], [54, 22, 26], dread);
  const m = 0.05;
  const roles = pack.roles;
  const themed = state.theme !== 'auto' ? themeRole(state.theme, pack.patterns) : null;
  // omen-driven detail: textures drop out first, then windows, doors and the roof as the building decays
  const sf = (role, color, shade) => (feat.texture ? surf(role, color, shade) : color);
  const wallRole = themed || (p.id === 'house_b' ? pickRole(roles, v.h < 0.5 ? 'wall_brick' : 'wall_plaster', 'wall_wood') : pickRole(roles, v.h < 0.5 ? 'wall_wood' : 'wall_plaster', 'wall_wood'));
  const stoneRole = themed || pickRole(roles, 'wall_stone', 'wall_brick');
  const roofRole = state.theme === 'tiles' ? themed : pickRole(roles, 'roof', 'wall_wood');
  const cx = p.x + m, cz = p.z + m, sx = p.sizeX - 2 * m, sz = p.sizeZ - 2 * m;
  switch (p.id) {
    case 'house_a': case 'house_b': {
      const fh = 11 + v.h * 3, ph = fh * cam.hs;
      const vis = visibleFloors(p.floors, state.floor, topDown);
      const n = Math.max(1, vis.length);
      const flat = feat.roof ? slab : mix([30, 28, 28], [22, 8, 12], dread); // cutaway slab, or a collapsed flat top
      const bx = box(cx, cz, sx, sz, n * fh, topDown || !feat.roof ? flat : null, sf(wallRole, wall, 0.05), sf(wallRole, wallR, 0.35));
      if (topDown) {
        const inset = 0.18, t = n * ph;
        poly([iso(cx + inset, cz + inset), iso(cx + sx - inset, cz + inset), iso(cx + sx - inset, cz + sz - inset), iso(cx + inset, cz + sz - inset)].map((pt) => rise(pt, t)), mix([26, 24, 24], [30, 8, 12], dread));
      }
      for (let i = 1; feat.floorLines && i < n; i++) {
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        const l1 = rise(bx.d, i * ph), l2 = rise(bx.c, i * ph), l3 = rise(bx.b, i * ph);
        ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.lineTo(l3.x, l3.y); ctx.stroke();
      }
      if (feat.trim) {
        ctx.strokeStyle = 'rgba(200,210,205,.22)'; ctx.beginPath();
        for (const c of [bx.d, bx.c, bx.b]) { const u = bx.up(c); ctx.moveTo(c.x, c.y); ctx.lineTo(u.x, u.y); }
        ctx.stroke();
      }
      if (!topDown && feat.roof) {
        const roof = gableRoof(bx, 10 + v.tilt * 4, v.tilt < 0.5, sf(roofRole, roofF, 0.1), sf(roofRole, roofB, 0.4), sf(wallRole, wallR, 0.35));
        if (p.id === 'house_b' && feat.chimney) { ctx.fillStyle = roofB; ctx.fillRect(roof.m1.x + (roof.m2.x - roof.m1.x) * 0.3 - 2, roof.m1.y - 7, 4, 9); }
      }
      for (const f of vis) {
        if (!feat.windows) break;
        const r1 = f === 0 ? v.lit : (v.lit * 7 + f * 0.37) % 1, r2 = f === 0 ? v.lit2 : (v.lit2 * 5 + f * 0.53) % 1;
        const st = (r) => (feat.lit ? windowState(r, dread) : 'off');
        windowAt(rise(lerpPt(bx.d, bx.c, 0.55), f * ph + ph * 0.8), 5, 6, st(r1), dread, flick);
        windowAt(rise(lerpPt(bx.b, bx.c, 0.5), f * ph + ph * 0.8), 5, 6, st(r2), dread, flick);
      }
      const door = lerpPt(bx.d, bx.c, 0.2);
      if (feat.door) { ctx.fillStyle = 'rgba(8,8,10,.8)'; ctx.fillRect(door.x - 2, door.y - 7, 4, 7); }
      else { ctx.fillStyle = 'rgba(30,22,16,.9)'; ctx.fillRect(door.x - 2, door.y - 7, 4, 7); ctx.strokeStyle = 'rgba(120,100,80,.8)'; ctx.beginPath(); ctx.moveTo(door.x - 2, door.y - 6); ctx.lineTo(door.x + 2, door.y - 1); ctx.moveTo(door.x + 2, door.y - 6); ctx.lineTo(door.x - 2, door.y - 1); ctx.stroke(); }
      break;
    }
    case 'church': {
      const sw = sf(stoneRole, wall, 0.05), swR = sf(stoneRole, wallR, 0.35), sRoofF = sf(roofRole, roofF, 0.1), sRoofB = sf(roofRole, roofB, 0.4);
      const tower = box(p.x + 0.12, p.z + 0.12, 0.8, 0.8, 58, sRoofF, sw, swR);
      const apex = riseH(lerpPt(tower.up(tower.a), tower.up(tower.c), 0.5), 30);
      poly([tower.up(tower.d), tower.up(tower.c), apex], sRoofF); poly([tower.up(tower.b), tower.up(tower.c), apex], sRoofB);
      if (feat.windows) windowAt(lerpPt(rise(tower.d, 42 * cam.hs), rise(tower.c, 42 * cam.hs), 0.5), 4, 9, feat.lit ? (dread > 0.85 ? 'red' : 'warm') : 'off', dread, flick);
      const nVis = Math.max(1, visibleFloors(p.floors, state.floor, topDown).length);
      const bx = box(cx, cz, sx, sz, 13 * nVis, topDown || !feat.roof ? slab : null, sw, swR);
      if (!topDown && feat.roof) gableRoof(bx, 14, true, sRoofF, sRoofB, swR);
      if (feat.windows) for (const t of [0.3, 0.7]) windowAt(lerpPt(rise(bx.d, 6 * cam.hs), rise(bx.c, 6 * cam.hs), t), 5, 11, feat.lit ? (dread > 0.7 ? 'red' : 'warm') : 'off', dread, flick);
      break;
    }
    case 'well': {
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 9, mix([30, 40, 44], [20, 5, 8], dread), sf(stoneRole, mix([84, 90, 92], [92, 40, 44], dread), 0.05), sf(stoneRole, mix([60, 66, 70], [60, 22, 28], dread), 0.35));
      ctx.fillStyle = dread > 0.5 ? `rgba(170,20,30,${(0.5 + 0.4 * flick).toFixed(2)})` : 'rgba(10,20,26,.9)';
      const c = lerpPt(bx.up(bx.a), bx.up(bx.c), 0.5); ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 3.4, 0, 0, 7); ctx.fill();
      break;
    }
    case 'dead_tree': {
      const base = iso(p.x + 0.5, p.z + 0.5);
      const sway = reduceMotion ? 0 : Math.sin(time / 900 + v.phase) * 2;
      const trunkRole = pickRole(roles, 'trunk');
      ctx.strokeStyle = trunkRole ? pack.patterns[trunkRole] : mix([40, 32, 28], [30, 14, 14], dread); ctx.lineCap = 'round';
      const branch = (x, y, len, ang, w, d) => {
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
        const nx = x + Math.cos(ang) * len + (d > 1 ? sway * 0.4 : 0), ny = y + Math.sin(ang) * len; ctx.lineTo(nx, ny); ctx.stroke();
        if (d > 0) { branch(nx, ny, len * 0.7, ang - 0.5 - v.tilt * 0.3, w * 0.7, d - 1); branch(nx, ny, len * 0.7, ang + 0.5 + v.h * 0.3, w * 0.7, d - 1); }
      };
      branch(base.x, base.y, 16 + v.h * 8, -Math.PI / 2, 4, 3);
      break;
    }
    case 'altar': {
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 10, mix([70, 72, 80], [90, 20, 30], dread), sf(stoneRole, mix([40, 42, 50], [50, 12, 18], dread), 0.1), sf(stoneRole, mix([30, 32, 40], [36, 8, 14], dread), 0.35));
      const c = lerpPt(bx.up(bx.a), bx.up(bx.c), 0.5);
      glow(c.x, c.y, 26 + 26 * dread, '160,255,200', 0.3 + 0.2 * flick);
      break;
    }
    default: box(cx, cz, sx, sz, 12, roofF, sf(wallRole, wall, 0.05), sf(wallRole, wallR, 0.35));
  }
}

function drawCultist(pos, dread, time) {
  const s = iso(pos.x, pos.z);
  const bob = reduceMotion ? 0 : Math.abs(Math.sin(time / 170 + pos.x * 3)) * 1.2;
  poly([{ x: s.x - 3.6, y: s.y }, { x: s.x + 3.6, y: s.y }, { x: s.x + 1.6, y: s.y - 11 - bob }, { x: s.x - 1.6, y: s.y - 11 - bob }], mix([22, 20, 30], [42, 6, 10], dread));
  ctx.fillStyle = 'rgba(5,5,8,.95)'; ctx.beginPath(); ctx.arc(s.x, s.y - 13 - bob, 2.3, 0, 7); ctx.fill();
  const lx = s.x + 5, ly = s.y - 7 - bob;
  ctx.strokeStyle = 'rgba(40,30,20,.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x + 1.5, s.y - 9 - bob); ctx.lineTo(lx, ly - 2); ctx.stroke();
  ctx.fillStyle = dread > 0.67 ? 'rgb(255,120,70)' : 'rgb(255,214,140)'; ctx.fillRect(lx - 1.5, ly - 1, 3, 4);
  glow(lx, ly + 1, 12, '255,190,110', 0.55);
}

const stars = Array.from({ length: 90 }, (_, i) => { const r = new SeededRandom(i + 99); return { x: r.next(960), y: r.next(260), s: 0.5 + r.next(100) / 100, ph: r.next(628) }; });
const reeds = Array.from({ length: 70 }, (_, i) => { const r = new SeededRandom(i + 4242); return { x: GRID_W + 0.3 + r.next(80) / 10, z: 1 + r.next(GRID_D * 10) / 10, h: 8 + r.next(14), lean: (r.next(100) - 50) / 40 }; });
const fogBanks = Array.from({ length: 8 }, (_, i) => ({ y: 130 + i * 52, speed: 5 + i * 2.2, off: i * 150, dir: i % 2 ? -1 : 1 }));
const q = (d) => Math.round(d * 40);

function drawSky(dread, time) {
  const g = cachedGrad(`sky${q(dread)}`, () => {
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, mix([14, 24, 38], [38, 6, 12], dread)); gr.addColorStop(1, mix([8, 14, 18], [14, 3, 6], dread)); return gr;
  });
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  stars.forEach((s) => { ctx.fillStyle = `rgba(220,230,255,${((1 - dread * 0.7) * (0.35 + 0.35 * Math.sin(time / 700 + s.ph))).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.s, s.s); });
  // moon swells and reddens with dread
  const mx = 800, my = 80 + dread * 18, mr = 28 + 22 * dread;
  glow(mx, my, mr * 4, `${200 + 40 * dread | 0},${220 - 150 * dread | 0},${230 - 180 * dread | 0}`, 0.35);
  ctx.fillStyle = mix([225, 232, 240], [190, 40, 44], dread); ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
  if (state.eye > 0.02) drawEye(time);
}

function drawEye(time) {
  const cx = 250, cy = 78, w = 64, hgt = 30 * state.eye;
  glow(cx, cy, 120, '200,30,30', 0.45 * state.eye);
  ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.quadraticCurveTo(cx, cy - hgt, cx + w, cy); ctx.quadraticCurveTo(cx, cy + hgt, cx - w, cy); ctx.closePath();
  ctx.fillStyle = 'rgb(222,176,120)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,0,0,.9)'; ctx.lineWidth = 3; ctx.stroke();
  const px = cx + (reduceMotion ? 0 : Math.sin(time / 2600) * 14);
  ctx.fillStyle = 'rgb(18,0,4)'; ctx.beginPath(); ctx.ellipse(px, cy, 5 + 2 * state.eye, Math.max(1, hgt * 0.85), 0, 0, 7); ctx.fill();
}

function drawSea(dread, time) {
  // sea along the z = GRID_D edge (front left), marsh along x = GRID_W (front right)
  const E = 12;
  poly([iso(-E, GRID_D), iso(GRID_W, GRID_D), iso(GRID_W, GRID_D + E), iso(-E, GRID_D + E)], mix([10, 30, 38], [40, 8, 14], dread));
  const segs = 28;
  for (let k = 0; k < 9; k++) {
    const z0 = GRID_D + 0.35 + k * 0.8;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const x = -E + (GRID_W + E) * i / segs;
      const zz = z0 + (reduceMotion ? 0 : Math.sin(time / 700 + x * 0.7 + k * 1.3) * 0.12 * (1 + dread));
      const pt = iso(x, zz); if (i) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y);
    }
    ctx.strokeStyle = `rgba(${120 + 90 * dread | 0},${190 - 140 * dread | 0},${200 - 150 * dread | 0},${(0.28 - k * 0.025).toFixed(3)})`; ctx.lineWidth = 1.4; ctx.stroke();
  }
  poly([iso(GRID_W, 0), iso(GRID_W + E, 0), iso(GRID_W + E, GRID_D + E), iso(GRID_W, GRID_D + E)], mix([18, 28, 22], [34, 10, 14], dread));
  ctx.lineCap = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = mix([46, 66, 50], [70, 22, 24], dread);
  reeds.forEach((r) => {
    const b = iso(r.x, r.z); const sw = reduceMotion ? 0 : Math.sin(time / 800 + r.z) * 1.5;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + r.lean * 6 + sw, b.y - r.h); ctx.stroke();
  });
}

function drawTentacles(dread, time) {
  if (state.tentacle < 0.02) return;
  const bases = [[7, GRID_D + 3.2, 0.9], [16, GRID_D + 4.8, 1.2], [11, GRID_D + 7.5, 1.5]];
  bases.forEach(([x, z, ph], bi) => {
    const grow = Math.max(0, Math.min(1, state.tentacle * 1.4 - bi * 0.25));
    if (grow <= 0) return;
    const b = iso(x, z), H = 150 * grow, n = 16;
    let prev = b;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const sway = reduceMotion ? 0 : Math.sin(time / 1100 + ph + t * 3.2);
      const pt = { x: b.x + (Math.sin(t * 2.4 + ph) * 18 + sway * 12) * t, y: b.y - t * H };
      ctx.strokeStyle = mix([34, 44, 54], [96, 24, 40], dread); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, 16 * (1 - t) + 2);
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      if (i % 3 === 0 && t < 0.85) { ctx.fillStyle = 'rgba(120,30,40,.45)'; ctx.fillRect(pt.x - 1, pt.y, 2, 2); }
      prev = pt;
    }
  });
}

function drawGround(dread) {
  const corners = [iso(0, 0), iso(GRID_W, 0), iso(GRID_W, GRID_D), iso(0, GRID_D)];
  poly(corners, surf(pickRole(pack.roles, 'ground', 'ground_stones'), mix([24, 38, 32], [42, 12, 16], dread), 0.25), mix([60, 84, 72], [100, 28, 34], dread));
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i < GRID_W; i++) { const a = iso(i, 0), b = iso(i, GRID_D); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  for (let i = 1; i < GRID_D; i++) { const a = iso(0, i), b = iso(GRID_W, i); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
}

function drawFog(dread, time) {
  const density = 0.06 + 0.12 * dread;
  const banks = 4 + Math.round(4 * dread);
  const g = cachedGrad(`fog${q(dread)}`, () => {
    const gr = ctx.createRadialGradient(0, 0, 10, 0, 0, 320);
    gr.addColorStop(0, `rgba(${150 - 60 * dread | 0},${170 - 120 * dread | 0},${170 - 120 * dread | 0},1)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr;
  });
  const span = canvas.width + 640;
  for (let i = 0; i < banks; i++) {
    const f = fogBanks[i];
    const x = ((((time / 1000) * f.speed * (1 + dread) * f.dir + f.off) % span) + span) % span - 320;
    ctx.save(); ctx.translate(x, f.y - dread * 30 * (i % 3)); ctx.scale(1, 0.45); ctx.globalAlpha = density * (i % 2 ? 0.8 : 1); ctx.fillStyle = g; ctx.fillRect(-320, -320, 640, 640); ctx.restore();
  }
}

const raindrops = Array.from({ length: 160 }, (_, i) => { const r = new SeededRandom(i + 7777); return { x: r.next(1100), y: r.next(700), v: 380 + r.next(260), l: 8 + r.next(10) }; });

/** Night tint over the whole scene, plus rain streaks or an extra fog layer. Static when reduced motion is on. */
function drawWeather(dread, time) {
  const night = currentNight(); if (!night) return;
  const tint = skyTint(night.sky);
  ctx.fillStyle = `rgba(${tint.rgb[0]},${tint.rgb[1]},${tint.rgb[2]},${tint.alpha})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const w = weatherFor(night.weather);
  if (w.fog) {
    const g = cachedGrad('wfog', () => { const gr = ctx.createLinearGradient(0, 0, 0, canvas.height); gr.addColorStop(0, 'rgba(150,165,165,.25)'); gr.addColorStop(0.5, 'rgba(150,165,165,.5)'); gr.addColorStop(1, 'rgba(150,165,165,.3)'); return gr; });
    ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1;
  }
  if (w.rain) {
    ctx.strokeStyle = 'rgba(170,200,220,.35)'; ctx.lineWidth = 1; ctx.beginPath();
    const t = time / 1000;
    for (const d of raindrops) {
      const y = (d.y + t * d.v) % (canvas.height + 40) - 20, x = (d.x - t * d.v * 0.25 + 4000) % (canvas.width + 40) - 20;
      ctx.moveTo(x, y); ctx.lineTo(x - d.l * 0.25, y + d.l);
    }
    ctx.stroke();
  }
}

function drawVignette(dread, time) {
  const flicker = reduceMotion ? 0 : (Math.sin(time / 90) * Math.sin(time / 37)) * 0.05 * dread;
  const g = cachedGrad(`vig${q(dread)}`, () => {
    const inner = canvas.height * (0.7 - 0.34 * dread);
    const gr = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, inner, canvas.width / 2, canvas.height / 2, canvas.width * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.4 + 0.5 * dread).toFixed(2)})`); return gr;
  });
  ctx.globalAlpha = Math.min(1, 0.95 + flicker * 2); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1;
  if (dread > 0.75) { ctx.fillStyle = `rgba(120,0,10,${((dread - 0.75) * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}

function drawFocus(time) {
  const p = state.landmarks[state.focus]; if (!p) return;
  const pulse = reduceMotion ? 0.9 : 0.65 + 0.3 * Math.sin(time / 260);
  const pad = 0.15;
  poly([iso(p.x - pad, p.z - pad), iso(p.x + p.sizeX + pad, p.z - pad), iso(p.x + p.sizeX + pad, p.z + p.sizeZ + pad), iso(p.x - pad, p.z + p.sizeZ + pad)], 'rgba(160,255,200,.08)');
  ctx.strokeStyle = `rgba(160,255,200,${pulse.toFixed(2)})`; ctx.lineWidth = 2; ctx.stroke();
  const c = iso(p.x + p.sizeX / 2, p.z + p.sizeZ / 2);
  const hint = hintLabel(p.id);
  const label = hint ? `${prettyId(p.id)} (${hint})` : prettyId(p.id);
  ctx.font = '600 20px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(label, c.x + 1, c.y + 26); ctx.fillStyle = 'rgb(190,255,220)'; ctx.fillText(label, c.x, c.y + 25);
}

function drawDoorMarks(real) {
  const f = state.doors[state.doorFocus];
  if (f) { const pt = doorPoint(f); ctx.strokeStyle = 'rgba(160,255,200,.9)'; ctx.setLineDash?.([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pt.x, pt.y - 3, 9, 0, 7); ctx.stroke(); ctx.setLineDash?.([]); }
  for (const [k, sh] of state.shakes) {
    const p = state.layout.find((q) => q.key === k); if (!p) continue;
    const pt = doorPoint(p), age = real - sh.at;
    ctx.strokeStyle = DOOR_RING[sh.behavior]; ctx.lineWidth = 2; ctx.globalAlpha = Math.max(0, 1 - age / 1500);
    ctx.beginPath(); ctx.arc(pt.x, pt.y - 3, 8 + Math.min(10, age / 90), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
}

function drawPackBadge() {
  const text = pack.manifest ? badgeText(pack.manifest) : pack.notice;
  if (!text) return;
  ctx.save(); ctx.font = '13px Georgia, serif'; ctx.textAlign = 'left';
  const w = (ctx.measureText ? ctx.measureText(text).width : 300) + 16;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(8, canvas.height - 30, w, 22);
  ctx.fillStyle = pack.manifest ? 'rgb(190,230,210)' : 'rgb(240,200,150)'; ctx.fillText(text, 16, canvas.height - 15); ctx.restore();
}

function drawToast(now) {
  const t = state.toast; if (!t) return;
  const age = now - t.at;
  if (age > 6000) { state.toast = null; return; }
  const a = reduceMotion ? 1 : Math.min(1, age / 400, (6000 - age) / 800);
  ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.font = 'italic 26px Georgia, serif'; ctx.textAlign = 'center';
  const w = Math.min(canvas.width - 20, (ctx.measureText ? ctx.measureText(t.text).width : 400) + 48);
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(canvas.width / 2 - w / 2, 22, w, 44);
  ctx.strokeStyle = t.rising ? 'rgba(200,60,60,.8)' : 'rgba(95,143,120,.8)'; ctx.lineWidth = 1; ctx.strokeRect(canvas.width / 2 - w / 2, 22, w, 44);
  ctx.fillStyle = t.rising ? 'rgb(240,170,170)' : 'rgb(190,230,210)'; ctx.fillText(t.text, canvas.width / 2, 52); ctx.restore();
}

let running = false;
const active = [];
// Eases the projection toward the effective camera. Returns true while still moving.
function updateCamera(dread) {
  cam.mode = effectiveCamera(state.camChoice, dread);
  const prof = cameraProfile(cam.mode);
  const step = reduceMotion || state.snap ? 1 : 0.15;
  const nk = cam.k + (prof.k - cam.k) * step, nh = cam.hs + (prof.hs - cam.hs) * step;
  cam.settled = Math.abs(nk - prof.k) < 0.004 && Math.abs(nh - prof.hs) < 0.004;
  cam.k = cam.settled ? prof.k : nk; cam.hs = cam.settled ? prof.hs : nh;
  return !cam.settled;
}
function frame(now) {
  if (document.hidden) { running = false; return; }
  const real = performance.now();
  for (const [k, sh] of state.shakes) if (real - sh.at > 1500) state.shakes.delete(k);
  const dread = state.sanity.dread, tier = tierFor(dread);
  const moving = updateCamera(dread);
  // Idle skip: with reduced motion nothing animates on its own, so only redraw after a change (or while a toast, flash or shake plays).
  const busy = !reduceMotion || dirty || moving || state.flash > 0 || state.toast || state.shakes.size > 0;
  if (!busy) { running = false; return; }
  if (!state.visible) { requestAnimationFrame(frame); return; }
  dirty = false;
  const time = reduceMotion ? 0 : now;
  const eyeT = tier >= 3 ? 1 : 0, tentT = tier >= 3 ? 1 : tier >= 2 ? 0.4 : 0;
  state.eye = reduceMotion || state.snap ? eyeT : state.eye + (eyeT - state.eye) * 0.06;
  state.tentacle = reduceMotion || state.snap ? tentT : state.tentacle + (tentT - state.tentacle) * 0.06;
  state.snap = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky(dread, time);
  ctx.save();
  if (!reduceMotion && dread > 0.5) ctx.translate((Math.random() - 0.5) * (dread - 0.5) * 3, (Math.random() - 0.5) * (dread - 0.5) * 3);
  drawSea(dread, time);
  drawGround(dread);
  active.length = 0;
  const n = Math.min(cultistCount(tier), state.walkers.length);
  for (let i = 0; i < n; i++) {
    const pos = walkerPos(state.walkers[i], time / 1000); pos.depth = pos.x + pos.z + 0.6; active.push(pos);
    const s = iso(pos.x, pos.z); glow(s.x, s.y, 26, '255,190,110', 0.28, 0.5);
  }
  active.sort((a, b) => a.depth - b.depth);
  let ai = 0;
  for (const p of state.drawOrder) {
    while (ai < active.length && active[ai].depth <= p.depth) drawCultist(active[ai++], dread, time);
    const sh = state.shakes.get(p.key);
    if (sh) { const o = doorShake(sh.behavior, real - sh.at, reduceMotion); ctx.save(); ctx.translate(o.dx, o.dy); drawPiece(p, dread, time); ctx.restore(); }
    else drawPiece(p, dread, time);
  }
  while (ai < active.length) drawCultist(active[ai++], dread, time);
  drawFocus(time);
  drawDoorMarks(real);
  drawTentacles(dread, time);
  drawFog(dread, time);
  ctx.restore();
  if (state.flash > 0) { ctx.fillStyle = `rgba(210,230,255,${state.flash.toFixed(2)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); state.flash = Math.max(0, state.flash - 0.04); }
  else if (!reduceMotion && dread > 0.4 && Math.random() < 0.0015 * dread) state.flash = 0.5;
  drawWeather(dread, time);
  drawVignette(dread, time);
  drawToast(performance.now());
  drawPackBadge();
  requestAnimationFrame(frame);
}
function start() { if (running) return; running = true; requestAnimationFrame(frame); }

// ---------- controls ----------
function syncUi() {
  const s = state.sanity.value, d = state.sanity.dread;
  $('sanity').value = s; $('sanityOut').textContent = Math.round(s);
  $('dreadBar').style.width = `${(d * 100).toFixed(0)}%`; $('dreadOut').textContent = `Dread ${(d * 100).toFixed(0)}%`;
  updateAudio(d);
  refreshDetail();
  syncViewUi();
  state.tracker.update(d).forEach(omen);
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

// ---------- story mode (beats from story.js; deep link #story=1&night=N&beat=N, beat is 0-based within the night) ----------
const story = { on: false, beats: [], idx: 0, playing: false, timer: 0, ramp: 0 };
function storyBeats() {
  if (!story.beats.length && state.campaign) story.beats = buildStory(state.campaign);
  return story.beats;
}
function rampSanity(target) {
  clearTimeout(story.ramp);
  const from = state.sanity.value;
  if (reduceMotion || Math.abs(target - from) < 1) { setSanity(target, true); return; }
  let i = 0;
  const step = () => { i++; setSanity(i >= 8 ? target : from + ((target - from) * i) / 8, true); if (i < 8) story.ramp = setTimeout(step, 70); };
  step();
}
function showBeat(idx, user) {
  const beats = storyBeats(); if (!beats.length) return;
  story.idx = clampBeat(idx, beats.length);
  const b = beats[story.idx];
  const nightIdx = b.nightNumber - 1;
  if (nightIdx !== state.night) { state.night = nightIdx; renderCampaign(); }
  rampSanity(100 - b.dreadPercent);
  const start = nightStartIndex(beats, b.nightNumber);
  $('storyText').textContent = b.text;
  $('storyMeta').textContent = `Night ${b.nightNumber} of ${state.campaign.nights.length}, beat ${story.idx - start + 1} of ${beats.filter((x) => x.nightNumber === b.nightNumber).length} (${b.kind}). Sky ${b.sky}, weather ${b.weather}, dread target ${b.dreadPercent}%.`;
  $('storyPrev').disabled = story.idx === 0;
  $('storyNext').disabled = story.idx >= beats.length - 1;
  pushHash();
  if (user) clearTimeout(story.timer);
  schedulePlay();
}
function schedulePlay() {
  clearTimeout(story.timer);
  if (!story.playing) return;
  const beats = storyBeats();
  if (story.idx >= beats.length - 1) { setPlaying(false); return; }
  story.timer = setTimeout(() => showBeat(nextBeat(story.idx, beats.length)), beats[story.idx].durationMs);
}
function setPlaying(p) {
  story.playing = p;
  $('storyPlay').textContent = p ? 'Pause' : 'Play';
  $('storyPlay').setAttribute?.('aria-pressed', String(p));
  if (!p) clearTimeout(story.timer); else schedulePlay();
}
function openStory(idx, autoplay) {
  story.on = true; $('story').hidden = false;
  showBeat(idx, true);
  if (autoplay) setPlaying(true);
}
function closeStory() {
  story.on = false; setPlaying(false); clearTimeout(story.ramp); $('story').hidden = true; pushHash();
}
function toggleStory() { if (story.on) closeStory(); else openStory(nightStartIndex(storyBeats(), state.night + 1)); }
function applyStoryHash() {
  const sp = parseStoryParam(location.hash || location.search);
  const q = parseStoryParam(location.search);
  const on = sp.on || q.on;
  if (!on) { if (story.on) closeStory(); return; }
  const beats = storyBeats();
  const hasNight = /(^|[#&?])night=/.test(location.hash);
  const night = hasNight ? state.night + 1 : (sp.on ? sp.night : q.night);
  const base = nightStartIndex(beats, night);
  const n = beats.filter((x) => x.nightNumber === beats[base].nightNumber).length;
  openStory(base + Math.min(n - 1, sp.on ? sp.beat : q.beat), optParam('autoplay') === '1');
}

// ---------- intro (skippable title sequence; ?intro=0 disables, deep links skip it) ----------
const intro = { slides: [], i: 0, timer: 0, prevFocus: null };
function renderSlide() {
  const sl = intro.slides[intro.i];
  $('introTitle').textContent = sl.title; $('introText').textContent = sl.text;
  $('introStep').textContent = `${intro.i + 1} of ${intro.slides.length}.`;
  $('introNext').textContent = intro.i === intro.slides.length - 1 ? 'Begin' : 'Next';
  clearTimeout(intro.timer);
  const delay = slideDelayMs(reduceMotion);
  if (delay && intro.i < intro.slides.length - 1) intro.timer = setTimeout(introAdvance, delay);
}
function introAdvance() { const r = advanceSlide(intro.i, intro.slides.length); if (r.done) closeIntro(); else { intro.i = r.index; renderSlide(); } }
function openIntro() {
  intro.slides = buildIntroSlides(state.campaign); intro.i = 0;
  intro.prevFocus = document.activeElement || null;
  $('intro').hidden = false; renderSlide(); $('introNext').focus?.();
}
function closeIntro() { clearTimeout(intro.timer); $('intro').hidden = true; (intro.prevFocus && intro.prevFocus.focus ? intro.prevFocus : canvas).focus?.(); }
const introOpen = () => $('intro').hidden === false;
$('introNext').addEventListener('click', introAdvance);
$('introSkip').addEventListener('click', closeIntro);
// reading time: hovering or any key press stops the auto-advance for the current slide
$('intro').addEventListener('pointerenter', () => clearTimeout(intro.timer));
$('intro').addEventListener('pointerleave', () => { if (introOpen()) renderSlide(); });
$('intro').addEventListener('keydown', () => clearTimeout(intro.timer), true);
$('intro').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeIntro(); e.preventDefault(); }
  else if (e.key === 'ArrowRight' || ((e.key === 'Enter' || e.key === ' ') && e.target !== $('introSkip'))) { introAdvance(); e.preventDefault(); }
  else if (e.key === 'Tab') { const to = e.shiftKey === (e.target === $('introNext')) ? $('introSkip') : $('introNext'); to.focus?.(); e.preventDefault(); }
});

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
$('share').addEventListener('click', async () => { pushHash(); try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link copied'; } catch { $('share').textContent = 'Copy the address bar'; } setTimeout(() => ($('share').textContent = 'Copy share link'), 1800); });
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
  applyHash(); pushHash(); start(); if (introWanted) openIntro(); setTimeout(() => { state.live = true; }, 800);
})();
