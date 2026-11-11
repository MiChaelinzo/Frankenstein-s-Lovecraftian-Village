// Texture sources for the canvas renderer: the optional local pack (?pack=1) and the procedural pattern library.
import { SeededRandom } from './core.js';
import { validateManifest, hintFor, tintChannel } from './pack.js';
import { THEMES, themeColors } from './building.js';

export function createTextures({ ctx, params }) {
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

  return { pack, loadPack, ensureProcPatterns, resolvePattern, surf, hintLabel, paintSurface };
}
