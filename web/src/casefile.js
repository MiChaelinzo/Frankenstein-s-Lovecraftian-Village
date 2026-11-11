// Case file export: deterministic Markdown/HTML of a campaign. No timestamps, so the same inputs give identical output.
import { buildStory } from './story.js';
import { generateRitual, ritualProgress } from './core.js';

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const caseFileName = (seed, ext) => `village-casefile-seed-${seed | 0}.${ext}`;

/** input: { campaign, seed, sanity, journal: [{kind,text,sanity}], report?: { pieces, tier, dreadPercent, omen }, night?: 1-based current night } */
export function buildCaseFile({ campaign, seed, sanity, journal = [], report = null, night = 0 }) {
  const L = [];
  const name = campaign ? campaign.villageName : 'Unknown';
  L.push(`# Case File: ${name}`, '', `- Seed: ${seed | 0}`, `- Sanity at filing: ${Math.round(sanity)}`);
  if (campaign) L.push(`- Nights: ${campaign.nights.length}`);
  if (report) L.push(`- Pieces: ${report.pieces}`, `- Dread: ${report.dreadPercent}% (${report.tier})`);
  if (report && report.omen) L.push('', `> ${one(report.omen)}`);
  if (campaign) {
    L.push('', '## Nights');
    for (const n of campaign.nights) {
      L.push('', `### Night ${n.number}: ${one(n.title)}`, '',
        `- Dread target: ${n.dreadTargetPercent}%`, `- Sanity start: ${n.sanityStart}`, `- Sky: ${n.sky}, weather: ${n.weather}`,
        `- Rumor: ${one(n.rumor)}`, `- Lore: ${one(n.lore)}`);
    }
    const ritual = generateRitual(campaign);
    L.push('', `## Ritual: ${one(ritual.name)}`, '');
    for (const st of ritual.stages) L.push(`- Night ${st.nightNumber}, ${st.name} (sigil ${st.sigil}), begins at ${st.dreadThresholdPercent}% dread, omen ${st.omenId}, story beat ${st.beatIndex + 1}`);
    L.push('', `Night schedule: night N reaches ritual stage N of ${ritual.stages.length}. The effective stage is the later of the night's stage and the stage dread has reached, so the night sets a floor.`);
    if (night >= 1) {
      const p = ritualProgress(ritual, night, Math.round(100 - sanity));
      L.push('', `Current: night schedule: stage ${p.scheduled + 1} of ${ritual.stages.length}, dread reached: ${p.dreadReached < 0 ? 'none' : `stage ${p.dreadReached + 1}`}, effective stage ${p.effective + 1} (${p.pace === 'on' ? 'on schedule' : p.pace}).`);
    }
    L.push('', '## Story beats', '');
    for (const b of buildStory(campaign)) L.push(`- [night ${b.nightNumber}, ${b.kind}, ${b.dreadPercent}%] ${one(b.text)}`);
  }
  L.push('', '## Journal', '');
  if (journal.length) journal.forEach((e, i) => L.push(`${i + 1}. (${e.kind}, sanity ${Math.round(e.sanity)}) ${one(e.text)}`));
  else L.push('- No entries recorded.');
  return L.join('\n') + '\n';
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Small self-contained HTML page (inline style only, no scripts) built from the Markdown above. */
export function caseFileHtml(markdown) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const open = (t) => { if (list !== t) { close(); out.push(`<${t}>`); list = t; } };
  for (const line of String(markdown).split('\n')) {
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(line))) { close(); out.push(`<h${m[1].length}>${escHtml(m[2])}</h${m[1].length}>`); }
    else if ((m = /^- (.*)$/.exec(line))) { open('ul'); out.push(`<li>${escHtml(m[1])}</li>`); }
    else if ((m = /^\d+\. (.*)$/.exec(line))) { open('ol'); out.push(`<li>${escHtml(m[1])}</li>`); }
    else if ((m = /^> (.*)$/.exec(line))) { close(); out.push(`<blockquote>${escHtml(m[1])}</blockquote>`); }
    else close();
  }
  close();
  const title = (/^# (.*)$/m.exec(markdown) || [0, 'Case File'])[1];
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>` +
    '<style>body{font:16px/1.5 Georgia,serif;max-width:48em;margin:2em auto;padding:0 1em;background:#0b1012;color:#d8e0dc}blockquote{border-left:3px solid #4a6;margin-left:0;padding-left:1em;font-style:italic}</style>' +
    `</head><body>\n${out.join('\n')}\n</body></html>\n`;
}
