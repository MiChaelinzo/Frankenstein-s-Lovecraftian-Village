// Opt-in first-person WebGL view (?view=3d). Dependency-free WebGL 1. All maths is in view3d-math.js, the village layout comes from
// core.js, meshes from glb.js and the interaction rules from InteractionRules in core.js. This file only owns GL objects, shaders,
// input listeners and the frame loop. Original shaders and geometry only: no DLNK assets or footage are used.
import { InteractionRules } from './core.js';
import { appendMeshVertices, loadMeshSet, VERTEX_FLOATS } from './glb.js';
import { mapGamepad, padAxes3d, snapshotPad, touchDrive, isTap } from './input.js';
import { createPerf } from './perf.js';
import {
  CELL, EYE_HEIGHT, FAR, FOV_Y, MAX_LIGHTS, carriedLantern, cameraBasis, fogDensity, forwardVector, headBob, lanternColor, lanternFlicker,
  lanternLights, moonParams, nearestLights, nextScale, particleCounts, particleSeeds, parseCamParam, pickBox, renderSize, screenRay, skyColors,
  spawnPoint, stepCamera, terrainRects, viewProjection, windowLit, worldBounds, worldBoxes,
} from './view3d-math.js';

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
  const lamp = meshes && meshes.get('lamp');
  if (lamp) for (const l of lights) if (l.post) appendMeshVertices(out, lamp, null, cell, { glow: 1, phase: l.phase, scale: 1, at: [l.pos[0], l.pos[2]] });
  const t = terrainRects(gridW, gridD, seed, cell), g = t.ground, ground = [], sea = [];
  const gc = groundTint ? groundTint.map((v) => (v / 255) * 0.5) : [0.16, 0.17, 0.14];
  pushQuad(ground, g.minX, g.minZ, g.maxX, g.maxZ, 0, gc, -1);
  pushQuad(sea, t.sea.minX, t.sea.minZ, t.sea.maxX, t.sea.maxZ, t.sea.y, [0.02, 0.05, 0.08], -2);
  return { building: new Float32Array(out), ground: new Float32Array(ground), sea: new Float32Array(sea), heights, lights, coast: t.side };
}

// ---------- shaders ----------

const FRAG_HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const SCENE_VS = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor; attribute float aGlow; attribute float aPhase;
uniform mat4 uVP; varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase;
void main(){ vPos=aPos; vNormal=aNormal; vColor=aColor; vGlow=aGlow; vPhase=aPhase; gl_Position=uVP*vec4(aPos,1.0); }`;
const SCENE_FS = `${FRAG_HEAD}varying vec3 vPos; varying vec3 vNormal; varying vec3 vColor; varying float vGlow; varying float vPhase;
uniform vec3 uCam; uniform vec3 uFogColor; uniform float uFog; uniform vec3 uAmbient; uniform vec3 uMoonDir; uniform vec3 uMoonColor;
uniform vec4 uLight[${MAX_LIGHTS}]; uniform vec3 uLightCol[${MAX_LIGHTS}]; uniform vec3 uGlowColor; uniform float uTime; uniform float uFlicker; uniform float uMode;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 toCam = uCam - vPos; float dist = length(toCam); vec3 V = toCam / max(dist, 0.001);
  vec3 n = normalize(vNormal); if (dot(n, V) < 0.0) n = -n;
  vec3 base = vColor;
  if (uMode > 0.5 && uMode < 1.5) { vec2 c = floor(vPos.xz * 1.5); base *= 0.88 + 0.16 * hash(c) + 0.12 * hash(floor(vPos.xz * 6.0)) + 0.08 * sin(vPos.x * 0.21) * sin(vPos.z * 0.17); }
  vec3 lightSum = uAmbient + uMoonColor * max(dot(n, uMoonDir), 0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uLight[i]; if (L.w <= 0.0) continue;
    vec3 d = L.xyz - vPos; float r2 = dot(d, d); float att = clamp(1.0 - r2 / (L.w * L.w), 0.0, 1.0); att *= att;
    float nl = max(dot(n, normalize(d)), 0.0) * 0.75 + 0.25; lightSum += uLightCol[i] * att * nl;
  }
  vec3 col = base * lightSum;
  if (uMode > 1.5) {
    vec3 sn = normalize(vec3(sin(vPos.x * 0.7 + uTime) * 0.07 + sin(vPos.z * 1.7 + uTime * 1.3) * 0.05, 1.0, cos(vPos.z * 0.6 + uTime * 0.8) * 0.07));
    float fres = pow(1.0 - max(dot(sn, V), 0.0), 3.0);
    vec3 R = reflect(-V, sn);
    float spec = pow(max(dot(R, uMoonDir), 0.0), 140.0);
    col = mix(base * lightSum, uFogColor * 1.1, 0.25 + 0.6 * fres) + uMoonColor * spec * 6.0;
  }
  if (vGlow > 0.0) { float fl = 1.0 - uFlicker * 0.12 * (0.5 + 0.5 * sin(uTime * 6.0 + vPhase * 2.3)); col = mix(col, uGlowColor * 1.4, clamp(vGlow, 0.0, 1.0) * fl); }
  float f = 1.0 - exp(-pow(dist * uFog, 2.0));
  gl_FragColor = vec4(mix(col, uFogColor, clamp(f, 0.0, 1.0)), 1.0);
}`;
const SKY_VS = 'attribute vec2 aPos; varying vec2 vNdc; void main(){ vNdc = aPos; gl_Position = vec4(aPos, 0.9999, 1.0); }';
const SKY_FS = `${FRAG_HEAD}varying vec2 vNdc; uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uTy; uniform float uAspect;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uMoonDir; uniform vec3 uMoonColor; uniform float uMoonSize; uniform float uStars; uniform float uCloud; uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  vec3 d = normalize(uF + uR * vNdc.x * uTy * uAspect + uU * vNdc.y * uTy);
  float h = d.y; vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.45));
  if (h < 0.0) col = uHorizon * 0.8;
  vec2 uv = d.xz / (abs(h) + 0.2) * 0.8 + vec2(uTime * 0.004, 0.0);
  float cl = (vnoise(uv * 2.0) * 0.6 + vnoise(uv * 5.0) * 0.3 + vnoise(uv * 11.0) * 0.1);
  float c = smoothstep(0.42, 0.78, cl) * uCloud * clamp(h * 5.0, 0.0, 1.0);
  col = mix(col, uHorizon * 0.55 + 0.03, c * 0.7);
  vec3 g = floor(d * 160.0); float s = step(0.9972, hash(g.xy + g.z * 7.31)) * uStars * (1.0 - c) * smoothstep(0.04, 0.3, h);
  col += vec3(0.8, 0.85, 1.0) * s;
  float m = dot(d, uMoonDir); float disc = smoothstep(cos(uMoonSize), cos(uMoonSize * 0.9), m);
  float halo = pow(max(m, 0.0), 40.0) * 0.5 + pow(max(m, 0.0), 6.0) * 0.08;
  col += (vec3(0.9, 0.93, 1.0) * disc + uMoonColor * 2.0 * halo) * (1.0 - c * 0.75) * step(0.0001, uMoonColor.z);
  gl_FragColor = vec4(col, 1.0);
}`;
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
  const scene = program(gl, SCENE_VS, SCENE_FS), sky = program(gl, SKY_VS, SKY_FS), part = program(gl, PART_VS, PART_FS);
  const skyBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const bufs = { building: gl.createBuffer(), ground: gl.createBuffer(), sea: gl.createBuffer(), rain: gl.createBuffer(), mist: gl.createBuffer() };
  const counts = { building: 0, ground: 0, sea: 0, rain: 0, mist: 0 };
  const lightPos = new Float32Array(MAX_LIGHTS * 4), lightCol = new Float32Array(MAX_LIGHTS * 3);
  const upload = (name, data) => { gl.bindBuffer(gl.ARRAY_BUFFER, bufs[name]); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); counts[name] = data.length / (name === 'rain' || name === 'mist' ? 3 : VERTEX_FLOATS); };
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
    setWorld(w) { upload('building', w.building); upload('ground', w.ground); upload('sea', w.sea); },
    setParticles(rainSeeds, mistSeeds) { upload('rain', rainSeeds); upload('mist', mistSeeds); },
    resize(w, h) { gl.viewport(0, 0, w, h); },
    draw(f) {
      gl.clearColor(f.fogColor[0], f.fogColor[1], f.fogColor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // sky
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(sky.p);
      const b = f.basis; gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
      const sl = gl.getAttribLocation(sky.p, 'aPos'); gl.enableVertexAttribArray(sl); gl.vertexAttribPointer(sl, 2, gl.FLOAT, false, 8, 0);
      gl.uniform3fv(sky.u('uF'), b.f); gl.uniform3fv(sky.u('uR'), b.r); gl.uniform3fv(sky.u('uU'), b.u);
      gl.uniform1f(sky.u('uTy'), Math.tan(FOV_Y / 2)); gl.uniform1f(sky.u('uAspect'), f.aspect);
      gl.uniform3fv(sky.u('uZenith'), f.sky.zenith); gl.uniform3fv(sky.u('uHorizon'), f.sky.horizon);
      gl.uniform3fv(sky.u('uMoonDir'), f.moon.dir); gl.uniform3fv(sky.u('uMoonColor'), f.moon.color); gl.uniform1f(sky.u('uMoonSize'), f.moon.size);
      gl.uniform1f(sky.u('uStars'), f.sky.stars); gl.uniform1f(sky.u('uCloud'), f.sky.cloud); gl.uniform1f(sky.u('uTime'), f.reduced ? 0 : f.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // world
      gl.enable(gl.DEPTH_TEST); gl.useProgram(scene.p);
      lightPos.fill(0); lightCol.fill(0);
      f.lights.slice(0, MAX_LIGHTS).forEach((l, i) => { lightPos.set([l.pos[0], l.pos[1], l.pos[2], l.radius], i * 4); lightCol.set(l.color, i * 3); });
      gl.uniformMatrix4fv(scene.u('uVP'), false, f.vp); gl.uniform3fv(scene.u('uCam'), f.camPos); gl.uniform3fv(scene.u('uFogColor'), f.fogColor);
      gl.uniform1f(scene.u('uFog'), f.fog); gl.uniform3fv(scene.u('uAmbient'), f.sky.ambient); gl.uniform3fv(scene.u('uMoonDir'), f.moon.dir);
      gl.uniform3fv(scene.u('uMoonColor'), f.moon.color); gl.uniform4fv(scene.u('uLight'), lightPos); gl.uniform3fv(scene.u('uLightCol'), lightCol);
      gl.uniform3fv(scene.u('uGlowColor'), f.glowColor); gl.uniform1f(scene.u('uTime'), f.time); gl.uniform1f(scene.u('uFlicker'), f.reduced ? 0 : 1);
      for (const [name, mode] of [['sea', 2], ['ground', 1], ['building', 0]]) {
        if (!counts[name]) continue;
        gl.uniform1f(scene.u('uMode'), mode); bindScene(bufs[name]); gl.drawArrays(gl.TRIANGLES, 0, counts[name]);
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

let meshPromise = null;
const loadMeshesOnce = () => (meshPromise ||= loadMeshSet(fetch.bind(globalThis), 'assets/meshes/', [...new Set(Object.values(MESH_FOR)), 'lamp']));

/**
 * getScene() -> { layout, seed, gridW, gridD, dread, night: {number, sky, weather}, categoryOf(id), labelFor(piece, kind), tintFor(id), groundTint }
 * onInteract(piece, kind) applies the sanity change and shows the line; onExit() leaves the view; notice(key) reports status text.
 */
export function createView3d({ canvas, prompt, getScene, onInteract, onExit, notice, reduced = false, capture = false, camParam = null, now = () => performance.now() }) {
  let gl = null, renderer = null, active = false, rafId = 0, running = false;
  let cam = null, world = null, worldKey = '', boxes = [], bounds = null, meshes = null, lights = [], rainKey = '';
  let last = 0, t0 = 0, dirty = true, scale = 1, lastSize = '', lastUse = -Infinity, bobPhase = 0, locked = false, pendingMouse = null;
  const keys = new Set(), perf = createPerf(), touches = new Map();
  let drive = { forward: 0, strafe: 0 }, look = { dx: 0, dy: 0 }, padPrev = null, mouseDown = null, lockedBeforeDown = false;

  const wake = () => { dirty = true; if (active && !running) { running = true; last = 0; rafId = requestAnimationFrame(loop); } };
  const isTyping = (e) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target && e.target.tagName);

  function ensureWorld(s) {
    const key = [s.seed, meshes ? meshes.size : 0, s.layout.map((p) => p.detail).join('')].join('|');
    if (key === worldKey) return;
    worldKey = key;
    world = buildWorld({ layout: s.layout, meshes, seed: s.seed, gridW: s.gridW, gridD: s.gridD, tintFor: s.tintFor, groundTint: s.groundTint });
    boxes = worldBoxes(s.layout, world.heights); bounds = worldBounds(s.gridW, s.gridD);
    lights = world.lights; renderer.setWorld(world);
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
    const hit = pickBox([cam.x, cam.y, cam.z], ray, boxes, 60);
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
    const inp = currentInput(), mouse = look.dx || look.dy || pendingMouse ? { dx: look.dx + (pendingMouse ? pendingMouse.dx : 0), dy: look.dy + (pendingMouse ? pendingMouse.dy : 0) } : null;
    const before = cam;
    cam = stepCamera(cam, inp, dt, boxes, bounds, mouse); look = { dx: 0, dy: 0 }; pendingMouse = null;
    const moved = cam.x !== before.x || cam.z !== before.z || cam.yaw !== before.yaw || cam.pitch !== before.pitch;
    const moving = !!(inp.forward || inp.strafe);
    if (moving) bobPhase += dt;
    const padOn = navigator.getGamepads && Array.from(navigator.getGamepads() || []).some(Boolean);
    const animated = !reduced && !capture;
    if (animated || dirty || moved || moving) { draw(s, ts); dirty = false; if (moved) updatePrompt(s); }
    const stay = animated || moving || moved || padOn || keys.size > 0 || touches.size > 0 || dirty;
    if (stay) rafId = requestAnimationFrame(loop); else running = false;
  }

  function draw(s, ts) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = renderSize(rect.width || canvas.width, rect.height || canvas.height, dpr, scale);
    if (`${size.width}x${size.height}` !== lastSize) { lastSize = `${size.width}x${size.height}`; canvas.width = size.width; canvas.height = size.height; renderer.resize(size.width, size.height); }
    perf.sample(ts);
    if (!reduced) { const st = perf.stats(), ns = nextScale(scale, st.avgMs, st.frames); if (ns !== scale) { scale = ns; perf.reset(); } }
    const time = (ts - t0) / 1000, aspect = canvas.width / canvas.height;
    const eye = { ...cam, y: cam.y + headBob(bobPhase, 1, reduced) };
    const sk = skyColors(s.night.sky, s.night.weather, s.dread), moon = moonParams(s.seed, s.night.number, s.night.sky, s.night.weather);
    const lc = lanternColor(s.dread), carried = carriedLantern(s.dread), fwd = forwardVector(cam.yaw, cam.pitch);
    const lit = nearestLights(lights, cam).map((l) => {
      const k = lanternFlicker(l.phase, time, s.dread, reduced) * (1 - 0.3 * s.dread);
      return { pos: l.pos, radius: l.radius, color: lc.map((v) => v * 1.3 * k) };
    });
    const k0 = lanternFlicker(0.7, time, s.dread, reduced);
    lit.push({ pos: [eye.x + fwd[0] * 0.4, eye.y - 0.25, eye.z + fwd[2] * 0.4], radius: carried.radius, color: carried.color.map((v) => v * 0.9 * k0) });
    renderer.draw({
      vp: viewProjection(eye, aspect), basis: cameraBasis(eye), camPos: [eye.x, eye.y, eye.z], aspect, time, reduced, sky: sk, moon, lights: lit,
      fog: fogDensity({ dread: s.dread, weather: s.night.weather, timeSec: time, reduced }), fogColor: sk.fog, glowColor: lc, pointScale: canvas.height * 0.5,
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
    canvas.setPointerCapture?.(e.pointerId);
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
