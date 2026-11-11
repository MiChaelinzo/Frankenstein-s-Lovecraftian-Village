// Key and seed derivation mirror Assets/Scripts/Core/DailySeed.cs (golden-checked in web/test/parity.test.js). Opt-in daily village: the seed is derived from the UTC date, so everyone who opts in on the same day gets the same village.
// The clock is injectable for tests. Nothing here runs unless the player asks (button, Z key or ?daily=1).
import { queryParam } from './util.js';
const fmt = (n, w) => String(n).padStart(w, '0');

/** "YYYY-MM-DD" in UTC, or null for an invalid date. */
export function dailyKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${fmt(date.getUTCFullYear(), 4)}-${fmt(date.getUTCMonth() + 1, 2)}-${fmt(date.getUTCDate(), 2)}`;
}

/** FNV-1a over the key, folded to a positive 31-bit seed (never 0). */
export function seedFromKey(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h & 0x7fffffff) || 1;
}

/** { key, seed } for the date from `clock` (default: the real clock), or null if the clock gives no valid date. */
export function dailyVillage(clock = () => new Date()) {
  let d; try { d = clock(); } catch { return null; }
  const key = dailyKey(d);
  return key ? { key, seed: seedFromKey(key) } : null;
}

/** True only for an explicit ?daily=1 in the query or hash. */
export function dailyWanted(search, hash) {
  return queryParam(search, 'daily') === '1' || queryParam(hash, 'daily') === '1';
}
