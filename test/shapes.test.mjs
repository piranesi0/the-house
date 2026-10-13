import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall, BUILDERS } from '../src/shapes/index.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const inside = (boxes, x, y, z) => boxes.some(b => x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]);

export function checkHall(hall, conns, built) {
  const { cx, cz, hx, hz, wall: t } = hall;
  assert.ok(built.prims.length > 0 && built.boxes.length > 0);
  const probes = {
    n: { open: [cx, 1, cz - hz - t / 2], solid: [cx + conns.n.width / 2 + 2, 1, cz - hz - t / 2] },
    s: { open: [cx, 1, cz + hz + t / 2], solid: [cx - conns.s.width / 2 - 2, 1, cz + hz + t / 2] },
    e: { open: [cx + hx + t / 2, 1, cz], solid: [cx + hx + t / 2, 1, cz + conns.e.width / 2 + 2] },
    w: { open: [cx - hx - t / 2, 1, cz], solid: [cx - hx - t / 2, 1, cz - conns.w.width / 2 - 2] },
  };
  for (const [side, p] of Object.entries(probes)) {
    assert.ok(!inside(built.boxes, ...p.open), `${hall.shape} ${side} doorway blocked`);
    assert.ok(inside(built.boxes, ...p.solid), `${hall.shape} ${side} wall missing`);
  }
  assert.ok(built.slots.length >= 2, `${hall.shape} has ${built.slots.length} slots`);
  for (const s of built.slots) {
    assert.ok(Math.abs(s.x - cx) <= hx && Math.abs(s.z - cz) <= hz, 'slot outside hall');
    const nearN = Math.abs(s.x - cx) < conns.n.width / 2 + 1.5 && s.z < cz - hz + 3;
    const nearS = Math.abs(s.x - cx) < conns.s.width / 2 + 1.5 && s.z > cz + hz - 3;
    const nearE = Math.abs(s.z - cz) < conns.e.width / 2 + 1.5 && s.x > cx + hx - 3;
    const nearW = Math.abs(s.z - cz) < conns.w.width / 2 + 1.5 && s.x < cx - hx + 3;
    assert.ok(!(nearN || nearS || nearE || nearW), `${hall.shape} slot in a doorway zone`);
  }
}

test('every built shape has four open doorways, solid walls and safe slots', () => {
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!BUILDERS[hall.shape]) continue;
    seen.add(hall.shape);
    const conns = connsFor(seed, hall, fields);
    checkHall(hall, conns, buildHall(hall, conns));
    assert.deepEqual(buildHall(hall, conns), buildHall(hall, conns));
  }
  for (const s of Object.keys(BUILDERS)) assert.ok(seen.has(s), `never saw ${s}`);
});
