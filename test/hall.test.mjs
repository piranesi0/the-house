import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, cellOf, depthFor, CELL, SHAPES, STOREY, spawnPoint } from '../src/hall.js';

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
    assert.ok(a.ceiling >= 18 && a.ceiling <= (a.shape === 'long' ? 26 : 40), `${a.shape} ceiling ${a.ceiling}`);
    assert.equal(a.cx, x * CELL); assert.equal(a.cz, z * CELL); assert.equal(a.floorY, 0);
    if (a.shape === 'square' || a.shape === 'octagon') assert.equal(a.hx, a.hz);
    if (a.depth > 0) { assert.equal(a.pool.length, 10); for (const [px, pz] of a.pool) assert.ok(Math.abs(px) < a.hx && Math.abs(pz) < a.hz); }
    else assert.equal(a.pool, null);
  }
});

test('storeys offset floorY and stair halls spawn beside the stairwell', () => {
  const below = hallParams(seed, 3, -1, 4, fields);
  assert.equal(below.floorY, -STOREY);
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

test('STOREY is 44 and every ceiling, stair halls included, fits under the floor above', () => {
  assert.equal(STOREY, 44);
  let tall = 0, long = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const h = hallParams(seed, x, 0, z, fields);
    assert.ok(h.ceiling <= STOREY - 1);
    if (h.shape === 'long') { long++; assert.ok(h.ceiling <= 26); }
    else if (h.ceiling > 28) tall++;
  }
  assert.ok(long > 100 && tall > 200, `long ${long}, tall ${tall}`);
});

test('the taller ceilings leave every other output of the hall stream as it was', () => {
  // Fingerprint of everything hallParams returns except ceiling and floorY (which follow from the
  // ceiling range and STOREY), over 1000 cells on three storeys, taken from the code before the
  // change. A different hash means a draw moved in the hall stream.
  const KEYS = ['x', 'y', 'z', 'shape', 'hx', 'hz', 'wall', 'water', 'light', 'decay', 'theme', 'depth', 'pool', 'isStair', 'hasBirds', 'cx', 'cz'];
  const rows = [];
  for (let i = 0; i < 1000; i++) {
    const x = (i * 7919) % 201 - 100, z = (i * 104729) % 201 - 100, y = (i % 3) - 1;
    const h = hallParams(seed, x, y, z, fields);
    rows.push(KEYS.map(k => h[k]));
  }
  assert.equal(fnv1a(JSON.stringify(rows)).toString(16), '74b8ebac');
});
