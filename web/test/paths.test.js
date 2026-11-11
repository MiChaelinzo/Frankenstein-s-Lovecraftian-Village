import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const PREFIX = '/Frankenstein-s-Lovecraftian-Village/';

const isBad = (spec) => spec.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(spec) && !/^https:\/\//i.test(spec);

test('html src/href are relative (external https links allowed)', () => {
  for (const f of ['index.html', 'selftest.html', 'meshes.html']) {
    const html = readFileSync(join(webDir, f), 'utf8');
    const specs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
    assert.ok(specs.length > 0, f);
    for (const s of specs) {
      assert.ok(!isBad(s), `${f}: ${s}`);
      if (/^https:\/\//i.test(s)) assert.ok(!s.includes('localhost'));
    }
  }
});

test('js import, fetch and URL specifiers are relative', () => {
  const dir = join(webDir, 'src');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const js = readFileSync(join(dir, f), 'utf8');
    const specs = [
      ...[...js.matchAll(/\bfrom\s+'([^']+)'/g)].map((m) => m[1]),
      ...[...js.matchAll(/\bimport\s+'([^']+)'/g)].map((m) => m[1]),
      ...[...js.matchAll(/\bfetch\(\s*'([^']+)'/g)].map((m) => m[1]),
      ...[...js.matchAll(/new URL\(\s*'([^']+)'/g)].map((m) => m[1]),
    ];
    for (const s of specs) assert.ok(!s.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(s), `${f}: ${s}`);
    for (const s of specs.filter((x) => x.endsWith('.js'))) {
      assert.ok(s.startsWith('./') || s.startsWith('../'), `${f}: bare import ${s}`);
    }
  }
});

function serve(prefix) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!path.startsWith(prefix)) { res.statusCode = 404; return res.end(); }
      path = path.slice(prefix.length);
      if (path === '') path = 'index.html';
      const file = normalize(join(webDir, path));
      if (!file.startsWith(webDir) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

for (const prefix of ['/', PREFIX]) {
  test(`web/ resolves when mounted at ${prefix}`, async () => {
    const server = await serve(prefix);
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    try {
      const html = await (await fetch(base)).text();
      assert.match(html, /src\/app\.js/);
      // resolve every relative reference of index.html the way a browser would
      const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*"([^"#?]*)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
      for (const r of [...refs, 'style.css', 'src/app.js', 'data/village_catalog.json', 'selftest.html', '_headers']) {
        const res = await fetch(new URL(r, base));
        assert.equal(res.status, 200, r);
        if (r.endsWith('.js')) assert.match(res.headers.get('content-type'), /javascript/, r);
      }
      // module imports resolve relative to the importing file
      const app = await (await fetch(new URL('src/app.js', base))).text();
      for (const m of app.matchAll(/from\s+'(\.\/[^']+)'/g)) {
        assert.equal((await fetch(new URL(m[1], new URL('src/app.js', base)))).status, 200, m[1]);
      }
    } finally {
      server.close();
    }
  });
}
