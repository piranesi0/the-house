import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedArea2, triangulate, polyPositions, clipBox, aroundWell } from '../src/shapes/poly.js';
import { poly, boundsOf, translatePrims } from '../src/shapes/ir.js';
import { covers } from './helpers.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const triArea2 = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const areaOfTris = (pts2, tris) => tris.reduce((s, [i, j, k]) => s + triArea2(pts2[i], pts2[j], pts2[k]), 0);
const octagon = Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return [5 * Math.cos(a), 5 * Math.sin(a)]; });
const cross = [[-2, -6], [2, -6], [2, -2], [6, -2], [6, 2], [2, 2], [2, 6], [-2, 6], [-2, 2], [-6, 2], [-6, -2], [-2, -2]];
const lift = (pts2, y = 0) => pts2.map(([x, z]) => [x, y, z]);

test('triangulate covers convex and concave outlines exactly', () => {
  for (const pts of [octagon, cross, [...cross].reverse()]) {
    const tris = triangulate(pts);
    assert.ok(tris.length <= pts.length - 2, `${tris.length} triangles`);
    near(areaOfTris(pts, tris), Math.abs(signedArea2(pts)), 1e-9);
    for (const [i, j, k] of tris) assert.ok(signedArea2([pts[i], pts[j], pts[k]]) > 0, 'triangle not counter-clockwise');
  }
});

test('triangulate drops collinear vertices instead of stalling', () => {
  const sq = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]];
  const tris = triangulate(sq);
  near(areaOfTris(sq, tris), 4);
});

test('polyPositions winds floors up and ceilings down', () => {
  const up = polyPositions(poly(lift(octagon, 3), 'floor'));
  assert.equal(up.length, 6 * 9);
  const normalY = (p) => {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p;
    return (by - ay) * (cz - az) - (bz - az) * (cy - ay) === 0 ? ((bz - az) * (cx - ax) - (bx - ax) * (cz - az)) : NaN;
  };
  for (let i = 0; i < up.length; i += 9) assert.ok(normalY(up.slice(i, i + 9)) > 0, 'floor triangle faces down');
  const down = polyPositions(poly(lift(octagon, 3), 'ceiling', true));
  for (let i = 0; i < down.length; i += 9) assert.ok(normalY(down.slice(i, i + 9)) < 0, 'ceiling triangle faces up');
  assert.ok(up.every((v, i) => i % 3 !== 1 || v === 3), 'height preserved');
});

test('clipBox keeps the inside of an axis box and interpolates y across the cut', () => {
  const ramp = [[-2, 0, 0], [2, 0, 0], [2, 4, 4], [-2, 4, 4]];
  const half = clipBox(ramp, -10, 10, 2, 10);
  near(Math.abs(signedArea2(half.map(([x, , z]) => [x, z]))), 8);
  for (const p of half) if (Math.abs(p[2] - 2) < 1e-9) near(p[1], 2);
  assert.equal(clipBox(ramp, 5, 6, -10, 10), null);
});

test('aroundWell leaves exactly the well uncovered, for a rect, an octagon and a cross', () => {
  for (const pts of [[[-9, 0, -9], [9, 0, -9], [9, 0, 9], [-9, 0, 9]], lift(octagon.map(([x, z]) => [x * 1.8, z * 1.8])), lift(cross.map(([x, z]) => [x * 1.6, z * 1.6]))]) {
    const pieces = aroundWell(pts, 0, 0, 3, 5);
    assert.equal(pieces.length, 4);
    const total = pieces.reduce((s, p) => s + Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))), 0);
    near(total, Math.abs(signedArea2(pts.map(([x, , z]) => [x, z]))) - 60, 1e-6);
    const pos = pieces.flatMap(p => polyPositions(poly(p, 'floor')));
    assert.ok(!covers(pos, 0, 0) && !covers(pos, 2.9, 4.9) && !covers(pos, -2.9, -4.9), 'well covered');
    assert.ok(covers(pos, 3.5, 0) && covers(pos, -3.5, 0) && covers(pos, 0, 5.5) && covers(pos, 0, -5.5), 'floor beside the well missing');
  }
});

test('ir knows poly: translate moves its points and boundsOf wraps them', () => {
  const [p] = translatePrims([poly(lift(cross), 'floor')], 1, 2, 3);
  assert.deepEqual(p.points[0], [-1, 2, -3]);
  assert.deepEqual(boundsOf([p]), { min: [-5, 2, -3], max: [7, 2, 9] });
});
