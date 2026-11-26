// Round 37 (FEAT-003 item 6): real browser saves from the shipped round 26 to 36 builds must load in the current build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadSettings, SETTINGS_KEY } from '../src/access.js';
import { loadSession, SESSION_KEY } from '../src/session.js';
import { ROUND_COMMITS, VISIT } from '../../tools/gen_save_fixtures.mjs';

const rounds = Object.keys(ROUND_COMMITS).map(Number);
const fixtureDir = new URL('./fixtures/saves/', import.meta.url);
const memory = (values) => {
  const map = new Map(Object.entries(values));
  return { map, getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)) };
};

test('real saves from rounds 26 to 36 load in the current build', () => {
  const files = readdirSync(fixtureDir).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(files, rounds.map((round) => `round-${round}.json`));

  for (const round of rounds) {
    const fixture = JSON.parse(readFileSync(new URL(`round-${round}.json`, fixtureDir), 'utf8'));
    assert.equal(fixture.round, round);
    assert.match(fixture.commit, new RegExp(`^${ROUND_COMMITS[round]}`));
    assert.equal(fixture.visit, VISIT);
    assert.equal(fixture.generator, 'tools/gen_save_fixtures.mjs');
    assert.deepEqual(fixture.pageErrors, [], `round ${round} browser errors`);
    assert.equal(typeof fixture.storage?.[SESSION_KEY], 'string');

    const storage = memory(fixture.storage);
    const loaded = loadSession(storage);
    assert.ok(loaded, `round ${round} session did not load`);
    assert.equal(loaded.seed, 1818);
    assert.ok(loaded.sanity >= 0 && loaded.sanity <= 100);
    assert.ok(loaded.night >= 0 && loaded.night <= 8);
    const recorded = JSON.parse(fixture.storage[SESSION_KEY]);
    for (const field of ['codex', 'ach', 'lore']) {
      assert.deepEqual(loaded[field], recorded[field] || [], `round ${round} ${field} parser preservation`);
    }
    for (const field of ['inv', 'hs', 'board', 'society', 'memory', 'theories', 'glimpse', 'vigil']) {
      assert.equal(loaded[field], recorded[field] || '', `round ${round} ${field} parser preservation`);
    }

    const settings = loadSettings(storage);
    assert.equal(typeof settings.contrast, 'boolean');
    assert.ok(['gentle', 'standard', 'dread'].includes(settings.intensity));
    if (fixture.storage['flv.contrast.v1'] === '1') assert.equal(settings.contrast, true);
    if (fixture.storage['flv.intensity.v1']) assert.equal(settings.intensity, fixture.storage['flv.intensity.v1']);
    assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)), settings, `round ${round} legacy settings migrated`);
  }
});
