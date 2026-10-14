import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedArea2, triangulate, polyPositions, clipBox, aroundWell, aroundPool } from '../src/shapes/poly.js';
import { poolOutline } from '../src/hall.js';
import { stream, fnv1a } from '../src/rng.js';
import { footprint } from '../src/shapes/footprint.js';
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

test('aroundPool leaves exactly the pool uncovered, for a rect, an octagon and a cross', () => {
  for (const shape of ['square', 'octagon', 'cross']) for (let i = 0; i < 20; i++) {
    const hall = { shape, cx: 0, cz: 0, hx: 9, hz: 9 };
    const pts = footprint(hall).map(([x, z]) => [x, 0, z]);
    const pool = poolOutline(stream(fnv1a('ravens'), i, 0, 0, 'hall'), hall.hx, hall.hz);
    const pieces = aroundPool(pts, 0, 0, pool);
    assert.equal(pieces.length, pool.length, `${shape}: one piece per pool edge`);
    const total = pieces.reduce((s, p) => s + Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))), 0);
    near(total, Math.abs(signedArea2(footprint(hall))) - Math.abs(signedArea2(pool)), 1e-6);
    const pos = pieces.flatMap(p => polyPositions(poly(p, 'floor')));
    assert.ok(!covers(pos, 0, 0), `${shape}: pool centre covered`);
    for (const [x, z] of pool) {
      assert.ok(!covers(pos, 0.95 * x, 0.95 * z), `${shape}: pool covered at ${x}, ${z}`);
      assert.ok(covers(pos, 1.05 * x, 1.05 * z), `${shape}: floor beside the pool missing at ${x}, ${z}`);
    }
    for (const p of pieces) assert.ok(p.every(q => q[1] === 0), 'piece off the floor');
  }
});

test('aroundPool takes the pool in either winding', () => {
  const pts = footprint({ shape: 'square', cx: 4, cz: -2, hx: 9, hz: 9 }).map(([x, z]) => [x, 0, z]);
  const pool = poolOutline(stream(fnv1a('ravens'), 3, 0, 0, 'hall'), 9, 9);
  const area = (ps) => ps.reduce((s, p) => s + Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))), 0);
  near(area(aroundPool(pts, 4, -2, pool)), area(aroundPool(pts, 4, -2, [...pool].reverse())), 1e-9);
});

test('ir knows poly: translate moves its points and boundsOf wraps them', () => {
  const [p] = translatePrims([poly(lift(cross), 'floor')], 1, 2, 3);
  assert.deepEqual(p.points[0], [-1, 2, -3]);
  assert.deepEqual(boundsOf([p]), { min: [-5, 2, -3], max: [7, 2, 9] });
});
