// Arming rule for progress. A deep link, a restore or a hash change only previews progress (counts and meta);
// codex entries and achievements are awarded only after the first real player action. Pure: sets in, new ids out.
import { unlockInto } from './codex.js';
import { award } from './achievements.js';

/** Returns { fresh, won }. While not armed nothing is added to `codex` or `earned` and both lists are empty. */
export function settleProgress({ armed, codex, earned, ritual, unlockable, stats }) {
  if (!armed) return { fresh: [], won: [] };
  const fresh = unlockInto(codex, ritual, unlockable);
  // stats.codexCount must include what was just unlocked before achievements are tested
  stats.codexCount = Math.max(stats.codexCount, codex.size);
  return { fresh, won: award(earned, stats) };
}
