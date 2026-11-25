// Round 36 (spec 184): streamer features. Mirrors WeeklySeed, InvestigationAccuracy and LeaderboardExport in Packages/com.michaelinzo.frankenstein-village/Core/StreamerChallenge.cs (golden key "streamerChallenge").
// Pure: no clock of its own, no DOM, no network. The leaderboard is a local list the player shares by hand; entries hold a seed and counts only, never a name.
import { seedFromKey, encodeSeedCode } from './daily.js';

const DAY_MS = 86400000;
const pad = (n, w) => String(n).padStart(w, '0');

/** "YYYY-Www" (ISO 8601 week of the UTC date), or null for an invalid date. Thursday rule, like Core. */
export function weeklyKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const midnight = new Date(date.getTime()); midnight.setUTCHours(0, 0, 0, 0);
  const thursday = new Date(midnight.getTime() + (4 - isoDay) * DAY_MS);
  const jan1 = new Date(0); jan1.setUTCFullYear(thursday.getUTCFullYear(), 0, 1); jan1.setUTCHours(0, 0, 0, 0);
  const week = Math.floor(Math.round((thursday.getTime() - jan1.getTime()) / DAY_MS) / 7) + 1;
  return `${pad(thursday.getUTCFullYear(), 4)}-W${pad(week, 2)}`;
}
export const weeklySeedFromKey = seedFromKey;
export const weeklyCodeForKey = (library, key) => encodeSeedCode(library, seedFromKey(key));

/** { key, seed, code } for the week of the date from `clock`, or null without a valid date. */
export function weeklyChallenge(library, clock = () => new Date()) {
  let d; try { d = clock(); } catch { return null; }
  const key = weeklyKey(d);
  return key ? { key, seed: seedFromKey(key), code: encodeSeedCode(library, seedFromKey(key)) } : null;
}

export const WEIGHT_THEORY = 70, WEIGHT_BELIEF = 30, POINTS_TRUE = 2, POINTS_PARTIAL = 1, MAXIMUM = 100;
const GRADE_TRUE = 0, GRADE_PARTIAL = 1;

/** Score 0 to 100 from conclusion counts and the sum of their average belief. Integer arithmetic like Core. */
export function accuracyScore(trueCount, partialCount, falseCount, beliefTotal) {
  const t = Math.max(0, trueCount), p = Math.max(0, partialCount), f = Math.max(0, falseCount), n = t + p + f;
  if (n === 0) return 0;
  const theoryPercent = Math.trunc(((t * POINTS_TRUE + p * POINTS_PARTIAL) * MAXIMUM) / (n * POINTS_TRUE));
  const beliefPercent = Math.min(MAXIMUM, Math.trunc(Math.max(0, beliefTotal) / n));
  return Math.trunc((theoryPercent * WEIGHT_THEORY + beliefPercent * WEIGHT_BELIEF) / MAXIMUM);
}

/** Score from replayTheories() output: { list: [{ grade, averageBelief }] }. */
export function accuracyOfState(state) {
  const list = state.list;
  return accuracyScore(list.filter((c) => c.grade === GRADE_TRUE).length, list.filter((c) => c.grade === GRADE_PARTIAL).length,
    list.filter((c) => c.grade !== GRADE_TRUE && c.grade !== GRADE_PARTIAL).length, list.reduce((s, c) => s + c.averageBelief, 0));
}

export const LEADERBOARD_FORMAT = 'flv-challenge-1', MAX_ENTRIES = 25, MAX_COUNT = 1000000;

/** Score descending, then seed (unsigned), cut to MAX_ENTRIES. results: [{ seed, score, theories, endings }]. */
export function rankResults(results) {
  return results.slice().sort((a, b) => (a.score !== b.score ? b.score - a.score : (a.seed >>> 0) - (b.seed >>> 0))).slice(0, MAX_ENTRIES);
}

/** The export JSON, byte for byte what Core LeaderboardExport.ToJson writes. */
export function leaderboardJson(library, weekKey, results) {
  const entries = rankResults(results).map((r, i) => ({ rank: i + 1, seed: r.seed >>> 0, code: encodeSeedCode(library, r.seed), score: r.score, theories: r.theories, endings: r.endings }));
  return JSON.stringify({ format: LEADERBOARD_FORMAT, week: weekKey, entries });
}

const whole = (e, field, max) => {
  const v = e[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new Error(`leaderboard: ${field} must be a whole number from 0 to ${max}`);
  return v;
};

/** Reads an export back: { week, results }. Throws naming the problem on a wrong format, field or share code. */
export function parseLeaderboard(library, text) {
  let root; try { root = JSON.parse(text); } catch (err) { throw new Error(`leaderboard: not JSON (${err.message})`); }
  if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('leaderboard: root is not an object');
  if (root.format !== LEADERBOARD_FORMAT) throw new Error(`leaderboard: format is not ${LEADERBOARD_FORMAT}`);
  if (typeof root.week !== 'string' || !Array.isArray(root.entries)) throw new Error('leaderboard: week and entries are required');
  if (root.entries.length > MAX_ENTRIES) throw new Error(`leaderboard: more than ${MAX_ENTRIES} entries`);
  const results = root.entries.map((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('leaderboard: an entry is not an object');
    const seed = whole(e, 'seed', 4294967295) | 0, score = whole(e, 'score', MAXIMUM), theories = whole(e, 'theories', MAX_COUNT), endings = whole(e, 'endings', MAX_COUNT);
    if (e.code !== encodeSeedCode(library, seed)) throw new Error(`leaderboard: share code does not belong to seed ${seed >>> 0}`);
    return { seed, score, theories, endings };
  });
  return { week: root.week, results };
}

/** Adds a run to a local list: the same seed keeps its best score. Returns a new list. */
export function addResult(results, result) {
  const same = results.find((r) => r.seed === result.seed);
  if (same && same.score >= result.score) return results.slice();
  return results.filter((r) => r.seed !== result.seed).concat([result]);
}

/** Readable list for the text export: 'md' or 'txt'. opts: { tr, format, weekKey }. Entries show the share code and counts only. */
export function leaderboardText(library, results, opts) {
  const { tr, format, weekKey } = opts, title = tr('export.challenge.title', { week: weekKey });
  const out = [format === 'md' ? `# ${title}` : `${title}\n${'='.repeat(title.length)}`, ''];
  const ranked = rankResults(results);
  if (!ranked.length) out.push(tr('export.challenge.empty'));
  ranked.forEach((r, i) => out.push(`${i + 1}. ${tr('export.challenge.row', { code: encodeSeedCode(library, r.seed), score: r.score, theories: r.theories, endings: r.endings })}`));
  out.push('', tr('export.challenge.hint'), '');
  return out.join('\n');
}
