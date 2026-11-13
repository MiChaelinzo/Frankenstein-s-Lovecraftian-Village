// Original procedural textures as raw RGBA pixels: no assets, no DOM, no Math.random. Same kind, size and colours give identical bytes.
// Every texture tiles seamlessly (all writes wrap). Used by the 2D canvas patterns (textures.js) and as the default 3D wall and ground
// textures (view3d.js), so the village has its own surfaces without any pack. Mean brightness is about 0.6 so the 3D shader's x1.6 keeps colours steady.
import { SeededRandom } from './core.js';

export const TEXTURE_KINDS = ['brick', 'plaster', 'roof', 'wood', 'stone', 'water', 'ground'];

/** Default [lit, shaded] colours per kind (0..255): dusky, damp and desaturated for the foggy coast. */
export const TEXTURE_COLORS = {
  brick: [[158, 96, 80], [104, 66, 58]], plaster: [[176, 166, 148], [128, 122, 112]], roof: [[118, 84, 78], [74, 54, 54]],
  wood: [[132, 98, 70], [84, 62, 46]], stone: [[160, 161, 168], [112, 115, 124]], water: [[84, 120, 132], [46, 76, 92]], ground: [[146, 152, 132], [96, 106, 90]],
};

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const KIND_SALT = Object.fromEntries(TEXTURE_KINDS.map((k, i) => [k, 977 * (i + 1) + k.charCodeAt(0)]));

/** Returns { size, data: Uint8Array(size*size*4) }. Throws for an unknown kind. */
export function proceduralTexture(kind, { size = 64, lit = null, shaded = null } = {}) {
  if (!TEXTURE_KINDS.includes(kind)) throw new Error(`proc-textures: unknown kind "${kind}"`);
  const [dl, ds] = TEXTURE_COLORS[kind];
  const L = lit || dl, S = shaded || ds, r = new SeededRandom(KIND_SALT[kind]);
  const data = new Uint8Array(size * size * 4);
  const wrap = (v) => ((v % size) + size) % size;
  const put = (x, y, c, t = 0) => { const i = (wrap(y) * size + wrap(x)) * 4; data[i] = clamp(c[0] + t); data[i + 1] = clamp(c[1] + t); data[i + 2] = clamp(c[2] + t); data[i + 3] = 255; };
  const rect = (x0, y0, w, h, c, t = 0) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, c, t); };
  const blob = (cx, cy, rx, ry, c, t) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) put(cx + x, cy + y, c, t); };
  const speckle = (amount) => { for (let i = 0; i < size * size * 4; i += 4) { const t = r.next(amount * 2 + 1) - amount; data[i] = clamp(data[i] + t); data[i + 1] = clamp(data[i + 1] + t); data[i + 2] = clamp(data[i + 2] + t); } };
  const u = size / 64;
  rect(0, 0, size, size, L);

  if (kind === 'brick') {
    const rows = 8 * u | 0, rh = size / rows | 0, bw = 16 * u | 0;
    for (let row = 0; row < rows; row++) for (let col = 0; col < size / bw; col++) rect(col * bw + (row % 2) * (bw / 2), row * rh, bw - 1, rh - 1, L, r.next(34) - 17);
    for (let row = 0; row < rows; row++) { rect(0, row * rh + rh - 1, size, 1, S, -22); for (let col = 0; col < size / bw; col++) rect(col * bw + (row % 2) * (bw / 2) + bw - 1, row * rh, 1, rh, S, -22); }
  } else if (kind === 'plaster') {
    for (let i = 0; i < 150 * u * u; i++) blob(r.next(size), r.next(size), 1 + r.next(3), 1 + r.next(2), i % 2 ? S : L, r.next(24) - 12);
    for (let i = 0; i < 5; i++) { const x = r.next(size); for (let y = 0; y < size / 3; y++) put(x + ((y / 5) | 0), y + r.next(size), S, -18); } // hairline cracks
  } else if (kind === 'roof') {
    const th = 16 * u | 0;
    for (let row = 0; row < size / th; row++) for (let col = 0; col < size / th; col++) {
      const t = r.next(26) - 13, ox = (row % 2) * (th / 2);
      rect(col * th + ox + 1, row * th + 1, th - 2, th - 2, L, t);
      rect(col * th + ox + 1, row * th + th - 4, th - 2, 3, S, t - 10); // shadowed lower lip of each tile
    }
    for (let row = 0; row < size / th; row++) rect(0, row * th, size, 1, S, -30);
  } else if (kind === 'wood') {
    const pw = 8 * u | 0;
    for (let p = 0; p < size / pw; p++) { rect(p * pw, 0, pw, size, L, r.next(30) - 15); rect(p * pw, 0, 1, size, S, -20); }
    for (let i = 0; i < 20 * u; i++) { const x = r.next(size), len = 8 + r.next(size / 2), y0 = r.next(size); for (let y = 0; y < len; y++) put(x + (y > len / 2 ? 1 : 0), y0 + y, S, -6); }
    for (let i = 0; i < 3; i++) blob(r.next(size), r.next(size), 2, 3, S, -34); // knots
  } else if (kind === 'stone') {
    for (let i = 0; i < 30 * u * u; i++) blob(r.next(size), r.next(size), 4 + r.next(7), 3 + r.next(5), r.next(2) ? L : S, r.next(30) - 15);
    for (let i = 0; i < 40 * u * u; i++) put(r.next(size), r.next(size), S, -30); // pits
  } else if (kind === 'water') {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const w = Math.sin(((x + y * 0.5) / size) * Math.PI * 4) * 0.5 + Math.sin((y / size) * Math.PI * 8) * 0.5;
      put(x, y, w > 0.35 ? L : S, w * 14);
    }
  } else { // ground: damp earth, dark patches and pebbles
    for (let i = 0; i < 40 * u * u; i++) blob(r.next(size), r.next(size), 3 + r.next(6), 2 + r.next(4), S, r.next(20) - 10);
    for (let i = 0; i < 60 * u * u; i++) blob(r.next(size), r.next(size), 1, 1, r.next(2) ? L : S, 22 - r.next(40));
  }
  speckle(kind === 'water' ? 3 : 7);
  return { size, data };
}
