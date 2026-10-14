import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, STOREY } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { footprint } from '../src/shapes/footprint.js';
import { signedArea2, polyPositions } from '../src/shapes/poly.js';
import { WELL, buildStairwell } from '../src/shapes/stairwell.js';
import { buildConnector } from '../src/shapes/connector.js';
import { connectorParams, TYPES } from '../src/connectors.js';
import { covers } from './helpers.mjs';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const polyArea = (p) => Math.abs(signedArea2(p.points.map(([x, , z]) => [x, z])));

test('every hall floor is filled to its footprint, less the well in a stair hall and the pool in a wet hall', () => {
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
    const pool = hall.pool ? Math.abs(signedArea2(hall.pool)) : 0;
    assert.ok(Math.abs(area - (foot - hole - pool)) < 1e-6, `${hall.shape} floor area ${area} vs ${foot - hole - pool}`);
    const carea = ceilings.reduce((s, f) => s + polyArea(f), 0);
    assert.ok(Math.abs(carea - (foot - hole)) < 1e-6, `${hall.shape} ceiling area ${carea} vs ${foot - hole}`);
    if (!hall.isStair) continue;
    stairs++;
    const pos = floors.flatMap(f => polyPositions(f));
    const { cx, cz } = hall;
    assert.ok(!covers(pos, cx, cz) && !covers(pos, cx + WELL.hx - 0.1, cz + WELL.hz - 0.1), 'well sealed');
    assert.ok(covers(pos, cx + WELL.hx + 0.5, cz) && covers(pos, cx, cz - WELL.hz - 0.5), 'floor beside the well missing');
    const above = buildHall({ ...hall, y: 1, floorY: STOREY }, conns, { vista: true, ceiling: false, floorHole: true });
    const abovePos = above.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f));
    assert.ok(!covers(abovePos, cx, cz) && covers(abovePos, cx + WELL.hx + 0.5, cz), 'hall above has no hole');
    const below = buildHall({ ...hall, y: -1, floorY: -STOREY }, conns, { vista: true, ceiling: false });
    assert.equal(below.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling').length, 0);
    assert.ok(covers(below.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f)), cx, cz), 'hall below lost its floor');
  }
  assert.equal(shapes.size, 5);
  assert.ok(stairs >= 10);
});

test('a pool is cut out of its hall floor, and the ceiling over it stays whole', () => {
  let wet = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.pool) continue;
    wet++;
    const built = buildHall(hall, connsFor(seed, hall, fields));
    const floors = built.prims.filter(p => p.kind === 'poly' && p.name === 'floor');
    assert.equal(floors.length, hall.pool.length, `${hall.shape} floor pieces`);
    const pos = floors.flatMap(f => polyPositions(f)), { cx, cz } = hall;
    assert.ok(!covers(pos, cx, cz), `${hall.shape} pool centre covered`);
    for (const [px, pz] of hall.pool) {
      assert.ok(!covers(pos, cx + 0.95 * px, cz + 0.95 * pz), `${hall.shape} pool covered`);
      assert.ok(covers(pos, cx + 1.05 * px, cz + 1.05 * pz), `${hall.shape} floor beside the pool missing`);
    }
    const ceilings = built.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling');
    assert.equal(ceilings.length, 1);
    assert.ok(covers(polyPositions(ceilings[0]), cx, cz), 'ceiling over the pool cut');
  }
  assert.ok(wet > 100, `only ${wet} wet halls`);
});

test('every doorway has a threshold floor through the wall thickness', () => {
  for (let i = 0; i < 400; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const built = buildHall(hall, conns);
    const thresholds = built.prims.filter(p => p.kind === 'poly' && p.name === 'threshold');
    assert.equal(thresholds.length, 4, `${hall.shape} has ${thresholds.length} thresholds`);
    const pos = thresholds.flatMap(p => polyPositions(p));
    const { cx, cz, hx, hz, wall: t } = hall;
    for (const [px, pz] of [[cx, cz - hz - t / 2], [cx, cz + hz + t / 2], [cx + hx + t / 2, cz], [cx - hx - t / 2, cz]]) {
      assert.ok(covers(pos, px, pz), `${hall.shape} doorway at ${px},${pz} has no floor`);
    }
    for (const p of thresholds) assert.ok(p.points.every(q => q[1] === hall.floorY));
  }
});

test('stair ramps and steps connectors have sloped floor surfaces', () => {
  const hall = { cx: 0, cz: 0, floorY: 0, ceiling: 18 };
  const ramps = buildStairwell(hall).prims.filter(p => p.kind === 'poly' && p.name === 'ramp');
  assert.equal(ramps.length, 2);
  const ys = ramps.flatMap(p => p.points.map(q => q[1])).sort((a, b) => a - b);
  assert.deepEqual([ys[0], ys[ys.length - 1]], [-WELL.drop, WELL.drop]);
  for (const p of ramps) assert.ok(!p.down);

  let found = false;
  for (let i = 0; i < 2000 && !found; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const a = hallParams(seed, x, 0, z, fields), b = hallParams(seed, x + 1, 0, z, fields);
    const conn = connectorParams(seed, a, b);
    if (conn.type !== 'steps') continue;
    found = true;
    const floors = buildConnector(conn).prims.filter(p => p.kind === 'poly' && p.name === 'floor');
    assert.equal(floors.length, 3);
    const heights = new Set(floors.flatMap(p => p.points.map(q => q[1])));
    assert.deepEqual([...heights].sort(), [0, TYPES.steps.raise].sort());
    assert.ok(!buildConnector(conn).prims.some(p => p.kind === 'box' && p.size[1] === 0.02 && p.pos[1] === TYPES.steps.raise), 'floating floor box remains');
  }
  assert.ok(found, 'no steps connector in range');
});
