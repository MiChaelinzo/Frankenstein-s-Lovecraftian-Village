// High-contrast accessibility theme preference. Pure helpers; the page toggles the "hc" class on <html>.
import { queryParam } from './util.js';
const LEGACY_CONTRAST_KEY = 'flv.contrast.v1'; // read once to migrate into the settings store, never written

/** Explicit ?contrast=1/0 (query or hash) wins; otherwise the stored choice; otherwise off. */
export function contrastWanted(search, hash, stored) {
  const v = queryParam(hash, 'contrast') ?? queryParam(search, 'contrast');
  if (v === '1') return true;
  if (v === '0') return false;
  return stored === '1';
}

// Round 34 (spec 165): Horror Intensity. PRESENTATION ONLY. It scales how hard the director and creature glimpses lean on the player. For the reality view only Gentle matters (it drops one tier); Standard and Dread are identical there.
// It is never read by Core ports, never part of a save, a golden or a seed: the same seed gives the same village and the same run at every level.
const LEGACY_INTENSITY_KEY = 'flv.intensity.v1'; // read once to migrate into the settings store, never written
export const INTENSITY_LEVELS = ['gentle', 'standard', 'dread'];
export const INTENSITY_PER_MILLE = { gentle: 500, standard: 1000, dread: 1500 };
export const intensityOf = (v) => (INTENSITY_LEVELS.includes(v) ? v : 'standard');
/** Explicit ?intensity= (query or hash) wins; otherwise the stored choice; otherwise standard. Unknown values mean standard. */
export function intensityWanted(search, hash, stored) { return intensityOf(queryParam(hash, 'intensity') ?? queryParam(search, 'intensity') ?? stored); }
export const nextIntensity = (v) => INTENSITY_LEVELS[(INTENSITY_LEVELS.indexOf(intensityOf(v)) + 1) % INTENSITY_LEVELS.length];

// Round 37 (FEAT-003 item 5): ONE settings store. Horror Intensity, reduced motion, graphics quality, language and high contrast persist together
// under SETTINGS_KEY and are explained in one panel (the Settings section of the Help dialog). All of them are presentation only: none is read by
// Core ports, none is part of a save, a golden or a seed. Precedence everywhere: explicit URL parameter, then the stored choice, then the default.
// The older keys (flv.intensity.v1, flv.contrast.v1, flv-quality) are read once as a migration fallback and never written again.
export const SETTINGS_KEY = 'flv.settings.v1';
const LEGACY_QUALITY_KEY = 'flv-quality';
export const SETTINGS_LANGS = ['en', 'fr'];
export const SETTINGS_QUALITY = ['auto', 'low', 'medium', 'high'];
/** 'auto' follows the operating system preference; 'on' always reduces motion. There is no 'off': the OS preference is never overridden away. */
export const SETTINGS_MOTION = ['auto', 'on'];
export const DEFAULT_SETTINGS = Object.freeze({ intensity: 'standard', motion: 'auto', quality: 'auto', lang: 'en', contrast: false });
const pick = (list, v, fallback) => (list.includes(v) ? v : fallback);

/** A complete settings object from anything: unknown or missing fields take the default, so a damaged store never breaks startup. */
export function sanitizeSettings(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return { intensity: intensityOf(o.intensity), motion: pick(SETTINGS_MOTION, o.motion, 'auto'), quality: pick(SETTINGS_QUALITY, o.quality, 'auto'), lang: pick(SETTINGS_LANGS, o.lang, 'en'), contrast: o.contrast === true };
}
const readKey = (storage, key) => { try { return storage ? storage.getItem(key) : null; } catch { return null; } };
/** The stored settings. A missing store migrates the three older keys; unparseable JSON gives the defaults. */
export function loadSettings(storage) {
  const text = readKey(storage, SETTINGS_KEY);
  if (text !== null) { try { return sanitizeSettings(JSON.parse(text)); } catch { return sanitizeSettings(null); } }
  return sanitizeSettings({ intensity: readKey(storage, LEGACY_INTENSITY_KEY), quality: readKey(storage, LEGACY_QUALITY_KEY), contrast: readKey(storage, LEGACY_CONTRAST_KEY) === '1' });
}
export function saveSettings(storage, settings) { try { storage?.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(settings))); return !!storage; } catch { return false; } }
/** Changes some settings and keeps the rest. Returns the settings now in force (saved when the storage allows). */
export function updateSettings(storage, patch) { const next = sanitizeSettings({ ...loadSettings(storage), ...patch }); saveSettings(storage, next); return next; }

/**
 * What is in force for this visit. query and hash are location.search and location.hash (hash wins, as for intensity), prefersReduced is the OS media query.
 * ?reduced=1 and ?capture=1 reduce motion for this visit only; ?lang=, ?quality=, ?intensity= and ?contrast= override the stored value for this visit only.
 */
export function resolveSettings(search, hash, stored, prefersReduced) {
  const base = sanitizeSettings(stored);
  const param = (name) => queryParam(hash, name) ?? queryParam(search, name);
  const lang = (param('lang') || '').toLowerCase().slice(0, 2);
  return {
    intensity: intensityWanted(search, hash, base.intensity),
    quality: pick(SETTINGS_QUALITY, (param('quality') || '').toLowerCase(), base.quality),
    lang: pick(SETTINGS_LANGS, lang, base.lang),
    contrast: contrastWanted(search, hash, base.contrast ? '1' : '0'),
    motion: base.motion,
    reduced: !!prefersReduced || base.motion === 'on' || param('reduced') === '1' || param('capture') === '1',
  };
}
