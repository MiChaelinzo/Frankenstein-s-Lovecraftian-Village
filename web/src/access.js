// High-contrast accessibility theme preference. Pure helpers; the page toggles the "hc" class on <html>.
import { queryParam } from './util.js';
export const CONTRAST_KEY = 'flv.contrast.v1';

/** Explicit ?contrast=1/0 (query or hash) wins; otherwise the stored choice; otherwise off. */
export function contrastWanted(search, hash, stored) {
  const v = queryParam(hash, 'contrast') ?? queryParam(search, 'contrast');
  if (v === '1') return true;
  if (v === '0') return false;
  return stored === '1';
}
export function loadContrast(storage) { try { return storage ? storage.getItem(CONTRAST_KEY) : null; } catch { return null; } }
export function saveContrast(storage, on) { try { storage?.setItem(CONTRAST_KEY, on ? '1' : '0'); return !!storage; } catch { return false; } }

// Round 34 (spec 165): Horror Intensity. PRESENTATION ONLY. It scales how hard the director and creature glimpses lean on the player. For the reality view only Gentle matters (it drops one tier); Standard and Dread are identical there.
// It is never read by Core ports, never part of a save, a golden or a seed: the same seed gives the same village and the same run at every level.
export const INTENSITY_KEY = 'flv.intensity.v1';
export const INTENSITY_LEVELS = ['gentle', 'standard', 'dread'];
export const INTENSITY_PER_MILLE = { gentle: 500, standard: 1000, dread: 1500 };
export const intensityOf = (v) => (INTENSITY_LEVELS.includes(v) ? v : 'standard');
/** Explicit ?intensity= (query or hash) wins; otherwise the stored choice; otherwise standard. Unknown values mean standard. */
export function intensityWanted(search, hash, stored) { return intensityOf(queryParam(hash, 'intensity') ?? queryParam(search, 'intensity') ?? stored); }
export const nextIntensity = (v) => INTENSITY_LEVELS[(INTENSITY_LEVELS.indexOf(intensityOf(v)) + 1) % INTENSITY_LEVELS.length];
export function loadIntensity(storage) { try { return storage ? storage.getItem(INTENSITY_KEY) : null; } catch { return null; } }
export function saveIntensity(storage, level) { try { storage?.setItem(INTENSITY_KEY, intensityOf(level)); return !!storage; } catch { return false; } }
