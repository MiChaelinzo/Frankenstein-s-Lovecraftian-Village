import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WEATHER_NAMES, weatherForDay, weatherIndexForDay, hasLightning, precipitationPercent } from '../src/clock.js';
import { generateCampaign } from '../src/core.js';
import { WEATHER_LOOK, weatherLook, windState, precipitationStyle, flashSky, decayFlash, particleCounts, fogDensity, skyColors, FRAME_BUDGET } from '../src/view3d-math.js';
import { stormFlash, thunderDelayMs, applyFlash, weatherFor, FLASH_MAX, FLASH_MIN_GAP_MS } from '../src/scene.js';
import { buildStory } from '../src/story.js';
import { STRINGS, t } from '../src/i18n.js';
import { weatherNameL } from '../src/i18n-text.js';
import { weatherAudio, thunderParams } from '../src/music.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')).villagers.weather;

test('weather sequence matches C# GameClock.WeatherForDay', () => {
  assert.deepEqual(WEATHER_NAMES, golden.names);
  for (const [seed, ...days] of golden.days) {
    days.forEach((idx, i) => assert.equal(weatherIndexForDay(seed, i - 3), idx, `seed ${seed} day ${i - 3}`));
  }
});

test('campaign nights take their weather from the per-day sequence', () => {
  const c = generateCampaign(1818, 9);
  c.nights.forEach((n, i) => assert.equal(n.weather, weatherForDay(1818, i)));
  assert.ok(buildStory(c).every((b) => WEATHER_NAMES.includes(b.weather)));
  for (const b of buildStory(c).filter((x) => x.kind === 'weather')) assert.ok(b.text.length > 20);
});

test('only storms throw lightning, and precipitation rises with the sky', () => {
  assert.deepEqual(WEATHER_NAMES.filter(hasLightning), ['storm']);
  assert.ok(precipitationPercent('drizzle') < precipitationPercent('rain') && precipitationPercent('rain') < precipitationPercent('storm'));
});

test('every weather has a look, names in en and fr, and 2D flags', () => {
  for (const w of WEATHER_NAMES) {
    assert.ok(WEATHER_LOOK[w], w);
    assert.ok(`weather.${w}` in STRINGS.en && `weather.${w}` in STRINGS.fr, w);
    assert.notEqual(weatherNameL(w, 'fr'), '');
    assert.doesNotMatch(t(`weather.${w}`, 'fr'), /[^\x20-\x7e]/);
  }
  assert.equal(weatherNameL('fog', 'en'), 'heavy fog');
  assert.deepEqual(weatherFor('storm'), { rain: true, fog: false });
  assert.deepEqual(weatherFor('mist'), { rain: false, fog: true });
  assert.deepEqual(weatherFor('overcast'), { rain: false, fog: false });
  assert.equal(weatherLook('???'), WEATHER_LOOK.clear);
});

test('fog and sky ordering across the new weathers, particles stay in budget', () => {
  assert.ok(fogDensity({ weather: 'fog' }) > fogDensity({ weather: 'mist' }) && fogDensity({ weather: 'mist' }) > fogDensity({ weather: 'overcast' }));
  assert.ok(skyColors('night', 'storm').stars < skyColors('night', 'clear').stars);
  for (const w of WEATHER_NAMES) {
    const p = particleCounts({ weather: w, dread: 1, reduced: false });
    assert.ok(p.rain + p.mist + 120 + 100 <= FRAME_BUDGET.points, w);
    assert.deepEqual(particleCounts({ weather: w, dread: 1, reduced: true }), { rain: 0, mist: 0 });
  }
  assert.ok(particleCounts({ weather: 'drizzle', dread: 0 }).rain < particleCounts({ weather: 'rain', dread: 0 }).rain);
});

test('wind is deterministic, stronger in a storm, and still under reduced motion', () => {
  const a = windState({ weather: 'storm', seed: 7, timeSec: 3 });
  assert.deepEqual(a, windState({ weather: 'storm', seed: 7, timeSec: 3 }));
  assert.ok(a.base > windState({ weather: 'clear', seed: 7 }).base);
  const r1 = windState({ weather: 'storm', seed: 7, timeSec: 1, reduced: true }), r2 = windState({ weather: 'storm', seed: 7, timeSec: 9, reduced: true });
  assert.deepEqual(r1, r2);
  assert.ok(Math.abs(Math.hypot(...a.dir) - 1) < 1e-9);
  const rain = precipitationStyle('rain', a), drizzle = precipitationStyle('drizzle', a), storm = precipitationStyle('storm', a);
  assert.ok(storm.vel[1] < rain.vel[1] && rain.vel[1] < drizzle.vel[1]);
});

test('lightning respects the capped, rate-limited gate and reduced motion', () => {
  let slots = 0;
  const st = { flash: 0, flashAt: null, flashLevel: 0 };
  let last = -Infinity, started = 0;
  for (let ms = 0; ms < 600000; ms += 100) {
    const level = stormFlash(42, ms, 'storm');
    if (level > 0) slots++;
    assert.ok(level <= FLASH_MAX);
    if (applyFlash(st, level, ms)) { started++; assert.ok(ms - last >= FLASH_MIN_GAP_MS, 'no strobing'); last = ms; }
    assert.equal(stormFlash(42, ms, 'rain'), 0);
    assert.equal(stormFlash(42, ms, 'storm', true), 0, 'reduced motion never flashes');
  }
  assert.ok(started > 10 && started < 200, `bolts in ten minutes: ${started}`);
  assert.equal(stormFlash(42, 1234, 'storm'), stormFlash(42, 1234, 'storm'));
  assert.ok(thunderDelayMs(42, 5000) >= 400 && thunderDelayMs(42, 5000) <= 2200);
});

test('flash sky brightens, decays to zero, and leaves no flash untouched', () => {
  const sky = { zenith: [0, 0, 0.1], horizon: [0.1, 0.1, 0.2], fog: [0.1, 0.1, 0.2], ambient: [0.1, 0.1, 0.1] };
  assert.equal(flashSky(sky, 0), sky);
  assert.ok(flashSky(sky, 0.3).horizon[0] > sky.horizon[0]);
  assert.equal(decayFlash(0.3, 5), 0);
  assert.ok(decayFlash(0.3, 0.05) < 0.3 && decayFlash(0.3, 0.05) > 0);
});

test('weather audio: dry is silent, storm is loudest, thunder is farther and lower with delay', () => {
  assert.equal(weatherAudio('clear').rain, 0);
  assert.ok(weatherAudio('storm').rain > weatherAudio('rain').rain && weatherAudio('rain').rain > weatherAudio('drizzle').rain);
  assert.ok(thunderParams(2200).durMs > thunderParams(400).durMs && thunderParams(2200).freq < thunderParams(400).freq);
});
