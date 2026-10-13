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
  assert.equal(Object.keys(POSES).length, 6);
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
  for (const name of ['carrying', 'reading']) {
    const { parts } = figureParts(name);
    const prop = parts.find(p => p.name === 'prop');
    for (const side of ['L', 'R']) {
      const hand = parts.find(p => p.name === `arm${side}.hand`);
      const dy = Math.abs(hand.pos[1] - prop.pos[1]), dz = Math.abs(hand.pos[2] - prop.pos[2]);
      assert.ok(dy < 0.8 && dz < 1.0, `${name} ${side} hand is ${dy.toFixed(2)} up/down and ${dz.toFixed(2)} fore/aft of the prop`);
    }
  }
});
