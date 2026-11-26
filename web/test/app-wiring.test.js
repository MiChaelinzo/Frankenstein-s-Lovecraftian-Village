import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (name) => readFileSync(join(src, name), 'utf8');

// Static check on the real wiring: every dep a controller reads as `deps.name` must be supplied in app.js.
// Optional deps (read as `deps.name?.`) are skipped; they are allowed to be absent.
function suppliedKeys(app, factory) {
  const start = app.indexOf(`${factory}({`);
  assert.ok(start >= 0, `${factory} call not found in app.js`);
  const end = app.indexOf('\n});', start);
  return app.slice(start, end);
}

for (const [file, factory] of [['inventory-ui.js', 'createInventoryController'], ['board-ui.js', 'createBoardController'], ['vigil-ui.js', 'createVigilController']]) {
  test(`app.js supplies every required dep read by ${file}`, () => {
    const body = suppliedKeys(read('app.js'), factory);
    const required = new Set([...read(file).matchAll(/\bdeps\.([A-Za-z0-9_]+)(?!\w|\?\.)/g)].map((m) => m[1]));
    for (const name of required) assert.match(body, new RegExp(`(^|[\\s,{])${name}\\s*[:,}]`), `${factory} in app.js is missing dep "${name}"`);
  });
}

test('the investigation board is wired to key, pad, touch, evidence sources and the save (round 26)', () => {
  const app = read('app.js'), view = read('view3d.js'), touch = read('touch-ui.js'), input = read('input.js'), html = readFileSync(join(src, '..', 'index.html'), 'utf8');
  assert.match(app, /e\.key === BOARD_KEY/);
  assert.match(app, /case 'board': board\.toggle\(\)/);
  assert.match(app, /onBoard: \(\) => board\.toggle\(\)/);
  assert.match(app, /board: \(\) => board\.toggle\(\)/); // touch action
  assert.match(app, /onClue: \(id\) => board\.noteClue\(id\)/);
  assert.match(app, /onMet: \(i\) => board\.noteMet\(i\), onChat:/);
  assert.match(app, /board\.sync\(\)/);
  assert.match(app, /\.\.\.board\.snapshot\(\)/);
  assert.equal([...app.matchAll(/board\.restore\(/g)].length, 1);
  assert.match(app, /restoreSessionControllers\(v\)/);
  assert.match(view, /acts\.includes\('board'\) && onBoard/);
  assert.match(touch, /board: \(\) => actions\.board\(\)/);
  assert.match(input, /16: 'board'/);
  assert.match(html, /id="boardToggle"/); assert.match(html, /id="boardPanel"[^>]*hidden/); assert.match(html, /id="boardLive"[^>]*aria-live="polite"/); assert.match(html, /id="touchBoard"/);
  assert.match(read('tour.js'), /id: 'board', target: 'boardToggle'/);
});

test('the Horror Director is stepped from a timer, not from the 3D render callback (round 30)', () => {
  const app = read('app.js');
  const scene = app.slice(app.indexOf('getScene: () => ({'), app.indexOf('labelFor:', app.indexOf('getScene: () => ({')));
  assert.ok(scene.length > 100, 'getScene block not found');
  assert.doesNotMatch(scene, /directorUpdate\(|directorStep\(|directorRamp\(|directorFrame\(/, 'getScene must only read the cached look');
  assert.match(scene, /director: directorLookNow/);
  assert.match(app, /setInterval\(\(\) => \{ if \(!document\.hidden\) directorUpdate\(\); \}, DIRECTOR_STEP_MS\)/);
  assert.equal([...app.matchAll(/directorStep\(/g)].length, 1, 'a single call, inside directorUpdate');
});

test('round 36 evolution wiring: the chronicle gets reputation, rumor library and experienced beats, saved state is unchanged (spec 175, 176, 182)', async () => {
  const app = read('app.js'), ui = read('chronicle-ui.js'), soc = read('society-ui.js');
  const body = suppliedKeys(app, 'createChronicleController');
  assert.match(body, /evolution: \(\) => \(\{ reputation: society\.reputationEffects\(\), mutations: society\.rumorMutationLibrary\(\), beats: experiencedBeats \}\)/);
  assert.match(body, /evolutionKey:/); assert.match(body, /reputationOf: \(i\) => society\.reputationOf\(i\)/);
  assert.match(ui, /evolution: deps\.evolution \? deps\.evolution\(\) : undefined/); // absent dep keeps the chronicle as it was
  assert.match(app, /experiencedBeats\.push\(\{ night: state\.night \+ 1, id: beat\.id \}\)/);
  assert.match(app, /experiencedBeats\.length = 0/); // a new run forgets the beats
  assert.match(soc, /reputationEffectsAfter\(log, logNights\)/);
  // The saved shape is untouched: the snapshot holds the same two strings and never the nights or the beats.
  assert.match(soc, /snapshot: \(\) => \{ ensureSeed\(\); return \{ society: serializeSocietyLog\(log\), memory: serializeMemoryLog\(memoryLog\) \}; \}/);
  assert.doesNotMatch(app, /experiencedBeats[^;\n]*snapshot/);
  const { serializeSocietyLog } = await import('../src/society-ui.js');
  assert.equal(serializeSocietyLog([{ kind: 0, subject: 1, night: 3 }, { kind: 2, subject: -1 }]), 'sc1;0:1,2:-1');
  const { STRINGS } = await import('../src/i18n.js');
  for (const lang of ['en', 'fr']) for (const k of ['society.reputation.trusted', 'society.reputation.accused']) assert.ok(STRINGS[lang][k] && !STRINGS[lang][k].includes('{'), `${lang} ${k}`);
});
