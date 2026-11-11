// Mirror of Packages/com.michaelinzo.frankenstein-village/Core/AchievementRules.cs (golden-checked in web/test/parity.test.js). Achievements and journal-completion tracker. Pure: stats in, earned ids out. Earned ids are sticky (saved in the session).
export const JOURNAL_KINDS = ['narration', 'omen', 'door', 'investigator'];

export const ACHIEVEMENTS = [
  { id: 'whisper', test: (s) => s.whispers >= 1 },
  { id: 'listener', test: (s) => s.listens >= 3 },
  { id: 'doors', test: (s) => s.doors >= 3 },
  { id: 'nights', test: (s) => s.nightsTotal > 0 && s.nightsVisited >= s.nightsTotal },
  { id: 'journal', test: (s) => JOURNAL_KINDS.every((k) => s.kinds.has(k)) },
  { id: 'abyss', test: (s) => s.tier >= 3 },
  { id: 'ritual', test: (s) => s.stageCount > 0 && s.stage >= s.stageCount - 1 },
  { id: 'codexhalf', test: (s) => s.codexTotal > 0 && s.codexCount * 2 >= s.codexTotal },
  { id: 'codexfull', test: (s) => s.codexTotal > 0 && s.codexCount >= s.codexTotal },
  { id: 'wanderer', test: (s) => s.investigatorDone },
];
const VALID = new Set(ACHIEVEMENTS.map((a) => a.id));

export const newStats = () => ({
  whispers: 0, listens: 0, doors: 0, nightsVisited: 0, nightsTotal: 0, kinds: new Set(), tier: 0,
  stage: -1, stageCount: 0, codexCount: 0, codexTotal: 0, investigatorDone: false,
});

/** Ids earned by these stats. */
export const earnedIds = (stats) => ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);

/** Adds newly earned ids to `earned` (a Set); returns the new ones in definition order. */
export function award(earned, stats) {
  const fresh = [];
  for (const id of earnedIds(stats)) if (!earned.has(id)) { earned.add(id); fresh.push(id); }
  return fresh;
}

/** Journal completion: how many of the tracked kinds were seen, as { seen, total, percent }. */
export function journalCompletion(kinds) {
  const seen = JOURNAL_KINDS.filter((k) => kinds.has(k)).length;
  return { seen, total: JOURNAL_KINDS.length, percent: Math.round((seen * 100) / JOURNAL_KINDS.length) };
}

/** Keeps only known achievement ids (for untrusted save data). */
export const cleanAchievementIds = (ids) => (Array.isArray(ids) ? [...new Set(ids.filter((i) => VALID.has(i)))] : []);
