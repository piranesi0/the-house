import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, hash32, mulberry32, stream } from '../src/rng.js';

test('fnv1a is stable and spreads', () => {
  assert.equal(fnv1a('ravens'), fnv1a('ravens'));
  assert.notEqual(fnv1a('ravens'), fnv1a('raven'));
  assert.equal(fnv1a(''), 0x811c9dc5);
});

test('hash32 is deterministic and sensitive to every input, including negatives', () => {
  const s = fnv1a('seed'), salt = fnv1a('hall');
  assert.equal(hash32(s, -7, 0, 12, salt), hash32(s, -7, 0, 12, salt));
  assert.notEqual(hash32(s, -7, 0, 12, salt), hash32(s, 7, 0, 12, salt));
  assert.notEqual(hash32(s, 0, 0, 0, salt), hash32(s, 0, 1, 0, salt));
  assert.notEqual(hash32(s, 0, 0, 0, salt), hash32(s, 0, 0, 0, fnv1a('statues')));
  assert.notEqual(hash32(s, 100000, 0, -100000, salt), hash32(s, 100001, 0, -100000, salt));
});

test('mulberry32 yields [0,1) and is reproducible', () => {
  const a = mulberry32(123), b = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, b());
  }
});

test('stream helpers stay in range', () => {
  const r = stream(fnv1a('seed'), 3, 0, -4, 'hall');
  for (let i = 0; i < 500; i++) {
    const n = r.int(2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n));
    const f = r.range(6, 14); assert.ok(f >= 6 && f < 14);
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
    assert.equal(typeof r.chance(0.5), 'boolean');
  }
});
