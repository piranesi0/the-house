import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, stream } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues } from '../src/statues/place.js';
import { windowsFor } from '../src/windows.js';
import { isRoofless, overheadKey, ROOF } from '../src/roof.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);

test('about one bright hall in ten is roofless, and no other hall is', () => {
  let bright = 0, open = 0;
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    const hall = hallParams(seed, x, 0, z, fields), r = isRoofless(seed, hall);
    assert.equal(isRoofless(seed, hall), r, 'not deterministic');
    if (hall.isStair || hall.light <= ROOF.light) { assert.equal(r, false, `stair or ${hall.light.toFixed(2)} light hall roofless at (${x},${z})`); continue; }
    bright++;
    if (r) open++;
  }
  assert.ok(bright > 250, `only ${bright} bright halls`);
  assert.ok(open / bright > 0.05 && open / bright < 0.16, `${open} roofless of ${bright}`);
});

test('vista halls above and below a well are never roofless, whatever their light', () => {
  let n = 0;
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    for (const y of [-1, 1]) {
      const hall = hallParams(seed, x, y, z, fields);
      if (hall.light <= ROOF.light) continue;
      n++;
      assert.equal(isRoofless(seed, hall), false);
      assert.equal(isRoofless(seed, { ...hall, isStair: false }), false);
    }
  }
  assert.ok(n > 200);
});

test('a hall beside a stair hall is never roofless, so no vista hall shows over its wall (D7)', () => {
  let barred = 0;
  for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) {
    const hall = hallParams(seed, x, 0, z, fields);
    const nextToStair = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => hallParams(seed, x + dx, 0, z + dz, fields).isStair);
    if (!nextToStair) continue;
    assert.equal(isRoofless(seed, hall), false, `(${x},${z}) is roofless beside a stair hall`);
    // Halls the roll alone would have opened: the neighbour rule is what keeps their roof on.
    if (!hall.isStair && hall.light > ROOF.light && stream(seed, x, 0, z, 'roof').chance(ROOF.chance)) barred++;
  }
  assert.ok(barred >= 3, `only ${barred} halls kept their roof for a stair neighbour`);
});

test('a roofless hall has no ceiling, walls to full height, no windows, and light from almost overhead', () => {
  let n = 0;
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    const hall = hallParams(seed, x, 0, z, fields);
    if (!isRoofless(seed, hall)) continue;
    n++;
    const conns = connsFor(seed, hall, fields);
    const built = buildHall(hall, conns, { roofless: true });
    const top = hall.floorY + hall.ceiling;
    assert.equal(built.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling').length, 0, 'ceiling poly');
    assert.ok(!built.prims.some(p => p.kind === 'lines' && p.points.every(q => Math.abs(q[1] - top) < 1e-9)), 'ceiling outline');
    // The walls themselves still rise to the full ceiling height: their box edges are the top line.
    assert.ok(built.boxes.some(b => Math.abs(b.max[1] - top) < 1e-9), 'walls stop short');
    const covered = buildHall(hall, conns);
    assert.deepEqual(built.boxes, covered.boxes, 'roofless changed collision');
    assert.deepEqual(built.slots, covered.slots, 'roofless changed the statue slots');
    const statues = placeStatues(seed, hall, built.slots, built.boxes);
    const out = windowsFor(seed, hall, conns, statues);
    assert.equal(out.wall, null); assert.deepEqual(out.windows, []); assert.deepEqual(out.shafts, []);
    assert.deepEqual(out.keyDir, overheadKey(seed, hall));
    const k = out.keyDir, elev = Math.asin(-k[1]) * 180 / Math.PI;
    assert.ok(Math.abs(Math.hypot(...k) - 1) < 1e-9);
    assert.ok(elev >= ROOF.elevation[0] - 1e-9 && elev <= ROOF.elevation[1] + 1e-9, `roofless key at ${elev.toFixed(1)} degrees`);
  }
  assert.ok(n >= 15, `only ${n} roofless halls`);
});

test('a hall with a roof keeps its windows, and its key light still comes through them', () => {
  for (let x = -10; x < 10; x++) for (let z = -10; z < 10; z++) {
    const hall = hallParams(seed, x, 0, z, fields);
    if (isRoofless(seed, hall)) continue;
    const conns = connsFor(seed, hall, fields), built = buildHall(hall, conns);
    const out = windowsFor(seed, hall, conns, placeStatues(seed, hall, built.slots, built.boxes));
    assert.ok(out.wall && out.windows.length >= 1, `(${x},${z}) lost its windows`);
  }
});
