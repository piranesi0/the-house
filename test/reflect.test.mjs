import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues } from '../src/statues/place.js';
import { placeColossus } from '../src/statues/colossus.js';
import { reflectionPrims, mirrorTriangles, mirrorSegments } from '../src/reflect.js';

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
  return { hall, statues, prims };
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

test('the shaded look reflects the colossus and columns standing in the pool, and the vault over it', () => {
  let colossi = 0, columns = 0;
  for (let i = 0; i < 2000; i++) {
    const w = wetHall((i * 31) % 401 - 200, (i * 17) % 401 - 200);
    if (!w) continue;
    const got = reflectionPrims(w.hall, w.statues, w.prims, { shaded: true });
    const wet = w.statues.filter(s => inPool(w.hall, s.slot.x, s.slot.z));
    assert.equal(got.filter(p => p.tag === 'statue').length, wet.reduce((k, s) => k + s.prims.length, 0));
    if (wet.some(s => s.colossus)) colossi++;
    const cols = got.filter(p => p.name === 'column');
    assert.ok(cols.every(p => inPool(w.hall, p.pos[0], p.pos[2])), 'a dry column reflected');
    columns += cols.length;
    if (w.hall.shape === 'colonnade') assert.equal(cols.length, w.prims.filter(p => p.name === 'column' && inPool(w.hall, p.pos[0], p.pos[2])).length);
    const vault = got.filter(p => p.kind === 'poly');
    assert.equal(vault.length, 1);
    assert.ok(vault[0].name === 'ceiling' && vault[0].down);
    assert.equal(got.length, got.filter(p => p.tag === 'statue').length + cols.length + 1, 'something else reflected');
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

test('mirrorTriangles turns a triangle over the water line and keeps it facing out', () => {
  // Facing +y (counter-clockwise seen from above is clockwise in (x, z) for three's +y normal).
  const up = [0, 2, 0, 0, 2, 1, 1, 2, 0];
  const m = mirrorTriangles(up, 0.4);
  assert.deepEqual([...m].map(v => +v.toFixed(6)), [0, -1.2, 0, 1, -1.2, 0, 0, -1.2, 1]);
  const normalY = (t) => (t[5] - t[2]) * (t[6] - t[0]) - (t[3] - t[0]) * (t[8] - t[2]);
  assert.ok(normalY(up) > 0 && normalY([...m]) < 0, 'the mirrored face must face down, as the reflection of an up face');
});

test('mirrorSegments drops what rises above the sheet and cuts what crosses it', () => {
  const segs = [0, 2, 0, 0, 3, 0,     // high: mirrored to -1.2..-2.2, kept
                0, 0, 0, 0, 1, 0,     // standing in 0.4 m of water: mirrored 0.8..-0.2, cut at 0.34
                0, 0.1, 0, 1, 0.2, 0]; // under the water: mirrored 0.7..0.6, dropped
  const m = [...mirrorSegments(segs, 0.4, 0.34)].map(v => +v.toFixed(6));
  assert.deepEqual(m, [0, -1.2, 0, 0, -2.2, 0, 0, 0.34, 0, 0, -0.2, 0]);
});
