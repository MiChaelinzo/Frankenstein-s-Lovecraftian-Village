import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(web, 'sw.js'), 'utf8');
const list = [...new Function(`${/const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/^/, 'return ')}`)()];

test('precache list is explicit, exists on disk and never includes local-pack or tests', () => {
  assert.ok(list.length > 10);
  for (const p of list) {
    assert.ok(!/local-pack|test\/|\.\./.test(p), p);
    assert.ok(!p.startsWith('/') && !/^https?:/.test(p), `relative only: ${p}`);
    if (p !== './') assert.ok(existsSync(join(web, p)), `missing ${p}`);
  }
  assert.equal(new Set(list).size, list.length);
});
test('every module in src/ is precached so offline works', () => {
  for (const f of readdirSync(join(web, 'src'))) assert.ok(list.includes(`src/${f}`), `src/${f} not in PRECACHE`);
});
test('service worker skips local-pack and ?pack=1', () => {
  assert.match(sw, /local-pack/);
  assert.match(sw, /searchParams\.get\('pack'\) === '1'/);
  assert.match(sw, /if \(.*skip\(url\)\) return;/);
});
test('app registers only on https or localhost and never in pack mode', () => {
  const app = readFileSync(join(web, 'src', 'app.js'), 'utf8');
  assert.match(app, /serviceWorker\.register\('sw\.js'/);
  assert.match(app, /!pack\.want/);
  assert.match(app, /isSecureHost/);
});
test('manifest is relative and valid', () => {
  const m = JSON.parse(readFileSync(join(web, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
  for (const i of m.icons) assert.ok(existsSync(join(web, i.src)) && !i.src.startsWith('/'));
  assert.ok(readFileSync(join(web, 'index.html'), 'utf8').includes('rel="manifest" href="manifest.webmanifest"'));
});
test('index.html offline fallback applies only to navigation requests', () => {
  const isNavigation = new Function(`${/const isNavigation = (\(req\) => .*);/.exec(sw)[0]}; return isNavigation;`)();
  const h = (accept) => ({ get: (k) => (k === 'accept' ? accept : null) });
  assert.equal(isNavigation({ mode: 'navigate', headers: h('*/*') }), true);
  assert.equal(isNavigation({ mode: 'cors', headers: h('text/html,application/xhtml+xml') }), true);
  assert.equal(isNavigation({ mode: 'cors', headers: h('application/json') }), false);
  assert.equal(isNavigation({ mode: 'no-cors', headers: h('text/css,*/*;q=0.1') }), false);
  assert.equal(isNavigation({ mode: 'cors', headers: h('*/*') }), false);
  assert.equal(isNavigation({ mode: 'cors', headers: { get: () => null } }), false);
  assert.match(sw, /isNavigation\(req\) \? caches\.match\(new URL\('index\.html'/);
  assert.match(sw, /Response\.error\(\)/);
});
