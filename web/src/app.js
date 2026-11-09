import {
  PrefabCatalog, generateLayout, SanityModel, SeededRandom,
  StaticNarrationProvider, SafeNarrationProvider, HttpNarrationProvider, encodeHash, decodeHash,
} from './core.js';

const GRID_W = 24, GRID_D = 24, PIECES = 40;
const TW = 34, TH = 17; // iso tile size
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${lerp(c1[0], c2[0], t) | 0},${lerp(c1[1], c2[1], t) | 0},${lerp(c1[2], c2[2], t) | 0})`;

const state = { seed: 1818, sanity: new SanityModel(100), layout: [], catalog: null, narrationLine: '', narrationAt: 0, flash: 0, drain: false };

// ?narrator=https://... plugs in an AI endpoint; Safe wrapper falls back to offline text on any failure.
const narratorUrl = new URLSearchParams(location.search).get('narrator');
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
    p.vis = { h: r.next(100) / 100, tilt: r.next(100) / 100, lit: r.next(100) / 100, phase: r.next(1000) };
  });
  const area = state.layout.reduce((a, p) => a + p.sizeX * p.sizeZ, 0);
  $('stats').textContent = `Seed ${state.seed}: ${state.layout.length} pieces stitched onto a ${GRID_W}x${GRID_D} grid (${area} of ${GRID_W * GRID_D} cells used). Same seed, same village, in Unity and here.`;
  say(null);
}

// ---------- narration ----------
function say(locationId) {
  const line = narrator.narrate(locationId, state.sanity.dread);
  state.narrationLine = line;
  state.narrationAt = performance.now();
  $('narration').textContent = line;
  $('narration').style.opacity = 1;
}

// ---------- drawing ----------
const origin = () => ({ x: canvas.width / 2, y: 70 });
function iso(x, z) { const o = origin(); return { x: o.x + (x - z) * TW / 2, y: o.y + (x + z) * TH / 2 }; }

function poly(points, fill, stroke) {
  ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function box(cx, cy, sx, sz, h, top, left, right) {
  // base footprint corners in screen space, cx/cy is the (x,z) corner tile origin in grid units
  const a = iso(cx, cy), b = iso(cx + sx, cy), c = iso(cx + sx, cy + sz), d = iso(cx, cy + sz);
  const up = (p) => ({ x: p.x, y: p.y - h });
  poly([d, c, up(c), up(d)], left); // left-facing wall (z+ edge)
  poly([b, c, up(c), up(b)], right);
  poly([up(a), up(b), up(c), up(d)], top);
  return { a, b, c, d, up };
}

function drawPiece(p, t, dread, time) {
  const v = p.vis;
  const flick = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(time / (140 + v.phase % 90) + v.phase) * (0.6 + dread);
  const wall = mix([66, 74, 78], [70, 30, 36], dread);
  const wallR = mix([46, 54, 60], [48, 18, 24], dread);
  const roof = mix([52, 40, 44], [34, 12, 18], dread);
  const warm = `rgba(255,${190 - 110 * dread | 0},${110 - 70 * dread | 0},${(0.9 * flick).toFixed(2)})`;
  const cx = p.x + 0.12, cz = p.z + 0.12;
  const sx = p.sizeX - 0.24, sz = p.sizeZ - 0.24;
  switch (p.id) {
    case 'house_a': case 'house_b': {
      const h = 22 + v.h * 14 + (p.id === 'house_b' ? 8 : 0);
      const bx = box(cx, cz, sx, sz, h, roof, wall, wallR);
      const peak = { x: (bx.up(bx.a).x + bx.up(bx.c).x) / 2, y: bx.up(bx.a).y - 14 - v.tilt * 6 };
      poly([bx.up(bx.d), bx.up(bx.c), peak], roof); poly([bx.up(bx.b), bx.up(bx.c), peak], mix([40, 32, 36], [26, 8, 12], dread));
      if (v.lit > 0.35 - 0.3 * dread) { ctx.fillStyle = warm; const w = lerpPt(bx.d, bx.c, 0.35); ctx.fillRect(w.x - 3, w.y - h * 0.65, 6, 8); }
      if (dread > 0.6 && v.lit > 0.5) { ctx.fillStyle = `rgba(255,40,40,${((dread - 0.6) * 2).toFixed(2)})`; const w = lerpPt(bx.d, bx.c, 0.7); ctx.fillRect(w.x - 2, w.y - h * 0.6, 2, 2); ctx.fillRect(w.x + 2, w.y - h * 0.6, 2, 2); }
      break;
    }
    case 'church': {
      box(cx, cz, sx, sz, 40, roof, wall, wallR);
      const tower = box(p.x + 0.2, p.z + 0.2, 0.8, 0.8, 78, roof, wall, wallR);
      poly([tower.up(tower.d), tower.up(tower.c), { x: tower.up(tower.d).x / 2 + tower.up(tower.c).x / 2, y: tower.up(tower.a).y - 34 }], roof);
      poly([tower.up(tower.b), tower.up(tower.c), { x: tower.up(tower.d).x / 2 + tower.up(tower.c).x / 2, y: tower.up(tower.a).y - 34 }], mix([40, 32, 36], [26, 8, 12], dread));
      ctx.fillStyle = warm; const w = lerpPt(tower.d, tower.c, 0.5); ctx.fillRect(w.x - 2, w.y - 55, 5, 12);
      break;
    }
    case 'well': {
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 9, mix([30, 40, 44], [20, 5, 8], dread), mix([84, 90, 92], [92, 40, 44], dread), mix([60, 66, 70], [60, 22, 28], dread));
      ctx.fillStyle = dread > 0.5 ? `rgba(170,20,30,${(0.5 + 0.4 * flick).toFixed(2)})` : 'rgba(10,20,26,.9)';
      const c = lerpPt(bx.up(bx.a), bx.up(bx.c), 0.5); ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 3.4, 0, 0, 7); ctx.fill();
      break;
    }
    case 'dead_tree': {
      const base = iso(p.x + 0.5, p.z + 0.5);
      const sway = reduceMotion ? 0 : Math.sin(time / 900 + v.phase) * 2;
      ctx.strokeStyle = mix([40, 32, 28], [30, 14, 14], dread); ctx.lineCap = 'round';
      const branch = (x, y, len, ang, w, d) => {
        ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y);
        const nx = x + Math.cos(ang) * len + (d > 1 ? sway * 0.4 : 0), ny = y + Math.sin(ang) * len; ctx.lineTo(nx, ny); ctx.stroke();
        if (d > 0) { branch(nx, ny, len * 0.7, ang - 0.5 - v.tilt * 0.3, w * 0.7, d - 1); branch(nx, ny, len * 0.7, ang + 0.5 + v.h * 0.3, w * 0.7, d - 1); }
      };
      branch(base.x, base.y, 16 + v.h * 8, -Math.PI / 2, 4, 3);
      break;
    }
    case 'altar': {
      const bx = box(cx + 0.1, cz + 0.1, sx - 0.2, sz - 0.2, 8, mix([70, 72, 80], [90, 20, 30], dread), mix([40, 42, 50], [50, 12, 18], dread), mix([30, 32, 40], [36, 8, 14], dread));
      const c = lerpPt(bx.up(bx.a), bx.up(bx.c), 0.5);
      const glow = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, 34 + 30 * dread);
      glow.addColorStop(0, `rgba(160,255,200,${(0.5 + 0.3 * flick).toFixed(2)})`); glow.addColorStop(1, 'rgba(160,255,200,0)');
      ctx.fillStyle = glow; ctx.fillRect(c.x - 70, c.y - 70, 140, 140);
      break;
    }
    default: box(cx, cz, sx, sz, 12, roof, wall, wallR);
  }
}
const lerpPt = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

const stars = Array.from({ length: 90 }, (_, i) => { const r = new SeededRandom(i + 99); return { x: r.next(960), y: r.next(260), s: 0.5 + r.next(100) / 100, ph: r.next(628) }; });
const fog = Array.from({ length: 7 }, (_, i) => ({ y: 120 + i * 62, speed: 6 + i * 2.2, off: i * 170 }));

function drawSky(dread, time) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, mix([14, 22, 34], [34, 6, 12], dread)); g.addColorStop(1, mix([8, 14, 18], [14, 3, 6], dread));
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  stars.forEach((s) => { ctx.fillStyle = `rgba(220,230,255,${((1 - dread * 0.7) * (0.35 + 0.35 * Math.sin(time / 700 + s.ph))).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.s, s.s); });
  // moon swells and reddens with dread
  const mx = 780, my = 90 + dread * 20, mr = 30 + 22 * dread;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
  halo.addColorStop(0, `rgba(${200 + 40 * dread | 0},${220 - 150 * dread | 0},${230 - 180 * dread | 0},.35)`); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  ctx.fillStyle = mix([225, 232, 240], [190, 40, 44], dread); ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
}

function drawGround(dread) {
  const corners = [iso(0, 0), iso(GRID_W, 0), iso(GRID_W, GRID_D), iso(0, GRID_D)];
  poly(corners, mix([22, 34, 30], [40, 12, 16], dread), mix([50, 70, 62], [90, 24, 30], dread));
  ctx.strokeStyle = `rgba(0,0,0,.18)`; ctx.lineWidth = 1;
  for (let i = 1; i < GRID_W; i++) { const a = iso(i, 0), b = iso(i, GRID_D); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let i = 1; i < GRID_D; i++) { const a = iso(0, i), b = iso(GRID_W, i); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
}

function drawFog(dread, time) {
  const density = 0.06 + 0.3 * dread;
  fog.forEach((f, i) => {
    const x = ((time / 1000 * f.speed + f.off) % (canvas.width + 600)) - 300;
    const g = ctx.createRadialGradient(x, f.y, 10, x, f.y, 300);
    g.addColorStop(0, `rgba(${150 - 60 * dread | 0},${170 - 120 * dread | 0},${170 - 120 * dread | 0},${(density * (i % 2 ? 0.8 : 1)).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 300, f.y - 120, 600, 240);
  });
}

function drawVignette(dread, time) {
  const flicker = reduceMotion ? 0 : (Math.sin(time / 90) * Math.sin(time / 37)) * 0.05 * dread;
  const inner = canvas.height * (0.62 - 0.34 * dread);
  const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, inner, canvas.width / 2, canvas.height / 2, canvas.width * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, 0.45 + 0.5 * dread + flicker).toFixed(2)})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (dread > 0.75) { ctx.fillStyle = `rgba(120,0,10,${((dread - 0.75) * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}

function frame(time) {
  const dread = state.sanity.dread;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSky(dread, time);
  ctx.save();
  if (!reduceMotion && dread > 0.5) ctx.translate((Math.random() - 0.5) * (dread - 0.5) * 3, (Math.random() - 0.5) * (dread - 0.5) * 3);
  drawGround(dread);
  [...state.layout].sort((a, b) => (a.x + a.sizeX + a.z + a.sizeZ) - (b.x + b.sizeX + b.z + b.sizeZ)).forEach((p) => drawPiece(p, 0, dread, time));
  drawFog(dread, time);
  ctx.restore();
  if (state.flash > 0) { ctx.fillStyle = `rgba(210,230,255,${state.flash.toFixed(2)})`; ctx.fillRect(0, 0, canvas.width, canvas.height); state.flash = Math.max(0, state.flash - 0.04); }
  else if (!reduceMotion && dread > 0.4 && Math.random() < 0.0015 * dread) state.flash = 0.5;
  drawVignette(dread, time);
  if (time - state.narrationAt > 7000) $('narration').style.opacity = 0.35;
  requestAnimationFrame(frame);
}

// ---------- controls ----------
function syncUi() {
  const s = state.sanity.value, d = state.sanity.dread;
  $('sanity').value = s; $('sanityOut').textContent = Math.round(s);
  $('dreadBar').style.width = `${(d * 100).toFixed(0)}%`; $('dreadOut').textContent = `Dread ${(d * 100).toFixed(0)}%`;
  updateAudio(d);
}
function pushHash() { history.replaceState(null, '', encodeHash({ seed: state.seed, sanity: state.sanity.value })); }
function setSanity(v, quiet) { state.sanity = new SanityModel(v); syncUi(); pushHash(); if (!quiet) say(null); }
function adjust(delta, location) { state.sanity.apply(delta); if (delta < 0) state.flash = 0.25; syncUi(); pushHash(); say(location); }
function applyHash() {
  const h = decodeHash(location.hash);
  state.seed = h.seed; $('seed').value = h.seed; state.sanity = new SanityModel(h.sanity);
  if (state.catalog) rebuild(); syncUi();
}

canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * canvas.width / r.width, my = (e.clientY - r.top) * canvas.height / r.height;
  let best = null, bd = 1e9;
  state.layout.forEach((p) => { const c = iso(p.x + p.sizeX / 2, p.z + p.sizeZ / 2); const d = Math.hypot(c.x - mx, c.y - 12 - my); if (d < bd) { bd = d; best = p; } });
  if (best && bd < 60) { $('hint').style.display = 'none'; adjust(-2, best.id); }
});
$('seed').addEventListener('change', () => { const v = Number.parseInt($('seed').value, 10); state.seed = Number.isFinite(v) ? v | 0 : 1818; $('seed').value = state.seed; rebuild(); pushHash(); });
$('reroll').addEventListener('click', () => { state.seed = (Math.random() * 2147483647) | 0; $('seed').value = state.seed; rebuild(); pushHash(); });
$('share').addEventListener('click', async () => { pushHash(); try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Link copied'; } catch { $('share').textContent = 'Copy the address bar'; } setTimeout(() => ($('share').textContent = 'Copy share link'), 1800); });
$('sanity').addEventListener('input', () => setSanity(Number($('sanity').value)));
$('whisper').addEventListener('click', () => adjust(-8, 'the walls'));
$('church').addEventListener('click', () => { state.flash = 0.6; adjust(-15, 'church'); });
$('candle').addEventListener('click', () => adjust(10, 'the village'));
$('drain').addEventListener('change', (e) => { state.drain = e.target.checked; });
$('sound').addEventListener('change', (e) => { if (e.target.checked) { startAudio(); syncUi(); } else stopAudio(); });
addEventListener('hashchange', applyHash);
setInterval(() => { if (state.drain && state.sanity.value > 0) { state.sanity.apply(-0.5); syncUi(); } }, 500);
setInterval(() => { if (state.drain) say(null); }, 9000);

(async function init() {
  try { await loadCatalog(); } catch (err) { $('stats').textContent = `Could not load the catalog (${err.message}). Serve this folder over HTTP, for example: python3 -m http.server -d web`; return; }
  applyHash(); pushHash(); requestAnimationFrame(frame);
})();
