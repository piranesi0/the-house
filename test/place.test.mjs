import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues, FAMILIES } from '../src/statues/place.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const overlapXZ = (b, r) => b.min[0] < r.x1 && b.max[0] > r.x0 && b.min[2] < r.z1 && b.max[2] > r.z0;

test('every hall gets unique statues that never block a doorway', () => {
  for (let i = 0; i < 300; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const built = buildHall(hall, conns);
    const statues = placeStatues(seed, hall, built.slots);
    assert.ok(statues.length >= 1, `${hall.shape} at ${x},${z} has no statues`);
    assert.ok(statues.length <= 14);
    assert.deepEqual(placeStatues(seed, hall, built.slots), statues);
    const keys = statues.map(s => `${s.subject}:${s.pose}`);
    assert.equal(new Set(keys).size, keys.length, 'duplicate statue');
    const { cx, cz, hx, hz, wall } = hall;
    const gaps = [
      { x0: cx - conns.n.width / 2 - 0.5, x1: cx + conns.n.width / 2 + 0.5, z0: cz - hz - wall, z1: cz - hz + 2 },
      { x0: cx - conns.s.width / 2 - 0.5, x1: cx + conns.s.width / 2 + 0.5, z0: cz + hz - 2, z1: cz + hz + wall },
      { x0: cx + hx - 2, x1: cx + hx + wall, z0: cz - conns.e.width / 2 - 0.5, z1: cz + conns.e.width / 2 + 0.5 },
      { x0: cx - hx - wall, x1: cx - hx + 2, z0: cz - conns.w.width / 2 - 0.5, z1: cz + conns.w.width / 2 + 0.5 },
    ];
    for (const s of statues) {
      assert.ok(s.prims.length > 0 && s.boxes.length >= 1);
      assert.ok(FAMILIES[s.family].includes(s.subject));
      assert.ok(s.scale >= 1 && s.scale <= 3);
      for (const b of s.boxes) for (const g of gaps) assert.ok(!overlapXZ(b, g), `${s.subject} blocks a doorway in ${hall.shape}`);
    }
  }
});

test('the spawn point is never inside a statue', async () => {
  const { freeSpawn } = await import('../src/hall.js');
  let moved = 0;
  for (let i = 0; i < 300; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const boxes = placeStatues(seed, hall, buildHall(hall, conns).slots).flatMap(s => s.boxes);
    const [px, pz] = freeSpawn(hall, boxes);
    const r = 0.35;
    for (const b of boxes) {
      const hit = px > b.min[0] - r && px < b.max[0] + r && pz > b.min[2] - r && pz < b.max[2] + r && b.max[1] > hall.floorY + 0.2;
      assert.ok(!hit, `${hall.shape} at ${x},${z} spawns inside a statue`);
    }
    if (px !== hall.cx || pz !== hall.cz) moved++;
  }
  assert.ok(moved > 0 && moved < 300);
});

test('statues stay inside the hall, off its walls, columns and well, and off each other', () => {
  const ov = (a, b) => a.min[0] < b.max[0] - 1e-6 && a.max[0] > b.min[0] + 1e-6 && a.min[2] < b.max[2] - 1e-6 && a.max[2] > b.min[2] + 1e-6
    && a.min[1] < b.max[1] && a.max[1] > b.min[1];
  for (const name of ['ravens', 'kelp-salt']) {
    const s = fnv1a(name), f = makeFields(s);
    for (let i = 0; i < 400; i++) {
      const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
      const hall = hallParams(s, x, 0, z, f), built = buildHall(hall, connsFor(s, hall, f));
      const statues = placeStatues(s, hall, built.slots, built.boxes);
      assert.ok(statues.length >= 2, `${hall.shape} at ${x},${z} has ${statues.length} statues`);
      const { cx, cz, hx, hz } = hall;
      statues.forEach((st, k) => {
        for (const b of st.boxes) {
          assert.ok(b.min[0] >= cx - hx - 1e-6 && b.max[0] <= cx + hx + 1e-6 && b.min[2] >= cz - hz - 1e-6 && b.max[2] <= cz + hz + 1e-6, `${st.subject} pokes out of a ${hall.shape} hall`);
          assert.ok(!built.boxes.some(w => ov(b, w)), `${st.subject} is inside a wall, column or well of a ${hall.shape} hall`);
          for (const other of statues.slice(k + 1)) assert.ok(!other.boxes.some(o => ov(b, o)), `${st.subject} overlaps ${other.subject}`);
        }
      });
    }
  }
});

test('every placed figure carries its own pose variant, and all twelve poses turn up', () => {
  const seen = new Set(), variants = new Set(), halls = new Set();
  let figures = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    if (halls.has(`${x},${z}`)) continue;
    halls.add(`${x},${z}`);
    const hall = hallParams(seed, x, 0, z, fields), built = buildHall(hall, connsFor(seed, hall, fields));
    for (const s of placeStatues(seed, hall, built.slots, built.boxes)) {
      if (s.family !== 'figure') continue;
      figures++; seen.add(s.subject);
      assert.ok(Number.isInteger(s.variant) && s.variant >= 0, `${s.subject} has no variant`);
      variants.add(s.variant);
    }
  }
  assert.equal(seen.size, 12, `poses seen: ${[...seen].join(', ')}`);
  assert.ok(variants.size > 0.95 * figures);
});
