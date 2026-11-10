import {
  PrefabCatalog, generateLayout, SanityModel, SeededRandom, DreadEventTracker, DREAD_THRESHOLDS, tierFor,
  buildVillageReport, reportToMarkdown, reportToJson, generateCampaign,
  StaticNarrationProvider, SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
} from './core.js';
import {
  computeView, buildWalkers, walkerPos, cultistCount, windowState, omenText, addEntry, entryLabel,
  reportFilename, wrapIndex, describeScene, skyTint, weatherFor, postcardFilename, postcardCaption, nightFromHash,
} from './scene.js';
import { validateManifest, pickRole, hintFor, badgeText, tintChannel } from './pack.js';

const GRID_W = 24, GRID_D = 24, PIECES = 80;
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('reduced') === '1';
if (reduceMotion) document.documentElement?.classList?.add('reduced');

const V = computeView(canvas.width, canvas.height, GRID_W, GRID_D);
const TW = V.tw, TH = V.th;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${lerp(c1[0], c2[0], t) | 0},${lerp(c1[1], c2[1], t) | 0},${lerp(c1[2], c2[2], t) | 0})`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const prettyId = (id) => id.replace(/_/g, ' ');

const state = {
  seed: 1818, sanity: new SanityModel(100), layout: [], landmarks: [], walkers: [], drawOrder: [], catalog: null,
  narrationLine: '', narrationAt: 0, flash: 0, drain: false,
  campaign: null, night: 0, tracker: new DreadEventTracker(), live: false, snap: true, journal: [], toast: null, focus: -1, eye: 0, tentacle: 0,
};

// ?narrator=https://... plugs in an AI endpoint; Safe wrapper falls back to offline text on any failure.
const narratorUrl = params.get('narrator');
const narrator = new SafeNarrationProvider(narratorUrl ? new HttpNarrationProvider(narratorUrl) : null, new StaticNarrationProvider());

// ---------- audio (optional, starts only after the user opts in) ----------
let audio = null;
function startAudio() {
  if (audio) { audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
  const oscs = [55, 55.7, 82.4].map((f, i) => {
    const o = ac.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.value = i === 2 ? 0.25 : 0.4;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    o.connect(lp); lp.connect(g); g.connect(master); o.start(); return { o, lp };
  });
  const lfo = ac.createOscillator(); lfo.frequency.value = 0.15;
  const lg = ac.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(master.gain); lfo.start();
  audio = { ctx: ac, master, oscs };
}
function updateAudio(dread) {
  if (!audio || audio.ctx.state !== 'running') return;
  const t = audio.ctx.currentTime;
  audio.master.gain.setTargetAtTime(0.04 + 0.2 * dread, t, 0.3);
  audio.oscs.forEach(({ o, lp }, i) => {
    lp.frequency.setTargetAtTime(160 + 500 * dread, t, 0.3);
    o.frequency.setTargetAtTime([55, 55.7, 82.4][i] * (1 - 0.12 * dread * (i === 1 ? -1 : 1)), t, 0.5);
  });
}
function stopAudio() { if (audio) audio.ctx.suspend(); }

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
  });
  state.drawOrder = [...state.layout].sort((a, b) => a.depth - b.depth);
  state.landmarks = state.layout.filter((p) => p.id === 'church' || p.id === 'altar' || p.id === 'well');
  state.walkers = buildWalkers(state.layout, GRID_W, GRID_D, state.seed);
  state.focus = -1;
  state.campaign = generateCampaign(state.seed);
  state.night = Math.min(state.night, state.campaign.nights.length - 1);
  renderCampaign();
  $('listen').innerHTML = '<option value="">Choose a landmark</option>' +
    state.landmarks.map((p, i) => `<option value="${i}">${esc(prettyId(p.id))}${hintLabel(p.id) ? ` [${esc(hintLabel(p.id))}]` : ''} at (${p.x}, ${p.z})</option>`).join('');
  const area = state.layout.reduce((a, p) => a + p.sizeX * p.sizeZ, 0);
  $('stats').textContent = `Seed ${state.seed}: ${state.layout.length} pieces stitched onto a ${GRID_W}x${GRID_D} grid (${area} of ${GRID_W * GRID_D} cells used). Same generator as the Unity project, so the same seed and settings (set pieceCount to ${PIECES} there) give the same layout.`;
  updateDesc();
  say(null);
}

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
  log('narration', line);
}
function omen(e) {
  const text = omenText(e);
  state.toast = { text, at: performance.now(), rising: e.rising };
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
function iso(x, z) { return { x: V.ox + (x - z) * TW / 2, y: V.oy + (x + z) * TH / 2 }; }
const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const rise = (p, h) => ({ x: p.x, y: p.y - h });

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
const surf = (role, color, shade = 0) => (role && pack.patterns[role] ? { role, color, shade } : color);
const hintLabel = (id) => (pack.manifest ? hintFor(pack.manifest, id) : '');
function paintSurface(s) {
  ctx.fillStyle = pack.patterns[s.role]; ctx.fill();
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
  const up = (p) => ({ x: p.x, y: p.y - h });
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
    const m1 = rise(lerpPt(ud, ua, 0.5), rh), m2 = rise(lerpPt(uc, ub, 0.5), rh);
    poly([ua, ub, m2, m1], back); poly([ub, uc, m2], gable); poly([ud, uc, m2, m1], front);
    return { m1, m2 };
  }
  const m1 = rise(lerpPt(ua, ub, 0.5), rh), m2 = rise(lerpPt(ud, uc, 0.5), rh);
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

function drawPiece(p, dread, time) {
  const v = p.vis;
  const flick = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(time / (140 + v.phase % 90) + v.phase) * (0.6 + dread);
  const wall = mix([66, 74, 78], [70, 30, 36], dread);
  const wallR = mix([46, 54, 60], [48, 18, 24], dread);
  const roofF = mix([58, 44, 48], [44, 12, 20], dread);
  const roofB = mix([40, 32, 36], [28, 8, 14], dread);
  const m = 0.05;
  const roles = pack.roles;
  const wallRole = p.id === 'house_b' ? pickRole(roles, v.h < 0.5 ? 'wall_brick' : 'wall_plaster', 'wall_wood') : pickRole(roles, v.h < 0.5 ? 'wall_wood' : 'wall_plaster', 'wall_wood');
  const stoneRole = pickRole(roles, 'wall_stone', 'wall_brick');
  const roofRole = pickRole(roles, 'roof', 'wall_wood');
  const cx = p.x + m, cz = p.z + m, sx = p.sizeX - 2 * m, sz = p.sizeZ - 2 * m;
  switch (p.id) {
    case 'house_a': case 'house_b': {
      const h = 13 + v.h * 6 + (p.id === 'house_b' ? 5 : 0);
      const bx = box(cx, cz, sx, sz, h, null, surf(wallRole, wall, 0.05), surf(wallRole, wallR, 0.35));
      const roof = gableRoof(bx, 10 + v.tilt * 4, v.tilt < 0.5, surf(roofRole, roofF, 0.1), surf(roofRole, roofB, 0.4), surf(wallRole, wallR, 0.35));
      if (p.id === 'house_b') { ctx.fillStyle = roofB; ctx.fillRect(roof.m1.x + (roof.m2.x - roof.m1.x) * 0.3 - 2, roof.m1.y - 7, 4, 9); }
      windowAt(lerpPt(bx.d, bx.c, 0.5), 5, 6, windowState(v.lit, dread), dread, flick);
      windowAt(lerpPt(rise(bx.b, 0), rise(bx.c, 0), 0.5), 5, 6, windowState(v.lit2, dread), dread, flick);
      ctx.fillStyle = 'rgba(8,8,10,.8)'; const door = lerpPt(bx.d, bx.c, 0.2); ctx.fillRect(door.x - 2, door.y - 7, 4, 7);
      break;
    }
    case 'church': {
      const sw = surf(stoneRole, wall, 0.05), swR = surf(stoneRole, wallR, 0.35), sRoofF = surf(roofRole, roofF, 0.1), sRoofB = surf(roofRole, roofB, 0.4);
      const tower = box(p.x + 0.12, p.z + 0.12, 0.8, 0.8, 58, sRoofF, sw, swR);
      const apex = rise(lerpPt(tower.up(tower.a), tower.up(tower.c), 0.5), 30);
      poly([tower.up(tower.d), tower.up(tower.c), apex], sRoofF); poly([tower.up(tower.b), tower.up(tower.c), apex], sRoofB);
      windowAt(lerpPt(rise(tower.d, 42), rise(tower.c, 42), 0.5), 4, 9, dread > 0.85 ? 'red' : 'warm', dread, flick);
      const bx = box(cx, cz, sx, sz, 26, null, sw, swR);
      gableRoof(bx, 14, true, sRoofF, sRoofB, swR);
      windowAt(lerpPt(rise(bx.d, 6), rise(bx.c, 6), 0.3), 5, 11, dread > 0.7 ? 'red' : 'warm', dread, flick);
      windowAt(lerpPt(rise(bx.d, 6), rise(bx.c, 6), 0.7), 5, 11, dread > 0.7 ? 'red' : 'warm', dread, flick);
      break;
    }
    case 'well': {
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 9, mix([30, 40, 44], [20, 5, 8], dread), surf(stoneRole, mix([84, 90, 92], [92, 40, 44], dread), 0.05), surf(stoneRole, mix([60, 66, 70], [60, 22, 28], dread), 0.35));
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
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 10, mix([70, 72, 80], [90, 20, 30], dread), surf(stoneRole, mix([40, 42, 50], [50, 12, 18], dread), 0.1), surf(stoneRole, mix([30, 32, 40], [36, 8, 14], dread), 0.35));
      const c = lerpPt(bx.up(bx.a), bx.up(bx.c), 0.5);
      glow(c.x, c.y, 26 + 26 * dread, '160,255,200', 0.3 + 0.2 * flick);
      break;
    }
    default: box(cx, cz, sx, sz, 12, roofF, surf(wallRole, wall, 0.05), surf(wallRole, wallR, 0.35));
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
function frame(now) {
  if (document.hidden) { running = false; return; }
  const time = reduceMotion ? 0 : now;
  const dread = state.sanity.dread, tier = tierFor(dread);
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
    drawPiece(p, dread, time);
  }
  while (ai < active.length) drawCultist(active[ai++], dread, time);
  drawFocus(time);
  drawTentacles(dread, time);
  drawFog(dread, time);
  ctx.restore();
  if (state.flash > 0) { ctx.fillStyle = `rgba(210,230,255,${state.flash.toFixed(2)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); state.flash = Math.max(0, state.flash - 0.04); }
  else if (!reduceMotion && dread > 0.4 && Math.random() < 0.0015 * dread) state.flash = 0.5;
  drawWeather(dread, time);
  drawVignette(dread, time);
  drawToast(performance.now());
  drawPackBadge();
  if (performance.now() - state.narrationAt > 7000) $('narration').style.opacity = 0.35;
  requestAnimationFrame(frame);
}
function start() { if (running) return; running = true; requestAnimationFrame(frame); }

// ---------- controls ----------
function syncUi() {
  const s = state.sanity.value, d = state.sanity.dread;
  $('sanity').value = s; $('sanityOut').textContent = Math.round(s);
  $('dreadBar').style.width = `${(d * 100).toFixed(0)}%`; $('dreadOut').textContent = `Dread ${(d * 100).toFixed(0)}%`;
  updateAudio(d);
  state.tracker.update(d).forEach(omen);
  updateDesc();
}
function pushHash() { history.replaceState(null, '', `${encodeHash({ seed: state.seed, sanity: state.sanity.value })}&night=${state.night + 1}`); }
function setSanity(v, quiet) { state.sanity = new SanityModel(v); syncUi(); pushHash(); if (!quiet) say(null); }
function adjust(delta, location) { state.sanity.apply(delta); if (delta < 0 && !reduceMotion) state.flash = 0.25; syncUi(); pushHash(); say(location); }
function applyHash() {
  const h = decodeHash(location.hash);
  state.seed = h.seed; $('seed').value = h.seed; state.sanity = new SanityModel(h.sanity);
  state.night = nightFromHash(location.hash, 9);
  if (state.catalog) rebuild();
  // a shared night link without an explicit sanity starts at that night's sanity
  if (state.catalog && /night=/.test(location.hash) && !/sanity=/.test(location.hash)) state.sanity = new SanityModel(currentNight().sanityStart);
  syncUi();
}
function reroll() { state.seed = (Math.random() * 2147483647) | 0; $('seed').value = state.seed; rebuild(); selectNight(state.night, true); pushHash(); }
function setFocus(i) { state.focus = i; $('listen').value = i >= 0 ? String(i) : ''; updateDesc(); }
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
function setSound(on) { $('sound').checked = on; if (on) { startAudio(); syncUi(); } else stopAudio(); }

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
  let best = null, bd = 1e9;
  state.layout.forEach((p) => { const c = iso(p.x + p.sizeX / 2, p.z + p.sizeZ / 2); const d = Math.hypot(c.x - mx, c.y - 12 - my); if (d < bd) { bd = d; best = p; } });
  if (best && bd < 60) { $('hint').style.display = 'none'; const li = state.landmarks.indexOf(best); if (li >= 0) setFocus(li); adjust(-2, best.id); }
});
canvas.addEventListener('keydown', (e) => {
  const n = state.landmarks.length;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { setFocus(wrapIndex(state.focus, n, 1)); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { setFocus(wrapIndex(state.focus < 0 ? 0 : state.focus, n, -1)); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { if (state.focus >= 0) listen(state.focus); e.preventDefault(); }
  else if (e.key === 'Escape') setFocus(-1);
});
$('listen').addEventListener('change', () => { const v = $('listen').value; if (v === '') setFocus(-1); else listen(Number(v)); });
$('seed').addEventListener('change', () => { const v = Number.parseInt($('seed').value, 10); state.seed = Number.isFinite(v) ? v | 0 : 1818; $('seed').value = state.seed; rebuild(); selectNight(state.night, true); pushHash(); });
$('reroll').addEventListener('click', reroll);
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
$('dlMd').addEventListener('click', () => download(reportFilename(state.seed, 'md'), reportToMarkdown(report()), 'text/markdown'));
$('dlJson').addEventListener('click', () => download(reportFilename(state.seed, 'json'), reportToJson(report()), 'application/json'));

addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  switch (e.key) {
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
    case '?': $('keys').open = !$('keys').open; break;
    default:
  }
});
addEventListener('hashchange', applyHash);
document.addEventListener?.('visibilitychange', () => { if (!document.hidden) start(); });
setInterval(() => { if (state.drain && state.sanity.value > 0) { state.sanity.apply(-0.5); syncUi(); } }, 500);
setInterval(() => { if (state.drain) say(null); }, 9000);

(async function init() {
  try { await loadCatalog(); } catch (err) { $('stats').textContent = `Could not load the catalog (${err.message}). Serve this folder over HTTP, for example: python3 -m http.server -d web`; return; }
  if (pack.want) await loadPack();
  applyHash(); pushHash(); start(); setTimeout(() => { state.live = true; }, 800);
})();
