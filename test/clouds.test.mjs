import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, stream } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { CLOUD, cloudsFor } from '../src/clouds.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const above = (i) => hallParams(seed, (i * 31) % 201 - 100, 1, (i * 17) % 201 - 100, fields);

test('cloudsFor draws what v0 sky.js drew, blob for blob', () => {
  for (let i = 0; i < 200; i++) {
    const hall = above(i), rng = stream(seed, hall.x, hall.y, hall.z, 'cloud');
    const baseY = hall.floorY + hall.ceiling + 6, want = [];
    // v0 sky.js, verbatim draw order: sphere radius, position x, y, z, then speed.
    for (let k = 0; k < Math.round(1 + 8 * hall.light); k++) {
      const r = rng.range(3, 6), x = hall.cx + rng.range(-12, 12), y = baseY + rng.range(2, 10), z = hall.cz + rng.range(-12, 12);
      want.push({ r, x, y, z, speed: rng.range(0.2, 0.5) });
    }
    const got = cloudsFor(seed, hall).map(b => ({ ...b, x: hall.cx + b.x, y: hall.floorY + b.y, z: hall.cz + b.z }));
    assert.equal(got.length, want.length);
    for (let k = 0; k < want.length; k++) for (const f of ['r', 'x', 'y', 'z', 'speed']) assert.ok(Math.abs(got[k][f] - want[k][f]) < 1e-9, `${f} of blob ${k}`);
  }
});

test('clouds float only over the storey above a stair hall, clear of its walls, and drift within the square', () => {
  for (let i = 0; i < 200; i++) {
    const hall = above(i), blobs = cloudsFor(seed, hall);
    assert.equal(blobs.length, Math.round(1 + 8 * hall.light));
    assert.ok(blobs.length >= 1 && blobs.length <= 9);
    for (const b of blobs) {
      assert.ok(b.y - b.r >= hall.ceiling + 2 - 1e-9, 'cloud down among the storey walls');
      assert.ok(Math.abs(b.x) <= CLOUD.spread && Math.abs(b.z) <= CLOUD.spread);
      assert.ok(b.speed >= CLOUD.speed[0] && b.speed <= CLOUD.speed[1]);
    }
    for (const y of [0, -1, 2]) assert.deepEqual(cloudsFor(seed, { ...hall, y }), []);
  }
  assert.deepEqual(cloudsFor(seed, above(7)), cloudsFor(seed, above(7)));
});
