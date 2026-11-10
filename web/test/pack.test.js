import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, pickRole, hintFor, badgeText, tintChannel, PACK_ROLES } from '../src/pack.js';

const good = {
  source: { package: 'X.unitypackage' },
  roles: { roof: { texture: 'textures/roof.png', tint: [185, 185, 185], sourcePathname: 'a/b.png' }, ground: { texture: 'textures/ground.png', tint: [1, 2, 3] } },
  prefabHints: { house_a: 'BigHouse00' },
};

test('validateManifest accepts a good manifest', () => {
  const v = validateManifest(good);
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.roles).sort(), ['ground', 'roof']);
});
test('validateManifest rejects junk and path traversal', () => {
  assert.equal(validateManifest(null).ok, false);
  assert.equal(validateManifest({}).ok, false);
  const bad = structuredClone(good); bad.roles.roof.texture = '../../etc/passwd'; bad.roles.ground.tint = [300, 0, 0];
  const v = validateManifest(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.length >= 2);
});
test('unknown roles are ignored', () => {
  const m = structuredClone(good); m.roles.evil = { texture: 'textures/x.png', tint: [0, 0, 0] };
  assert.equal(validateManifest(m).roles.evil, undefined);
  assert.ok(PACK_ROLES.includes('roof'));
});
test('pickRole falls back in order', () => {
  const { roles } = validateManifest(good);
  assert.equal(pickRole(roles, 'wall_brick', 'roof'), 'roof');
  assert.equal(pickRole(roles, 'wall_brick'), null);
});
test('hintFor, badgeText, tintChannel', () => {
  assert.equal(hintFor(good, 'house_a'), 'BigHouse00');
  assert.equal(hintFor(good, 'nope'), '');
  assert.equal(badgeText(good), 'Pack mode: local textures from X.unitypackage');
  assert.equal(tintChannel(200, 255), 200);
  assert.equal(tintChannel(200, 0), 0);
});
