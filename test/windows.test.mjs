import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues } from '../src/statues/place.js';
import { footprint } from '../src/shapes/footprint.js';
import { WELL } from '../src/shapes/stairwell.js';
import { footprintEdges, windowsFor, moodBand, PATCH, HEIGHT_SHARE, ELEVATION } from '../src/windows.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const RANGE = { luminous: [2, 4], dusk: [1, 2], chiaroscuro: [1, 2] };
const build = (x, z, over = {}) => {
  const hall = { ...hallParams(seed, x, 0, z, fields), ...over }, conns = connsFor(seed, hall, fields);
  const built = buildHall(hall, conns);
  return { hall, conns, statues: placeStatues(seed, hall, built.slots, built.boxes) };
};
const cell = (i) => [(i * 31) % 201 - 100, (i * 17) % 201 - 100];
const along = (e, w) => (w.c[0] - e.a[0]) * e.d[0] + (w.c[2] - e.a[1]) * e.d[1];
const inWell = (hall, x, z) => hall.isStair && Math.abs(x - hall.cx) < WELL.hx && Math.abs(z - hall.cz) < WELL.hz;

test('footprint edges point inward and know their doorways', () => {
  for (const [x, z] of [[0, 0], [3, -4], [-7, 11], [20, 20], [5, 9]]) {
    const { hall, conns } = build(x, z);
    const edges = footprintEdges(hall, conns);
    assert.equal(edges.length, footprint(hall).length);
    for (const e of edges) {
      const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      assert.ok(pointInPolygon([mid[0] + e.n[0] * 0.3, mid[1] + e.n[1] * 0.3], footprint(hall)), 'normal points outward');
    }
    assert.equal(edges.filter(e => e.doorway).length, 4, `${hall.shape} doorway edges`);
  }
});

test('windows sit on their wall, high, clear of the doorway, in the mood\'s count range', () => {
  const seen = { luminous: 0, dusk: 0, chiaroscuro: 0 };
  for (let i = 0; i < 600; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues);
    const band = moodBand(hall.light); seen[band]++;
    const [lo, hi] = RANGE[band];
    assert.ok(out.windows.length >= lo && out.windows.length <= hi, `${band} has ${out.windows.length} windows`);
    const e = out.wall, top = hall.floorY + hall.ceiling;
    for (const w of out.windows) {
      assert.ok(w.w > 0 && w.h > 0, 'degenerate window');
      assert.ok(top - (w.c[1] + w.h / 2) <= 1.5 + 1e-9 && w.c[1] + w.h / 2 <= top, 'window top not within 1.5 m of the ceiling');
      assert.ok(w.c[1] - w.h / 2 > hall.floorY + 0.5, 'window reaches the floor');
      const s = along(e, w);
      assert.ok(s - w.w / 2 >= -1e-9 && s + w.w / 2 <= e.len + 1e-9, 'window off its wall');
      if (e.doorway) {
        const m = e.len / 2, half = e.doorway.width / 2;
        assert.ok(s + w.w / 2 <= m - half + 1e-9 || s - w.w / 2 >= m + half - 1e-9, 'window over the doorway opening');
      }
    }
    assert.equal(out.shafts.length, out.windows.length);
    assert.deepEqual(windowsFor(seed, hall, conns, statues), out);
  }
  for (const b of Object.keys(seen)) assert.ok(seen[b] > 20, `never saw ${b}`);
});

test('no two windows on the window wall overlap (D1)', () => {
  let pairs = 0;
  for (let i = 0; i < 3000; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues);
    const iv = out.windows.map(w => { const s = along(out.wall, w); return [s - w.w / 2, s + w.w / 2]; }).sort((p, q) => p[0] - q[0]);
    for (let k = 1; k < iv.length; k++, pairs++) {
      assert.ok(iv[k][0] >= iv[k - 1][1] - 1e-9, `${hall.shape} (${x},${z}) windows overlap on a ${out.wall.len.toFixed(2)} m wall`);
    }
  }
  assert.ok(pairs > 500, `only ${pairs} window pairs checked`);
});

test('an 18 m square hall with 12 m arches puts its windows on the wall segments beside the opening (D3)', () => {
  // The lowest ceiling over the tallest arch: a window 30% of 18 m tall, its top within 1.5 m of
  // the ceiling, reaches down to about 11 m, below the arch's 12 m head, so it must sit beside it.
  const { hall, conns, statues } = build(0, 0, { ceiling: 18, shape: 'square' });
  for (const side of ['n', 'e', 's', 'w']) conns[side] = { ...conns[side], type: 'arch', width: 4, height: 12 };
  const out = windowsFor(seed, hall, conns, statues);
  const e = out.wall;
  assert.ok(e.doorway, 'a square hall\'s window wall carries a doorway');
  assert.equal(e.doorway.height, 12);
  assert.ok(out.windows.length >= 1);
  assert.ok(out.windows.some(w => w.c[1] - w.h / 2 < hall.floorY + 12), 'no window reaches below the arch head, so the case is not exercised');
  for (const w of out.windows) {
    const s = along(e, w);
    assert.ok(s + w.w / 2 <= e.len / 2 - 2 + 1e-9 || s - w.w / 2 >= e.len / 2 + 2 - 1e-9, 'window over the 12 m arch');
    assert.ok(w.c[1] + w.h / 2 <= hall.floorY + 18 && w.c[1] - w.h / 2 > hall.floorY + 0.5);
  }
});

test('windows are about 30% of the ceiling tall, and the key light falls at 50 to 75 degrees or steeper', () => {
  const elevs = [];
  for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) {
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues);
    for (const w of out.windows) {
      assert.ok(w.h >= HEIGHT_SHARE[0] * hall.ceiling - 1e-9 && w.h <= HEIGHT_SHARE[1] * hall.ceiling + 1e-9, `window ${w.h.toFixed(2)} m in a ${hall.ceiling.toFixed(1)} m hall`);
      assert.ok(w.h >= 4.8 && w.h <= 13.2);
    }
    const e = Math.asin(-out.keyDir[1]) * 180 / Math.PI;
    assert.ok(e >= ELEVATION[0] - 1e-9 && e < 90, `key elevation ${e.toFixed(1)}`);
    elevs.push(e);
  }
  // The landing rule only ever steepens the light, so most halls keep their nominal elevation and
  // the whole nominal range turns up.
  const nominal = elevs.filter(e => e <= ELEVATION[1] + 1e-9);
  assert.ok(nominal.length > 0.5 * elevs.length, `only ${nominal.length} of ${elevs.length} halls at their nominal elevation`);
  assert.ok(Math.min(...nominal) < 53 && Math.max(...nominal) > 72, `nominal elevations span ${Math.min(...nominal).toFixed(1)} to ${Math.max(...nominal).toFixed(1)}`);
});

test('every shaft lands inside the hall; chiaroscuro shafts land on a statue when one is in front', () => {
  let checked = 0, aimed = 0;
  for (let i = 0; i < 1500 && checked < 300; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues);
    checked++;
    for (const s of out.shafts) {
      assert.ok(Math.abs(s.to[1] - hall.floorY) < 1e-9, 'shaft does not end on the floor');
      assert.ok(pointInPolygon([s.to[0], s.to[2]], footprint(hall)), `${hall.shape} shaft lands outside`);
      assert.ok(s.from[1] > s.to[1]);
    }
    if (moodBand(hall.light) !== 'chiaroscuro') continue;
    const inFront = statues.some(st => (st.slot.x - out.windows[0].c[0]) * out.wall.n[0] + (st.slot.z - out.windows[0].c[2]) * out.wall.n[1] > 1.5);
    if (!inFront) continue;
    aimed++;
    for (const s of out.shafts) {
      assert.ok(statues.some(st => st.boxes.some(b => s.to[0] >= b.min[0] - 0.6 && s.to[0] <= b.max[0] + 0.6 && s.to[2] >= b.min[2] - 0.6 && s.to[2] <= b.max[2] + 0.6)), 'chiaroscuro shaft misses every statue');
    }
  }
  assert.ok(aimed >= 10, `only ${aimed} aimed halls`);
});

test('a chiaroscuro hall with every statue behind the window wall falls back to the key direction (D3)', () => {
  const { hall, conns, statues } = build(0, 0, { light: 0.05 });
  assert.ok(statues.length >= 1, 'the hall has statues to move');
  const bare = windowsFor(seed, hall, conns, []);
  // Move the hall's real statues 2 m and more behind the window wall, outside the hall.
  const w0 = bare.windows[0], n = bare.wall.n;
  const behind = statues.map((st, k) => {
    const tx = w0.c[0] - n[0] * (2 + k) - st.slot.x, tz = w0.c[2] - n[1] * (2 + k) - st.slot.z;
    return { ...st, slot: { ...st.slot, x: st.slot.x + tx, z: st.slot.z + tz },
      boxes: st.boxes.map(b => ({ min: [b.min[0] + tx, b.min[1], b.min[2] + tz], max: [b.max[0] + tx, b.max[1], b.max[2] + tz] })) };
  });
  for (const st of behind) assert.ok((st.slot.x - w0.c[0]) * n[0] + (st.slot.z - w0.c[2]) * n[1] < 0, 'statue is behind the wall');
  const out = windowsFor(seed, hall, conns, behind);
  assert.deepEqual(out, bare, 'statues behind the wall change nothing');
  assert.ok(out.shafts.length >= 1);
  for (const s of out.shafts) {
    assert.ok(pointInPolygon([s.to[0], s.to[2]], footprint(hall)));
    const horiz = Math.hypot(s.to[0] - s.from[0], s.to[2] - s.from[2]);
    const dirDot = ((s.to[0] - s.from[0]) * out.wall.n[0] + (s.to[2] - s.from[2]) * out.wall.n[1]) / horiz;
    assert.ok(dirDot > 0.99, 'fallback shaft is not along the key light');
  }
});

test('stair hall shafts never land in the stairwell hole (D2)', () => {
  let stairShafts = 0;
  for (let i = 0; i < 3000; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    if (!hall.isStair) continue;
    const out = windowsFor(seed, hall, conns, statues);
    for (const s of out.shafts) {
      stairShafts++;
      assert.ok(!inWell(hall, s.to[0], s.to[2]), `shaft lands in the well at (${x},${z})`);
    }
  }
  assert.ok(stairShafts >= 100, `only ${stairShafts} stair-hall shafts`);
});

test('keyDir is normalised and agrees with every shaft along the key light (D5)', () => {
  let keyed = 0;
  for (let i = 0; i < 1500; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues), k = out.keyDir;
    assert.ok(Math.abs(Math.hypot(...k) - 1) < 1e-9 && k[1] < 0, 'keyDir not a unit downward vector');
    const chiaro = moodBand(hall.light) === 'chiaroscuro';
    for (const s of out.shafts) {
      const v = [s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]], len = Math.hypot(...v);
      const dot = (v[0] * k[0] + v[1] * k[1] + v[2] * k[2]) / len;
      // Only a chiaroscuro shaft aimed at a statue may leave the key light (spec section 5).
      const onSlot = chiaro && statues.some(st => Math.abs(st.slot.x - s.to[0]) < 1e-9 && Math.abs(st.slot.z - s.to[2]) < 1e-9);
      if (onSlot) continue;
      keyed++;
      assert.ok(dot > 1 - 1e-9, `shaft leaves keyDir by ${(Math.acos(Math.min(1, dot)) / Math.PI * 180).toFixed(2)} deg`);
    }
  }
  assert.ok(keyed > 1000, `only ${keyed} keyed shafts`);
});

test('every landing patch stays inside the footprint and off the stairwell (D6)', () => {
  let n = 0;
  for (let i = 0; i < 3000; i++) {
    const [x, z] = cell(i);
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues), fp = footprint(hall);
    out.shafts.forEach((s, j) => {
      n++;
      assert.ok(s.w > 0 && s.w <= out.windows[j].w + 1e-9, 'shaft wider than its window');
      // The patch effects.js draws: a square of half-size PATCH * w around the landing point, square to the travel.
      const dx = s.to[0] - s.from[0], dz = s.to[2] - s.from[2], hz = Math.hypot(dx, dz);
      const u = [dx / hz, dz / hz], p = [-u[1], u[0]], R = PATCH * s.w;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [s.to[0] + (u[0] * a + p[0] * b) * R, s.to[2] + (u[1] * a + p[1] * b) * R]);
      for (const c of corners) {
        assert.ok(pointInPolygon(c, fp), `${hall.shape} (${x},${z}) patch corner outside the footprint`);
        assert.ok(!inWell(hall, c[0], c[1]), 'patch corner over the stairwell');
      }
      const inside = ([vx, vz]) => Math.abs((vx - s.to[0]) * u[0] + (vz - s.to[2]) * u[1]) < R - 1e-6 && Math.abs((vx - s.to[0]) * p[0] + (vz - s.to[2]) * p[1]) < R - 1e-6;
      assert.ok(!fp.some(inside), `${hall.shape} wall corner inside a landing patch`);
      if (hall.isStair) {
        const { hx, hz: wz } = WELL, wc = [[-hx, -wz], [hx, -wz], [hx, wz], [-hx, wz]].map(([a, b]) => [hall.cx + a, hall.cz + b]);
        assert.ok(!wc.some(inside), 'stairwell corner inside a landing patch');
      }
    });
  }
  assert.ok(n > 3000, `only ${n} shafts`);
});
