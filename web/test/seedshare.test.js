// Round 34 (spec 172): the Village Seed Share code mirrors Core SeedShare (golden key "seedShare"), round trips and fails readably.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSeedShareLibrary, encodeSeedCode, decodeSeedCode, dailyChallengeCode, dailyCodeForKey, SEED_SHARE_ERRORS } from '../src/daily.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const dataText = readFileSync(new URL('../data/seedshare.json', import.meta.url), 'utf8');
const lib = parseSeedShareLibrary(JSON.parse(dataText));

test('data file is a byte copy of the Core data file', () => {
  assert.equal(dataText, readFileSync(new URL('../../Packages/com.michaelinzo.frankenstein-village/Data/seedshare.json', import.meta.url), 'utf8'));
});

test('codes, decodes and daily challenge codes match C# SeedShare', () => {
  assert.ok(golden.seedShare.codes.length > 0 && golden.seedShare.decodes.length > 0 && golden.seedShare.daily.length > 0);
  for (const [seed, code] of golden.seedShare.codes) assert.equal(encodeSeedCode(lib, seed), code, String(seed));
  for (const [input, ok, value, expected] of golden.seedShare.decodes) {
    const r = decodeSeedCode(lib, input);
    assert.equal(r.ok, ok, JSON.stringify(input));
    if (ok) assert.equal(r.seed, value, JSON.stringify(input)); else { assert.equal(r.error, value, JSON.stringify(input)); assert.equal(r.expected, expected); }
  }
  for (const [key, code] of golden.seedShare.daily) assert.equal(dailyCodeForKey(lib, key), code, key);
});

test('every seed round trips, in any case, and a bare number is accepted', () => {
  let state = 34;
  const next = () => { state = (Math.imul(state, 1103515245) + 12345) | 0; return state; };
  const seeds = [0, 1, 42, 1818, -1, 2147483647, -2147483648];
  for (let i = 0; i < 5000; i++) seeds.push(next());
  for (const seed of seeds) {
    const code = encodeSeedCode(lib, seed);
    assert.ok(/^[0-9]+-[A-Z]+-[A-Z]+$/.test(code), code);
    assert.equal(decodeSeedCode(lib, code).seed, seed, code);
    assert.equal(decodeSeedCode(lib, ` ${code.toLowerCase()} `).seed, seed);
    assert.equal(decodeSeedCode(lib, String(seed >>> 0)).seed, seed);
  }
});

test('broken codes give a readable error with a stable id and no em dash', () => {
  for (const input of ['', '  ', '-5', 'abc', '1818-BLACK', '4294967296', '99999999999', '1818-STRAY-WORD', null, undefined]) {
    const r = decodeSeedCode(lib, input);
    assert.equal(r.ok, false, String(input));
    assert.ok(SEED_SHARE_ERRORS.includes(r.error));
    assert.ok(r.message.length > 20 && !r.message.includes('\u2014'));
  }
  const r = decodeSeedCode(lib, '1818-STRAY-WORD');
  assert.equal(r.error, 'mismatch');
  assert.equal(r.expected, encodeSeedCode(lib, 1818));
  assert.ok(r.message.includes(r.expected));
});

test('the daily challenge shows today\'s code and survives a bad clock', () => {
  const d = dailyChallengeCode(lib, () => new Date(Date.UTC(2026, 10, 15, 3)));
  assert.equal(d.key, '2026-11-15');
  assert.equal(d.code, dailyCodeForKey(lib, '2026-11-15'));
  assert.equal(decodeSeedCode(lib, d.code).seed, d.seed);
  assert.equal(dailyChallengeCode(lib, () => new Date(NaN)), null);
});

test('the parser names the field of malformed data', () => {
  assert.throws(() => parseSeedShareLibrary([]), /root/);
  assert.throws(() => parseSeedShareLibrary({ first: ['A'], second: [] }), /first/);
  const ok = Array.from({ length: 16 }, (_, i) => 'W'.repeat(i + 1));
  assert.throws(() => parseSeedShareLibrary({ first: ok.map((w) => w.toLowerCase()), second: ok }), /A-Z/);
  assert.throws(() => parseSeedShareLibrary({ first: ok, second: [...ok.slice(1), ok[1]] }), /repeats/);
});
