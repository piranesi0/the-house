import { test } from 'node:test';
import assert from 'node:assert/strict';
import { box, cyl, lines, aabbOfBox, boundsOf, rotateYPrims, rotateYBoxes, translatePrims, scalePrims } from '../src/shapes/ir.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('aabbOfBox and boundsOf agree for unrotated boxes', () => {
  const b = box([2, 4, 6], [1, 2, 3]);
  assert.deepEqual(aabbOfBox(b.size, b.pos), { min: [0, 0, 0], max: [2, 4, 6] });
  assert.deepEqual(boundsOf([b]), { min: [0, 0, 0], max: [2, 4, 6] });
});

test('boundsOf is conservative for rotated parts and includes lines', () => {
  const b = boundsOf([cyl(0.2, 0.2, 2, [0, 1, 0], [Math.PI / 2, 0, 0]), lines([[5, 5, 5], [6, 6, 6]])]);
  assert.ok(b.min[2] <= -1 && b.max[2] >= 1);
  assert.deepEqual(b.max, [6, 6, 6]);
});

test('rotateYPrims turns +x into -z for a quarter turn and adds yaw', () => {
  const [p] = rotateYPrims([box([1, 1, 1], [2, 0, 0], [0.1, 0, 0.2])], Math.PI / 2);
  near(p.pos[0], 0); near(p.pos[2], -2); near(p.rot[1], Math.PI / 2); near(p.rot[0], 0.1); near(p.rot[2], 0.2);
  const [l] = rotateYPrims([lines([[2, 0, 0]])], Math.PI / 2);
  near(l.points[0][0], 0); near(l.points[0][2], -2);
});

test('rotateYBoxes wraps the rotated corners', () => {
  const [b] = rotateYBoxes([{ min: [1, 0, -0.5], max: [3, 2, 0.5] }], Math.PI / 2);
  near(b.min[0], -0.5); near(b.max[0], 0.5); near(b.min[2], -3); near(b.max[2], -1);
  assert.deepEqual([b.min[1], b.max[1]], [0, 2]);
});

test('translate and scale', () => {
  const [p] = translatePrims(scalePrims([box([1, 2, 3], [1, 1, 1])], 2), 1, 0, 0);
  assert.deepEqual(p.size, [2, 4, 6]); assert.deepEqual(p.pos, [3, 2, 2]);
});
