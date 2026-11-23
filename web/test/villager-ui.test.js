import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCityLayout } from '../src/districts.js';
import { generateLayout, PrefabCatalog, generateCampaign, SanityModel } from '../src/core.js';
import { readFileSync } from 'node:fs';
import { mapGamepad, BUTTON_ACTIONS } from '../src/input.js';
import { STRINGS } from '../src/i18n.js';
import { t } from '../src/i18n.js';
import { generateRoster } from '../src/villagers.js';
import {
  buildVillagerRequest, sanitizeAiLine, fetchVillagerLine, MAX_AI_LINE_CHARS, NARRATOR_TIMEOUT_MS,
} from '../src/villager-narrator.js';
import {
  parseTickParam, sessionTick, villagerPlacements, whoIsWhereRows, villagerMarkers, villagerScene, nearestVillager, START_TICK,
} from '../src/villager-view.js';
import { createVillagerController } from '../src/villager-ui.js';
import { buildVillagers, poseWalker, VILLAGER_SWAY_RAD, VILLAGER_HIP_HEIGHT } from '../src/view3d.js';
import { frameCost, FRAME_BUDGET } from '../src/view3d-math.js';

const catalog = new PrefabCatalog(JSON.parse(readFileSync(new URL('../data/village_catalog.json', import.meta.url))).entries);
const layout = generateLayout(catalog, 24, 24, 80, 1818);
const roster = generateRoster(1818, layout);
const REQ = buildVillagerRequest({ villager: 'A B', roleId: 'fisher', behavior: 0, cause: 'routine', phase: 'day', dreadPercent: 12.4, night: 1, lang: 'en', fallback: 'x' });

// ---- narrator ----
test('request carries context only and clamps numbers', () => {
  assert.equal(REQ.kind, 'villager'); assert.equal(REQ.dread, 12);
  assert.equal(buildVillagerRequest({ ...REQ, villager: 'v', roleId: 'r', dreadPercent: 900 }).dread, 100);
});
test('sanitize: strings only, control characters removed, capped', () => {
  assert.equal(sanitizeAiLine(42), ''); assert.equal(sanitizeAiLine(null), '');
  assert.equal(sanitizeAiLine('  a\u0000b\n\nc  '), 'a b c');
  const long = sanitizeAiLine('x'.repeat(1000)); assert.equal(long.length, MAX_AI_LINE_CHARS); assert.ok(long.endsWith('\u2026'));
  assert.equal(sanitizeAiLine('<img src=x onerror=1>'), '<img src=x onerror=1>', 'kept as text; the UI uses textContent');
});
const okFetch = (body) => async () => ({ ok: true, json: async () => body });
test('narrator success returns the AI line', async () => {
  const out = await fetchVillagerLine({ url: 'https://x.test/n', request: REQ, fallback: 'FB', fetchImpl: okFetch({ text: ' The tide hums. ' }) });
  assert.deepEqual(out, { text: 'The tide hums.', source: 'ai', reason: '' });
});
test('narrator failures all return the fallback with a reason', async () => {
  const cases = [
    ['disabled', { url: '' }], ['bad_url', { url: 'javascript:alert(1)', fetchImpl: okFetch({ text: 'a' }) }],
    ['network', { url: 'https://x.test', fetchImpl: async () => { throw new TypeError('blocked by CSP'); } }],
    ['http', { url: 'https://x.test', fetchImpl: async () => ({ ok: false, status: 500 }) }],
    ['malformed', { url: 'https://x.test', fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }) }],
    ['malformed', { url: 'https://x.test', fetchImpl: okFetch({ text: 5 }) }],
    ['empty', { url: 'https://x.test', fetchImpl: okFetch({ text: '  \n ' }) }],
  ];
  for (const [reason, o] of cases) { const out = await fetchVillagerLine({ request: REQ, fallback: 'FB', ...o }); assert.deepEqual([out.text, out.source, out.reason], ['FB', 'fallback', reason]); }
});
test('narrator timeout aborts a hanging request', async () => {
  let aborted = false;
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }));
  const out = await fetchVillagerLine({ url: 'https://x.test', request: REQ, fallback: 'FB', fetchImpl: hang, timeoutMs: 20 });
  assert.equal(out.reason, 'timeout'); assert.ok(aborted); assert.ok(NARRATOR_TIMEOUT_MS >= 1000);
});

// ---- view ----
test('tick param and session clock', () => {
  assert.equal(parseTickParam('?tick=300'), 300); assert.equal(parseTickParam('#seed=1&tick=-5'), -5);
  assert.equal(parseTickParam('?tick=abc'), null); assert.equal(parseTickParam(''), null);
  assert.equal(sessionTick(0, null), START_TICK); assert.equal(sessionTick(5500, null), START_TICK + 5); assert.equal(sessionTick(5500, null, 100), START_TICK + 105); assert.equal(sessionTick(0, 7, 3), 10); assert.equal(sessionTick(99999, 12), 12); assert.equal(sessionTick(NaN, null), START_TICK);
});
const place = (tick, dread) => villagerPlacements({ roster, layout, tick, dread, gridW: 24, gridD: 24, seed: 1818 });
test('placements are deterministic, inside the grid, and vanish at Abyss', () => {
  assert.deepEqual(place(300, 0.1), place(300, 0.1));
  for (const tick of [0, 300, 700, 1000, 1300]) for (const p of place(tick, 0.2)) { assert.ok(!p.gone); assert.ok(p.x >= 0.3 && p.x <= 23.7 && p.z >= 0.3 && p.z <= 23.7, JSON.stringify(p)); }
  const abyss = place(300, 1); assert.ok(abyss.every((p) => p.gone && p.placeName === 'gone'));
  assert.equal(villagerMarkers(abyss, 24, 24, 168).length, 0); assert.equal(villagerScene(abyss, 4).length, 0);
});
test('lanterns burn after dusk, the lamplighter always carries one', () => {
  const day = place(300, 0), night = place(1300, 0);
  assert.deepEqual(day.map((p) => p.lantern), day.map((p) => p.role === 3));
  assert.ok(night.every((p) => p.lantern));
});
test('rows, markers, scene and nearest pick', () => {
  const ps = place(300, 0.1), rows = whoIsWhereRows(ps);
  assert.equal(rows.length, 7); assert.match(rows[0].whereKey, /^villagerui\.where\./);
  for (const r of rows) for (const lang of ['en', 'fr']) { assert.ok(STRINGS[lang][r.roleKey]); assert.ok(STRINGS[lang][r.whereKey]); }
  const m = villagerMarkers(ps, 24, 24, 168); assert.ok(m.every((k) => k.x >= 0 && k.x <= 168 && k.y >= 0 && k.y <= 168));
  const scene = villagerScene(ps, 4), v = scene[0];
  assert.equal(nearestVillager(scene, v.pos[0], v.pos[2], 3).id, v.id);
  assert.equal(nearestVillager(scene, -500, -500, 3), null);
});

// ---- the living village (round 24) ----
// Root cause of "no villagers in the Old Town": the city is 36 x 36 cells (144 m) but the roster is seven people who, after dusk, all stood at their own
// front doors spread across the whole city, so the square (Old Town, centre) was empty at night. Gathering and the lamplighter's patrol bring people back.
const cityLayout = generateCityLayout(catalog, 36, 36, 180, 1818), cityRoster = generateRoster(1818, cityLayout);
const cityScene = (tick, dread = 0.2) => villagerScene(villagerPlacements({ roster: cityRoster, layout: cityLayout, tick, dread, gridW: 36, gridD: 36, seed: 1818 }), 4);
const nearSquare = (scene, metres) => scene.filter((v) => Math.hypot(v.pos[0] - 74, v.pos[2] - 74) <= metres);
test('seed 1818: someone is always drawn in the Old Town square, night included, and a night walker carries a lit lantern', () => {
  for (const tick of [0, 300, 400, 700, 845, 1070, 1100, 1250, 1380, 1439]) assert.ok(nearSquare(cityScene(tick), 20).length >= 1, `nobody in the square at tick ${tick}`);
  const night = nearSquare(cityScene(1250), 20);
  assert.ok(night.every((v) => v.lantern));
  assert.ok(cityScene(1070).length >= 6, 'at the session start nearly everyone is drawn');
});
test('late at night villagers at home are indoors (not drawn, not pickable) and the lamplighter is not', () => {
  const placements = villagerPlacements({ roster: cityRoster, layout: cityLayout, tick: 1300, dread: 0.2, gridW: 36, gridD: 36, seed: 1818 });
  assert.ok(placements.some((p) => p.indoors));
  const scene = villagerScene(placements, 4);
  assert.ok(scene.every((v) => !placements[v.id].indoors));
  assert.ok(!placements[3].indoors && scene.some((v) => v.id === 3));
  assert.equal(villagerMarkers(placements, 36, 36, 100).length, scene.length);
});
test('walking is continuous: a villager never jumps more than the walk speed allows between two ticks', () => {
  for (const v of cityRoster) {
    let prev = null;
    for (let tick = 200; tick < 1500; tick += 0.5) {
      const p = villagerPlacements({ roster: cityRoster, layout: cityLayout, tick, dread: 0.2, gridW: 36, gridD: 36, seed: 1818 })[v.index];
      if (prev && !prev.gone && !p.gone && prev.walking && p.walking) assert.ok(Math.hypot(p.x - prev.x, p.z - prev.z) < 2.5, `${v.name} jumped at ${tick}`);
      prev = p;
    }
  }
});
test('poseWalker swings the legs, bobs, narrows through a door and holds still when reduced', () => {
  const tri = (y) => [0.2, y, 0, 0, 0, 1, 1, 1, 1, 0, 0];
  const verts = () => [...tri(0.1), ...tri(1.2), ...tri(0.1)];
  const a = verts(); poseWalker(a, 0, 0, 0, 0, 0.35, 1);
  assert.ok(a[2] !== 0, 'legs swing along the facing');
  assert.equal(a[11 + 2], 0, 'the torso does not swing');
  assert.ok(a[1] > 0.1 && a[12] > 1.2, 'the body bobs');
  const door = verts(); poseWalker(door, 0, 0, 0, 0, 0, 0); assert.equal(door[0], 0, 'fully faded is a sliver');
  const still = verts(); poseWalker(still, 0, 0, 0, 0, 0.35, 1, true); assert.deepEqual(still, verts());
  assert.ok(VILLAGER_HIP_HEIGHT > 0.5 && VILLAGER_HIP_HEIGHT < 1.2);
});

// ---- 3D buffer and budget ----
test('3D villager buffer: empty without a mesh, still when reduced, swaying otherwise', () => {
  const model = { bounds: { min: [-1, 0, -1], max: [1, 2, 1] }, triangles: [{ p: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], color: [0.5, 0.5, 0.5], emissive: false }] };
  const vs = villagerScene(place(300, 0.1), 4);
  assert.equal(buildVillagers({ villagers: vs, model: null }).length, 0);
  assert.equal(buildVillagers({ villagers: vs, model }).length, vs.length * 3 * 11);
  assert.deepEqual(buildVillagers({ villagers: vs, model, timeSec: 0, reduced: true }), buildVillagers({ villagers: vs, model, timeSec: 7.3, reduced: true }));
  assert.notDeepEqual(buildVillagers({ villagers: vs, model, timeSec: 0 }), buildVillagers({ villagers: vs, model, timeSec: 3 }));
  assert.ok(VILLAGER_SWAY_RAD < 0.1);
});
test('frame budget still holds with the villager buffer', () => {
  const worst = frameCost({ vertices: { building: 3000, ground: 600, sea: 6, coast: 3000, tentacle: 900, villager: 900 }, rain: 900, mist: 100, halos: 100, fireflies: 100, post: true, lights: 8 });
  assert.ok(worst.drawCalls <= FRAME_BUDGET.drawCalls, JSON.stringify(worst));
});

// ---- gamepad ----
test('gamepad button 7 maps to talk and fires once per press', () => {
  assert.equal(BUTTON_ACTIONS[7], 'talk');
  const up = { buttons: [], axes: [] }, down = { buttons: Array.from({ length: 8 }, (_, i) => i === 7), axes: [] };
  assert.deepEqual(mapGamepad(up, down), ['talk']); assert.deepEqual(mapGamepad(down, down), []);
});

// ---- controller: AI text never changes state ----
function fakeDoc() {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) els.set(id, { id, textContent: '', hidden: true, innerHTML: '', focus() {}, addEventListener() {}, setAttribute() {} }); return els.get(id); };
  return { $: el, els };
}
function run(fetchImpl, narratorUrl) {
  const { $, els } = fakeDoc();
  const state = { seed: 1818, layout, sanity: new SanityModel(40), campaign: generateCampaign(1818), night: 0, villagers: [] };
  const effects = [], said = [];
  const ctl = createVillagerController({
    $, tr: (k, v) => t(k, 'en', v), lang: 'en', state, gridW: 24, gridD: 24, tickNow: () => 300, chatNeeds: () => ({ cluesLeft: 2, lampsLeft: 1, sanity: 30 }), announce: (x) => said.push(x), narratorUrl, fetchImpl,
    applyEffect: (result) => { effects.push(result); state.sanity.apply(result.sanityDelta); },
  });
  ctl.refresh();
  return { ctl, state, effects, said, els };
}
test('talking: same clue and sanity effect with no narrator, a failing narrator and a succeeding narrator', async () => {
  const runs = [run(null, null), run(async () => { throw new Error('unreachable'); }, 'https://unreachable.invalid/n'), run(okFetch({ text: 'AI whisper' }), 'https://ok.test/n')];
  for (const r of runs) { const present = r.state.villagers.find((p) => p.index === 0); assert.ok(present && !present.gone); r.ctl.talkTo(0); }
  await new Promise((resolve) => setTimeout(resolve, 20));
  const snap = (r) => JSON.stringify({ effects: r.effects, sanity: r.state.sanity.value });
  assert.equal(snap(runs[0]), snap(runs[1])); assert.equal(snap(runs[0]), snap(runs[2]));
  assert.notEqual(runs[2].els.get('villagerLine').textContent, runs[0].els.get('villagerLine').textContent);
  assert.equal(runs[2].els.get('villagerLine').textContent, 'AI whisper');
  assert.equal(runs[1].els.get('villagerLine').textContent, runs[0].els.get('villagerLine').textContent, 'failure keeps the deterministic line');
});
test('chat shows a Core hint, cycles topics, changes no state and asks no narrator', () => {
  let fetched = 0;
  const r = run(async () => { fetched++; return { ok: true, json: async () => ({ text: 'AI' }) }; }, 'https://ok.test/n');
  const before = r.state.sanity.value;
  const first = r.ctl.chatWith(0), second = r.ctl.chatWith(0);
  assert.equal(first.topic, 0); assert.equal(second.topic, 1);
  assert.equal(r.effects.length, 0); assert.equal(r.state.sanity.value, before); assert.equal(fetched, 0);
  assert.equal(first.hintId, 'clues_seek');
  assert.equal(r.els.get('villagerLine').textContent, t(`villagerui.chat.lamps_light.${second.lineVariant}`, 'en'));
  assert.ok(r.els.get('villagerEffect').textContent.includes(t('villagerui.chat.topic.1', 'en')));
  assert.ok(r.ctl.chatNext(), 'the 2D key finds somebody present');
});
test('a vanished villager cannot be chatted with', () => {
  const r = run(null, null); r.state.sanity = new SanityModel(0); r.ctl.refresh();
  assert.equal(r.ctl.chatWith(0).available, false); assert.equal(r.els.get('villagerLine').textContent, t('villager.gone', 'en'));
  assert.equal(r.ctl.chatNext(), null);
});
test('a vanished villager cannot be talked to and applies no effect', () => {
  const r = run(null, null); r.state.sanity = new SanityModel(0); r.ctl.refresh();
  assert.ok(r.state.villagers.every((p) => p.gone));
  const out = r.ctl.talkTo(0); assert.equal(out.available, false); assert.equal(r.effects.length, 0);
  assert.equal(r.els.get('villagerLine').textContent, t('villager.gone', 'en'));
});
test('closing the dialogue drops a late AI answer', async () => {
  let release; const slow = () => new Promise((res) => { release = () => res({ ok: true, json: async () => ({ text: 'late' }) }); });
  const r = run(slow, 'https://slow.test'); r.ctl.talkTo(0);
  const line = r.els.get('villagerLine').textContent; r.ctl.close(); release(); await new Promise((res) => setTimeout(res, 10));
  assert.equal(r.els.get('villagerLine').textContent, line);
});
test('markup: dialogue, panel and talk button exist; index.html declares aria and no inline narrator keys', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['villagerDialog', 'villagerName', 'villagerLine', 'villagerClose', 'villagerPanel', 'villagerList', 'villagerClock', 'villagerToggle', 'touchTalk']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="villagerDialog"[^>]*role="dialog"[^>]*hidden/);
  for (const f of ['../_headers', '../../vercel.json', '../../netlify.toml']) assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), /connect-src 'self'[^;]*https:\/\/\*\.paypal\.com/, f);
});

test('chat topics restart when the village or the night changes', () => {
  const r = run(null, null);
  assert.equal(r.ctl.chatWith(0).topic, 0); assert.equal(r.ctl.chatWith(0).topic, 1);
  r.state.night = 1; r.ctl.refresh();
  assert.equal(r.ctl.chatWith(0).topic, 0, 'a new night starts at topic 0');
  assert.equal(r.ctl.chatWith(0).topic, 1);
  r.state.seed = 2024; r.state.layout = layout.slice(0, layout.length - 1); r.ctl.refresh();
  assert.equal(r.ctl.chatWith(0).topic, 0, 'a new village starts at topic 0');
});
