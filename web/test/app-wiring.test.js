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
  assert.equal([...app.matchAll(/board\.restore\(/g)].length, 2);
  assert.match(view, /acts\.includes\('board'\) && onBoard/);
  assert.match(touch, /board: \(\) => actions\.board\(\)/);
  assert.match(input, /16: 'board'/);
  assert.match(html, /id="boardToggle"/); assert.match(html, /id="boardPanel"[^>]*hidden/); assert.match(html, /id="boardLive"[^>]*aria-live="polite"/); assert.match(html, /id="touchBoard"/);
  assert.match(read('tour.js'), /id: 'board', target: 'boardToggle'/);
});
