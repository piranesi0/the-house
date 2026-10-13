import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connectorParams, connsFor, TYPES } from '../src/connectors.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const H = (x, z) => hallParams(seed, x, 0, z, fields);

test('a connector derives identically from either hall', () => {
  for (let i = 0; i < 300; i++) {
    const x = (i * 31) % 61 - 30, z = (i * 17) % 61 - 30;
    assert.deepEqual(connectorParams(seed, H(x, z), H(x + 1, z)), connectorParams(seed, H(x + 1, z), H(x, z)));
    assert.deepEqual(connectorParams(seed, H(x, z), H(x, z + 1)), connectorParams(seed, H(x, z + 1), H(x, z)));
  }
});

test('gap is positive, a vestibule needs 7 m and steps need 3.2 m', () => {
  let vest = 0, steps = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const c = connectorParams(seed, H(x, z), H(x + 1, z));
    assert.ok(c.gap >= 1.2 - 1e-9, `gap ${c.gap}`);
    assert.ok(Object.keys(TYPES).includes(c.type));
    if (c.type === 'vestibule') { vest++; assert.ok(c.gap >= 7); }
    if (c.type === 'steps') { steps++; assert.ok(c.gap >= 3.2); }
    assert.equal(c.width, TYPES[c.type].width);
  }
  assert.ok(vest > 0 && steps > 0);
});

test('two maximal halls downgrade to an arch', () => {
  const a = { ...H(0, 0), hx: 11.4 - 1, wall: 1, cx: 0, cz: 0, x: 0, z: 0, y: 0 };
  const b = { ...H(1, 0), hx: 11.4 - 1, wall: 1, cx: 24, cz: 0, x: 1, z: 0, y: 0 };
  for (let k = 0; k < 50; k++) {
    const c = connectorParams(fnv1a('seed' + k), a, b);
    assert.ok(c.type === 'arch' || c.type === 'door');
  }
});

test('connsFor gives one connector per side with matching axes', () => {
  const c = connsFor(seed, H(2, -3), fields);
  assert.equal(c.n.axis, 'z'); assert.equal(c.s.axis, 'z');
  assert.equal(c.e.axis, 'x'); assert.equal(c.w.axis, 'x');
  assert.deepEqual(c.e.a, { x: 2, z: -3 }); assert.deepEqual(c.w.b, { x: 2, z: -3 });
  assert.deepEqual(c.s.a, { x: 2, z: -3 }); assert.deepEqual(c.n.b, { x: 2, z: -3 });
});

test('every doorway, plus a 1 m lintel, fits under the ceilings of both halls it joins', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.height])), { arch: 12, door: 6, vestibule: 6, steps: 12 });
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const a = H(x, z), b = H(x + dx, z + dz), c = connectorParams(seed, a, b);
      assert.ok(c.height + 1 <= Math.min(a.ceiling, b.ceiling), `${c.type} ${c.height} m under ${a.ceiling.toFixed(1)} / ${b.ceiling.toFixed(1)} m`);
    }
  }
});
