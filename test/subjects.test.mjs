import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animal } from '../src/statues/animal.js';
import { object } from '../src/statues/object.js';
import { group } from '../src/statues/group.js';
import { FAMILIES, FAMILY_BUILDERS } from '../src/statues/place.js';
import { boundsOf } from '../src/shapes/ir.js';

test('every subject in every family builds on the ground and scales', () => {
  for (const [family, subjects] of Object.entries(FAMILIES)) {
    assert.ok(FAMILY_BUILDERS[family], family);
    for (const s of subjects) {
      const one = FAMILY_BUILDERS[family](s, 1), two = FAMILY_BUILDERS[family](s, 2);
      assert.ok(one.prims.length > 0, `${family}/${s} is empty`);
      const b1 = boundsOf(one.prims), b2 = boundsOf(two.prims);
      assert.ok(b1.min[1] > -0.35 && b1.min[1] < 0.05, `${family}/${s} floats or sinks: ${b1.min[1]}`);
      assert.ok(b1.max[1] > 0.1);
      assert.ok(Math.abs(b2.max[1] - 2 * b1.max[1]) < 0.05, `${family}/${s} does not scale`);
      assert.equal(one.boxes.length, 1);
    }
  }
  assert.deepEqual(Object.keys(FAMILIES), ['figure', 'animal', 'object', 'group']);
  assert.ok(animal('horse', 1).prims.length > object('urn', 1).prims.length - 10);
  assert.ok(group('pair', 1).prims.length > 2 * 10);
});
