import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SeededRandom, PrefabCatalog, generateLayout, SanityModel, StaticNarrationProvider } from '../src/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));
const catalogJson = JSON.parse(readFileSync(join(here, '..', 'data', 'village_catalog.json'), 'utf8'));
const unityCatalogJson = JSON.parse(readFileSync(join(here, '..', '..', 'Assets', 'Data', 'village_catalog.json'), 'utf8'));
const catalog = new PrefabCatalog(catalogJson.entries);

test('web catalog copy is identical to the Unity catalog', () => {
  assert.deepEqual(catalogJson, unityCatalogJson);
});

test('SeededRandom matches C# xorshift32', () => {
  for (const g of golden.rng) {
    const r = new SeededRandom(g.seed);
    assert.deepEqual(g.uints.map(() => r.nextUInt()), g.uints, `uints seed ${g.seed}`);
    const r2 = new SeededRandom(g.seed);
    assert.deepEqual(g.next10.map(() => r2.next(10)), g.next10, `next10 seed ${g.seed}`);
  }
});

test('layouts match C# VillageLayoutGenerator exactly', () => {
  assert.ok(golden.layouts.length > 0);
  for (const g of golden.layouts) {
    const actual = generateLayout(catalog, g.width, g.depth, g.count, g.seed).map((p) => [p.id, p.x, p.z, p.sizeX, p.sizeZ]);
    assert.deepEqual(actual, g.pieces, `seed ${g.seed} ${g.width}x${g.depth}x${g.count}`);
  }
});

test('narration and dread match C#', () => {
  const s = new StaticNarrationProvider();
  for (const n of golden.narration) assert.equal(s.narrate(n.location, n.dread), n.text);
  for (const [sanity, dread] of golden.dread) assert.equal(SanityModel.dreadFor(sanity), dread);
});
