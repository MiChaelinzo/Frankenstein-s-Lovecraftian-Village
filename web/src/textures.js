// Texture sources for the canvas renderer: the optional local pack (?pack=1) and the procedural pattern library.
import { proceduralTexture } from './proc-textures.js';
import { validateLayout } from './dlnk-layout.js';
import { validateManifest, hintFor, tintChannel } from './pack.js';
import { THEMES, themeColors } from './building.js';

export function createTextures({ ctx, params, tr }) {
  // ---------- optional local pack mode (?pack=1), textures come from the git-ignored web/local-pack/ ----------
  const pack = { want: params.get('pack') === '1', manifest: null, roles: {}, patterns: {}, notice: '', layout: null, layoutNotice: '' };
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
      await loadLayout();
    } catch (err) {
      pack.patterns = {}; pack.manifest = null;
      pack.notice = tr('msg.packmissing');
      console.warn(`[pack] ${err.message}`);
    }
  }
  // Optional scene_layout.json from tools/build_local_pack.py; absence is normal and keeps plain pack mode.
  async function loadLayout() {
    try {
      const res = await fetch('local-pack/scene_layout.json');
      if (!res.ok) return;
      const v = validateLayout(await res.json());
      if (v.ok) pack.layout = v.scenes;
      else console.warn(`[pack] scene layout rejected: ${v.errors.join('; ')}`);
    } catch (err) {
      console.warn(`[pack] no scene layout: ${err.message}`);
    }
  }
  // Procedural texture library (no assets): one small seamless pattern per theme from proc-textures.js, built once on a tiny offscreen canvas.
  const procPatterns = {};
  const THEME_TEXTURE = { bricks: 'brick', plaster: 'plaster', tiles: 'roof', wood: 'wood', rocks: 'stone' };
  function buildProcPattern(id) {
    const [lit, shaded] = themeColors(id);
    const tex = proceduralTexture(THEME_TEXTURE[id] || 'water', { size: 64, lit, shaded });
    const off = document.createElement('canvas'); off.width = tex.size; off.height = tex.size;
    const o = off.getContext('2d'), img = o.createImageData(tex.size, tex.size);
    if (img) { img.data.set(tex.data); o.putImageData(img, 0, 0); } // no ImageData under the headless test stubs
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
