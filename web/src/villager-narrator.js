// Optional AI voice for villagers (?narrator=<url>). Pure logic plus one injected fetch, no DOM.
// The AI line is display only: nothing here reads or writes game state, so a villager's clue and sanity effect come from Core talk() alone.
// Every failure (no url, bad scheme, network or CSP block, HTTP error, timeout, malformed JSON, empty text) resolves to the deterministic line.

export const NARRATOR_TIMEOUT_MS = 4000;
export const MAX_AI_LINE_CHARS = 240;
export const FALLBACK_REASONS = ['disabled', 'bad_url', 'network', 'http', 'timeout', 'malformed', 'empty'];

/** Request body posted to the endpoint. Only descriptive context; the endpoint cannot ask the game to change anything. */
export function buildVillagerRequest({ villager, roleId, behavior, cause, phase, dreadPercent, night, lang, fallback }) {
  return {
    kind: 'villager',
    villager: String(villager), role: String(roleId), behavior: Number(behavior) | 0, cause: String(cause), phase: String(phase),
    dread: Math.max(0, Math.min(100, Math.round(Number(dreadPercent) || 0))), night: Number(night) | 0, lang: String(lang), fallback: String(fallback),
  };
}

/** Trusted-nothing clean up: a string only, control characters removed, whitespace collapsed, capped. Rendering still uses textContent. */
export function sanitizeAiLine(text, max = MAX_AI_LINE_CHARS) {
  if (typeof text !== 'string') return '';
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}\u2026` : clean;
}

const isHttpUrl = (url) => { try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

/**
 * Resolves { text, source: 'ai' | 'fallback', reason }. Never rejects. The fallback text is returned untouched on any failure.
 * fetchImpl and timer functions are injectable so tests need no network and no real waiting.
 */
export async function fetchVillagerLine({ url, request, fallback, fetchImpl = globalThis.fetch, timeoutMs = NARRATOR_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const fail = (reason) => ({ text: fallback, source: 'fallback', reason });
  if (!url) return fail('disabled');
  if (!isHttpUrl(url)) return fail('bad_url');
  if (typeof fetchImpl !== 'function') return fail('network');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimer(() => { timedOut = true; controller?.abort(); }, timeoutMs);
  // With no AbortController the race still resolves on time even if the fetch never settles.
  let deadlineTimer = null;
  const deadline = new Promise((resolve) => { deadlineTimer = setTimer(() => resolve('timeout'), timeoutMs); });
  try {
    const res = await Promise.race([
      fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller?.signal }),
      deadline,
    ]);
    if (res === 'timeout' || timedOut) return fail('timeout');
    if (!res || !res.ok) return fail('http');
    let body;
    try { body = await res.json(); } catch { return fail('malformed'); }
    if (!body || typeof body.text !== 'string') return fail('malformed');
    const text = sanitizeAiLine(body.text);
    return text ? { text, source: 'ai', reason: '' } : fail('empty');
  } catch {
    return fail(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimer(timer); clearTimer(deadlineTimer);
  }
}
