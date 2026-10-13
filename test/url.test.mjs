import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFragment, writeFragment, randomSeed, WORDS } from '../src/url.js';

test('round trip with negative coordinates and odd seeds', () => {
  for (const seed of ['ravens', 'two words', 'ümlaut-ß', 'a&b=c']) {
    const frag = writeFragment({ seed, x: -7, z: 100000 });
    assert.ok(frag.startsWith('#s='));
    assert.deepEqual(readFragment(frag), { seed, x: -7, z: 100000 });
  }
});

test('missing or junk fragment falls back cleanly', () => {
  assert.deepEqual(readFragment(''), { seed: null, x: 0, z: 0 });
  assert.deepEqual(readFragment('#x=abc&z=3.5'), { seed: null, x: 0, z: 0 });
  assert.deepEqual(readFragment('#s=ravens'), { seed: 'ravens', x: 0, z: 0 });
});

test('random seeds are two words from the list', () => {
  const s = randomSeed(() => 0.5).split('-');
  assert.equal(s.length, 2);
  for (const w of s) assert.ok(WORDS.includes(w));
  assert.ok(WORDS.length >= 30);
});
