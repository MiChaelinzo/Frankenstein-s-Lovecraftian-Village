// Round 34 (spec 172): pure text builders for the chronicle export and the theory export. No DOM, no clock, no randomness: the same model and options give the same text.
// They only repeat what the chronicle and the theory board already show the player, so nothing unrevealed can leak. The seed code (daily.js) lets players compare a run with a friend's.
const GRADE_KEYS = ['true', 'partial', 'false'];

/** Heading in markdown ('md') or plain text ('txt'). */
function heading(format, level, text) {
  if (format === 'md') return `${'#'.repeat(level)} ${text}`;
  return level === 1 ? `${text}\n${'='.repeat(text.length)}` : text.toUpperCase();
}

const gradeCounts = (theories) => GRADE_KEYS.map((_, g) => theories.filter((t) => t.grade === g).length);

/**
 * The outcome comparison block: ending count, theory conclusions by grade and how many missing outcomes the player has learned.
 * opts: { tr, theories: [{ grade }], missing: [{ outcome }] | null, endings: { found, total } | null }.
 */
export function outcomeComparisonLines(opts) {
  const { tr } = opts, theories = opts.theories || [], [t, p, f] = gradeCounts(theories), lines = [];
  if (opts.endings) lines.push(tr('export.compare.endings', { found: opts.endings.found, total: opts.endings.total }));
  lines.push(tr('export.compare.theories', { n: theories.length, t, p, f }));
  if (opts.missing) lines.push(tr('export.compare.outcomes', { n: opts.missing.filter((m) => m.outcome).length, total: opts.missing.length }));
  return lines;
}

/**
 * Chronicle export. model: chronicleModel() output. opts: { tr, format: 'md' | 'txt', seedCode, endings }.
 * Lists only what the player learned: prose written from heard statements and leads, missing persons with at least one lead, statements heard, theories concluded.
 */
export function chronicleExportText(model, opts) {
  const { tr, format } = opts, out = [heading(format, 1, tr('chronicle.title')), '', tr('export.seed', { code: opts.seedCode }), ''];
  if (model.prose) {
    out.push(heading(format, 2, tr('chronicle.prose')), '');
    model.prose.nights.forEach((text, i) => out.push(`${tr('chronicle.prose.night', { night: i + 1 })} ${text}`, ''));
    if (model.prose.summary) out.push(model.prose.summary, '');
  }
  const learned = model.missing.filter((m) => m.told > 0);
  if (learned.length) {
    out.push(heading(format, 2, tr('chronicle.missing')), '');
    for (const m of learned) out.push(`- ${tr('chronicle.missing.row', { missing: m.name, home: m.home, n: m.told })}${m.outcome ? ` ${tr('chronicle.outcome', { text: m.outcome })}` : ''}`);
    out.push('');
  }
  if (model.mythos.length) {
    out.push(heading(format, 2, tr('chronicle.mythos')), '');
    for (const e of model.mythos) out.push(`- ${tr('chronicle.mythos.row', { night: e.night, kind: tr(`chronicle.mythos.kind.${e.kind}`), text: e.text })}`);
    out.push('');
  }
  out.push(heading(format, 2, tr('export.compare')), '');
  for (const line of outcomeComparisonLines({ tr, theories: model.theories, missing: model.missing, endings: opts.endings })) out.push(`- ${line}`);
  out.push('', tr('export.compare.hint'), '');
  return out.join('\n');
}

/** Theory export. results: theory summary() rows { grade, gradeName, question, answer, verdict, evidence }. opts: { tr, format, seedCode, endings }. */
export function theoryExportText(results, opts) {
  const { tr, format } = opts, out = [heading(format, 1, tr('export.theory.title')), '', tr('export.seed', { code: opts.seedCode }), ''];
  out.push(heading(format, 2, tr('theory.summary.title')), '');
  if (!results.length) out.push(tr('theory.summary.empty'));
  results.forEach((r, i) => {
    out.push(`${i + 1}. ${tr('export.theory.row', { grade: r.gradeName, question: r.question, answer: r.answer })}`, `   ${r.verdict}`);
    if (r.evidence.length) out.push(`   ${tr('theory.summary.evidence', { list: r.evidence.join(', ') })}`);
  });
  out.push('', heading(format, 2, tr('export.compare')), '');
  for (const line of outcomeComparisonLines({ tr, theories: results, missing: null, endings: opts.endings })) out.push(`- ${line}`);
  out.push('', tr('export.compare.hint'), '');
  return out.join('\n');
}

/** File name for an export: lower case, safe characters only, the seed code inside so the file names the village. */
export const exportFileName = (kind, seedCode, format) => `${kind}-${String(seedCode).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${format}`;
