// Original procedural textures as raw RGBA pixels: no assets, no DOM, no Math.random. Same kind, size and colours give identical bytes.
// Every texture tiles seamlessly (all writes and all noise wrap). Used by the 2D canvas patterns (textures.js) and as the default 3D surfaces
// (view3d.js): timber framed plaster walls, stone blocks, slate or shingle roofs, cobbles and wet mud. Mean brightness is about 0.6 so the
// 3D shader's x1.6 keeps colours steady. The 3D material scale is one tile per storey (3 m) for walls and 2 m for cobbles.
import { SeededRandom } from './core.js';

export const TEXTURE_KINDS = ['brick', 'plaster', 'roof', 'wood', 'stone', 'water', 'ground', 'timber', 'cobble'];

/** Default [lit, shaded] colours per kind (0..255): dusky, damp and desaturated for the foggy coast. For timber, shaded is the beam colour; for cobble, the mud between the stones. */
export const TEXTURE_COLORS = {
  brick: [[158, 96, 80], [104, 66, 58]], plaster: [[176, 166, 148], [128, 122, 112]], roof: [[118, 84, 78], [74, 54, 54]],
  wood: [[132, 98, 70], [84, 62, 46]], stone: [[160, 161, 168], [112, 115, 124]], water: [[84, 120, 132], [46, 76, 92]], ground: [[146, 152, 132], [96, 106, 90]],
  timber: [[176, 166, 148], [74, 52, 38]], cobble: [[158, 156, 150], [82, 74, 66]],
};

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const KIND_SALT = Object.fromEntries(TEXTURE_KINDS.map((k, i) => [k, 977 * (i + 1) + k.charCodeAt(0)]));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t) => t * t * (3 - 2 * t);

/** Returns { size, data: Uint8Array(size*size*4) }. Throws for an unknown kind. */
export function proceduralTexture(kind, { size = 64, lit = null, shaded = null } = {}) {
  if (!TEXTURE_KINDS.includes(kind)) throw new Error(`proc-textures: unknown kind "${kind}"`);
  const [dl, ds] = TEXTURE_COLORS[kind];
  const L = lit || dl, S = shaded || ds, r = new SeededRandom(KIND_SALT[kind]);
  const data = new Uint8Array(size * size * 4);
  const wrap = (v) => ((v % size) + size) % size;
  const u = size / 64;
  const put = (x, y, c, t = 0) => { const i = (wrap(y | 0) * size + wrap(x | 0)) * 4; data[i] = clamp(c[0] + t); data[i + 1] = clamp(c[1] + t); data[i + 2] = clamp(c[2] + t); data[i + 3] = 255; };
  const rect = (x0, y0, w, h, c, t = 0) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, c, t); };
  /** Blend a colour over what is already there (alpha 0..1), wrapping. */
  const over = (x, y, c, a) => { const i = (wrap(y | 0) * size + wrap(x | 0)) * 4; data[i] = clamp(data[i] + (c[0] - data[i]) * a); data[i + 1] = clamp(data[i + 1] + (c[1] - data[i + 1]) * a); data[i + 2] = clamp(data[i + 2] + (c[2] - data[i + 2]) * a); };
  const shade = (x, y, t) => { const i = (wrap(y | 0) * size + wrap(x | 0)) * 4; data[i] = clamp(data[i] + t); data[i + 1] = clamp(data[i + 1] + t); data[i + 2] = clamp(data[i + 2] + t); };
  const speckle = (amount) => { for (let i = 0; i < size * size * 4; i += 4) { const t = r.next(amount * 2 + 1) - amount; data[i] = clamp(data[i] + t); data[i + 1] = clamp(data[i + 1] + t); data[i + 2] = clamp(data[i + 2] + t); } };

  /** Tileable value noise with px by py lattice cells across the tile; returns f(x, y) in 0..1 for pixel coordinates. */
  const makeNoise = (px, py) => {
    const lat = new Float32Array(px * py);
    for (let i = 0; i < lat.length; i++) lat[i] = r.next(1000) / 1000;
    return (x, y) => {
      const fx = (wrap(x) / size) * px, fy = (wrap(y) / size) * py, ix = Math.floor(fx), iy = Math.floor(fy), tx = smooth(fx - ix), ty = smooth(fy - iy);
      const a = lat[(iy % py) * px + (ix % px)], b = lat[(iy % py) * px + ((ix + 1) % px)], c = lat[(((iy + 1) % py) * px) + (ix % px)], d = lat[(((iy + 1) % py) * px) + ((ix + 1) % px)];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  };
  /** Three octaves of tileable noise, 0..1, with `cells` lattice cells across at the coarsest octave. */
  const makeFbm = (cells) => {
    const n1 = makeNoise(cells, cells), n2 = makeNoise(cells * 2, cells * 2), n3 = makeNoise(cells * 4, cells * 4);
    return (x, y) => n1(x, y) * 0.5 + n2(x, y) * 0.3 + n3(x, y) * 0.2;
  };

  /** Plaster: mottled lime wash with fine grain, vertical grime streaks and a few hairline cracks. Drawn over the whole tile. */
  const paintPlaster = (base, dark) => {
    const mottle = makeFbm(4), streak = makeNoise(Math.max(8, 16 * u | 0), 2);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const m = mottle(x, y), s = streak(x, y);
      put(x, y, mix(base, dark, 0.18 + 0.3 * m + 0.35 * Math.max(0, s - 0.55)), (m - 0.5) * 14);
    }
    for (let i = 0; i < 3; i++) { let cx = r.next(size), cy = r.next(size); for (let k = 0; k < size / 4; k++) { shade(cx, cy, -34); cx += r.next(3) - 1; cy += 1; } }
  };

  if (kind === 'plaster') {
    paintPlaster(L, S);
  } else if (kind === 'timber') {
    // One storey bay: plaster panels in a dark oak frame (sill and floor beams across the tile edge, a post at the edge and one in the middle, two braces).
    paintPlaster(L, [L[0] * 0.55, L[1] * 0.5, L[2] * 0.45]);
    const grain = makeNoise(Math.max(4, 4 * u | 0), Math.max(16, 24 * u | 0)), beam = Math.round(9 * u), post = Math.round(8 * u), half = size / 2;
    const timberAt = (x, y, w, tone) => { const g = grain(x, y); put(x, y, mix(S, [S[0] * 1.5, S[1] * 1.45, S[2] * 1.4], g * 0.8), tone); return g; };
    // shadow cast on the plaster below each beam and right of each post first, so the oak lies over it
    for (let x = 0; x < size; x++) for (let k = 0; k < 4 * u; k++) { over(x, beam / 2 + k, [20, 16, 12], 0.34 * (1 - k / (4 * u))); over(x, half + beam / 2 + k, [20, 16, 12], 0.0); }
    for (let y = 0; y < size; y++) for (let k = 0; k < 3 * u; k++) over(post / 2 + k, y, [20, 16, 12], 0.26 * (1 - k / (3 * u)));
    for (let y = -Math.floor(beam / 2); y < beam - Math.floor(beam / 2); y++) for (let x = 0; x < size; x++) timberAt(x, y, beam, y === -Math.floor(beam / 2) ? 18 : 0);
    for (const px of [0, half]) for (let x = -Math.floor(post / 2); x < post - Math.floor(post / 2); x++) for (let y = 0; y < size; y++) timberAt(px + x, y, post, x === -Math.floor(post / 2) ? 14 : 0);
    // braces: a diagonal from the lower left corner joint to the middle post head, and its mirror to the right
    const bw = Math.round(5 * u);
    for (let t = 0; t < half - beam; t++) for (let w = 0; w < bw; w++) {
      timberAt(Math.round(post / 2 + t * 0.92), Math.round(beam / 2 + (half - beam) - t + w * 0.7), bw, 0);
      timberAt(Math.round(size - post / 2 - t * 0.92), Math.round(beam / 2 + (half - beam) - t + w * 0.7), bw, 0);
    }
    for (let i = 0; i < 24 * u; i++) { const nx = r.next(size), ny = r.next(size); if (data[(wrap(ny) * size + wrap(nx)) * 4] < 110) put(nx, ny, [24, 18, 14], 0); } // dark nail heads
  } else if (kind === 'brick') {
    const rows = 8 * u | 0, rh = size / rows | 0, bw = 16 * u | 0, mortar = mix(L, [200, 196, 186], 0.55), grime = makeFbm(4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, mortar, (grime(x, y) - 0.5) * -26);
    for (let row = 0; row < rows; row++) for (let col = 0; col < size / bw; col++) {
      const t = r.next(40) - 20, c = mix(L, S, r.next(100) / 260), ox = (row % 2) * (bw / 2);
      for (let y = 0; y < rh - 1; y++) for (let x = 0; x < bw - 1; x++) put(col * bw + ox + x, row * rh + y, c, t + (y === 0 ? 10 : y === rh - 2 ? -12 : 0) + (grime(col * bw + x, row * rh + y) - 0.5) * -22);
    }
  } else if (kind === 'roof') {
    // Overlapping slate or shingle courses with a scalloped lower edge: each course is painted over the one above it.
    const rh = Math.round(16 * u), sw = Math.round(14 * u), rows = Math.ceil(size / rh), moss = makeFbm(4);
    const slate = [mix(S, L, 0.55), mix(S, L, 0.85), mix(S, L, 1.15)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, S, -10);
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * Math.round(sw / 2), cols = Math.ceil(size / sw) + 1;
      for (let col = 0; col < cols; col++) {
        const tone = slate[r.next(3)], t = r.next(30) - 15, x0 = col * sw + off - sw, wob = r.next(3);
        for (let x = 1; x < sw; x++) {
          const edge = Math.round(rh + 3 * u - 3 * u * Math.pow(Math.abs(x / sw - 0.5) * 2, 2)); // scalloped bottom
          for (let y = 0; y < edge; y++) {
            const along = y / edge, m = moss(x0 + x, row * rh + y);
            let tt = t + (1 - along) * 10 - along * along * 14 - (y > edge - 3 * u ? 18 : 0);
            if (m > 0.62) tt -= 12;
            put(x0 + x, row * rh + y + wob - 1, tone, tt);
          }
        }
        for (let y = 0; y < rh; y++) put(x0, row * rh + y + wob - 1, S, -36); // gap between slates
      }
    }
  } else if (kind === 'wood') {
    // Vertical planks: every plank has its own tone and grain, dark gaps and a nail at each end.
    const pw = Math.round(8 * u), grain = makeNoise(Math.max(4, 8 * u | 0), Math.max(8, 4 * u | 0));
    for (let p = 0; p < Math.ceil(size / pw); p++) {
      const tone = mix(S, L, 0.35 + r.next(60) / 100), t = r.next(24) - 12;
      for (let x = 0; x < pw; x++) for (let y = 0; y < size; y++) put(p * pw + x, y, tone, t + (grain(p * pw + x, y) - 0.5) * 38 + (x === 0 ? -26 : x === pw - 1 ? 8 : 0));
      put(p * pw + pw / 2, 3 * u, [30, 26, 24]); put(p * pw + pw / 2, size - 4 * u, [30, 26, 24]);
    }
    for (let i = 0; i < 3; i++) { const kx = r.next(size), ky = r.next(size); for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) if ((x * x) / 4 + (y * y) / 9 <= 1) over(kx + x, ky + y, [38, 28, 20], 0.7); }
  } else if (kind === 'stone') {
    // Coursed blocks: rows of unequal height, blocks of unequal width, lighter top edge, mortar lines, pits and damp staining.
    const damp = makeFbm(4), mortar = mix(S, [60, 58, 56], 0.5);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, mortar);
    let y0 = 0;
    while (y0 < size) {
      let rh = Math.round((14 + r.next(10)) * u); if (size - y0 - rh < 10 * u) rh = size - y0;
      let x0 = -r.next(Math.round(16 * u));
      while (x0 < size) {
        let bw = Math.round((16 + r.next(22)) * u); if (x0 + bw > size - 8 * u && x0 + bw < size + 8 * u) bw = size - x0 + (x0 < 0 ? 0 : 0);
        const tone = mix(S, L, 0.25 + r.next(75) / 100), t = r.next(26) - 13;
        for (let y = 1; y < rh - 1; y++) for (let x = 1; x < bw - 1; x++) {
          const d = (damp(x0 + x, y0 + y) - 0.5) * -34, edge = y === 1 ? 16 : x === 1 ? 8 : y === rh - 2 ? -18 : x === bw - 2 ? -10 : 0;
          put(x0 + x, y0 + y, tone, t + d + edge);
        }
        x0 += bw;
      }
      y0 += rh;
    }
    for (let i = 0; i < 26 * u * u; i++) put(r.next(size), r.next(size), S, -30); // pits
  } else if (kind === 'water') {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const w = Math.sin(((x + y * 0.5) / size) * Math.PI * 4) * 0.5 + Math.sin((y / size) * Math.PI * 8) * 0.5;
      put(x, y, w > 0.35 ? L : S, w * 14);
    }
  } else if (kind === 'cobble') {
    // Worley cells on a jittered grid: each cell is a rounded stone, domed in the middle, with dark mud in the joints.
    const g = Math.max(4, Math.round(7 * u)), cell = size / g, pts = [], tones = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) { pts.push([(i + 0.2 + r.next(60) / 100) * cell, (j + 0.2 + r.next(60) / 100) * cell]); tones.push([r.next(100) / 100, r.next(30) - 15]); }
    const grit = makeFbm(8);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let d1 = 1e9, d2 = 1e9, k1 = 0;
      const gi = Math.floor(x / cell), gj = Math.floor(y / cell);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ci = (gi + di + g) % g, cj = (gj + dj + g) % g, p = pts[cj * g + ci], px = p[0] + (gi + di - ci) * cell, py = p[1] + (gj + dj - cj) * cell;
        const d = Math.hypot(x - px, y - py);
        if (d < d1) { d2 = d1; d1 = d; k1 = cj * g + ci; } else if (d < d2) d2 = d;
      }
      const edge = (d2 - d1) / cell, tone = mix(S, L, 0.35 + tones[k1][0] * 0.65);
      const body = smooth(Math.min(1, edge / 0.28)), dome = 1 - Math.min(1, d1 / (cell * 0.75));
      put(x, y, mix(S, tone, body), body * (tones[k1][1] + dome * 26 - 10) + (grit(x, y) - 0.5) * 22 - (1 - body) * 14);
    }
  } else { // ground: wet mud. Low frequency tone, puddles with a sheen, ruts of lighter silt, pebbles and a few grass flecks. No big dark patches.
    const tone = makeFbm(4), fine = makeNoise(Math.round(16 * u), Math.round(16 * u)), puddle = makeNoise(3, 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const t = tone(x, y), f = fine(x, y), pd = puddle(x, y);
      put(x, y, mix(S, L, 0.35 + 0.45 * t), (f - 0.5) * 26);
      if (pd > 0.62) { const k = Math.min(1, (pd - 0.62) / 0.12); over(x, y, [70, 84, 92], 0.32 * k); shade(x, y, 6 * k * (f > 0.55 ? 1 : 0)); } // standing water: smooth and cool, with the odd glint
    }
    for (let i = 0; i < 70 * u * u; i++) { const px = r.next(size), py = r.next(size), c = r.next(2) ? [186, 178, 160] : [120, 112, 98]; put(px, py, c, r.next(24) - 12); put(px + 1, py + 1, S, -34); }
    for (let i = 0; i < 18 * u; i++) { const gx = r.next(size), gy = r.next(size); for (let k = 0; k < 3; k++) put(gx + k - 1, gy - k, [96, 126, 82], -4); }
  }
  speckle(kind === 'water' ? 3 : kind === 'timber' || kind === 'cobble' ? 4 : 5);
  return { size, data };
}
