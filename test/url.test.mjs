import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFragment, writeFragment, randomSeed, WORDS } from '../src/url.js';

test('round trip with negative coordinates and odd seeds', () => {
  for (const seed of ['ravens', 'two words', 'ümlaut-ß', 'a&b=c']) {
    const frag = writeFragment({ seed, x: -7, z: 100000 });
    assert.ok(frag.startsWith('#s='));
    assert.deepEqual(readFragment(frag), { seed, x: -7, z: 100000, look: 'shaded', debug: false });
  }
});

test('missing or junk fragment falls back cleanly', () => {
  assert.deepEqual(readFragment(''), { seed: null, x: 0, z: 0, look: 'shaded', debug: false });
  assert.deepEqual(readFragment('#x=abc&z=3.5'), { seed: null, x: 0, z: 0, look: 'shaded', debug: false });
  assert.deepEqual(readFragment('#s=ravens'), { seed: 'ravens', x: 0, z: 0, look: 'shaded', debug: false });
});

test('random seeds are two words from the list', () => {
  const s = randomSeed(() => 0.5).split('-');
  assert.equal(s.length, 2);
  for (const w of s) assert.ok(WORDS.includes(w));
  assert.ok(WORDS.length >= 30);
});

test('absurd coordinates are clamped to a million halls either way', () => {
  assert.deepEqual(readFragment('#s=a&x=1e20&z=-1e20'), { seed: 'a', x: 1000000, z: -1000000, look: 'shaded', debug: false });
  assert.deepEqual(readFragment('#s=a&x=-7&z=100000'), { seed: 'a', x: -7, z: 100000, look: 'shaded', debug: false });
});

test('look and debug default, parse and round-trip', () => {
  assert.deepEqual(readFragment('#s=ravens&x=1&z=-2'), { seed: 'ravens', x: 1, z: -2, look: 'shaded', debug: false });
  assert.equal(readFragment('#s=a&look=lines').look, 'lines');
  assert.equal(readFragment('#s=a&look=foo').look, 'shaded');
  assert.equal(readFragment('#s=a&debug').debug, true);
  assert.equal(readFragment('#s=a&debug=0').debug, true);
  assert.equal(readFragment('').debug, false);
  const f = { seed: 'ravens', x: 3, z: 4, look: 'lines', debug: true };
  assert.deepEqual(readFragment(writeFragment(f)), f);
  assert.equal(writeFragment({ seed: 'ravens', x: 0, z: 0, look: 'shaded', debug: false }), '#s=ravens&x=0&z=0');
  assert.match(writeFragment(f), /&debug(&|$)/);
});
