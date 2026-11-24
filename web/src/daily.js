// Key and seed derivation mirror Packages/com.michaelinzo.frankenstein-village/Core/DailySeed.cs (golden-checked in web/test/parity.test.js). Opt-in daily village: the seed is derived from the UTC date, so everyone who opts in on the same day gets the same village.
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

// ---------- Village Seed Share (round 34, spec 172): "1818-BLACK-TIDE", mirrors SeedShare in Core/DailySeed.cs (golden key "seedShare") ----------
export const SEED_SHARE_MIN_WORDS = 16, MAX_SEED = 4294967295;
export const SEED_SHARE_ERRORS = ['empty', 'format', 'range', 'mismatch'];

const wordList = (root, field) => {
  const list = root && !Array.isArray(root) ? root[field] : null;
  if (!Array.isArray(list) || list.length < SEED_SHARE_MIN_WORDS) throw new Error(`seedshare: ${field} needs at least ${SEED_SHARE_MIN_WORDS} words`);
  const seen = new Set();
  for (const w of list) {
    if (typeof w !== 'string' || !w) throw new Error(`seedshare: ${field} holds a non-string`);
    if (!/^[A-Z]+$/.test(w)) throw new Error(`seedshare: ${field} word '${w}' must be A-Z upper case`);
    if (seen.has(w)) throw new Error(`seedshare: ${field} repeats '${w}'`);
    seen.add(w);
  }
  return list.slice();
};

/** Parses data/seedshare.json (byte copy of Data/seedshare.json). Throws naming the list when malformed. */
export function parseSeedShareLibrary(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('seedshare: root is not an object');
  return { first: wordList(input, 'first'), second: wordList(input, 'second') };
}

/** The seed prints as an unsigned 32-bit number, so every integer seed round trips. Words derive from FNV-1a over those digits. */
export function encodeSeedCode(library, seed) {
  const number = String(seed >>> 0);
  let h = 0x811c9dc5;
  for (let i = 0; i < number.length; i++) { h ^= number.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  const n1 = library.first.length;
  return `${number}-${library.first[h % n1]}-${library.second[Math.floor(h / n1) % library.second.length]}`;
}

const asciiUpper = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 32));
const fail = (error, message, expected = '') => ({ ok: false, seed: 0, error, message, expected });

/** A bare number or number-WORD-WORD in any case. Returns { ok, seed } or { ok: false, error: id, message (English), expected }. The UI translates by error id. */
export function decodeSeedCode(library, input) {
  const text = asciiUpper(String(input ?? '').trim());
  if (!text) return fail('empty', 'Enter a seed number or a share code such as 1818-BLACK-TIDE.');
  const parts = text.split('-');
  if ((parts.length !== 1 && parts.length !== 3) || !/^[0-9]+$/.test(parts[0]) || (parts.length === 3 && (!/^[A-Z]+$/.test(parts[1]) || !/^[A-Z]+$/.test(parts[2]))))
    return fail('format', 'A share code is a number, or a number and two words joined by hyphens, like 1818-BLACK-TIDE.');
  const digits = parts[0].replace(/^0+/, '');
  if (digits.length > 10 || (digits.length > 0 && Number(digits) > MAX_SEED)) return fail('range', 'The seed number must be between 0 and 4294967295.');
  const value = digits ? Number(digits) : 0, seed = value | 0, expected = encodeSeedCode(library, seed);
  if (parts.length === 3 && expected !== `${value}-${parts[1]}-${parts[2]}`) return fail('mismatch', `The words do not belong to that number. The village ${value} is ${expected}.`, expected);
  return { ok: true, seed, error: '', message: '', expected: '' };
}

/** The Daily Village Challenge: the share code of the seed for the date from `clock`, or null without a valid date. */
export function dailyChallengeCode(library, clock = () => new Date()) {
  const d = dailyVillage(clock);
  return d ? { key: d.key, seed: d.seed, code: encodeSeedCode(library, d.seed) } : null;
}
export const dailyCodeForKey = (library, key) => encodeSeedCode(library, seedFromKey(key));
