// High-contrast accessibility theme preference. Pure helpers; the page toggles the "hc" class on <html>.
export const CONTRAST_KEY = 'flv.contrast.v1';

/** Explicit ?contrast=1/0 (query or hash) wins; otherwise the stored choice; otherwise off. */
export function contrastWanted(search, hash, stored) {
  const get = (s) => new URLSearchParams(String(s || '').replace(/^[?#]/, '')).get('contrast');
  const v = get(hash) ?? get(search);
  if (v === '1') return true;
  if (v === '0') return false;
  return stored === '1';
}
export function loadContrast(storage) { try { return storage ? storage.getItem(CONTRAST_KEY) : null; } catch { return null; } }
export function saveContrast(storage, on) { try { storage?.setItem(CONTRAST_KEY, on ? '1' : '0'); return !!storage; } catch { return false; } }
