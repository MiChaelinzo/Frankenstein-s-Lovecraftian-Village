// JS port of Core/GameClock.cs. Integer-only; one tick is one village minute.
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
