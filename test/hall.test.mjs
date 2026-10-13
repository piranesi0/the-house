import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, cellOf, depthFor, CELL, SHAPES, spawnPoint } from '../src/hall.js';

const seed = fnv1a('ravens');
const fields = makeFields(seed);

test('cellOf maps world coordinates to the nearest cell, negatives included', () => {
  assert.equal(cellOf(0), 0);
  assert.equal(cellOf(11.9), 0);
  assert.equal(cellOf(12.1), 1);
  assert.equal(cellOf(-12.1), -1);
  assert.equal(cellOf(-36), -2);
});

test('depthFor follows the spec thresholds', () => {
  assert.equal(depthFor(0.1), 0);
  assert.equal(depthFor(0.4), 0.05);
  assert.equal(depthFor(0.6), 0.4);
  assert.equal(depthFor(0.9), 1);
});

test('hallParams is deterministic and inside the spec ranges over 1000 cells', () => {
  for (let i = 0; i < 1000; i++) {
    const x = (i * 7919) % 201 - 100, z = (i * 104729) % 201 - 100;
    const a = hallParams(seed, x, 0, z, fields), b = hallParams(seed, x, 0, z, fields);
    assert.deepEqual(a, b);
    assert.ok(SHAPES.includes(a.shape));
    assert.ok(a.wall >= 1 && a.wall <= 2);
    assert.ok(a.hx + a.wall <= 0.95 * CELL / 2 + 1e-9 && a.hx + a.wall >= 0.6 * CELL / 2 - 1e-9);
    assert.ok(a.hz + a.wall <= 0.95 * CELL / 2 + 1e-9 && a.hz + a.wall >= 0.6 * CELL / 2 - 1e-9);
    assert.ok(a.ceiling >= 6 && a.ceiling <= 14);
    assert.equal(a.cx, x * CELL); assert.equal(a.cz, z * CELL); assert.equal(a.floorY, 0);
    if (a.shape === 'square' || a.shape === 'octagon') assert.equal(a.hx, a.hz);
    if (a.depth > 0) { assert.equal(a.pool.length, 10); for (const [px, pz] of a.pool) assert.ok(Math.abs(px) < a.hx && Math.abs(pz) < a.hz); }
    else assert.equal(a.pool, null);
  }
});

test('storeys offset floorY and stair halls spawn beside the stairwell', () => {
  const below = hallParams(seed, 3, -1, 4, fields);
  assert.equal(below.floorY, -12);
  const stair = { ...hallParams(seed, 0, 0, 0, fields), isStair: true };
  assert.deepEqual(spawnPoint(stair), [stair.cx - 8, stair.cz]);
  const plain = { ...stair, isStair: false };
  assert.deepEqual(spawnPoint(plain), [plain.cx, plain.cz]);
});

test('some halls are stair halls and some have birds, but not most', () => {
  let stairs = 0, birds = 0;
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    const h = hallParams(seed, x, 0, z, fields);
    if (h.isStair) stairs++;
    if (h.hasBirds) birds++;
  }
  assert.ok(stairs > 40 && stairs < 400, `stairs ${stairs}`);
  assert.ok(birds > 10 && birds < 400, `birds ${birds}`);
});
