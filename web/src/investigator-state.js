// Pure rules for the investigator pause and the cinematic playback restore. No DOM, no timers.
// The investigator must not step while the tab is hidden or a cinematic take runs, so a take stays repeatable.
export const shouldStepInvestigator = ({ investigator, hidden, cinemaOn } = {}) => !!investigator && !hidden && !cinemaOn;

/** Remember what story mode was doing before a take starts. */
export const snapshotPlayback = (story) => ({ hadStory: !!(story && story.on), hadPlaying: !!(story && story.playing) });

/** What to do with story mode when a take ends: 'close' if the take opened it, 'resume' if it was playing, else 'keep'. */
export function restoreAction(snap) {
  if (!snap || !snap.hadStory) return 'close';
  return snap.hadPlaying ? 'resume' : 'keep';
}
