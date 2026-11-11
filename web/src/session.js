// Session save/load and share links. Pure functions plus a storage wrapper that tolerates a missing localStorage.
export const SESSION_KEY = 'flv.session.v1';
export const CAMERAS = ['auto', 'first', 'third', 'top'];
const THEME_RE = /^[a-z0-9_-]{1,32}$/;
const int = (v) => (typeof v === 'number' || typeof v === 'string') && v !== '' && Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Validates untrusted input (object or JSON text). Returns a clean session or null. night and beat are 0-based. */
export function parseSession(input) {
  let o = input;
  if (typeof input === 'string') { try { o = JSON.parse(input); } catch { return null; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const seed = int(o.seed), sanity = int(o.sanity);
  if (seed === null || sanity === null) return null;
  const night = int(o.night), beat = int(o.beat), floor = int(o.floor), stage = int(o.stage);
  return {
    seed: seed | 0,
    sanity: clamp(sanity, 0, 100),
    night: night === null ? 0 : clamp(night, 0, 8),
    beat: beat === null ? 0 : clamp(beat, 0, 99),
    theme: typeof o.theme === 'string' && THEME_RE.test(o.theme) ? o.theme : 'auto',
    cam: CAMERAS.includes(o.cam) ? o.cam : 'third',
    floor: floor === null ? 0 : clamp(floor, 0, 8),
    stage: stage === null ? -1 : clamp(stage, -1, 8), // effective ritual stage reached, -1 for none
  };
}

export const serializeSession = (s) => JSON.stringify(parseSession(s));

/** localStorage when usable, else null (private mode, blocked storage, node, tests). */
export function safeStorage(g = globalThis) {
  try { const s = g.localStorage; return s && typeof s.getItem === 'function' ? s : null; } catch { return null; }
}
export function saveSession(storage, s) {
  const text = serializeSession(s);
  if (!storage || text === 'null') return false;
  try { storage.setItem(SESSION_KEY, text); return true; } catch { return false; }
}
export function loadSession(storage) {
  if (!storage) return null;
  try { return parseSession(storage.getItem(SESSION_KEY)); } catch { return null; }
}
export function clearSession(storage) { try { storage?.removeItem(SESSION_KEY); } catch { /* ignore */ } }

/** Hash fragment (leading #) for a session. Night is 1-based in links. Default values are omitted. */
export function sessionHash(s) {
  const v = parseSession(s); if (!v) return '';
  return `#seed=${v.seed}&sanity=${v.sanity}&night=${v.night + 1}` +
    (v.theme !== 'auto' ? `&theme=${v.theme}` : '') + (v.cam !== 'third' ? `&cam=${v.cam}` : '') + (v.floor ? `&floor=${v.floor}` : '');
}
/** Relative link from location.pathname so it works at a domain root and under a repo subpath. Never carries ?pack. */
export function buildShareLink(loc, s) {
  const path = (loc && typeof loc.pathname === 'string' && loc.pathname) || './';
  return `${loc && typeof loc.origin === 'string' && loc.origin !== 'null' ? loc.origin : ''}${path}${sessionHash(s)}`;
}
