// Opt-in first-person WebGL view (?view=3d). Dependency-free WebGL 1. All maths is in view3d-math.js, the village layout comes from
// core.js, meshes from glb.js and the interaction rules from InteractionRules in core.js. This file only owns GL objects, shaders,
// input listeners and the frame loop. Original shaders and geometry only: no DLNK assets or footage are used.
import { InteractionRules } from './core.js';
import { appendMeshVertices, loadMeshSet, VERTEX_FLOATS } from './glb.js';
import { mapGamepad, padAxes3d, snapshotPad, touchDrive, isTap } from './input.js';
import { createPerf } from './perf.js';
import {
  CELL, EYE_HEIGHT, FAR, FOV_Y, HALO_FLOATS, MAX_LIGHTS, DOCK_SEGMENT, FENCE_SEGMENT, LAMP_KINDS, coastProps, lampKind, carriedLantern, cameraBasis, coldFill, contactRings, lanternPool, lanternState, moonBoost, churchSite, coastFeatures, blendCamera, coastToWorld, eyeParams, fogLayers, fireflyCount, fireflySeeds, fireflyStyle, seaParams, smoothDrive, footfall, surfaceAt, coastCloseness, FIREFLY_FLOATS,
  forwardVector, frameCost, hazedSky, headBob, haloSprites, lanternColor, lanternFlicker, lanternLights, moonParams, nearestLights, postParams, nextScale, omenBlendWeight, omenFraming,
  particleCounts, particleSeeds, parseCamParam, pickBox, pickLamp, renderSize, screenRay, spawnPoint, stepCamera, tentacleBases, terrainRects,
  viewProjection, windowLit, worldBounds, worldBoxes,
} from './view3d-math.js';
import { omenTargets } from './scene.js';
import { tierFor } from './core.js';

const BOX_COLORS = { house_a: [0.42, 0.35, 0.3], house_b: [0.38, 0.33, 0.3], church: [0.4, 0.4, 0.42], well: [0.35, 0.36, 0.36], altar: [0.3, 0.3, 0.32], dead_tree: [0.2, 0.17, 0.14] };
const MESH_FOR = { house_a: 'house_a', house_b: 'house_b', church: 'church', well: 'well', altar: 'altar', dead_tree: 'dead_tree' };

// ---------- geometry (pure, tested without a GL context) ----------

function pushQuad(out, x0, z0, x1, z1, y, color, phase) {
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]]) out.push(x, y, z, 0, 1, 0, color[0], color[1], color[2], 0, phase);
}
function pushBox(out, p, cell, h, color) {
  const x0 = p.x * cell + 0.2, x1 = (p.x + p.sizeX) * cell - 0.2, z0 = p.z * cell + 0.2, z1 = (p.z + p.sizeZ) * cell - 0.2;
  const faces = [[[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1]], [[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0], [0, 0, -1]],
    [[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0]], [[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0]], [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0]]];
  for (const [a, b, c, d, n] of faces) for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], n[0], n[1], n[2], color[0], color[1], color[2], 0, 0);
}

// Frustum from a rectangle on the ground: the top rectangle is the base scaled about its centre by `taper` (0 = pyramid, 1 = box, >1 = flares out).
function pushFrustum(out, x0, z0, x1, z1, y0, y1, taper, color, glow = 0, phase = 0) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  const b = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], t = [[cx - hx * taper, y1, cz - hz * taper], [cx + hx * taper, y1, cz - hz * taper], [cx + hx * taper, y1, cz + hz * taper], [cx - hx * taper, y1, cz + hz * taper]];
  const vert = (v, n) => out.push(v[0], v[1], v[2], n[0], n[1], n[2], color[0], color[1], color[2], glow, phase);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = b[i], c = b[j], d = t[j], e = t[i];
    const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], w = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    for (const v of [a, c, d, a, d, e]) vert(v, nn);
  }
  if (taper > 0) for (const v of [t[0], t[1], t[2], t[0], t[2], t[3]]) vert(v, [0, 1, 0]);
}
/** Box in coast-local metres: u along the shore, v out to sea. Placed on whichever side the coast is. */
function pushCoastBlock(out, f, u0, u1, v0, v1, y0, y1, color, taper = 1) {
  const a = coastToWorld(f, u0, v0), b = coastToWorld(f, u1, v1);
  pushFrustum(out, Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), y0, y1, taper, color);
}

const WOOD = [0.2, 0.15, 0.11], WOOD_DARK = [0.11, 0.08, 0.06], ROCK = [0.17, 0.17, 0.19], FOAM = [0.46, 0.52, 0.54], SILHOUETTE = [0.05, 0.05, 0.08], EARTH = [0.07, 0.085, 0.07];

/** Width of a model along its long (X) axis in metres. */
const modelLength = (m) => m.bounds.max[0] - m.bounds.min[0] || 1;

/**
 * Shoreline foam, a plank dock on posts, two moored boats and a pair of stepped cliffs, plus fence runs on the land side. Original geometry,
 * all seeded by coastFeatures. With `meshes` (the committed Blender GLBs) the dock, boats, cliffs and fences use them; a missing mesh falls back
 * to the procedural boxes, so the shore is never empty.
 */
export function buildCoast({ gridW, gridD, seed, cell = CELL, meshes = null }) {
  const out = [], { frame: f, dock, boats, cliffs } = coastFeatures(gridW, gridD, seed, cell), props = coastProps(gridW, gridD, seed, cell);
  const along = f.axis === 'x' ? Math.PI / 2 : 0, seaward = f.axis === 'x' ? 0 : Math.PI / 2; // long axis along the shore, and out to sea
  const place = (kind, u, v, scale, rot) => {
    const w = coastToWorld(f, u, v);
    appendMeshVertices(out, meshes.get(kind), null, cell, { glow: 1, phase: u, scale, at: [w.x, w.z], rot });
  };
  const foam = [coastToWorld(f, f.lo - 12, 0), coastToWorld(f, f.hi + 12, 2.2)];
  pushQuad(out, Math.min(foam[0].x, foam[1].x), Math.min(foam[0].z, foam[1].z), Math.max(foam[0].x, foam[1].x), Math.max(foam[0].z, foam[1].z), -0.3, FOAM, 0);
  if (meshes && meshes.has('dock')) for (const seg of props.dockSegments) place('dock', seg.u, seg.v, DOCK_SEGMENT / modelLength(meshes.get('dock')), seaward);
  else {
    pushCoastBlock(out, f, dock.u - dock.width / 2, dock.u + dock.width / 2, -1, dock.length, 0.3, dock.deck + 0.3, WOOD);
    for (let i = 0; i < dock.posts; i++) for (const side of [-1, 1]) {
      const v = i * 3, u = dock.u + side * (dock.width / 2 + 0.1);
      pushCoastBlock(out, f, u - 0.15, u + 0.15, v - 0.15, v + 0.15, -0.8, 1.1, WOOD_DARK);
    }
  }
  if (meshes && meshes.has('fence')) for (const fe of props.fences) place('fence', fe.u, fe.v, FENCE_SEGMENT / modelLength(meshes.get('fence')), along);
  for (const b of boats) {
    if (meshes && meshes.has('boat')) { place('boat', b.u, b.v, b.len / modelLength(meshes.get('boat')), along + b.tilt * 0.2); continue; }
    pushCoastBlock(out, f, b.u - b.len / 2, b.u + b.len / 2, b.v - b.wid / 2, b.v + b.wid / 2, -0.25, 0.55, WOOD_DARK, 1.2);
    pushCoastBlock(out, f, b.u + b.tilt * b.len * 0.12 - 0.35, b.u + b.tilt * b.len * 0.12 + 0.35, b.v - 0.3, b.v + 0.3, 0.55, 1.25, WOOD);
    pushCoastBlock(out, f, b.u - 0.05, b.u + 0.05, b.v - 0.05, b.v + 0.05, 0.55, 3.1, WOOD_DARK);
  }
  if (meshes && meshes.has('cliff_rock')) {
    cliffs.forEach((c, i) => place('cliff_rock', c.u, c.v, c.h / (meshes.get('cliff_rock').bounds.max[1] || 1), i * 2.1));
    return new Float32Array(out);
  }
  cliffs.forEach((c, i) => {
    let y = -0.6, w = c.w, d = c.d;
    for (let tier = 0; tier < 3; tier++) {
      const h = (c.h * (tier === 0 ? 0.45 : 0.3)), shift = c.step * tier * 1.1, g = 0.9 + 0.1 * ((i + tier) % 2);
      pushCoastBlock(out, f, c.u + shift - w / 2, c.u + shift + w / 2, c.v - d / 2, c.v + d / 2, y, y + h, ROCK.map((v) => v * g), 0.78);
      y += h; w *= 0.62; d *= 0.62;
    }
  });
  return new Float32Array(out);
}

/** A hill and a church standing on it, drawn as a near black silhouette against the haze, with two dim lit windows. Original geometry. */
export function buildChurchHill({ gridW, gridD, seed, cell = CELL }) {
  const out = [], c = churchSite(gridW, gridD, seed, cell), x = c.x, z = c.z;
  pushFrustum(out, x - 22, z - 20, x + 22, z + 20, -0.5, 3.5, 0.72, EARTH);
  pushFrustum(out, x - 16, z - 14, x + 16, z + 14, 3.5, 6.5, 0.66, EARTH);
  pushFrustum(out, x - 10, z - 9, x + 10, z + 9, 6.5, c.hill, 0.7, EARTH);
  const y0 = c.hill;
  pushFrustum(out, x - 2.6, z - 5.5, x + 2.6, z + 5.5, y0, y0 + 4.6, 1, SILHOUETTE);
  pushFrustum(out, x - 3, z - 5.9, x + 3, z + 5.9, y0 + 4.6, y0 + 7.4, 0.12, SILHOUETTE);
  pushFrustum(out, x - 1.6, z + 5.5, x + 1.6, z + 8.7, y0, y0 + 11.5, 1, SILHOUETTE);
  pushFrustum(out, x - 1.9, z + 5.3, x + 1.9, z + 8.9, y0 + 11.5, y0 + 18, 0, SILHOUETTE);
  const face = x + c.faceX * 2.65, depth = 0.1;
  for (const wz of [z - 3, z + 0.2]) pushFrustum(out, Math.min(face, face + c.faceX * depth), wz - 0.45, Math.max(face, face + c.faceX * depth), wz + 0.45, y0 + 1.3, y0 + 3.2, 1, [0.9, 0.6, 0.28], 1, wz);
  return new Float32Array(out);
}

/**
 * Tentacles standing in the sea off the coast: tapered five sided tubes that sway (unless reduced) and redden with dread.
 * grow is the shared omen strength 0..1 (omenTargets), so they appear exactly when the 2D canvas shows them.
 */
export function buildTentacles({ bases, grow, dread, timeSec = 0, reduced = false }) {
  const out = [], SEG = 14, SIDES = 5, tint = [0.13, 0.17, 0.21].map((v, k) => v + ([0.38, 0.09, 0.15][k] - v) * Math.max(0, Math.min(1, dread)));
  bases.forEach((b, bi) => {
    const g = Math.max(0, Math.min(1, grow * 1.4 - bi * 0.25));
    if (g <= 0) return;
    const H = 13 * g, rings = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, sway = reduced ? 0 : Math.sin(timeSec / 1.1 + b.phase + t * 3.2);
      const cx = b.x + (Math.sin(t * 2.4 + b.phase) * 1.8 + sway * 1.1 + b.lean * 5) * t, cz = b.z + Math.cos(t * 1.9 + b.phase) * 1.2 * t;
      rings.push({ cx, cz, y: -0.4 + t * H, r: 0.6 * (1 - t) + 0.07 });
    }
    const pt = (ring, k) => { const a = (k / SIDES) * Math.PI * 2; return [ring.cx + Math.cos(a) * ring.r, ring.y, ring.cz + Math.sin(a) * ring.r, Math.cos(a), Math.sin(a)]; };
    for (let i = 0; i < SEG; i++) for (let k = 0; k < SIDES; k++) {
      const p = pt(rings[i], k), q = pt(rings[i], k + 1), r = pt(rings[i + 1], k + 1), s = pt(rings[i + 1], k);
      for (const v of [p, q, r, p, r, s]) out.push(v[0], v[1], v[2], v[3], 0.2, v[4], tint[0], tint[1], tint[2], 0, 0);
    }
  });
  return new Float32Array(out);
}

/**
 * Static world: houses, landmarks and props as placed GLB meshes (boxes when a mesh is missing), lamp posts at lit houses.
 * Returns { building: Float32Array, ground, sea, heights, lights }. Deterministic: same layout, details and meshes give the same bytes.
 */
export function buildWorld({ layout, meshes, seed, gridW, gridD, tintFor = () => null, groundTint = null, cell = CELL }) {
  const out = [], heights = [];
  for (const p of layout) {
    const model = meshes && meshes.get(MESH_FOR[p.id]);
    const lit = p.id === 'house_a' || p.id === 'house_b' ? (windowLit(p) ? 1 : 0) : 1;
    const phase = p.vis ? p.vis.phase : 0;
    if (model) heights.push(appendMeshVertices(out, model, p, cell, { glow: lit, phase, tint: tintFor(p.id) }));
    else { heights.push(3); pushBox(out, p, cell, 3, BOX_COLORS[p.id] || [0.3, 0.3, 0.3]); }
  }
  const lights = lanternLights(layout, cell);
  if (meshes) for (const l of lights) {
    const lamp = l.post && (meshes.get(lampKind(l)) || meshes.get('lamp'));
    if (lamp) appendMeshVertices(out, lamp, null, cell, { glow: 1, phase: l.phase, scale: 1, at: [l.pos[0], l.pos[2]] });
  }
  const t = terrainRects(gridW, gridD, seed, cell), g = t.ground, ground = [], sea = [];
  const gc = groundTint ? groundTint.map((v) => (v / 255) * 0.7) : [0.2, 0.21, 0.17];
  pushQuad(ground, g.minX, g.minZ, g.maxX, g.maxZ, 0, gc, -1);
  for (const r of contactRings(layout, lights, cell)) pushQuad(ground, r.x0, r.z0, r.x1, r.z1, r.y, gc.map((v) => v * r.shade), -1);
  pushQuad(sea, t.sea.minX, t.sea.minZ, t.sea.maxX, t.sea.maxZ, t.sea.y, [0.02, 0.05, 0.08], -2);
  const coast = new Float32Array([...buildCoast({ gridW, gridD, seed, cell, meshes }), ...buildChurchHill({ gridW, gridD, seed, cell })]);
  return { building: new Float32Array(out), ground: new Float32Array(ground), sea: new Float32Array(sea), coast, halos: haloSprites(lights), heights, lights, coastSide: t.side };
}

// ---------- shaders ----------

const FRAG_HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const SCENE_VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute float aGlow; attribute float aPhase;
uniform mat4 uVP; varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase;
void main(){ vPos=aPos; vNormal=aNormal; vColor=aColor; vGlow=aGlow; vPhase=aPhase; gl_Position=uVP*vec4(aPos,1.0); }`;
const SCENE_FS = `${FRAG_HEAD}varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase;
uniform vec3 uCam; uniform vec3 uFogColor; uniform float uFog; uniform vec3 uAmbient; uniform vec3 uMoonDir; uniform vec3 uMoonColor;
uniform vec4 uLight[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}]; uniform vec3 uGlowColor; uniform float uTime; uniform float uFlicker; uniform float uMode;
uniform float uGroundFog; uniform float uGroundH; uniform vec2 uFogOff; uniform float uWaterT; uniform float uRipple; uniform float uFresnel; uniform vec3 uSeaTint; uniform float uMoonGain; uniform float uLampGain; uniform vec3 uZenith; uniform vec3 uHorizon; uniform sampler2D uWallTex; uniform sampler2D uGroundTex; uniform float uHasWall; uniform float uHasGround;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 toCam = uCam - vPos; float dist = length(toCam); vec3 V = toCam / max(dist, 0.001);
  vec3 n = normalize(vNormal); if (dot(n, V) < 0.0) n = -n;
  vec3 base = vColor;
  if (uMode > 0.5 && uMode < 1.5) { vec2 c = floor(vPos.xz * 1.5); base *= 0.88 + 0.16 * hash(c) + 0.12 * hash(floor(vPos.xz * 6.0)) + 0.08 * sin(vPos.x * 0.21) * sin(vPos.z * 0.17); }
  if (uMode < 0.5 && uHasWall > 0.5) base *= mix(vec3(1.0), texture2D(uWallTex, vec2(vPos.x + vPos.z, vPos.y) * 0.3).rgb * 1.6, 0.85);
  if (uMode > 0.5 && uMode < 1.5 && uHasGround > 0.5) base *= mix(vec3(1.0), texture2D(uGroundTex, vPos.xz * 0.25).rgb * 1.6, 0.85);
  float skyUp = n.y * 0.5 + 0.5;
  vec3 lightSum = uAmbient * (0.55 + 0.75 * skyUp) + uMoonColor * max(dot(n, uMoonDir), 0.0);
  if (uMode < 0.5 || uMode > 2.5) base *= mix(0.5, 1.0, smoothstep(0.0, 1.8, vPos.y));
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uLight[i]; if (L.w <= 0.0) continue;
    vec3 d = L.xyz - vPos; float r2 = dot(d, d); float att = clamp(1.0 - r2 / (L.w * L.w), 0.0, 1.0); att *= att;
    float nl = max(dot(n, normalize(d)), 0.0) * 0.75 + 0.25; lightSum += uLightCol[i] * att * nl;
  }
  vec3 col = (base + 0.045) * lightSum;
  if (uMode > 1.5 && uMode < 2.5) {
    // moving ripples: three crossed wave trains give the normal; zero speed (reduced motion) leaves them still
    vec2 p = vPos.xz; float t = uWaterT;
    vec2 g = vec2(sin(p.x * 0.9 + t * 1.1) * 0.5 + sin((p.x + p.y) * 1.7 - t * 1.6) * 0.35 + sin(p.y * 3.1 + t * 2.3) * 0.15,
                  cos(p.y * 0.8 + t * 0.9) * 0.5 + cos((p.x - p.y) * 1.5 + t * 1.3) * 0.35 + cos(p.x * 2.9 - t * 2.1) * 0.15) * uRipple;
    vec3 sn = normalize(vec3(g.x, 1.0, g.y));
    float fres = pow(1.0 - max(dot(sn, V), 0.0), uFresnel);
    vec3 R = reflect(-V, sn);
    vec3 skyRefl = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.5));
    col = mix(uSeaTint * (1.0 + lightSum * 2.0), skyRefl, 0.1 + 0.85 * fres);
    col += uMoonColor * pow(max(dot(R, uMoonDir), 0.0), 70.0) * uMoonGain;
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      vec4 L = uLight[i]; if (L.w <= 0.0) continue;
      vec3 d = L.xyz - vPos; float att = clamp(1.0 - dot(d, d) / (L.w * L.w * 9.0), 0.0, 1.0);
      col += uLightCol[i] * pow(max(dot(R, normalize(d)), 0.0), 40.0) * att * uLampGain;
    }
  }
  float peak = max(col.r, max(col.g, col.b)); // hue-preserving soft shoulder: lit walls keep their colour under a lantern instead of clipping to white
  if (peak > 0.55) col *= (0.55 + 0.33 * (1.0 - exp(-(peak - 0.55) / 0.33))) / peak;
  if (vGlow > 0.0) { float fl = 1.0 - uFlicker * 0.12 * (0.5 + 0.5 * sin(uTime * 6.0 + vPhase * 2.3)); col = mix(col, uGlowColor * 1.4, clamp(vGlow, 0.0, 1.0) * fl); }
  float f = 1.0 - exp(-pow(dist * uFog, 2.0));
  float sheet = 0.6 + 0.8 * vnoise(vPos.xz * 0.06 + uFogOff) * (0.6 + 0.4 * vnoise(vPos.xz * 0.19 - uFogOff * 1.7));
  float mist = (1.0 - exp(-dist * uGroundFog * sheet)) * exp(-max(vPos.y, 0.0) / uGroundH) * 0.9;
  f = 1.0 - (1.0 - f) * (1.0 - mist);
  gl_FragColor = vec4(mix(col, uFogColor, clamp(f, 0.0, 1.0)), 1.0);
}`;
const SKY_VS = 'attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }';
const SKY_FS = `${FRAG_HEAD}varying vec2 vNdc; uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uTy; uniform float uAspect;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform float uMoonSize; uniform float uStars; uniform float uCloud; uniform float uTime;
uniform vec3 uEyeDir; uniform vec4 uEye; uniform float uEyeOpen; uniform float uPupil;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(uF + uR * vNdc.x * uTy * uAspect + uU * vNdc.y * uTy);
  float h = d.y; vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  if (h < 0.0) col = uHorizon * 0.8;
  vec2 uv = d.xz / (abs(h) + 0.2) * 0.8 + vec2(uTime * 0.009, uTime * 0.002);
  float cl = (vnoise(uv * 2.0) * 0.6 + vnoise(uv * 5.0) * 0.3 + vnoise(uv * 11.0) * 0.1);
  float c = smoothstep(0.42, 0.78, cl) * uCloud * clamp(h * 5.0, 0.0, 1.0);
  col = mix(col, uHorizon * 0.55 + 0.03, c * 0.7);
  vec3 g = floor(d * 160.0); float sh = hash(g.xy + g.z * 7.31); float s = step(0.9972, sh) * uStars * (1.0 - c) * smoothstep(0.04, 0.3, h) * (0.65 + 0.35 * sin(uTime * 2.1 + sh * 600.0));
  col += vec3(0.8, 0.85, 1.0) * s;
  float m = dot(d, uMoonDir); float disc = smoothstep(cos(uMoonSize), cos(uMoonSize * 0.9), m);
  float halo = pow(max(m, 0.0), 220.0) * 0.4 + pow(max(m, 0.0), 40.0) * 0.1 + pow(max(m, 0.0), 6.0) * 0.04;
  float moonOn = (1.0 - c * 0.75) * step(0.0001, uMoonColor.z);
  col += uMoonColor * 0.9 * halo * moonOn;
  col = mix(col, vec3(0.6, 0.66, 0.78) * (0.85 + 0.15 * vnoise(d.xz * 90.0 + d.y * 40.0)), disc * moonOn); // the disc replaces the sky behind it, so it stays a pale moon instead of adding up to white
  col += uHorizon * 0.35 * exp(-abs(h) * 9.0) * (0.6 + 0.4 * uMoonColor.z);
  if (uEyeOpen > 0.01 && dot(d, uEyeDir) > 0.0) {
    vec3 tR = normalize(cross(vec3(0.0, 1.0, 0.0), uEyeDir)); vec3 tU = cross(uEyeDir, tR);
    vec2 e = vec2(dot(d, tR) / uEye.x, dot(d, tU) / uEye.y);
    float lid = uEyeOpen * (1.0 - e.x * e.x);
    float glowR = exp(-dot(e, e) * 0.05);
    col += vec3(0.55, 0.08, 0.07) * glowR * 0.5 * uEyeOpen;
    if (abs(e.x) < 1.0 && abs(e.y) < lid) {
      vec3 eyeCol = vec3(0.87, 0.69, 0.47) * (1.0 - 0.5 * abs(e.y) / max(lid, 0.01));
      float pup = 1.0 - smoothstep(0.16, 0.2, length(vec2((e.x - uPupil) * 1.0, e.y / max(lid, 0.05) * 0.45)));
      col = mix(eyeCol, vec3(0.07, 0.0, 0.015), pup);
      col = mix(col, vec3(0.1, 0.0, 0.0), smoothstep(0.85, 1.0, abs(e.y) / max(lid, 0.01)));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;
const HALO_VS = `attribute vec4 aHalo; attribute float aSize; uniform mat4 uVP; uniform float uScale; uniform float uTime; uniform float uReduced; uniform vec3 uCam;
varying float vFlick; varying float vDist;
void main(){
  gl_Position = uVP * vec4(aHalo.xyz, 1.0); vDist = length(aHalo.xyz - uCam);
  gl_PointSize = clamp(aSize * uScale / max(gl_Position.w, 0.5), 2.0, 140.0);
  vFlick = uReduced > 0.5 ? 1.0 : 0.85 + 0.15 * sin(uTime * 5.3 + aHalo.w * 1.7);
}`;
const HALO_FS = `${FRAG_HEAD}uniform vec3 uColor; uniform float uFog; varying float vFlick; varying float vDist;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 2.2) * 0.85 * vFlick * (1.0 - clamp(1.0 - exp(-pow(vDist * uFog, 2.0)), 0.0, 0.85));
  gl_FragColor = vec4(uColor, a); }`;
const PART_VS = `attribute vec3 aSeed; uniform mat4 uVP; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel; uniform float uTime; uniform float uSize; uniform float uScale;
varying float vFade;
void main(){
  vec3 l = mod(aSeed * uBox + uVel * uTime, uBox);
  vec3 w = vec3(uCam.x + l.x - uBox.x * 0.5, l.y, uCam.z + l.z - uBox.z * 0.5);
  gl_Position = uVP * vec4(w, 1.0); gl_PointSize = clamp(uSize * uScale / max(gl_Position.w, 0.5), 1.0, 90.0);
  vFade = clamp(1.0 - length(w.xz - uCam.xz) / (uBox.x * 0.5), 0.0, 1.0);
}`;
const PART_FS = `${FRAG_HEAD}uniform vec3 uColor; uniform float uAlpha; varying float vFade;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = clamp(1.0 - r, 0.0, 1.0) * uAlpha * vFade; gl_FragColor = vec4(uColor, a); }`;

const POST_VS = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';
// One pass: thresholded multi-tap bloom (two spiral rings), radial chromatic shift, teal shadow and warm highlight grade, vignette, film grain.
const POST_FS = `${FRAG_HEAD}varying vec2 vUv; uniform sampler2D uScene; uniform float uAspect; uniform float uVignette; uniform float uGrain; uniform float uGrainT;
uniform float uBloom; uniform float uThreshold; uniform float uChroma;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 bright(vec2 uv){ vec3 c = texture2D(uScene, uv).rgb; float l = max(c.r, max(c.g, c.b)); return c * max(l - uThreshold, 0.0) / max(1.0 - uThreshold, 0.1); }
void main(){
  vec2 uv = vUv, dir = uv - 0.5;
  vec3 col = vec3(texture2D(uScene, uv + dir * uChroma).r, texture2D(uScene, uv).g, texture2D(uScene, uv - dir * uChroma).b);
  vec2 px = vec2(1.0 / uAspect, 1.0); vec3 glow = vec3(0.0);
  for (int i = 0; i < 10; i++) { float a = float(i) * 2.39996; float r = sqrt((float(i) + 0.5) / 10.0);
    glow += bright(uv + vec2(cos(a), sin(a)) * r * 0.022 * px) * 1.1 + bright(uv + vec2(cos(a + 1.0), sin(a + 1.0)) * r * 0.06 * px) * 0.55; }
  col += glow * (uBloom / 10.0) * vec3(1.0, 0.92, 0.8);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * vec3(0.9, 1.0, 1.1), col * vec3(1.06, 1.0, 0.92), smoothstep(0.15, 0.7, lum));
  col = col * 1.06;
  col = (col - 0.5) * 1.1 + 0.5 + 0.0;
  float v = smoothstep(0.35, 0.95, length(dir * vec2(uAspect * 0.8, 1.0)) * 1.25);
  col *= 1.0 - uVignette * v;
  col += (hash(gl_FragCoord.xy + uGrainT) - 0.5) * uGrain;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

const FLY_VS = `attribute vec4 aFly; uniform mat4 uVP; uniform vec3 uCam; uniform float uTime; uniform float uRise; uniform float uSize; uniform float uScale; uniform float uFog;
varying float vTwinkle; varying float vFade;
void main(){
  float ph = aFly.w, t = uTime;
  vec3 w = aFly.xyz + vec3(sin(t * 0.6 + ph * 6.28) * 0.9, sin(t * 0.9 + ph * 9.0) * 0.35 + uRise * fract(t * 0.12 + ph) * 2.2, cos(t * 0.5 + ph * 5.0) * 0.9);
  gl_Position = uVP * vec4(w, 1.0); gl_PointSize = clamp(uSize * uScale / max(gl_Position.w, 0.5), 1.5, 40.0);
  vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 3.0 + ph * 40.0), 2.0); float dist = length(w - uCam);
  vFade = (1.0 - clamp(1.0 - exp(-pow(dist * uFog, 2.0)), 0.0, 0.9)) * (1.0 - uRise * fract(t * 0.12 + ph));
}`;
const FLY_FS = `${FRAG_HEAD}uniform vec3 uColor; varying float vTwinkle; varying float vFade;
void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.6) * vTwinkle * vFade; gl_FragColor = vec4(uColor, a); }`;

function program(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(p));
  const uniforms = {};
  return { p, u: (name) => (name in uniforms ? uniforms[name] : (uniforms[name] = gl.getUniformLocation(p, name))) };
}

// ---------- GL renderer ----------

/** Owns the GL programs and buffers. frame = the per-frame values computed by the controller; nothing here decides gameplay. */
export function createGlRenderer(gl) {
  const scene = program(gl, SCENE_VS, SCENE_FS), sky = program(gl, SKY_VS, SKY_FS), part = program(gl, PART_VS, PART_FS), halo = program(gl, HALO_VS, HALO_FS), fly = program(gl, FLY_VS, FLY_FS);
  const post = (() => { try { return program(gl, POST_VS, POST_FS); } catch (err) { console.warn('[view3d] post pass disabled, drawing directly: ' + err.message); return null; } })();
  let fbo = null, fboTex = null, fboDepth = null, fboSize = '', postBroken = !post;
  // Offscreen target for the post pass. Any failure (incomplete framebuffer, allocation error) disables post for good and warns once.
  function ensureTarget(w, h) {
    if (postBroken) return false;
    if (fbo && fboSize === `${w}x${h}`) return true;
    try {
      fbo ||= gl.createFramebuffer(); fboTex ||= gl.createTexture(); fboDepth ||= gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, fboTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindRenderbuffer(gl.RENDERBUFFER, fboDepth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fboDepth);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer status ' + status);
      fboSize = `${w}x${h}`; return true;
    } catch (err) {
      postBroken = true; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      console.warn('[view3d] post pass disabled, drawing directly: ' + err.message); return false;
    }
  }
  const skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bufs = { building: gl.createBuffer(), ground: gl.createBuffer(), sea: gl.createBuffer(), coast: gl.createBuffer(), tentacle: gl.createBuffer(), rain: gl.createBuffer(), mist: gl.createBuffer(), halo: gl.createBuffer(), fly: gl.createBuffer() };
  const counts = { building: 0, ground: 0, sea: 0, coast: 0, tentacle: 0, rain: 0, mist: 0, halo: 0, fly: 0 };
  // unit 0 = wall texture, unit 1 = ground texture; a white pixel stands in until ?pack=1 textures are bound
  const makeTex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };
  const texs = [makeTex(0), makeTex(1)], hasTex = [0, 0];
  const lightPos = new Float32Array(MAX_LIGHTS * 4), lightCol = new Float32Array(MAX_LIGHTS * 3);
  let size = [1, 1];
  const FLOATS = { rain: 3, mist: 3, halo: HALO_FLOATS, fly: FIREFLY_FLOATS };
  const upload = (name, data, usage = gl.STATIC_DRAW) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, data, usage); counts[name] = data.length / (FLOATS[name] || VERTEX_FLOATS); };
  const attrs = [['aPos', 3, 0], ['aNormal', 3, 3], ['aColor', 3, 6], ['aGlow', 1, 9], ['aPhase', 1, 10]];
  function bindScene(buf) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [name, size, off] of attrs) { const loc = gl.getAttribLocation(scene.p, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, VERTEX_FLOATS * 4, off * 4); }
  }
  function drawParticles(name, f, opt) {
    if (!counts[name]) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]);
    const loc = gl.getAttribLocation(part.p, 'aSeed'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
    gl.uniform3fv(part.u('uBox'), opt.box); gl.uniform3fv(part.u('uVel'), opt.vel); gl.uniform1f(part.u('uSize'), opt.size);
    gl.uniform3fv(part.u('uColor'), opt.color); gl.uniform1f(part.u('uAlpha'), opt.alpha);
    gl.drawArrays(gl.POINTS, 0, counts[name]);
  }
  return {
    setWorld(w) { upload('building', w.building); upload('ground', w.ground); upload('sea', w.sea); upload('coast', w.coast); upload('halo', w.halos); },
    /** Rebuilt every frame while the omen is visible (the tentacles sway), so it is a dynamic buffer. */
    setFireflies(data) { upload('fly', data); },
    setHalos(data) { upload('halo', data); },
    setTentacles(data) { upload('tentacle', data, gl.DYNAMIC_DRAW); },
    /** Images already cut to power of two canvases; null keeps the white stand-in. Only ever called under ?pack=1. */
    setPackTextures(wall, ground) {
      [wall, ground].forEach((img, unit) => {
        if (!img) return;
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        hasTex[unit] = 1;
      });
    },
    setParticles(rainSeeds, mistSeeds) { upload('rain', rainSeeds); upload('mist', mistSeeds); },
    resize(w, h) { size = [w, h]; gl.viewport(0, 0, w, h); },
    /** True when the post pass is available (shader compiled and the framebuffer is complete). */
    get postReady() { return !postBroken; },
    /** Vertex, point and draw-call counts of what was uploaded: feeds frameCost for the budget test and the perf label. */
    counts: () => ({ ...counts }),
    /** Draws the frame; with f.post.enabled the scene goes through the offscreen target and the single post pass, else straight to the canvas. */
    draw(f) {
      const usePost = !!(f.post && f.post.enabled) && ensureTarget(size[0], size[1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? fbo : null); gl.viewport(0, 0, size[0], size[1]);
      this.drawScene(f);
      if (!usePost) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(post.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fboTex);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      const pl = gl.getAttribLocation(post.p, 'aPos'); gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 8, 0);
      gl.uniform1i(post.u('uScene'), 0); gl.uniform1f(post.u('uAspect'), f.aspect); gl.uniform1f(post.u('uVignette'), f.post.vignette); gl.uniform1f(post.u('uGrain'), f.post.grain);
      gl.uniform1f(post.u('uGrainT'), f.post.grainMotion ? (Math.floor(f.time * 24) % 97) * 13.7 : 0);
      gl.uniform1f(post.u('uBloom'), f.post.bloom); gl.uniform1f(post.u('uThreshold'), f.post.bloomThreshold); gl.uniform1f(post.u('uChroma'), f.post.chroma);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    drawScene(f) {
      gl.clearColor(f.fogColor[0], f.fogColor[1], f.fogColor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(sky.p);
      const b = f.basis; gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      const sl = gl.getAttribLocation(sky.p, 'aPos'); gl.enableVertexAttribArray(sl); gl.vertexAttribPointer(sl, 2, gl.FLOAT, false, 8, 0);
      gl.uniform3fv(sky.u('uF'), b.f); gl.uniform3fv(sky.u('uR'), b.r); gl.uniform3fv(sky.u('uU'), b.u);
      gl.uniform1f(sky.u('uTy'), Math.tan(FOV_Y / 2)); gl.uniform1f(sky.u('uAspect'), f.aspect);
      gl.uniform3fv(sky.u('uZenith'), f.sky.zenith); gl.uniform3fv(sky.u('uHorizon'), f.sky.horizon);
      gl.uniform3fv(sky.u('uMoonDir'), f.moon.dir); gl.uniform3fv(sky.u('uMoonColor'), f.moon.color); gl.uniform1f(sky.u('uMoonSize'), f.moon.size);
      gl.uniform3fv(sky.u('uEyeDir'), f.eye.dir); gl.uniform4f(sky.u('uEye'), f.eye.width, f.eye.height, 0, 0); gl.uniform1f(sky.u('uEyeOpen'), f.eye.open); gl.uniform1f(sky.u('uPupil'), f.reduced ? 0 : Math.sin(f.time / 2.6) * 0.2);
      gl.uniform1f(sky.u('uStars'), f.sky.stars); gl.uniform1f(sky.u('uCloud'), f.sky.cloud); gl.uniform1f(sky.u('uTime'), f.reduced ? 0 : f.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // world
      gl.enable(gl.DEPTH_TEST); gl.useProgram(scene.p);
      lightPos.fill(0); lightCol.fill(0);
      f.lights.slice(0, MAX_LIGHTS).forEach((l, i) => { lightPos.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4); lightCol.set(l.color, i * 3); });
      gl.uniformMatrix4fv(scene.u('uVP'), false, f.vp); gl.uniform3fv(scene.u('uCam'), f.camPos); gl.uniform3fv(scene.u('uFogColor'), f.fogColor);
      gl.uniform1f(scene.u('uFog'), f.fog); gl.uniform1f(scene.u('uGroundFog'), f.groundFog); gl.uniform1f(scene.u('uGroundH'), f.groundHeight);
      gl.uniform2fv(scene.u('uFogOff'), f.fogOffset); gl.uniform1f(scene.u('uWaterT'), f.waterTime); gl.uniform1f(scene.u('uRipple'), f.sea.ripple); gl.uniform1f(scene.u('uFresnel'), f.sea.fresnel);
      gl.uniform3fv(scene.u('uSeaTint'), f.sea.tint); gl.uniform1f(scene.u('uMoonGain'), f.sea.moonGain); gl.uniform1f(scene.u('uLampGain'), f.sea.lanternGain);
      gl.uniform3fv(scene.u('uZenith'), f.sky.zenith); gl.uniform3fv(scene.u('uHorizon'), f.sky.horizon);
      gl.uniform1i(scene.u('uWallTex'), 0); gl.uniform1i(scene.u('uGroundTex'), 1); gl.uniform1f(scene.u('uHasWall'), hasTex[0]); gl.uniform1f(scene.u('uHasGround'), hasTex[1]);
      for (const unit of [0, 1]) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texs[unit]); } gl.uniform3fv(scene.u('uAmbient'), f.sky.ambient); gl.uniform3fv(scene.u('uMoonDir'), f.moon.dir);
      gl.uniform3fv(scene.u('uMoonColor'), f.moonLight); gl.uniform4fv(scene.u('uLight'), lightPos); gl.uniform3fv(scene.u('uLightCol'), lightCol);
      gl.uniform3fv(scene.u('uGlowColor'), f.glowColor); gl.uniform1f(scene.u('uTime'), f.time); gl.uniform1f(scene.u('uFlicker'), f.reduced ? 0 : 1);
      for (const [name, mode] of [['sea', 2], ['ground', 1], ['building', 0], ['coast', 3], ['tentacle', 3]]) {
        if (!counts[name]) continue;
        gl.uniform1f(scene.u('uMode'), mode); bindScene(bufs[name]); gl.drawArrays(gl.TRIANGLES, 0, counts[name]);
      }
      // lantern halos: additive soft sprites, depth tested so walls hide them
      if (counts.halo) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.useProgram(halo.p);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufs.halo);
        const hl = gl.getAttribLocation(halo.p, 'aHalo'), sl2 = gl.getAttribLocation(halo.p, 'aSize');
        gl.enableVertexAttribArray(hl); gl.vertexAttribPointer(hl, 4, gl.FLOAT, false, HALO_FLOATS * 4, 0);
        gl.enableVertexAttribArray(sl2); gl.vertexAttribPointer(sl2, 1, gl.FLOAT, false, HALO_FLOATS * 4, 16);
        gl.uniformMatrix4fv(halo.u('uVP'), false, f.vp); gl.uniform3fv(halo.u('uCam'), f.camPos); gl.uniform1f(halo.u('uScale'), f.pointScale);
        gl.uniform1f(halo.u('uTime'), f.time); gl.uniform1f(halo.u('uReduced'), f.reduced ? 1 : 0); gl.uniform1f(halo.u('uFog'), f.fog); gl.uniform3fv(halo.u('uColor'), f.glowColor);
        gl.drawArrays(gl.POINTS, 0, counts.halo);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // fireflies near warm lanterns (embers at high dread): additive glow points
      if (counts.fly) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.useProgram(fly.p); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.fly);
        const fl = gl.getAttribLocation(fly.p, 'aFly'); gl.enableVertexAttribArray(fl); gl.vertexAttribPointer(fl, 4, gl.FLOAT, false, FIREFLY_FLOATS * 4, 0);
        gl.uniformMatrix4fv(fly.u('uVP'), false, f.vp); gl.uniform3fv(fly.u('uCam'), f.camPos); gl.uniform1f(fly.u('uTime'), f.time); gl.uniform1f(fly.u('uRise'), f.flies.rise);
        gl.uniform1f(fly.u('uSize'), f.flies.size); gl.uniform1f(fly.u('uScale'), f.pointScale); gl.uniform1f(fly.u('uFog'), f.fog); gl.uniform3fv(fly.u('uColor'), f.flies.color);
        gl.drawArrays(gl.POINTS, 0, counts.fly);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
      // rain and mist
      if (counts.rain || counts.mist) {
        gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(part.p);
        gl.uniformMatrix4fv(part.u('uVP'), false, f.vp); gl.uniform3fv(part.u('uCam'), f.camPos); gl.uniform1f(part.u('uTime'), f.time); gl.uniform1f(part.u('uScale'), f.pointScale);
        drawParticles('rain', f, { box: [40, 16, 40], vel: [0, -16, 0], size: 0.08, color: [0.6, 0.68, 0.8], alpha: 0.5 });
        drawParticles('mist', f, { box: [70, 5, 70], vel: [0.5, 0, 0.3], size: 5, color: f.fogColor.map((v) => Math.min(1, v * 1.3)), alpha: 0.12 });
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    },
  };
}

// ---------- controller: input, frame loop, interaction ----------

const KEY_MOVE = { KeyW: ['forward', 1], ArrowUp: ['forward', 1], KeyS: ['forward', -1], ArrowDown: ['forward', -1], KeyA: ['strafe', -1], KeyD: ['strafe', 1], ArrowLeft: ['turn', -1], ArrowRight: ['turn', 1] };

/** Loads a local pack image and cuts it to a 256 square canvas (WebGL 1 needs power of two sizes to repeat and mipmap). Resolves null when it cannot load. */
function loadPackImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(im, 0, 0, 256, 256); resolve(c); };
    im.onerror = () => { console.warn(`[view3d] pack texture not loaded: ${url}`); resolve(null); };
    im.src = url;
  });
}

/** Capture stills are rendered at one fixed moment so every effect (ripples, fireflies, grain) is visible and repeatable. */
const STILL_TIME = 3.7;
let meshPromise = null;
const loadMeshesOnce = () => (meshPromise ||= loadMeshSet(fetch.bind(globalThis), 'assets/meshes/', [...new Set(Object.values(MESH_FOR)), ...LAMP_KINDS, 'boat', 'dock', 'fence', 'cliff_rock']));

/**
 * getScene() -> { layout, lamps: [{id, pos, lit}] (vigil lanterns that can be lit), seed, gridW, gridD, dread, night: {number, sky, weather}, categoryOf(id), labelFor(piece, kind), tintFor(id), groundTint,
 *   fly: camera {x,y,z,yaw,pitch} while the ?cinematic=1 fly-through runs (it replaces walking), else null }
 * packTextures(): null, or { wall, ground } image URLs (only under ?pack=1, served from the git-ignored web/local-pack).
 * onInteract(piece, kind) applies the sanity change and shows the line; onExit() leaves the view; notice(key) reports status text.
 */
export function createView3d({ canvas, prompt, getScene, onInteract, onExit, notice, reduced = false, capture = false, grain = true, camParam = null, packTextures = () => null, post = true, onPerf = null, onStep = null, onCoast = null, now = () => performance.now() }) {
  let gl = null, renderer = null, active = false, rafId = 0, running = false;
  let cam = null, world = null, worldKey = '', boxes = [], bounds = null, meshes = null, lights = [], rainKey = '', lastHalos = null, lastFlies = null;
  let perfAt = 0, packLoaded = false, omen = { eye: 0, tentacle: 0 }, lastTent = '';
  let lastDraw = 0, last = 0, t0 = 0, dirty = true, scale = 1, lastSize = '', lastUse = -Infinity, bobPhase = 0, locked = false, pendingMouse = null;
  const keys = new Set(), perf = createPerf(), touches = new Map();
  let drive = { forward: 0, strafe: 0 }, smooth = { forward: 0, strafe: 0 }, coastAt = -1, look = { dx: 0, dy: 0 }, padPrev = null, mouseDown = null, lockedBeforeDown = false;

  const wake = () => { dirty = true; if (active && !running) { running = true; last = 0; rafId = requestAnimationFrame(loop); } };
  const isTyping = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target && e.target.tagName);

  function ensureWorld(s) {
    const key = [s.seed, meshes ? meshes.size : 0, s.layout.map((p) => p.detail).join('')].join('|');
    if (key === worldKey) return;
    worldKey = key;
    lastHalos = null; lastFlies = null; world = buildWorld({ layout: s.layout, meshes, seed: s.seed, gridW: s.gridW, gridD: s.gridD, tintFor: s.tintFor, groundTint: s.groundTint });
    boxes = worldBoxes(s.layout, world.heights); bounds = worldBounds(s.gridW, s.gridD);
    lights = world.lights; renderer.setWorld(world); lastTent = '';
    if (!cam) {
      const sp = spawnPoint(s.layout, s.gridW, s.gridD), override = parseCamParam(camParam);
      cam = override ? { x: override.x, y: EYE_HEIGHT, z: override.z, yaw: override.yaw, pitch: override.pitch } : { x: sp.x, y: EYE_HEIGHT, z: sp.z, yaw: 0, pitch: -0.04 };
    }
  }
  function ensureParticles(s) {
    const counts = particleCounts({ weather: s.night.weather, dread: s.dread, reduced });
    const key = `${s.seed}|${counts.rain}|${counts.mist}`;
    if (key === rainKey) return;
    rainKey = key; renderer.setParticles(particleSeeds(s.seed, counts.rain, 1), particleSeeds(s.seed, counts.mist, 2));
  }

  function centerRay() { return forwardVector(cam.yaw, cam.pitch); }
  function target(ray, s) {
    const origin = [cam.x, cam.y, cam.z], hit = pickBox(origin, ray, boxes, 60);
    // Vigil lamps share the same view ray; a lamp wins when it is not clearly behind the wall it hangs beside.
    const lampHit = s.lamps && s.lamps.length ? pickLamp(origin, ray, s.lamps, 60) : null;
    if (lampHit && (!hit || lampHit.distance <= hit.distance + 0.6)) {
      const lamp = s.lamps[lampHit.index];
      return { piece: { id: 'lamp', lampId: lamp.id, lit: !!lamp.lit }, kind: 'lamp', distance: lampHit.distance, inRange: InteractionRules.inRange(lampHit.distance) };
    }
    if (!hit) return null;
    const piece = s.layout[hit.index], kind = InteractionRules.kindForCategory(s.categoryOf(piece.id));
    return { piece, kind, distance: hit.distance, inRange: InteractionRules.inRange(hit.distance) };
  }
  function interact(ray) {
    const s = getScene(), tt = now() / 1000;
    const hit = target(ray, s);
    if (!hit || !hit.inRange) return;
    if (!InteractionRules.cooldownElapsed(tt, lastUse)) return;
    lastUse = tt; onInteract(hit.piece, hit.kind); wake();
  }
  function updatePrompt(s) {
    const hit = cam ? target(centerRay(), s) : null;
    const text = hit && hit.inRange ? s.labelFor(hit.piece, hit.kind) : '';
    if (prompt.textContent !== text) prompt.textContent = text;
    prompt.hidden = !text;
  }

  const updatePromptOff = () => { if (!prompt.hidden) prompt.hidden = true; };

  function currentInput() {
    const inp = { forward: drive.forward, strafe: drive.strafe, turn: 0, look: 0 };
    for (const code of keys) { const m = KEY_MOVE[code]; if (m) inp[m[0]] = Math.max(-1, Math.min(1, inp[m[0]] + m[1])); }
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads() || []).filter(Boolean) : [];
    if (pads.length) {
      const snap = snapshotPad(pads[0]), ax = padAxes3d(snap);
      inp.forward += ax.forward; inp.strafe += ax.strafe; inp.turn += ax.turn; inp.look += ax.look;
      const acts = mapGamepad(padPrev, snap); padPrev = snap;
      if (acts.includes('listen') || acts.includes('door')) interact(centerRay());
      if (acts.includes('whisper')) onExit();
    }
    return inp;
  }

  function loop(ts) {
    rafId = 0;
    if (!active) { running = false; return; }
    if (document.hidden) { rafId = requestAnimationFrame(loop); return; }
    const dt = last ? (ts - last) / 1000 : 0.016; last = ts;
    const s = getScene();
    ensureWorld(s); ensureParticles(s);
    const raw = currentInput();
    smooth = smoothDrive(smooth, raw, dt); // eased walking; turning and looking stay direct (no mouse smoothing)
    const inp = { ...raw, forward: smooth.forward, strafe: smooth.strafe }, mouse = look.dx || look.dy || pendingMouse ? { dx: look.dx + (pendingMouse ? pendingMouse.dx : 0), dy: look.dy + (pendingMouse ? pendingMouse.dy : 0) } : null;
    const before = cam;
    cam = s.fly ? { ...s.fly } : stepCamera(cam, inp, dt, boxes, bounds, mouse); look = { dx: 0, dy: 0 }; pendingMouse = null;
    const moved = cam.x !== before.x || cam.z !== before.z || cam.yaw !== before.yaw || cam.pitch !== before.pitch;
    const speed = Math.min(1, Math.hypot(inp.forward, inp.strafe)), moving = speed > 0.01 || !!(raw.forward || raw.strafe);
    if (speed > 0.05) {
      const prevPhase = bobPhase; bobPhase += dt * speed;
      if (onStep && !s.fly && footfall(prevPhase, bobPhase)) onStep(surfaceAt(cam.x, cam.z, s.gridW, s.gridD, s.seed));
    }
    if (onCoast && !s.fly) { const c = Math.round(coastCloseness(cam.x, cam.z, s.gridW, s.gridD, s.seed) * 10) / 10; if (c !== coastAt) { coastAt = c; onCoast(c); } }
    const padOn = navigator.getGamepads && Array.from(navigator.getGamepads() || []).some(Boolean);
    const animated = !reduced && !capture;
    if (s.fly) updatePromptOff();
    if (animated || dirty || moved || moving) { draw(s, ts); dirty = false; if (moved) updatePrompt(s); }
    const stay = animated || moving || moved || padOn || keys.size > 0 || touches.size > 0 || dirty;
    if (stay) rafId = requestAnimationFrame(loop); else running = false;
  }

  function draw(s, ts) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = renderSize(rect.width || canvas.width, rect.height || canvas.height, dpr, scale);
    if (`${size.width}x${size.height}` !== lastSize) { lastSize = `${size.width}x${size.height}`; canvas.width = size.width; canvas.height = size.height; renderer.resize(size.width, size.height); }
    perf.sample(ts);
    if (onPerf && ts - perfAt > 500) { perfAt = ts; onPerf(perf.stats(), renderer.counts()); }
    if (!reduced) { const st = perf.stats(), ns = nextScale(scale, st.avgMs, st.frames); if (ns !== scale) { scale = ns; perf.reset(); } }
    const time = capture ? STILL_TIME : (ts - t0) / 1000, aspect = canvas.width / canvas.height;
    const targets = omenTargets(tierFor(s.dread)), step = reduced || capture ? 1 : Math.min(1, (ts - (lastDraw || ts)) / 1000 * 3);
    lastDraw = ts; omen = { eye: omen.eye + (targets.eye - omen.eye) * step, tentacle: omen.tentacle + (targets.tentacle - omen.tentacle) * step };
    if (Math.abs(omen.eye - targets.eye) < 0.01) omen.eye = targets.eye;
    if (Math.abs(omen.tentacle - targets.tentacle) < 0.01) omen.tentacle = targets.tentacle;
    // Fly-through at Dire and Abyss: turn toward the sea so the risen tentacles and the open eye are both in frame.
    let view = cam;
    const omenW = omenBlendWeight(!!s.fly, omen.tentacle);
    if (omenW > 0) {
      const framing = omenFraming({ gridW: s.gridW, gridD: s.gridD, seed: s.seed, nightNumber: s.night.number, grow: omen.tentacle, eyeOpen: omen.eye, aspect });
      view = blendCamera(cam, framing, omenW);
    }
    const eye = { ...view, y: view.y + headBob(bobPhase, Math.min(1, Math.hypot(smooth.forward, smooth.strafe)), reduced) };
    const sk = hazedSky(s.night.sky, s.night.weather, s.dread, s.night.number), moon = moonParams(s.seed, s.night.number, s.night.sky, s.night.weather);
    const lc = lanternColor(s.dread), carried = carriedLantern(s.dread), fwd = forwardVector(view.yaw, view.pitch);
    const states = lights.map((l) => lanternState(l, s.lamps)), haloKey = states.join(',');
    const fliesStyle = fireflyStyle(s.dread, reduced), fliesKey = `${haloKey}|${fliesStyle.kind}|${reduced}`;
    if (fliesKey !== lastFlies) {
      lastFlies = fliesKey;
      const warm = lights.filter((l, i) => states[i] !== 'unlit');
      renderer.setFireflies(fireflySeeds(warm, s.seed, fireflyCount({ lights: warm.length, reduced })));
    }
    if (haloKey !== lastHalos) { // lit and unlit vigil lanterns glow differently; the halo buffer is rebuilt only when that changes
      lastHalos = haloKey; renderer.setHalos(haloSprites(lights.map((l, i) => ({ ...l, haloScale: lanternPool(states[i], s.dread).halo }))));
    }
    const lit = nearestLights(lights, view).map((l) => {
      const k = lanternFlicker(l.phase, time, s.dread, reduced) * (1 - 0.3 * s.dread);
      const pool = lanternPool(lanternState(l, s.lamps), s.dread);
      return { pos: l.pos, radius: l.radius, color: pool.color.map((v) => v * pool.gain * 1.0 * k) };
    });
    const k0 = lanternFlicker(0.7, time, s.dread, reduced);
    lit.push({ pos: [eye.x + fwd[0] * 0.4, eye.y - 0.25, eye.z + fwd[2] * 0.4], radius: carried.radius, color: carried.color.map((v) => v * 0.9 * k0) });
    const tentKey = omen.tentacle > 0.01 ? `${omen.tentacle.toFixed(3)}|${reduced ? 0 : time.toFixed(2)}|${s.dread.toFixed(2)}` : '';
    if (tentKey !== lastTent) {
      lastTent = tentKey;
      renderer.setTentacles(tentKey ? buildTentacles({ bases: tentacleBases(s.gridW, s.gridD, s.seed), grow: omen.tentacle, dread: s.dread, timeSec: time, reduced }) : new Float32Array(0));
    }
    const postP = { ...postParams({ dread: s.dread, reduced, quality: scale }) }; if (!grain) postP.grain = 0; if (!post) postP.enabled = false; // ?post=0 forces direct rendering (QA and low-end switch)
    const fogs = fogLayers({ dread: s.dread, weather: s.night.weather, timeSec: time, reduced });
    renderer.draw({
      vp: viewProjection(eye, aspect), basis: cameraBasis(eye), camPos: [eye.x, eye.y, eye.z], aspect, time, reduced, sky: { ...sk, ambient: coldFill(sk.ambient) }, moon, moonLight: moonBoost(moon.color), lights: lit,
      fog: fogs.density, groundFog: fogs.ground, groundHeight: fogs.groundHeight, eye: { ...eyeParams(s.seed, s.night.number, s.gridW, s.gridD), open: omen.eye }, fogColor: sk.fog, glowColor: lc, post: postP, sea: seaParams({ dread: s.dread, weather: s.night.weather, reduced }), waterTime: reduced ? 0 : time, flies: { ...fliesStyle, rise: fliesStyle.rise }, fogOffset: [fogs.drift[0] * time * 0.06, fogs.drift[1] * time * 0.06], pointScale: canvas.height * 0.5,
    });
  }

  // ----- input -----
  const onKeyDown = (e) => {
    if (!active || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { if (locked) document.exitPointerLock(); else onExit(); e.preventDefault(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { interact(centerRay()); e.preventDefault(); return; }
    if (KEY_MOVE[e.code]) { keys.add(e.code); e.preventDefault(); wake(); }
  };
  const onKeyUp = (e) => { keys.delete(e.code); };
  const onMouseMove = (e) => { if (locked) { pendingMouse = { dx: (pendingMouse ? pendingMouse.dx : 0) + e.movementX, dy: (pendingMouse ? pendingMouse.dy : 0) + e.movementY }; wake(); } };
  const onLockChange = () => { locked = document.pointerLockElement === canvas; wake(); };
  const onPointerDown = (e) => {
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the pointer already ended; click and drag still work without capture */ }
    const r = canvas.getBoundingClientRect();
    if (e.pointerType === 'touch') {
      const left = e.clientX - r.left < r.width * 0.4;
      touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now(), role: left ? 'drive' : 'look' });
      wake(); return;
    }
    lockedBeforeDown = locked; mouseDown = { x: e.clientX, y: e.clientY, moved: false };
    if (!locked && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* unsupported: drag-look and click picking still work */ } }
  };
  const onPointerMove = (e) => {
    const tch = touches.get(e.pointerId);
    if (tch) {
      if (tch.role === 'drive') drive = touchDrive({ x: tch.x0, y: tch.y0 }, { x: e.clientX, y: e.clientY });
      else { look.dx += (e.clientX - tch.x) * 1.4; look.dy += (e.clientY - tch.y) * 1.4; }
      tch.x = e.clientX; tch.y = e.clientY; wake(); return;
    }
    if (mouseDown && !locked && e.buttons) { look.dx += e.movementX || 0; look.dy += e.movementY || 0; mouseDown.moved = true; wake(); }
  };
  const onPointerUp = (e) => {
    const tch = touches.get(e.pointerId);
    if (tch) {
      touches.delete(e.pointerId);
      if (tch.role === 'drive') drive = { forward: 0, strafe: 0 };
      if (isTap(tch.x0, tch.y0, e.clientX, e.clientY, now() - tch.t0)) {
        const r = canvas.getBoundingClientRect();
        interact(screenRay(cam, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, canvas.width / canvas.height));
      }
      wake(); return;
    }
    const md = mouseDown; mouseDown = null;
    if (!md || md.moved) return;
    if (lockedBeforeDown) interact(centerRay());
    else if (!canvas.requestPointerLock || document.pointerLockElement !== canvas) {
      const r = canvas.getBoundingClientRect();
      interact(screenRay(cam, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2, canvas.width / canvas.height));
    }
  };
  const onResize = () => wake();
  const onVisible = () => { if (!document.hidden) wake(); };

  const listeners = [[window, 'keydown', onKeyDown], [window, 'keyup', onKeyUp], [document, 'mousemove', onMouseMove], [document, 'pointerlockchange', onLockChange],
    [canvas, 'pointerdown', onPointerDown], [canvas, 'pointermove', onPointerMove], [canvas, 'pointerup', onPointerUp], [canvas, 'pointercancel', onPointerUp],
    [window, 'resize', onResize], [document, 'visibilitychange', onVisible], [window, 'gamepadconnected', wake]];

  return {
    get active() { return active; },
    /** Returns false (and reports why) when WebGL or shader compilation is unavailable. */
    enter() {
      if (active) return true;
      try {
        gl ||= canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: capture }) || canvas.getContext('experimental-webgl');
        if (!gl) { notice('view3d.nogl'); return false; }
        renderer ||= createGlRenderer(gl);
      } catch (err) { console.warn('[view3d] ' + err.message); notice('view3d.nogl'); return false; }
      active = true; worldKey = ''; t0 = now(); lastUse = -Infinity;
      for (const [target_, type, fn] of listeners) target_.addEventListener(type, fn);
      loadMeshesOnce().then((set) => { meshes = set; worldKey = ''; wake(); });
      const plan = packLoaded ? null : packTextures();
      if (plan) {
        packLoaded = true;
        Promise.all([plan.wall ? loadPackImage(plan.wall) : null, plan.ground ? loadPackImage(plan.ground) : null])
          .then(([wall, ground]) => { renderer.setPackTextures(wall, ground); wake(); });
      }
      wake(); return true;
    },
    exit() {
      if (!active) return;
      active = false; keys.clear(); touches.clear(); drive = { forward: 0, strafe: 0 }; prompt.hidden = true;
      if (rafId) cancelAnimationFrame(rafId); rafId = 0; running = false;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      for (const [target_, type, fn] of listeners) target_.removeEventListener(type, fn);
    },
    /** Called by the app when layout, dread or night changed while the view is open. */
    refresh: wake,
    get camera() { return cam; },
  };
}
