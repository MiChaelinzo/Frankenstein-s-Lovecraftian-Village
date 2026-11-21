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

for (const [file, factory] of [['inventory-ui.js', 'createInventoryController'], ['vigil-ui.js', 'createVigilController']]) {
  test(`app.js supplies every required dep read by ${file}`, () => {
    const body = suppliedKeys(read('app.js'), factory);
    const required = new Set([...read(file).matchAll(/\bdeps\.([A-Za-z0-9_]+)(?!\w|\?\.)/g)].map((m) => m[1]));
    for (const name of required) assert.match(body, new RegExp(`(^|[\\s,{])${name}\\s*[:,}]`), `${factory} in app.js is missing dep "${name}"`);
  });
}
