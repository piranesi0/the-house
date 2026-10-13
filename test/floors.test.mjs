import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { footprint } from '../src/shapes/footprint.js';
import { signedArea2, polyPositions } from '../src/shapes/poly.js';
import { WELL } from '../src/shapes/stairwell.js';
import { covers } from './helpers.mjs';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const polyArea = (p) => Math.abs(signedArea2(p.points.map(([x, , z]) => [x, z])));

test('every hall floor is filled to its footprint, and only a stair hall has a hole', () => {
  const shapes = new Set();
  let stairs = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const built = buildHall(hall, conns);
    shapes.add(hall.shape);
    const floors = built.prims.filter(p => p.kind === 'poly' && p.name === 'floor');
    const ceilings = built.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling');
    assert.ok(floors.length >= 1, `${hall.shape} has no floor`);
    if (hall.isStair) assert.ok(ceilings.length >= 1, `${hall.shape} stair ceiling`);
    else assert.equal(ceilings.length, 1, `${hall.shape} ceiling count`);
    assert.ok(ceilings.every(c => c.down), 'ceiling faces up');
    for (const f of floors) assert.ok(f.points.every(p => p[1] === hall.floorY), 'floor off the floor');
    const foot = Math.abs(signedArea2(footprint(hall)));
    const area = floors.reduce((s, f) => s + polyArea(f), 0);
    const hole = hall.isStair ? 4 * WELL.hx * WELL.hz : 0;
    assert.ok(Math.abs(area - (foot - hole)) < 1e-6, `${hall.shape} floor area ${area} vs ${foot - hole}`);
    const carea = ceilings.reduce((s, f) => s + polyArea(f), 0);
    assert.ok(Math.abs(carea - (foot - hole)) < 1e-6, `${hall.shape} ceiling area ${carea} vs ${foot - hole}`);
    if (!hall.isStair) continue;
    stairs++;
    const pos = floors.flatMap(f => polyPositions(f));
    const { cx, cz } = hall;
    assert.ok(!covers(pos, cx, cz) && !covers(pos, cx + WELL.hx - 0.1, cz + WELL.hz - 0.1), 'well sealed');
    assert.ok(covers(pos, cx + WELL.hx + 0.5, cz) && covers(pos, cx, cz - WELL.hz - 0.5), 'floor beside the well missing');
    const above = buildHall({ ...hall, y: 1, floorY: 12 }, conns, { vista: true, ceiling: false, floorHole: true });
    const abovePos = above.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f));
    assert.ok(!covers(abovePos, cx, cz) && covers(abovePos, cx + WELL.hx + 0.5, cz), 'hall above has no hole');
    const below = buildHall({ ...hall, y: -1, floorY: -12 }, conns, { vista: true, ceiling: false });
    assert.equal(below.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling').length, 0);
    assert.ok(covers(below.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f)), cx, cz), 'hall below lost its floor');
  }
  assert.equal(shapes.size, 5);
  assert.ok(stairs >= 10);
});
