import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues, doorZones } from '../src/statues/place.js';
import { placeColossus, wellZones, COLOSSUS } from '../src/statues/colossus.js';
import { footprint } from '../src/shapes/footprint.js';
import { WELL } from '../src/shapes/stairwell.js';

const ov = (a, b) => a.min[0] < b.max[0] - 1e-6 && a.max[0] > b.min[0] + 1e-6 && a.min[2] < b.max[2] - 1e-6 && a.max[2] > b.min[2] + 1e-6
  && a.min[1] < b.max[1] && a.max[1] > b.min[1];
const hallAt = (seed, fields, x, z) => {
  const hall = hallParams(seed, x, 0, z, fields), built = buildHall(hall, connsFor(seed, hall, fields));
  return { hall, built, statues: placeStatues(seed, hall, built.slots, built.boxes) };
};

test('about one hall in four taller than 28 m holds a colossus, and no lower hall does', () => {
  for (const name of ['ravens', 'kelp-salt']) {
    const seed = fnv1a(name), fields = makeFields(seed);
    let tall = 0, giants = 0;
    for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
      const { hall, built, statues } = hallAt(seed, fields, x, z);
      const c = placeColossus(seed, hall, built.boxes, statues);
      if (hall.ceiling <= COLOSSUS.minCeiling) { assert.equal(c, null, `${hall.ceiling.toFixed(1)} m hall has a colossus`); continue; }
      tall++;
      if (c) giants++;
    }
    assert.ok(tall > 150, `${name}: only ${tall} tall halls`);
    assert.ok(giants / tall > 0.15 && giants / tall < 0.35, `${name}: ${giants} colossi in ${tall} tall halls`);
  }
});

test('every colossus is 10 to 15 m tall, inside the hall, and clear of walls, well, doorways and statues', () => {
  const seed = fnv1a('ravens'), fields = makeFields(seed);
  let n = 0, stairs = 0;
  for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) {
    const { hall, built, statues } = hallAt(seed, fields, x, z);
    const c = placeColossus(seed, hall, built.boxes, statues);
    if (!c) continue;
    n++;
    if (hall.isStair) stairs++;
    assert.deepEqual(placeColossus(seed, hall, built.boxes, statues), c, 'not deterministic');
    assert.equal(c.family, 'figure'); assert.ok(c.colossus);
    const top = Math.max(...c.boxes.map(b => b.max[1])) - hall.floorY;
    assert.ok(top >= 10 - 1e-6 && top <= 15 + 1e-6, `colossus ${top.toFixed(2)} m tall`);
    const fp = footprint(hall);
    for (const b of c.boxes) {
      for (const corner of [[b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]]]) {
        assert.ok(pointInPolygon(corner, fp), `${hall.shape} colossus pokes out of the hall at (${x},${z})`);
      }
      assert.ok(!built.boxes.some(w => ov(b, w)), `colossus inside a wall, column or the well frame at (${x},${z})`);
      assert.ok(!statues.some(s => s.boxes.some(o => ov(b, o))), `colossus on a statue at (${x},${z})`);
      assert.ok(!doorZones(hall).some(r => b.min[0] < r.x1 && b.max[0] > r.x0 && b.min[2] < r.z1 && b.max[2] > r.z0), 'colossus blocks a doorway');
      if (hall.isStair) {
        const { cx, cz } = hall;
        assert.ok(b.max[0] <= cx - WELL.hx || b.min[0] >= cx + WELL.hx || b.max[2] <= cz - WELL.hz || b.min[2] >= cz + WELL.hz, 'colossus stands in the stairwell');
        assert.ok(!wellZones(hall).some(r => b.min[0] < r.x1 && b.max[0] > r.x0 && b.min[2] < r.z1 && b.max[2] > r.z0), 'colossus blocks a stairwell entrance');
      }
    }
  }
  assert.ok(n >= 60, `only ${n} colossi`);
  assert.ok(stairs >= 5, `only ${stairs} stair hall colossi checked`);
});

test('ordinary statues are the same as before colossi existed, and placing one changes none of them', () => {
  // Fingerprint of placeStatues over 300 halls, taken from the code before colossi and the fitter
  // refactor. A different hash means the ordinary placement moved.
  const seed = fnv1a('ravens'), fields = makeFields(seed), rows = [];
  for (let i = 0; i < 300; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const { hall, built, statues } = hallAt(seed, fields, x, z);
    const copy = structuredClone(statues);
    placeColossus(seed, hall, built.boxes, statues);
    assert.deepEqual(statues, copy, 'placeColossus changed the ordinary statues');
    for (const s of statues) rows.push([x, z, s.subject, s.pose, s.scale, s.slot.x, s.slot.z, s.boxes]);
  }
  assert.equal(rows.length, 1250);
  assert.equal(fnv1a(JSON.stringify(rows)).toString(16), '5f81ebd0');
});

test('ruling D1: no hall off the ground storey gets a colossus, stair-hall vistas included', () => {
  const seed = fnv1a('ravens'), fields = makeFields(seed);
  let tall = 0, stairAbove = 0;
  for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
    for (const y of [-1, 1]) {
      const hall = hallParams(seed, x, y, z, fields), built = buildHall(hall, connsFor(seed, hall, fields));
      if (hall.ceiling > COLOSSUS.minCeiling) tall++;
      if (y === 1 && hall.isStair) stairAbove++;
      assert.equal(placeColossus(seed, hall, built.boxes, placeStatues(seed, hall, built.slots, built.boxes)), null, `y=${y} hall (${x},${z}) has a colossus`);
    }
  }
  assert.ok(tall > 50, `only ${tall} tall off-storey halls checked`);
});

// Final review C1: a colossus must never cut a hall into pockets. An independent flood fill (0.2 m,
// diagonal-free, the player's 0.35 m radius, body band 0.2-1.8 m) from just inside each doorway,
// and each well gap in a stair hall; every pair connected without the colossus stays connected.
function pockets(hall, boxes) {
  const s = 0.2, r = 0.35, { cx, cz, hx, hz, floorY } = hall, fp = footprint(hall);
  const nx = Math.ceil(hx / s), nz = Math.ceil(hz / s), m = 2 * nz + 1;
  const band = boxes.filter(b => b.max[1] >= floorY + 0.2 && b.min[1] <= floorY + 1.8);
  const at = (i, j) => [cx + (i - nx) * s, cz + (j - nz) * s];
  const free = (i, j) => { const [x, z] = at(i, j); return pointInPolygon([x, z], fp) && !band.some(b => x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r); };
  const label = new Map(), comp = (i, j) => {
    if (i < 0 || j < 0 || i > 2 * nx || j >= m || !free(i, j)) return -1;
    const k0 = i * m + j;
    if (label.has(k0)) return label.get(k0);
    const stack = [[i, j]]; label.set(k0, k0);
    while (stack.length) {
      const [a, b] = stack.pop();
      for (const [p, q] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
        if (p < 0 || q < 0 || p > 2 * nx || q >= m || label.has(p * m + q) || !free(p, q)) continue;
        label.set(p * m + q, k0); stack.push([p, q]);
      }
    }
    return k0;
  };
  const e = WELL.hx + WELL.wallT + 1;
  const seeds = [[cx, cz - hz + 1], [cx, cz + hz - 1], [cx + hx - 1, cz], [cx - hx + 1, cz], ...(hall.isStair ? [[cx + e, cz], [cx - e, cz]] : [])];
  return seeds.map(([x, z]) => comp(Math.round((x - cx) / s) + nx, Math.round((z - cz) / s) + nz));
}

test('no colossus cuts a hall into pockets: doorways that reached each other still do', () => {
  const shapes = new Set();
  let n = 0, cross = 0, stairs = 0;
  for (const name of ['ravens', 'kelp-salt', 'moth']) {
    const seed = fnv1a(name), fields = makeFields(seed);
    const halls = [];
    for (let x = -14; x < 14; x++) for (let z = -14; z < 14; z++) halls.push([x, z]);
    if (name === 'ravens') halls.push([-3, 2]);   // the review's probe hall: a cross split four ways
    for (const [x, z] of halls) {
      const { hall, built, statues } = hallAt(seed, fields, x, z);
      const c = placeColossus(seed, hall, built.boxes, statues);
      if (!c) continue;
      n++; shapes.add(hall.shape); if (hall.shape === 'cross') cross++; if (hall.isStair) stairs++;
      const solids = [...built.boxes, ...statues.flatMap(s => s.boxes)];
      const before = pockets(hall, solids), after = pockets(hall, [...solids, ...c.boxes]);
      for (let a = 0; a < before.length; a++) for (let b = a + 1; b < before.length; b++) {
        if (before[a] < 0 || before[a] !== before[b]) continue;
        assert.ok(after[a] >= 0 && after[a] === after[b], `${name} ${hall.shape} (${x},${z}): colossus cuts seed ${a} off from seed ${b}`);
      }
    }
  }
  assert.ok(n >= 150, `only ${n} colossus halls checked`);
  // Long halls stop at 26 m, under COLOSSUS.minCeiling, so they never hold one.
  assert.deepEqual([...shapes].sort(), ['colonnade', 'cross', 'octagon', 'square'], 'not every shape checked');
  assert.ok(stairs >= 5, `only ${stairs} stair-hall colossi checked`);
  assert.ok(cross >= 10, `only ${cross} cross-hall colossi checked`);
});
