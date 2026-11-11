// Title/intro sequence helpers. Pure, no DOM.

const trim = (s) => String(s ?? '').replace(/^[#?]/, '');

/**
 * Whether the intro should show. Disabled by ?intro=0 or #intro=0. Also auto-skipped when the URL is a deep link
 * (#story=, #seed=, #sanity=, #night=) so shared links and tools/screenshot.sh callers land directly on the scene.
 */
export function shouldShowIntro(search, hash) {
  const q = new URLSearchParams(trim(search)), h = new URLSearchParams(trim(hash));
  if (q.get('intro') === '0' || h.get('intro') === '0') return false;
  for (const k of ['story', 'seed', 'sanity', 'night']) if (h.has(k) || q.has(k)) return false;
  return true;
}

/** Three slides built from the generated campaign. */
export function buildIntroSlides(campaign) {
  const name = campaign && campaign.villageName ? campaign.villageName : 'the village';
  const first = campaign && Array.isArray(campaign.nights) && campaign.nights[0];
  const last = campaign && Array.isArray(campaign.nights) && campaign.nights[campaign.nights.length - 1];
  return [
    { title: "Frankenstein's Lovecraftian Village", text: 'Stitched from a seeded layout generator, a sanity model and a narrator.' },
    { title: name, text: first ? `It begins with "${first.title}". ${first.rumor}` : 'Something is wrong with the tide.' },
    { title: last ? `${campaign.nights.length} nights` : 'The nights', text: last ? `By the end it is "${last.title}". Press Enter to begin, or open Story mode to read it all.` : 'Press Enter to begin.' },
  ];
}

/** Advance logic: returns { index, done }. Going past the last slide is done. */
export function advanceSlide(index, count) {
  const i = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return i + 1 >= count ? { index: Math.max(0, count - 1), done: true } : { index: i + 1, done: false };
}

/** Auto-advance delay in ms, or 0 (none) when reduced motion is on. */
export const slideDelayMs = (reduced) => (reduced ? 0 : 6000);
