// Frame-time statistics for the optional performance HUD. Pure; app.js feeds it timestamps.
export function createPerf(capacity = 120) {
  const times = []; let last = null;
  return {
    sample(now) {
      if (last !== null && now > last) { times.push(now - last); if (times.length > capacity) times.shift(); }
      last = now;
    },
    reset() { times.length = 0; last = null; },
    stats() {
      if (!times.length) return { fps: 0, avgMs: 0, maxMs: 0, frames: 0 };
      const sum = times.reduce((a, b) => a + b, 0), avg = sum / times.length;
      return { fps: 1000 / avg, avgMs: avg, maxMs: Math.max(...times), frames: times.length };
    },
  };
}
export const perfWanted = (search, hash) => new URLSearchParams(String(search || '')).get('perf') === '1' || new URLSearchParams(String(hash || '').replace(/^#/, '')).get('perf') === '1';
export const perfText = (s) => (s.frames ? `${s.fps.toFixed(0)} fps | ${s.avgMs.toFixed(1)} ms avg | ${s.maxMs.toFixed(1)} ms max` : 'perf: waiting for frames');
