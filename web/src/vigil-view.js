// Pure view-model helpers for the Vigil: objective text, ending dialog model, result card art and the endings-found record.
// No DOM here and no rules: every number comes from VigilState / the Core mirror in core.js, so node tests can pin it.
import { SeededRandom, VIGIL_ENDING_IDS, VIGIL_LAMPS_PER_NIGHT, VIGIL_HIDDEN_LETTER } from './core.js';

export const ENDINGS_KEY = 'flv.endings.v1';
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** What the objective line shows. Counts are for tonight; the name is the masked Ritual name. */
export function objectiveModel(vigil) {
  const finished = vigil.isFinished;
  return {
    finished, night: vigil.night, nights: vigil.nightsTotal,
    clues: vigil.nightClueIds.size, target: vigil.clueTarget,
    lit: vigil.nightLampIds.size, lamps: VIGIL_LAMPS_PER_NIGHT,
    name: vigil.revealedName, canEndure: vigil.canEndureNight,
  };
}
export function objectiveText(m, tr) {
  return tr('vigil.objective', { night: m.night, nights: m.nights, clues: m.clues, target: m.target, lit: m.lit, lamps: m.lamps, name: m.name });
}

/**
 * How each lantern reads on the 2D board. Lit ones carry a flame. While the night still wants lanterns, the next unlit ones in candle()
 * order (layout order) are 'reachable' and get a ring; every other lantern is a faint 'sconce' with no ring, so the board never promises a lantern the night cannot use.
 */
export function lampMarkerStates(lamps, litIds, perNight = VIGIL_LAMPS_PER_NIGHT) {
  let slots = Math.max(0, perNight - litIds.size);
  return lamps.map((l) => {
    if (litIds.has(l.id)) return { id: l.id, pos: l.pos, state: 'lit' };
    if (slots > 0) { slots--; return { id: l.id, pos: l.pos, state: 'reachable' }; }
    return { id: l.id, pos: l.pos, state: 'sconce' };
  });
}

/** Flame brightness 0.75..1 from time in ms; a slow uneven shimmer per lantern, a steady 1 with reduced motion. */
export function flameFlicker(timeMs, index, reduced) {
  if (reduced) return 1;
  const t = timeMs / 1000;
  return 0.875 + 0.075 * Math.sin(t * 5.3 + index * 1.7) + 0.05 * Math.sin(t * 11.1 + index * 0.9);
}

/** Strips the middle dots so a screen reader hears only the letters found so far. */
export const spokenName = (name) => String(name).split(VIGIL_HIDDEN_LETTER).join(' ').replace(/\s+/g, ' ').trim();

/** Ending dialog content from an outcome (VigilState.outcome) plus the facts only the app knows. */
export function endingModel(outcome, { vigil, villageName, seed, found, stageCount }) {
  return {
    id: outcome.endingId, score: outcome.score, rank: outcome.rank, rankName: outcome.rankName, code: outcome.code,
    villageName, seed, name: vigil.revealedName, named: outcome.named,
    clues: outcome.clues, lanterns: outcome.lanterns, nightsEndured: outcome.nightsEndured, nightsTotal: vigil.nightsTotal,
    stage: Math.max(0, vigil.ritualStage + 1), stageCount, sanity: outcome.sanity, found, foundTotal: VIGIL_ENDING_IDS.length,
  };
}
/** Which ending cue plays: the dawn and the witness end warm; the hollowing, the spoken name, the fever and the vessel end cold. */
export const endingCueKind = (endingId) => (endingId === 'dawn' || endingId === 'witness' ? 'ending-warm' : 'ending-cold');
export function endingStatsText(m, tr) {
  return tr('vigil.end.stats', { clues: m.clues, lanterns: m.lanterns, nights: m.nightsEndured, total: m.nightsTotal, stage: m.stage, stages: m.stageCount, sanity: m.sanity });
}

/** Text for the Copy result button: one readable line, the parseable result code, then the link. */
export function resultText(m, title, link) {
  return `${m.villageName} | ${title} | ${m.rankName} ${m.score} | ${m.code}${link ? `\n${link}` : ''}`;
}
export const resultCardFilename = (seed, endingId) => `vigil-${seed}-${endingId}.png`;

// ---------- endings found (a small localStorage record, tolerant of a missing storage) ----------

/** Parses the stored comma list; unknown ids are dropped, order follows the ending definition order. */
export function parseEndingsFound(text) {
  const have = new Set(typeof text === 'string' ? text.split(',') : []);
  return VIGIL_ENDING_IDS.filter((id) => have.has(id));
}
export function loadEndingsFound(storage) {
  if (!storage) return [];
  try { return parseEndingsFound(storage.getItem(ENDINGS_KEY)); } catch { return []; }
}
/** Records an ending and returns the full list found so far. Storage failures are reported through onError, never swallowed silently. */
export function recordEnding(storage, id, onError = null) {
  const found = new Set(loadEndingsFound(storage));
  if (VIGIL_ENDING_IDS.includes(id)) found.add(id);
  const list = VIGIL_ENDING_IDS.filter((e) => found.has(e));
  if (storage) { try { storage.setItem(ENDINGS_KEY, list.join(',')); } catch (err) { if (onError) onError(err); } }
  return list;
}

// ---------- result card: original art drawn procedurally ----------

const PALETTES = {
  hollowing: ['#050808', '#16201f', '#3b4a46'], name_spoken: ['#0a1214', '#1f4a4a', '#e6d9a8'], dawn: ['#0b1115', '#3a4a52', '#e8c98f'],
  fever: ['#120a0c', '#4a2630', '#c9805f'], witness: ['#090b12', '#2a3050', '#9fb0d8'], vessel: ['#0b0a10', '#3a2a50', '#a889c9'],
};

/**
 * Draws the 1200x630 card. Same seed and ending give the same picture. m = { id, villageName, title, rankName, score, code, seed, name, epitaph }.
 * Only 2D context calls are used so a recording stub can test it.
 */
export function drawResultCard(g, m, w = CARD_WIDTH, h = CARD_HEIGHT) {
  const [top, mid, glow] = PALETTES[m.id] || PALETTES.dawn;
  const rng = new SeededRandom(((m.seed | 0) * 131 + VIGIL_ENDING_IDS.indexOf(m.id) * 977 + 5) | 0);
  const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, top); sky.addColorStop(0.62, mid); sky.addColorStop(1, '#030506');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { g.globalAlpha = 0.2 + rng.next(60) / 100; g.fillStyle = '#dfe8e4'; g.fillRect(rng.next(w), rng.next(Math.floor(h * 0.5)), 2, 2); }
  g.globalAlpha = 1;
  const mx = w * (0.58 + rng.next(20) / 100), my = h * 0.26;
  const halo = g.createRadialGradient(mx, my, 6, mx, my, 150); halo.addColorStop(0, glow); halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = halo; g.globalAlpha = 0.55; g.fillRect(mx - 160, my - 160, 320, 320); g.globalAlpha = 1;
  g.fillStyle = glow; g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill();
  const sea = Math.floor(h * 0.62);
  g.fillStyle = '#04090a'; g.fillRect(0, sea, w, h - sea);
  g.strokeStyle = mid; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = sea + 12 + i * 20; g.globalAlpha = 0.55 - i * 0.05; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x / 70 + i + rng.next(10) / 10) * 5);
    g.stroke();
  }
  g.globalAlpha = 1;
  // a slow tentacle rising from the sea: more of it the worse the ending
  const reach = m.id === 'name_spoken' ? 0 : m.id === 'dawn' ? 1 : m.id === 'hollowing' || m.id === 'vessel' ? 4 : 2;
  g.strokeStyle = '#020405'; g.lineCap = 'round';
  for (let k = 0; k < reach; k++) {
    const bx = w * (0.15 + 0.2 * k + rng.next(8) / 100); g.lineWidth = 16; g.beginPath(); g.moveTo(bx, sea + 30);
    g.bezierCurveTo(bx - 30, sea - 90, bx + 70, sea - 130 - rng.next(60), bx + 10, sea - 210 - rng.next(70)); g.stroke();
  }
  // a few village roofs and one lit window on the far shore
  g.fillStyle = '#020405';
  for (let i = 0; i < 7; i++) { const x = 40 + i * 60 + rng.next(20), bw = 34 + rng.next(24), bh = 24 + rng.next(30); g.fillRect(x, sea - bh, bw, bh); g.beginPath(); g.moveTo(x - 4, sea - bh); g.lineTo(x + bw / 2, sea - bh - 16); g.lineTo(x + bw + 4, sea - bh); g.fill(); }
  g.fillStyle = glow; g.fillRect(60 + rng.next(200), sea - 18, 6, 8);
  const shade = g.createLinearGradient(0, h * 0.42, 0, h); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.78)');
  g.fillStyle = shade; g.fillRect(0, h * 0.42, w, h * 0.58);
  g.textAlign = 'center'; g.fillStyle = '#cfd8d3';
  g.font = 'italic 30px Georgia, serif'; g.fillText(m.villageName, w / 2, 62);
  g.fillStyle = glow; g.font = 'bold 54px Georgia, serif'; g.fillText(m.title, w / 2, 372);
  g.fillStyle = '#cfd8d3'; g.font = '28px Georgia, serif'; g.fillText(`${m.rankName}  |  ${m.score}`, w / 2, 424);
  g.font = 'italic 22px Georgia, serif'; g.fillStyle = '#9db0aa'; g.fillText(m.name, w / 2, 466);
  g.font = '18px monospace'; g.fillStyle = '#7f918b'; g.fillText(`${m.code}   seed ${m.seed}`, w / 2, h - 28);
}
