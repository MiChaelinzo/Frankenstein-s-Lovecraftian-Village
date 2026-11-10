// Story beat sequencer (StoryBeats.cs). Pure, no DOM. Mirrors the C# Core exactly.
import { SeededRandom } from './core.js';

export const MIN_DURATION_MS = 2500;
export const MAX_DURATION_MS = 12000;
export const BASE_DURATION_MS = 1500;
export const PER_CHAR_MS = 45;
export const TIER_PERCENTS = [34, 67, 90];

export const OMENS = [
  ['The lanterns burn steady and the dogs are quiet. That will not last.', 'Nothing stirs but the tide, and even the tide seems to be listening.', 'A calm so complete that it feels arranged.'],
  ['The bells hum a note nobody struck.', 'Shadows lean a little longer than the lamps allow.', 'Doors that were closed at dusk are ajar by midnight.'],
  ['Every window faces the sea, and something faces back.', 'The well breathes in when you breathe out.', 'Footsteps follow you in a rhythm that is almost your own.'],
  ['The sky has stopped pretending to be a sky.', 'The village is no longer being watched. It is being read.', 'All the bells ring at once, and no one is holding the ropes.'],
];
const SKY_NAMES = ['dusk', 'night', 'witching'];
const SKY_PHRASES = ['The last light bleeds out over the roofs.', 'A starless night settles on the harbor.', 'The witching hour hangs low and wrong.'];
const WEATHER_NAMES = ['clear', 'rain', 'fog'];
const WEATHER_PHRASES = ['The air is clear and far too still.', 'Cold rain drums on the slate.', 'Fog crawls up from the marsh and swallows the lanes.'];

export function tierForPercent(percent) {
  let tier = 0;
  while (tier < TIER_PERCENTS.length && percent >= TIER_PERCENTS[tier]) tier++;
  return tier;
}

export function beatDurationMs(textLength) {
  const n = Number.isFinite(textLength) ? Math.max(0, Math.trunc(textLength)) : 0;
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, BASE_DURATION_MS + PER_CHAR_MS * n));
}

function phraseFor(names, phrases, name) {
  const i = names.indexOf(name);
  return i < 0 ? '' : phrases[i];
}

/** Returns [{ index, nightNumber, kind, text, dreadPercent, sky, weather, durationMs }]. */
export function buildStory(campaign) {
  const beats = [];
  if (!campaign || !Array.isArray(campaign.nights)) return beats;
  const rng = new SeededRandom((campaign.seed | 0) ^ 0x1badf00d);
  for (const night of campaign.nights) {
    const omens = OMENS[tierForPercent(night.dreadTargetPercent)];
    const omen = omens[rng.next(omens.length)];
    const add = (kind, text) => beats.push({
      index: beats.length, nightNumber: night.number, kind, text, dreadPercent: night.dreadTargetPercent,
      sky: night.sky, weather: night.weather, durationMs: beatDurationMs(text.length),
    });
    add('title', `Night ${night.number}: ${night.title}`);
    add('rumor', night.rumor);
    add('lore', night.lore);
    add('omen', omen);
    add('weather', `${phraseFor(SKY_NAMES, SKY_PHRASES, night.sky)} ${phraseFor(WEATHER_NAMES, WEATHER_PHRASES, night.weather)}`);
  }
  return beats;
}

export function clampBeat(index, count) {
  if (!(count > 0)) return 0;
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.max(0, Math.min(count - 1, i));
}

export const nextBeat = (index, count) => clampBeat(clampBeat(index, count) + 1, count);
export const prevBeat = (index, count) => clampBeat(clampBeat(index, count) - 1, count);

/** Index of the title beat of the given night; out of range nights clamp to the first or last night. */
export function nightStartIndex(beats, night) {
  let found = 0;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i].kind === 'title' && beats[i].nightNumber <= night) found = i;
  }
  return found;
}

const intParam = (v) => (/^\d{1,6}$/.test(v) ? parseInt(v, 10) : null);

/** Parses '#story=1&beat=3', '?story=2' or 'story=1'. Bad input gives { on: false, night: 1, beat: 0 }. */
export function parseStoryParam(hashOrQuery) {
  const off = { on: false, night: 1, beat: 0 };
  if (typeof hashOrQuery !== 'string') return off;
  const params = new URLSearchParams(hashOrQuery.replace(/^[#?]/, ''));
  const story = intParam(params.get('story') ?? '');
  if (story === null || story < 1) return off;
  const beat = intParam(params.get('beat') ?? '');
  return { on: true, night: Math.min(9, story), beat: beat === null ? 0 : beat };
}
