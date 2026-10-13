import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, STOREY } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { WELL } from '../src/shapes/stairwell.js';
import { floorAt } from '../src/player.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const inside = (boxes, x, y, z) => boxes.some(b => x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]);

test('a stair hall has ramps to both landings, rails at every edge, and no slot in the well', () => {
  let checked = 0;
  for (let i = 0; i < 3000 && checked < 20; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.isStair) continue;
    checked++;
    const conns = connsFor(seed, hall, fields), b = buildHall(hall, conns);
    const { cx, cz } = hall, { hx, hz, drop } = WELL;
    assert.ok(Math.abs(floorAt(b.floors, cx, cz - 4.5) - (-drop)) < 1e-9);
    assert.ok(Math.abs(floorAt(b.floors, cx, cz + 4.5) - drop) < 1e-9);
    assert.ok(Math.abs(floorAt(b.floors, cx, cz - 2) - (-drop / 2)) < 1e-9);
    assert.equal(floorAt(b.floors, cx + hx + 2, cz), 0);
    assert.ok(inside(b.boxes, cx, 0.5, cz - hz - 0.15) && inside(b.boxes, cx, -drop + 0.5, cz - hz - 0.15), 'north rails');
    assert.ok(inside(b.boxes, cx, 0.5, cz + hz + 0.15) && inside(b.boxes, cx, drop + 0.5, cz + hz + 0.15), 'south rails');
    assert.ok(inside(b.boxes, cx + hx + 0.25, 1, cz - 3) && inside(b.boxes, cx - hx - 0.25, -2, cz - 3), 'shaft walls');
    assert.ok(!inside(b.boxes, cx + hx + 0.25, 1, cz) && !inside(b.boxes, cx - hx - 0.25, 1, cz), 'no way into the well from the side');
    for (const s of b.slots) assert.ok(Math.abs(s.x - cx) > hx + 1 || Math.abs(s.z - cz) > hz + 1, 'slot in the well');
    const vista = buildHall({ ...hall, y: -1, floorY: -STOREY }, conns, { vista: true, ceiling: false });
    assert.equal(vista.floors.length, 0);
  }
  assert.ok(checked >= 10);
});

test('stair halls spawn the player inside the hall, beside the well, clear of every box', async () => {
  const { freeSpawn } = await import('../src/hall.js');
  const { placeStatues } = await import('../src/statues/place.js');
  let checked = 0;
  for (let i = 0; i < 6000 && checked < 60; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.isStair) continue;
    checked++;
    const b = buildHall(hall, connsFor(seed, hall, fields));
    const boxes = [...b.boxes, ...placeStatues(seed, hall, b.slots).flatMap(s => s.boxes)];
    const [px, pz] = freeSpawn(hall, boxes);
    const { cx, cz, hx, hz } = hall;
    assert.ok(Math.abs(px - cx) <= hx - 0.35 && Math.abs(pz - cz) <= hz - 0.35, `${hall.shape} at ${x},${z} spawns outside the hall`);
    assert.equal(floorAt(b.floors, px, pz), 0, `${hall.shape} at ${x},${z} spawns on the stairs`);
    assert.ok(placeStatues(seed, hall, b.slots).length >= 2, `${hall.shape} stair hall at ${x},${z} has under two statues`);
    assert.ok(!boxes.some(q => px > q.min[0] - 0.35 && px < q.max[0] + 0.35 && pz > q.min[2] - 0.35 && pz < q.max[2] + 0.35 && q.max[1] > 0.2 && q.min[1] < 1.8), `${hall.shape} at ${x},${z} spawns inside a box`);
  }
  assert.ok(checked >= 30);
});

test('nothing from the storey below pokes through a stair hall floor, nor a stair hall into the one above', () => {
  let checked = 0;
  for (let i = 0; i < 6000 && checked < 60; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.isStair) continue;
    checked++;
    assert.ok(hall.ceiling <= STOREY - 1, `stair hall ceiling ${hall.ceiling}`);
    const below = hallParams(seed, x, -1, z, fields);
    const vista = buildHall(below, connsFor(seed, below, fields), { vista: true, ceiling: false });
    const top = Math.max(...vista.boxes.map(b => b.max[1]));
    assert.ok(top <= -1 + 1e-9, `hall below reaches y = ${top}`);
  }
});

test('stair halls and the halls above them are dry, so nobody wades on the stairs', () => {
  let checked = 0;
  for (let i = 0; i < 6000 && checked < 80; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.isStair || fields.water(x, z) < 0.35) continue;
    checked++;
    assert.equal(hall.depth, 0); assert.equal(hall.pool, null);
    const above = hallParams(seed, x, 1, z, fields);
    assert.equal(above.depth, 0); assert.equal(above.pool, null);
  }
  assert.ok(checked >= 20);
});
