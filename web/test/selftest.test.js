import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { golden, catalogEntries } from '../src/golden-data.js';
import { runSelfTest } from '../src/selftest.js';

const here = dirname(fileURLToPath(import.meta.url));

test('embedded golden data is in sync with golden.json and the catalog', () => {
  assert.deepEqual(golden, JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8')));
  assert.deepEqual(catalogEntries, JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8')).entries);
});

test('self-test passes on the real data and fails on tampered data', () => {
  const ok = runSelfTest(golden, catalogEntries);
  assert.ok(ok.length > 20);
  assert.equal(ok.filter((r) => !r.pass).length, 0);
  const bad = structuredClone(golden);
  bad.rng[0].uints[0] += 1;
  assert.equal(runSelfTest(bad, catalogEntries).filter((r) => !r.pass).length, 1);
});
