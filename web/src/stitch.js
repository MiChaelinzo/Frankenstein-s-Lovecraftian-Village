// The "Stitch" panel model: how the Frankenstein parts connect, driven by web/data/stitch.json (tools/gen_stitch.py).
// Pure: no DOM, no fetch. The panel only shows numbers that the generator read from the repo.
import { esc } from './util.js';

/** Part ids in display order, with the parts each one feeds (the stitches). */
export const STITCH_PARTS = [
  { id: 'core', feeds: ['golden', 'unity'] },
  { id: 'golden', feeds: ['js'] },
  { id: 'js', feeds: ['audio', 'pwa'] },
  { id: 'unity', feeds: [] },
  { id: 'audio', feeds: [] },
  { id: 'pwa', feeds: [] },
  { id: 'kiro', feeds: ['core', 'js'] },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0);

/** Validates untrusted JSON. Returns [{ id, feeds, vars }] (vars are plain integers) or null when the data is unusable. */
export function stitchModel(data) {
  if (!data || typeof data !== 'object' || data.version !== 1 || !data.parts || typeof data.parts !== 'object') return null;
  return STITCH_PARTS.map((p) => {
    const src = data.parts[p.id] && typeof data.parts[p.id] === 'object' ? data.parts[p.id] : {};
    const vars = {};
    for (const k of Object.keys(src)) vars[k] = num(src[k]);
    return { id: p.id, feeds: p.feeds, vars: { count: 0, ...vars } };
  });
}

/** Safe HTML list (every dynamic string is escaped). `tr` is the i18n translate function. */
export function stitchHtml(model, tr) {
  if (!model) return `<p class="stats">${esc(tr('stitch.unavailable'))}</p>`;
  return `<ul class="stitch-list">${model.map((p) => {
    const feeds = p.feeds.length ? ` <span class="stitch-feeds">${esc(tr('stitch.feeds', { to: p.feeds.map((f) => tr(`stitch.${f}`)).join(', ') }))}</span>` : '';
    return `<li><strong>${esc(tr(`stitch.${p.id}`))}</strong>: ${esc(tr(`stitch.${p.id}.d`, p.vars))}${feeds}</li>`;
  }).join('')}</ul>`;
}
