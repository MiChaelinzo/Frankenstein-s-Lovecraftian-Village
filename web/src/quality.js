// Graphics quality tiers for the web demo (presentation only, so web-only: Core has no rendering). Pure and tested without a DOM;
// app.js reads localStorage, the ?quality= override and the GPU hints, and passes the resolved tier to the 3D and 2D views.

export const QUALITY_KEY = 'flv-quality';
export const QUALITY_CHOICES = Object.freeze(['auto', 'low', 'medium', 'high']);

/**
 * What each tier enables. Every field is read by view3d.js or the 2D renderer; nothing here is aspirational.
 * maxPixels: backing store ceiling. minScale: lowest dynamic resolution scale. post: the fullscreen post pass (tone map, grade, bloom, grain).
 * bloom: post bloom gain. fxaa: edge smoothing in the post pass. detail: shader detail level (0 flat, 1 bump, wet sheen, foam and blob
 * shadows, 2 adds a third wave train, an extra cloud octave and moon glints on wet stone). particles, fireflies, birds: count multipliers.
 * fogDense: distance fog multiplier (denser also culls sooner, saving frames). groundDense: low mist multiplier. godRays: moon shaft strength (High only).
 * fogSheets: drifting noise in the ground mist. sky2d: layered dusk sky and window glow on the 2D canvas.
 */
export const QUALITY_TIERS = Object.freeze({
  low: Object.freeze({ maxPixels: 960 * 540, minScale: 0.5, post: false, bloom: 0, fxaa: false, detail: 0, particles: 0.5, fireflies: 0.5, birds: 0.5, fogSheets: false, sky2d: false, fogDense: 1.3, groundDense: 1, godRays: 0 }),
  medium: Object.freeze({ maxPixels: 1280 * 720, minScale: 0.5, post: true, bloom: 0.45, fxaa: false, detail: 1, particles: 1, fireflies: 1, birds: 1, fogSheets: true, sky2d: true, fogDense: 1.2, groundDense: 1.35, godRays: 0 }),
  high: Object.freeze({ maxPixels: 1920 * 1080, minScale: 0.5, post: true, bloom: 0.55, fxaa: true, detail: 2, particles: 1, fireflies: 1, birds: 1, fogSheets: true, sky2d: true, fogDense: 1.12, groundDense: 1.6, godRays: 1 }),
});

/** A tier or choice name from free text (URL, storage, select), lower-cased; null when it is not one of QUALITY_CHOICES. */
export function parseQuality(text) {
  const t = typeof text === 'string' ? text.trim().toLowerCase() : '';
  return QUALITY_CHOICES.includes(t) ? t : null;
}

const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i;
const DISCRETE_GPU = /nvidia|geforce|quadro|\brtx\b|radeon (rx|pro)|\bapple m[1-9]/i;

/**
 * The Auto tier from browser hints. Software rendering, Data Saver or two cores or fewer: low. A discrete GPU (or Apple silicon) with at
 * least eight cores and a screen ratio under 3: high. Everything else, including the integrated Intel and AMD graphics of most laptops at
 * 1080p: medium. renderer is the unmasked string from WEBGL_debug_renderer_info, or '' when the browser hides it.
 */
export function autoTier({ renderer = '', dpr = 1, cores = 4, saveData = false } = {}) {
  const r = typeof renderer === 'string' ? renderer : '', c = Number.isFinite(cores) && cores > 0 ? cores : 4;
  if (saveData || SOFTWARE_GL.test(r) || c <= 2) return 'low';
  if (DISCRETE_GPU.test(r) && c >= 8 && (Number.isFinite(dpr) ? dpr : 1) < 3) return 'high';
  return 'medium';
}

/**
 * The active tier. query (?quality=) wins over stored (localStorage), which wins over auto; anything unparseable counts as auto.
 * Returns { choice: what the user asked for, tier: low | medium | high, source: 'url' | 'saved' | 'default' }.
 */
export function resolveQuality({ query = null, stored = null, hints = {} } = {}) {
  const q = parseQuality(query), s = parseQuality(stored), choice = q || s || 'auto';
  return { choice, tier: choice === 'auto' ? autoTier(hints) : choice, source: q ? 'url' : s ? 'saved' : 'default' };
}

/** The tier's settings; an unknown name gets medium. */
export const tierSettings = (tier) => QUALITY_TIERS[tier] || QUALITY_TIERS.medium;

/** Feature ids a tier turns on, in display order; the settings panel shows them through the i18n keys quality.f.<id>. lines is the vertical resolution ceiling. */
export function tierFeatures(tier) {
  const t = tierSettings(tier), out = [];
  if (t.post) out.push('grade', 'bloom');
  if (t.fxaa) out.push('fxaa');
  if (t.detail >= 1) out.push('bump', 'shadows', 'foam');
  if (t.detail >= 2) out.push('waves');
  if (t.fogSheets) out.push('fog');
  if (t.particles < 1) out.push('halfparticles');
  return out;
}
/** Vertical lines of the tier's pixel ceiling at 16:9 (540, 720, 1080). */
export const tierLines = (tier) => Math.round(Math.sqrt(tierSettings(tier).maxPixels * 9 / 16));
