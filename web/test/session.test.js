import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSession, serializeSession, saveSession, loadSession, safeStorage, sessionHash, buildShareLink, SESSION_KEY } from '../src/session.js';

const good = { seed: 42, sanity: 55, night: 2, beat: 1, theme: 'bricks', cam: 'top', floor: 1, stage: 3 };
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('round trips and clamps', () => {
  assert.deepEqual(parseSession(serializeSession(good)), good);
  const c = parseSession({ seed: '7', sanity: 900, night: 99, beat: -4, theme: 'x y', cam: 'zzz', floor: 50 });
  assert.deepEqual(c, { seed: 7, sanity: 100, night: 8, beat: 0, theme: 'auto', cam: 'third', floor: 8, stage: -1 });
});
test('rejects junk', () => {
  for (const bad of [null, undefined, 5, [], '{', '[]', {}, { seed: 'a', sanity: 1 }, { seed: 1 }, { seed: 1, sanity: NaN }, { seed: '', sanity: 1 }]) assert.equal(parseSession(bad), null);
});
test('storage wrapper', () => {
  const s = mem();
  assert.equal(loadSession(s), null);
  assert.equal(saveSession(s, good), true);
  assert.ok(s.getItem(SESSION_KEY));
  assert.deepEqual(loadSession(s), good);
  s.setItem(SESSION_KEY, 'garbage');
  assert.equal(loadSession(s), null);
  assert.equal(saveSession(null, good), false);
  assert.equal(saveSession(s, { nope: 1 }), false);
  assert.equal(loadSession(null), null);
  assert.equal(saveSession({ setItem() { throw new Error('quota'); } }, good), false);
  assert.equal(loadSession({ getItem() { throw new Error('denied'); } }), null);
});
test('safeStorage tolerates absence and throwing getters', () => {
  assert.equal(safeStorage({}), null);
  assert.equal(safeStorage({ get localStorage() { throw new Error('blocked'); } }), null);
  assert.ok(safeStorage({ localStorage: mem() }));
});
test('share link is relative to pathname and never carries pack', () => {
  assert.equal(sessionHash(good), '#seed=42&sanity=55&night=3&theme=bricks&cam=top&floor=1');
  assert.equal(sessionHash({ seed: 1, sanity: 2 }), '#seed=1&sanity=2&night=1');
  assert.equal(buildShareLink({ pathname: '/Frankenstein-s-Lovecraftian-Village/' }, good), '/Frankenstein-s-Lovecraftian-Village/#seed=42&sanity=55&night=3&theme=bricks&cam=top&floor=1');
  assert.equal(buildShareLink({ origin: 'https://x.test', pathname: '/' }, { seed: 1, sanity: 2 }), 'https://x.test/#seed=1&sanity=2&night=1');
  assert.equal(buildShareLink(null, { seed: 1, sanity: 2 }), './#seed=1&sanity=2&night=1');
  assert.ok(!buildShareLink({ pathname: '/?pack=1' }, good).includes('#pack'));
});
