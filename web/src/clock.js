// JS port of Core/GameClock.cs. Integer-only; one tick is one village minute.
import { SeededRandom } from './core.js'; // used only at call time, so the clock/core import cycle is harmless
export const DAWN_MINUTES = 240;
export const DAY_MINUTES = 600;
export const DUSK_MINUTES = 240;
export const NIGHT_MINUTES = 360;
export const PHASE_LENGTHS = [DAWN_MINUTES, DAY_MINUTES, DUSK_MINUTES, NIGHT_MINUTES];
export const MINUTES_PER_DAY = DAWN_MINUTES + DAY_MINUTES + DUSK_MINUTES + NIGHT_MINUTES;
export const PHASE_NAMES = ['dawn', 'day', 'dusk', 'night'];
export const FULL_DAYLIGHT_PERCENT = 100;
/** Where a play session's clock starts: the heart of dusk (mirror of GameClock.SessionStartTick). */
export const SESSION_START_TICK = DAWN_MINUTES + DAY_MINUTES + DUSK_MINUTES / 2;

/** Tick folded into [0, MINUTES_PER_DAY), also for negative ticks. */
export const wrapTick = (tick) => ((Math.trunc(tick) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
export const dayNumber = (tick) => Math.trunc((Math.trunc(tick) - wrapTick(tick)) / MINUTES_PER_DAY);
export const phaseStart = (phase) => PHASE_LENGTHS.slice(0, phase).reduce((a, b) => a + b, 0);

/** 0 dawn, 1 day, 2 dusk, 3 night. */
export function phaseAt(tick) {
  let t = wrapTick(tick);
  for (let i = 0; i < PHASE_LENGTHS.length; i++) {
    if (t < PHASE_LENGTHS[i]) return i;
    t -= PHASE_LENGTHS[i];
  }
  return 3;
}
export const isDaylight = (phase) => phase === 0 || phase === 1;

export function daylightPercent(tick) {
  const phase = phaseAt(tick);
  const t = wrapTick(tick) - phaseStart(phase);
  if (phase === 0) return Math.floor(FULL_DAYLIGHT_PERCENT * t / DAWN_MINUTES);
  if (phase === 1) return FULL_DAYLIGHT_PERCENT;
  if (phase === 2) return FULL_DAYLIGHT_PERCENT - Math.floor(FULL_DAYLIGHT_PERCENT * t / DUSK_MINUTES);
  return 0;
}
export const lanternsLit = (tick) => !isDaylight(phaseAt(tick));

// ---- Weather: one deterministic condition per village day (mirror of GameClock.WeatherForDay). ----
export const WEATHER_NAMES = ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog', 'mist'];
const WEATHER_WEIGHTS = [20, 20, 14, 16, 8, 12, 10];
export const WEATHER_PERSIST_PERCENT = 40;
const WEATHER_DAY_SALT = 0x9e3779b1 | 0;

function rollWeather(seed, day) {
  const rng = new SeededRandom(((seed | 0) ^ Math.imul(day | 0, WEATHER_DAY_SALT) ^ 0x3c6ef372) | 0);
  const keep = rng.next(100);
  let pick = rng.next(100), index = 0;
  for (let i = 0; i < WEATHER_WEIGHTS.length; i++) {
    if (pick < WEATHER_WEIGHTS[i]) { index = i; break; }
    pick -= WEATHER_WEIGHTS[i];
  }
  return { keep, index };
}
/** Weather index (into WEATHER_NAMES) for a village day. Pure in (seed, day). */
export function weatherIndexForDay(seed, day) {
  const today = rollWeather(seed, day);
  return today.keep >= WEATHER_PERSIST_PERCENT ? today.index : rollWeather(seed, day - 1).index;
}
export const weatherForDay = (seed, day) => WEATHER_NAMES[weatherIndexForDay(seed, day)];
/** Only a storm throws lightning. */
export const hasLightning = (weather) => weather === 'storm';
/** Precipitation strength 0..100: none, drizzle, steady rain, downpour. Unknown names count as dry. */
export const precipitationPercent = (weather) => ({ drizzle: 30, rain: 65, storm: 100 })[weather] ?? 0;
