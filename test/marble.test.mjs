import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, SHAPES } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { buildConnector } from '../src/shapes/connector.js';
import { MARBLES, MARBLE_ORDER, THEME_CUTS, PATTERNS, MAX_FOOTPRINT, marbleFor, marbleOf, districtTheme, isInlaid, footprintLocal } from '../src/marble.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);

test('the table holds the six marbles, each with base, vein, strength and two inlays in range', () => {
  assert.deepEqual(Object.values(MARBLES).map(m => m.name), ['Carrara', 'Bardiglio', 'Rosso Verona', 'Verde antico', 'Giallo', 'Nero']);
  assert.deepEqual(MARBLE_ORDER, Object.keys(MARBLES));
  for (const m of Object.values(MARBLES)) {
    for (const c of [m.base, m.vein, ...m.inlay]) { assert.equal(c.length, 3); for (const v of c) assert.ok(v >= 0 && v <= 1); }
    assert.equal(m.inlay.length, 2);
    assert.ok(m.strength > 0 && m.strength <= 1);
  }
  const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
  assert.ok(lum(MARBLES.carrara.base) > 0.85 && lum(MARBLES.nero.base) < 0.15, 'Carrara white, Nero black');
});

test('marbleFor is deterministic, and every marble and every pattern turns up', () => {
  const marbles = new Set(), patterns = new Set();
  for (let x = -40; x < 40; x += 2) for (let z = -40; z < 40; z += 2) {
    const hall = hallParams(seed, x, 0, z, fields), m = marbleFor(seed, hall, fields);
    assert.deepEqual(marbleFor(seed, hall, fields), m);
    assert.ok(MARBLES[m.marble], `unknown marble ${m.marble}`);
    assert.ok(PATTERNS.includes(m.pattern));
    marbles.add(m.marble); patterns.add(m.pattern);
  }
  assert.equal(marbles.size, 6, `marbles seen: ${[...marbles]}`);
  assert.equal(patterns.size, 3);
});

test('the marble is constant within a district: neighbours differ only across a theme cut, and rarely', () => {
  let pairs = 0, differ = 0, fullDiffer = 0;
  for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) {
    const a = hallParams(seed, x, 0, z, fields);
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const b = hallParams(seed, x + dx, 0, z + dz, fields);
      pairs++;
      if (marbleOf(a.theme) !== marbleOf(b.theme)) fullDiffer++;
      const ma = marbleFor(seed, a, fields).marble, mb = marbleFor(seed, b, fields).marble;
      if (ma === mb) continue;
      differ++;
      const ta = districtTheme(fields, a), tb = districtTheme(fields, b), lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      assert.ok(THEME_CUTS.some(c => lo < c && c <= hi), `(${x},${z}) changes marble with no cut between ${lo} and ${hi}`);
    }
  }
  // At one-third resolution a district spans several halls: measured 0.179 of neighbouring pairs
  // change marble for this seed (0.163 and 0.204 for two others), against 0.47 at full resolution.
  assert.ok(differ / pairs > 0.1 && differ / pairs < 0.26, `${differ} of ${pairs} neighbouring pairs change marble`);
  assert.ok(differ < 0.5 * fullDiffer, `districts no wider than the field's own grain: ${differ} vs ${fullDiffer}`);
  // Halls with near-equal theme almost always share a marble.
  for (let t = 0; t < 1; t += 0.001) if (!THEME_CUTS.some(c => t < c && c <= t + 0.004)) assert.equal(marbleOf(t), marbleOf(t + 0.004));
});

test('the pattern stream is the hall\'s own: the marble salt moves no other draw', () => {
  const hall = hallParams(seed, 3, 0, -2, fields);
  assert.deepEqual(hallParams(seed, 3, 0, -2, fields), hall);
  const p = new Set();
  for (let x = 0; x < 30; x++) p.add(marbleFor(seed, { ...hall, x }, fields).pattern);
  assert.equal(p.size, 3, 'pattern does not vary from hall to hall');
});

test('floors, thresholds, ramps and vestibule floors are inlaid; ceilings, walls and statues are not', () => {
  let ramps = 0, vest = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const prims = [...buildHall(hall, conns).prims, ...buildConnector(conns.e).prims, ...buildConnector(conns.s).prims];
    for (const p of prims) {
      const floorish = p.kind === 'poly' && !p.down && ['floor', 'threshold', 'ramp', 'vestibule'].includes(p.name);
      assert.equal(isInlaid(p), floorish, `${p.kind} ${p.name} ${p.down ? 'down' : ''}`);
      if (isInlaid(p) && p.name === 'ramp') ramps++;
      if (isInlaid(p) && p.name === 'vestibule') vest++;
    }
    assert.ok(prims.filter(p => p.kind === 'poly' && p.down).every(p => !isInlaid(p)));
  }
  assert.ok(ramps > 0 && vest > 0, `ramps ${ramps}, vestibules ${vest}`);
});

test('every footprint fits the shader\'s 12-vertex uniform, the cross exactly, hall-relative', () => {
  const counts = {};
  for (let i = 0; i < 1000 && Object.keys(counts).length < SHAPES.length; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields), flat = footprintLocal(hall);
    counts[hall.shape] = flat.length / 2;
    assert.ok(flat.length / 2 <= MAX_FOOTPRINT);
    for (let k = 0; k < flat.length; k += 2) assert.ok(Math.abs(flat[k]) <= hall.hx + 1e-9 && Math.abs(flat[k + 1]) <= hall.hz + 1e-9, 'not hall-relative');
  }
  assert.deepEqual(counts, { long: 4, square: 4, octagon: 8, cross: 12, colonnade: 4 });
});
