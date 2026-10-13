import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSimplex2 } from '../src/noise.js';
import { makeFields } from '../src/fields.js';
import { fnv1a } from '../src/rng.js';

test('simplex stays in [-1, 1] and is reproducible', () => {
  const a = makeSimplex2(7), b = makeSimplex2(7);
  for (let i = 0; i < 2000; i++) {
    const x = (i % 50) * 0.37 - 9, y = Math.floor(i / 50) * 0.41 - 8;
    const v = a(x, y);
    assert.ok(v >= -1 && v <= 1);
    assert.equal(v, b(x, y));
  }
});

test('fields are in [0,1], deterministic, and slow across neighbours', () => {
  const f = makeFields(fnv1a('ravens')), g = makeFields(fnv1a('ravens'));
  for (let x = -30; x <= 30; x += 3) for (let z = -30; z <= 30; z += 3) {
    for (const k of ['water', 'light', 'decay', 'theme']) {
      const v = f[k](x, z);
      assert.ok(v >= 0 && v <= 1, `${k} out of range at ${x},${z}: ${v}`);
      assert.equal(v, g[k](x, z));
      assert.ok(Math.abs(v - f[k](x + 1, z)) < 0.3, `${k} jumps between ${x} and ${x + 1}`);
    }
  }
});

test('water rises to the south and light falls to the east, on average', () => {
  const f = makeFields(fnv1a('ravens'));
  let south = 0, north = 0, east = 0, west = 0;
  for (let i = -40; i <= 40; i++) {
    south += f.water(i, 80); north += f.water(i, -80);
    east += f.light(80, i); west += f.light(-80, i);
  }
  assert.ok(south > north);
  assert.ok(east < west);
});
