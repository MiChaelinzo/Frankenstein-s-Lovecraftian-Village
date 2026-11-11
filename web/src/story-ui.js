// Story mode controller (beats from story.js; deep link #story=1&night=N&beat=N, beat is 0-based within the night).
import { storyMetaL } from './i18n-text.js';
import { buildStory, clampBeat, nextBeat, nightStartIndex, parseStoryParam } from './story.js';

export function createStoryController({ $, tr, lang, state, reduceMotion, optParam, renderCampaign, setSanity, pushHash }) {
  const story = { on: false, beats: [], idx: 0, playing: false, timer: 0, ramp: 0 };
  function storyBeats() {
    if (!story.beats.length && state.campaign) story.beats = buildStory(state.campaign);
    return story.beats;
  }
  function rampSanity(target) {
    clearTimeout(story.ramp);
    const from = state.sanity.value;
    if (reduceMotion || Math.abs(target - from) < 1) { setSanity(target, true); return; }
    let i = 0;
    const step = () => { i++; setSanity(i >= 8 ? target : from + ((target - from) * i) / 8, true); if (i < 8) story.ramp = setTimeout(step, 70); };
    step();
  }
  function showBeat(idx, user) {
    const beats = storyBeats(); if (!beats.length) return;
    story.idx = clampBeat(idx, beats.length);
    const b = beats[story.idx];
    const nightIdx = b.nightNumber - 1;
    if (nightIdx !== state.night) { state.night = nightIdx; renderCampaign(); }
    rampSanity(100 - b.dreadPercent);
    const start = nightStartIndex(beats, b.nightNumber);
    $('storyText').textContent = b.text;
    $('storyMeta').textContent = storyMetaL({ n: b.nightNumber, total: state.campaign.nights.length, b: story.idx - start + 1, c: beats.filter((x) => x.nightNumber === b.nightNumber).length, kind: b.kind, sky: b.sky, weather: b.weather, pct: b.dreadPercent }, lang);
    $('storyPrev').disabled = story.idx === 0;
    $('storyNext').disabled = story.idx >= beats.length - 1;
    pushHash();
    if (user) clearTimeout(story.timer);
    schedulePlay();
  }
  function schedulePlay() {
    clearTimeout(story.timer);
    if (!story.playing) return;
    const beats = storyBeats();
    if (story.idx >= beats.length - 1) { setPlaying(false); return; }
    story.timer = setTimeout(() => showBeat(nextBeat(story.idx, beats.length)), beats[story.idx].durationMs);
  }
  function setPlaying(p) {
    story.playing = p;
    $('storyPlay').textContent = tr(p ? 'btn.pause' : 'btn.play');
    $('storyPlay').setAttribute?.('aria-pressed', String(p));
    if (!p) clearTimeout(story.timer); else schedulePlay();
  }
  function openStory(idx, autoplay) {
    story.on = true; $('story').hidden = false;
    showBeat(idx, true);
    if (autoplay) setPlaying(true);
  }
  function closeStory() {
    story.on = false; setPlaying(false); clearTimeout(story.ramp); $('story').hidden = true; pushHash();
  }
  function toggleStory() { if (story.on) closeStory(); else openStory(nightStartIndex(storyBeats(), state.night + 1)); }
  function applyStoryHash() {
    const sp = parseStoryParam(location.hash || location.search);
    const q = parseStoryParam(location.search);
    const on = sp.on || q.on;
    if (!on) { if (story.on) closeStory(); return; }
    const beats = storyBeats();
    const hasNight = /(^|[#&?])night=/.test(location.hash);
    const night = hasNight ? state.night + 1 : (sp.on ? sp.night : q.night);
    const base = nightStartIndex(beats, night);
    const n = beats.filter((x) => x.nightNumber === beats[base].nightNumber).length;
    openStory(base + Math.min(n - 1, sp.on ? sp.beat : q.beat), optParam('autoplay') === '1');
  }
  return { story, storyBeats, showBeat, setPlaying, openStory, closeStory, toggleStory, applyStoryHash };
}
