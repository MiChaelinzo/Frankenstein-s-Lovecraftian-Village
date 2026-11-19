// Round 24: resolveCollisions mirrors Core/WalkCollision.cs on numbers. Golden key "collision".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveCollisions } from '../src/view3d-math.js';

const golden = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'golden.json'), 'utf8')).collision;

test('resolved positions match C# for trunks, flat boxes and both together', () => {
  golden.scenes.forEach((scene, si) => {
    const boxes = scene.boxes.map(([minX, maxX, minZ, maxZ, round]) => ({ minX, maxX, minZ, maxZ, round: round === 1 }));
    golden.starts.forEach(([sx, sz], i) => {
      const p = resolveCollisions(sx, sz, golden.radius, boxes);
      assert.ok(Math.abs(p.x - scene.resolved[i][0]) < 1e-9 && Math.abs(p.z - scene.resolved[i][1]) < 1e-9, `scene ${si} start ${i}: ${p.x},${p.z} vs ${scene.resolved[i]}`);
    });
  });
});
