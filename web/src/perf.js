// Frame-time statistics for the optional performance HUD. Pure; app.js feeds it timestamps.
import { queryParam } from './util.js';
export function createPerf(capacity = 120) {
  const times = [], cpu = []; let last = null;
  return {
    sample(now) {
      if (last !== null && now > last) { times.push(now - last); if (times.length > capacity) times.shift(); }
      last = now;
    },
    /** JavaScript time spent building and submitting one frame (not GPU time): separates CPU work from fill rate when reading the HUD. */
    cpuSample(ms) { cpu.push(ms); if (cpu.length > capacity) cpu.shift(); },
    reset() { times.length = 0; cpu.length = 0; last = null; },
    stats() {
      if (!times.length) return { fps: 0, avgMs: 0, maxMs: 0, frames: 0, cpuMs: 0 };
      const sum = times.reduce((a, b) => a + b, 0), avg = sum / times.length;
      return { fps: 1000 / avg, avgMs: avg, maxMs: Math.max(...times), frames: times.length, cpuMs: cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0 };
    },
  };
}
export const perfWanted = (search, hash) => queryParam(search, 'perf') === '1' || queryParam(hash, 'perf') === '1';
export const perfText = (s) => (s.frames ? `${s.fps.toFixed(0)} fps | ${s.avgMs.toFixed(1)} ms avg | ${s.maxMs.toFixed(1)} ms max${s.cpuMs > 0 ? ` | ${s.cpuMs.toFixed(1)} ms js` : ''}` : 'perf: waiting for frames');
