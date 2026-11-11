// Journal model for the Whispers panel. Pure: story entries (narration, omens, doors, investigator) and progress entries
// (codex, achievements) live in separate lists, so a burst of progress lines can never push narration out of view.
export const STORY_MAX = 12;
export const PROGRESS_MAX = 6;
export const TABS = ['story', 'progress'];
export const PROGRESS_KINDS = new Set(['codex', 'achievement']);

export const newJournal = () => ({ story: [], progress: [], unseen: 0, tab: 'story' });
export const isProgressKind = (kind) => PROGRESS_KINDS.has(kind);

function push(list, entry, max) {
  if (list.length && list[0].text === entry.text && list[0].kind === entry.kind) return list;
  return [entry, ...list].slice(0, max);
}

/** Routes an entry to its list (newest first, capped). Progress entries raise `unseen` unless the Progress tab is open. */
export function addJournalEntry(model, entry) {
  if (!isProgressKind(entry.kind)) return { ...model, story: push(model.story, entry, STORY_MAX) };
  const progress = push(model.progress, entry, PROGRESS_MAX);
  const added = progress !== model.progress;
  return { ...model, progress, unseen: added && model.tab !== 'progress' ? model.unseen + 1 : model.unseen };
}

/** Switches tab; opening Progress clears the unseen badge. Unknown tabs are ignored. */
export function selectJournalTab(model, tab) {
  if (!TABS.includes(tab)) return model;
  return { ...model, tab, unseen: tab === 'progress' ? 0 : model.unseen };
}

/** Next tab for an arrow/Home/End key on the tablist, or null for other keys. */
export function tabForKey(current, key) {
  const i = TABS.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return TABS[(i + 1) % TABS.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return TABS[(i + TABS.length - 1) % TABS.length];
  if (key === 'Home') return TABS[0];
  if (key === 'End') return TABS[TABS.length - 1];
  return null;
}
