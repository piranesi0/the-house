import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSES, RANGES } from '../src/statues/poses.js';
import { figure, figureParts, dirDown, dirUp } from '../src/statues/figure.js';
import { boundsOf } from '../src/shapes/ir.js';

test('direction helpers point the right way', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  let d = dirDown(0, 0); near(d[0], 0); near(d[1], -1); near(d[2], 0);
  d = dirDown(Math.PI / 2, 0); near(d[1], 0); near(d[2], -1);          // forward
  d = dirDown(0, Math.PI / 2); near(d[0], 1); near(d[1], 0);           // out to the right
  d = dirUp(0); near(d[1], 1); d = dirUp(0.5); assert.ok(d[2] < 0);     // leaning forward
});

test('every pose keeps every joint inside its range', () => {
  const inRange = (v, [lo, hi], what) => assert.ok(v >= lo && v <= hi, `${what} = ${v}`);
  for (const [name, p] of Object.entries(POSES)) {
    inRange(p.lean, RANGES.lean, name + ' lean'); inRange(p.neck, RANGES.neck, name + ' neck');
    for (const s of ['shL', 'shR']) { inRange(p[s][0], RANGES.shPitch, name + ' ' + s); inRange(p[s][1], RANGES.shRoll, name + ' ' + s); }
    inRange(p.elL, RANGES.el, name); inRange(p.elR, RANGES.el, name);
    inRange(p.hipL, RANGES.hip, name); inRange(p.hipR, RANGES.hip, name);
    inRange(p.kneeL, RANGES.knee, name); inRange(p.kneeR, RANGES.knee, name);
  }
  assert.deepEqual(Object.keys(POSES), ['standing', 'seated', 'kneeling', 'reaching', 'carrying', 'reading',
    'listening', 'walking', 'lying', 'pointing', 'bowed', 'holding']);
});

test('figures stand on the ground at canon height and carry part names', () => {
  for (const name of Object.keys(POSES)) {
    const f = figure(name, 1);
    const b = boundsOf(f.prims);
    assert.ok(b.min[1] > -0.35 && b.min[1] < 0.05, `${name} floats or sinks: ${b.min[1]}`);
    assert.ok(f.prims.every(p => typeof p.name === 'string' && p.name.length > 0));
    assert.equal(f.boxes.length, 1);
    const { minY } = figureParts(name);
    assert.ok(minY < 0);
  }
  const standing = boundsOf(figure('standing', 1).prims);
  assert.ok(standing.max[1] > 1.6 && standing.max[1] < 2.1, `height ${standing.max[1]}`);
  const big = boundsOf(figure('standing', 2).prims);
  assert.ok(Math.abs(big.max[1] - 2 * standing.max[1]) < 0.05);
  assert.ok(figure('carrying', 1).prims.some(p => p.name === 'prop'));
  assert.ok(figure('seated', 1).prims.some(p => p.name === 'seat'));
  assert.ok(!figure('standing', 1).prims.some(p => p.name === 'seat'));
});

test('props sit in the hands that hold them', () => {
  for (const name of ['carrying', 'reading', 'holding']) {
    const { parts } = figureParts(name);
    const prop = parts.find(p => p.name === 'prop');
    for (const side of ['L', 'R']) {
      const hand = parts.find(p => p.name === `arm${side}.hand`);
      const dy = Math.abs(hand.pos[1] - prop.pos[1]), dz = Math.abs(hand.pos[2] - prop.pos[2]);
      assert.ok(dy < 0.8 && dz < 1.0, `${name} ${side} hand is ${dy.toFixed(2)} up/down and ${dz.toFixed(2)} fore/aft of the prop`);
    }
  }
});

test('a variant nudges every joint a little, stays in range, and is repeatable', async () => {
  const { perturbPose } = await import('../src/statues/poses.js');
  const { mulberry32 } = await import('../src/rng.js');
  const joints = (p) => [p.lean, p.neck, ...p.shL, p.elL, ...p.shR, p.elR, p.hipL, p.kneeL, p.hipR, p.kneeR];
  for (const [name, base] of Object.entries(POSES)) {
    for (let v = 1; v <= 50; v++) {
      const q = perturbPose(base, mulberry32(v));
      const inRange = (x, [lo, hi]) => assert.ok(x >= lo && x <= hi, `${name} variant ${v} out of range: ${x}`);
      inRange(q.lean, RANGES.lean); inRange(q.neck, RANGES.neck);
      for (const s of ['shL', 'shR']) { inRange(q[s][0], RANGES.shPitch); inRange(q[s][1], RANGES.shRoll); }
      for (const k of ['elL', 'elR']) inRange(q[k], RANGES.el);
      for (const k of ['hipL', 'hipR']) inRange(q[k], RANGES.hip);
      for (const k of ['kneeL', 'kneeR']) inRange(q[k], RANGES.knee);
      joints(q).forEach((x, i) => assert.ok(Math.abs(x - joints(base)[i]) <= 0.08 + 1e-12, `${name} nudged too far`));
      assert.equal(q.prop, base.prop); assert.equal(q.seat, base.seat);
    }
  }
  assert.deepEqual(figure('standing', 1, 7), figure('standing', 1, 7));
  assert.notDeepEqual(figure('standing', 1, 7), figure('standing', 1, 8));
  assert.deepEqual(figure('standing', 1), figure('standing', 1, null));
});

test('the lying figure rests on a bier, longer than it is tall', () => {
  const f = figure('lying', 1), b = boundsOf(f.prims);
  assert.ok(f.prims.some(p => p.name === 'bier'));
  assert.ok(b.max[0] - b.min[0] > 2 * (b.max[1] - b.min[1]), `lying is ${(b.max[0] - b.min[0]).toFixed(2)} long, ${(b.max[1] - b.min[1]).toFixed(2)} tall`);
  assert.ok(b.min[1] > -0.05 && b.min[1] < 0.05);
});

test('the holding figure carries a small child', () => {
  const f = figure('holding', 1), standing = boundsOf(figure('standing', 1).prims);
  const child = boundsOf(f.prims.filter(p => p.name === 'prop'));
  assert.ok(child.max[1] - child.min[1] < 0.5 * (standing.max[1] - standing.min[1]));
  assert.ok(child.min[1] > 0.6 && child.max[1] < standing.max[1]);
});

test('rotateXPrims turns a part about x without disturbing its own rotation', async () => {
  const { rotateXPrims } = await import('../src/statues/figure.js');
  const { cyl } = await import('../src/shapes/ir.js');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  // A limb pitched forward and rolled out; its tip direction must turn exactly like a point would.
  const tip = (p) => { const [rx, ry, rz] = p.rot; let v = [0, 1, 0];
    v = [v[0], v[1] * Math.cos(rx) - v[2] * Math.sin(rx), v[1] * Math.sin(rx) + v[2] * Math.cos(rx)];
    v = [v[0] * Math.cos(rz) - v[1] * Math.sin(rz), v[0] * Math.sin(rz) + v[1] * Math.cos(rz), v[2]];
    return [v[0] * Math.cos(ry) + v[2] * Math.sin(ry), v[1], -v[0] * Math.sin(ry) + v[2] * Math.cos(ry)]; };
  const p = cyl(0.1, 0.1, 1, [0, 1, 0], [0.7, 0, 0.4]);
  const [q] = rotateXPrims([p], Math.PI / 2);
  const a = tip(p), b = tip(q);
  near(b[0], a[0]); near(b[1], -a[2]); near(b[2], a[1]);
  near(q.pos[1], 0); near(q.pos[2], 1);
});
