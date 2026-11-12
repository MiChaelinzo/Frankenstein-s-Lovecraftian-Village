// Localized versions of the English text helpers in scene.js and building.js.
// For lang 'en' every function returns exactly what the original helper returns (tested), so the Core mirrors stay untouched.
import { STRINGS, t } from './i18n.js';
import { ritualProgress } from './core.js';

const fround = Math.fround;

/** Display name for a landmark or narration location id ('church', 'the walls', null for the whole village). */
export function locName(lang, id) {
  if (id == null || id === '') return t('loc.the_village', lang);
  const key = `loc.${String(id).replace(/ /g, '_')}`;
  return key in STRINGS.en ? t(key, lang) : String(id);
}

/** Offline narrator in the chosen language. Same dread thresholds as StaticNarrationProvider; deterministic per language. */
export class LocalizedNarrationProvider {
  constructor(lang) { this.lang = lang; }
  narrate(locationId, dread) {
    const d = fround(dread);
    const key = d < fround(0.34) ? 'narr.calm' : d < fround(0.67) ? 'narr.uneasy' : 'narr.dire';
    return t(key, this.lang, { 0: locName(this.lang, locationId) });
  }
}

export const tierLabel = (lang, tier) => t(`tier.${tier}`, lang);
export const themeLabel = (lang, theme) => t(`theme.${theme.id}`, lang);
export const cameraLabel = (lang, mode) => t(`camlabel.${mode}`, lang);
export const doorName = (lang, behavior) => t(`doorname.${behavior}`, lang);

export function omenTextL(event, lang) {
  if (!event) return '';
  if (event.rising) return t(`omen.rise.${event.name}` in STRINGS.en ? `omen.rise.${event.name}` : 'omen.rise.default', lang);
  const tier = [0, 1, 2, 3].includes(event.tier) ? tierLabel(lang, event.tier) : event.name;
  return t('omen.fall', lang, { tier });
}

export function entryLabelL(e, lang) {
  return t('entry.label', lang, { n: Math.round(e.sanity), omen: e.kind === 'omen' ? t('entry.omen', lang) : '', text: e.text });
}

/** doorMessage() returns English text; map it to the same line in `lang` by matching the English table. */
export function doorMessageL(englishText, lang) {
  const key = Object.keys(STRINGS.en).find((k) => k.startsWith('door.') && STRINGS.en[k] === englishText);
  return key ? t(key, lang) : englishText;
}

export function describeSceneL({ seed, pieces, tier, dreadPercent, focus }, lang) {
  return t('desc.scene', lang, { seed, pieces, pct: dreadPercent, tier: tierLabel(lang, tier) }) + (focus ? t('desc.listen', lang, { focus }) : '');
}

/** " Night schedule: stage X of N, dread reached: stage Y (behind)." for a ritualProgress result, or '' when no night applies. */
export function ritualScheduleTextL(prog, stageCount, lang) {
  if (!prog || prog.scheduled < 0) return '';
  return t('ritual.schedule', lang, {
    s: prog.scheduled + 1, n: stageCount,
    d: prog.dreadReached < 0 ? t('ritual.dread_none', lang) : t('ritual.dread_stage', lang, { i: prog.dreadReached + 1 }),
    pace: t(`ritual.pace_${prog.pace}`, lang),
  });
}

export function ritualHudTextL(ritual, dreadPercent, lang, nightNumber) {
  if (!ritual || !Array.isArray(ritual.stages) || !ritual.stages.length) return '';
  const prog = ritualProgress(ritual, typeof nightNumber === 'number' ? nightNumber : 0, dreadPercent);
  const found = prog.effective;
  if (found < 0) {
    return t('ritual.notbegun', lang, { name: ritual.name, stage: ritual.stages[0].name, pct: ritual.stages[0].dreadThresholdPercent });
  }
  const st = ritual.stages[found];
  const next = ritual.stages[found + 1];
  const sched = ritualScheduleTextL(prog, ritual.stages.length, lang);
  return t('ritual.stage', lang, { name: ritual.name, i: found + 1, n: ritual.stages.length, stage: st.name, sigil: st.sigil }) + sched +
    (next ? t('ritual.next', lang, { next: next.name, pct: next.dreadThresholdPercent }) : t('ritual.done', lang));
}

export function nightClampNoticeL(hash, count, lang) {
  const v = Number.parseInt(new URLSearchParams(String(hash || '').replace(/^#/, '')).get('night'), 10);
  if (!Number.isFinite(v) || count <= 0 || (v >= 1 && v <= count)) return '';
  return t('msg.nightclamp', lang, { n: v, count, shown: Math.max(1, Math.min(count, v)) });
}

export function postcardCaptionL({ villageName, seed, night, title }, lang) {
  return t('postcard.caption', lang, { village: villageName, n: night, title, seed: seed | 0 });
}

export function storyMetaL({ n, total, b, c, kind, sky, weather, pct }, lang) {
  return t('story.meta', lang, { n, total, b, c, kind, sky, weather, pct });
}

const kindName = (id, lang) => (`kind.${id}` in STRINGS.en ? t(`kind.${id}`, lang) : String(id).replace(/_/g, ' '));

/** Screen reader summary of what stands in the village, e.g. " The village holds 2 church, 3 house." (counts sorted by id). */
export function describeVillageL(layout, lang) {
  const counts = new Map();
  for (const p of layout || []) counts.set(p.id, (counts.get(p.id) || 0) + 1);
  const list = [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, n]) => `${n} ${kindName(id, lang)}`).join(', ');
  return list ? t('desc.village', lang, { list }) : '';
}

export function describeInvestigatorL(inv, lang) {
  if (!inv || !inv.route.length) return '';
  const pos = inv.position;
  return t('desc.investigator', lang, { x: pos.x, z: pos.z, step: Math.min(inv.tick + 1, inv.route.length), total: inv.route.length });
}
