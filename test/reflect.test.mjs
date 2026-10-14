import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues } from '../src/statues/place.js';
import { placeColossus } from '../src/statues/colossus.js';
import { reflectionPrims, mirrorTriangles, mirrorSegments, MIRROR_Y } from '../src/reflect.js';
import { boundsOf, translatePrims } from '../src/shapes/ir.js';
import { polyPositions } from '../src/shapes/poly.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);

// A pool hall as World.ensure builds it (connectors left out: they stand outside the hall).
function wetHall(x, z, opts = {}) {
  const hall = hallParams(seed, x, 0, z, fields);
  if (!hall.pool) return null;
  const built = buildHall(hall, connsFor(seed, hall, fields), opts);
  const statues = placeStatues(seed, hall, built.slots, built.boxes);
  const giant = placeColossus(seed, hall, built.boxes, statues);
  if (giant) statues.push(giant);
  const prims = [...built.prims, ...statues.flatMap(s => s.prims.map(p => ({ ...p, tag: 'statue' })))];
  return { hall, statues, prims, own: built.prims };
}
const inPool = (hall, x, z) => pointInPolygon([x - hall.cx, z - hall.cz], hall.pool);

test('look=lines reflects only the ordinary statues standing in the pool, as v0 did', () => {
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const w = wetHall((i * 31) % 201 - 100, (i * 17) % 201 - 100);
    if (!w) continue;
    n++;
    const want = w.statues.filter(s => !s.colossus && inPool(w.hall, s.slot.x, s.slot.z)).reduce((k, s) => k + s.prims.length, 0);
    const got = reflectionPrims(w.hall, w.statues, w.prims, { shaded: false });
    assert.equal(got.length, want);
    assert.ok(got.every(p => p.tag === 'statue'));
  }
  assert.ok(n > 100);
});

test('the shaded look reflects what stands in the pool, colossus included, and the hall: its walls, columns and vault', () => {
  let colossi = 0, columns = 0;
  for (let i = 0; i < 2000; i++) {
    const w = wetHall((i * 31) % 401 - 200, (i * 17) % 401 - 200);
    if (!w) continue;
    const got = reflectionPrims(w.hall, w.statues, w.prims, { shaded: true });
    const wet = w.statues.filter(s => inPool(w.hall, s.slot.x, s.slot.z));
    assert.equal(got.filter(p => p.tag === 'statue').length, wet.reduce((k, s) => k + s.prims.length, 0));
    if (wet.some(s => s.colossus)) colossi++;
    const cols = got.filter(p => p.name === 'column');
    assert.equal(cols.length, w.own.filter(p => p.name === 'column').length, 'a hall column not reflected');
    if (w.hall.shape === 'colonnade') assert.ok(cols.length > 0);
    columns += cols.length;
    const walls = got.filter(p => p.kind === 'box' && !p.tag);
    assert.equal(walls.length, w.own.filter(p => p.kind === 'box').length, 'a hall wall not reflected');
    assert.ok(walls.length > 0);
    const vault = got.filter(p => p.kind === 'poly');
    assert.equal(vault.length, 1);
    assert.ok(vault[0].name === 'ceiling' && vault[0].down);
    assert.equal(got.length, got.filter(p => p.tag === 'statue').length + cols.length + walls.length + 1, 'something else reflected');
  }
  assert.ok(colossi > 0, 'no colossus stands in a pool');
  assert.ok(columns > 0, 'no column stands in a pool');
});

test('a roofless pool hall reflects no vault', () => {
  for (let i = 0; i < 200; i++) {
    const w = wetHall((i * 31) % 201 - 100, (i * 17) % 201 - 100, { roofless: true });
    if (!w) continue;
    assert.equal(reflectionPrims(w.hall, w.statues, w.prims, { shaded: true }).filter(p => p.kind === 'poly').length, 0);
  }
});

test('mirrorTriangles turns a triangle over the floor and keeps it facing out', () => {
  // Facing +y (counter-clockwise seen from above is clockwise in (x, z) for three's +y normal).
  const up = [0, 2, 0, 0, 2, 1, 1, 2, 0];
  const m = mirrorTriangles(up, MIRROR_Y);
  assert.deepEqual([...m].map(v => +v.toFixed(6) + 0), [0, -2, 0, 1, -2, 0, 0, -2, 1]);
  const normalY = (t) => (t[5] - t[2]) * (t[6] - t[0]) - (t[3] - t[0]) * (t[8] - t[2]);
  assert.ok(normalY(up) > 0 && normalY([...m]) < 0, 'the mirrored face must face down, as the reflection of an up face');
});

test('mirrorSegments, about the floor and cut there, drops what would rise above it and cuts what crosses it', () => {
  const segs = [0, 2, 0, 0, 3, 0,        // high: mirrored to -2..-3, kept
                0, 0, 0, 0, 1, 0,        // standing on the floor: mirrored 0..-1, kept whole
                0, -0.5, 0, 0, 0.5, 0,   // through the floor: mirrored 0.5..-0.5, cut at 0
                0, -0.2, 0, 1, -0.1, 0]; // under the floor: mirrored 0.2..0.1, dropped
  const m = [...mirrorSegments(segs, MIRROR_Y, MIRROR_Y)].map(v => +v.toFixed(6) + 0);
  assert.deepEqual(m, [0, -2, 0, 0, -3, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, -0.5, 0]);
});

test('a shaded pool hall mirrors down to minus its own height and nothing above its floor', () => {
  let n = 0;
  for (let i = 0; i < 600; i++) {
    const w = wetHall((i * 31) % 201 - 100, (i * 17) % 201 - 100);
    if (!w) continue;
    const { hall } = w;
    const local = translatePrims(reflectionPrims(hall, w.statues, w.own, { shaded: true }), -hall.cx, -hall.floorY, -hall.cz);
    let lowest = Infinity;
    for (const p of local) {
      let tri;
      if (p.kind === 'poly') tri = polyPositions(p);
      else {
        // The part's bounding box as triangles: two per face is more than enough to bound it.
        const { min: a, max: b } = boundsOf([p]), c = (i) => [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
        tri = [0, 1, 2, 4, 5, 6, 3, 7, 1, 2, 6, 7].flatMap(k => c(k));
      }
      const m = mirrorTriangles(tri, MIRROR_Y);
      for (let k = 1; k < m.length; k += 3) {
        assert.ok(m[k] <= 1e-6, `${hall.shape} ${p.kind} ${p.name ?? ''} mirrored to ${m[k]} above the floor`);
        lowest = Math.min(lowest, m[k]);
      }
      // The vault hangs exactly as far below the floor as it stands above it.
      if (p.kind === 'poly') for (let k = 1; k < m.length; k += 3) assert.ok(Math.abs(m[k] + hall.ceiling) < 1e-4, `vault mirrored to ${m[k]}, not ${-hall.ceiling}`);
      n++;
    }
    // The walls carry the mirror at least a ceiling's height down, no deeper than the tallest part.
    const tallest = Math.max(...local.map(p => boundsOf([p]).max[1]));
    assert.ok(lowest <= -hall.ceiling + 1e-4 && Math.abs(lowest + tallest) < 1e-4, `${hall.shape} mirror bottoms at ${lowest}, ceiling ${hall.ceiling}`);
    const segs = local.filter(p => p.kind !== 'poly').flatMap(p => { const { min, max } = boundsOf([p]); return [...min, ...max]; });
    assert.ok(mirrorSegments(segs, MIRROR_Y, MIRROR_Y).every((v, j) => j % 3 !== 1 || v <= 1e-6), 'a mirrored line above the floor');
  }
  assert.ok(n > 1000, `only ${n} parts`);
});
