# The House — Look and Atmosphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shade the House's stone with one stylised shader, light it from windows, mist the drowned halls, and keep the drawn line work on top, at 60 fps on integrated graphics.

**Architecture:** The pure side grows a `poly` primitive (ear-clipped in plain JS), floors, thresholds and ramps that use it, a `moodFor` function that turns the three fields into shader settings, and a `windowsFor` function that places windows and light shafts. The browser side grows a surface mesh per hall (solid triangles with per-vertex field samples), a custom `ShaderMaterial` that fakes sky, key light, height gradient, contact darkening and two kinds of fog, an effects mesh per hall for glows and shafts, and a debug overlay. Hall builds are spread over frames.

**Tech Stack:** Plain ES modules, Three.js `0.170.0` via a CDN import map (`ShaderMaterial`, `BufferGeometryUtils.mergeGeometries`), `node --test` (Node 24). No bundler, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-the-house-look-design.md` (amends `2026-10-13-the-house-design.md` §6)

## Global Constraints

- Three.js pinned to `three@0.170.0` on jsdelivr. Nothing else is loaded from the network.
- Pure modules under `src/` never import `three`. `src/shapes/poly.js`, `src/mood.js`, `src/windows.js`, `src/schedule.js` are pure. `src/build.js`, `src/material.js`, `src/effects.js`, `src/debug.js` import `three` and are browser-only.
- The world stays a pure function of the seed: new streams use salt `windows`; no existing stream draws change.
- Surfaces use polygon offset factor `1`, units `1`; lines draw over them.
- Lighting: hemisphere term, one key light per hall (azimuth from the window wall's inward normal, elevation nominally 40 to 60 degrees below horizontal, clamped so every shaft lands inside the hall), height gradient, contact darkening within `0.6` m of the floor.
- Fog far by light: 18 m (chiaroscuro) to 44 m (luminous), about 31 m at dusk. Water fill opacity capped at `0.6`.
- Windows per hall: luminous 2 to 4, dusk 1 to 2, chiaroscuro 1 to 2. Window top within `1.5` m of the ceiling; no window overlaps its wall's doorway opening.
- Budget: 60 fps; at most 100 draw calls in view; about 600,000 triangles in view; at most 16 ms of hall building per crossing, else builds spread one per frame.
- Draw calls per hall: surfaces, lines, effects; a pool hall adds its water fill and mirror.
- URL flags `look` (`shaded` default, `lines`) and `debug` (valueless) live in the fragment and survive `writeFragment`.
- Commits are small and frequent, with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A 6 m hall with a 6 m arch** leaves a zero-height lintel, so the middle of the doorway wall is open. Windows on that wall must land on the wall segments beside the opening. Pinned in Task 11.
2. **A stair hall whose shape is octagon or cross**: the floor around the well is the footprint clipped by half-planes, which must still cover every point outside the well and none inside. Pinned over 1000 cells in Task 2.
3. **A chiaroscuro hall whose statues all stand behind the window wall**: no statue is in front of the window, so the shaft falls back to the key direction and must still land inside. Pinned in Task 11.
4. **Crossing into a stair hall**: a stair hall builds its vista halls above and below as well, so one crossing can queue seven builds. The scheduler must build the collision neighbourhood now and the rest one per frame. Pinned in Task 9.
5. **`look=foo` or `debug=0` in a pasted link**: unknown looks fall back to `shaded`; a present `debug` key is on whatever its value. Pinned in Task 6.

## File map

```
src/
  shapes/poly.js      signedArea2, triangulate, polyPositions, clipBox, aroundWell   (pure, new)
  shapes/footprint.js footprint(hall) -> [[x, z], ...] for rect, octagon, cross       (pure, new)
  shapes/ir.js        + poly(points, name, down); mapPoints/extents know poly         (pure)
  shapes/common.js    + rectPoly, octagonPoly, thresholds in both wall builders        (pure)
  shapes/rect.js, octagon.js, cross.js, connector.js, stairwell.js, index.js   floors, ramps, well frame (pure)
  mood.js             STOPS, WATER, DECAY, moodFor(light, water, decay)              (pure, new)
  windows.js          footprintEdges, windowsFor(seedHash, hall, statues)             (pure, new)
  schedule.js         planLoads(have, cx, cz)                                         (pure, new)
  url.js              look and debug flags                                            (pure)
  material.js         surfaceMaterial(opts), effectsMaterial(opts), cloudMaterials    (browser, new)
  build.js            primSolid, buildGroup(prims, { color, ghost, surface })         (browser)
  effects.js          buildEffects(hall, windows, mood) -> Mesh                       (browser, new)
  debug.js            Debug overlay                                                   (browser, new)
  world.js            surface options, effects mesh, build queue, timing              (browser)
  water.js            water fill, shaded mirrors                                      (browser)
  sky.js              one cloud mesh per hall, drift in the vertex shader             (browser)
  main.js             look flag, mood-driven background and fog, debug, tick          (browser)
test/
  poly.test.mjs  floors.test.mjs  mood.test.mjs  url.test.mjs  windows.test.mjs  schedule.test.mjs  (new)
```

Phase A is Tasks 1 to 10, phase B is Tasks 11 and 12, phase C is Tasks 13 to 15. Each phase is deployed and walked before the next starts (spec §9).

---

## Phase A: surfaces, shader, mood, flags

### Task 1: The `poly` primitive and its pure geometry

**Files:**
- Create: `src/shapes/poly.js`
- Modify: `src/shapes/ir.js`
- Test: `test/poly.test.mjs`

**Interfaces:**
- Produces: `poly(points, name, down = false)` in `ir.js` → `{ kind: 'poly', points, name, down }`.
- Produces: in `poly.js`: `signedArea2(pts2)`, `triangulate(pts2) -> [[i, j, k], ...]` (counter-clockwise in `(u, v)`), `polyPositions(prim) -> number[]` (flat xyz, 9 per triangle, wound `+y` or `-y` when `down`), `clipBox(points, x0, x1, z0, z1) -> points | null`, `aroundWell(points, cx, cz, wx, wz) -> points[]`.

- [ ] **Step 1: Write the failing tests**

```js
// test/poly.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedArea2, triangulate, polyPositions, clipBox, aroundWell } from '../src/shapes/poly.js';
import { poly, boundsOf, translatePrims } from '../src/shapes/ir.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const triArea2 = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const areaOfTris = (pts2, tris) => tris.reduce((s, [i, j, k]) => s + triArea2(pts2[i], pts2[j], pts2[k]), 0);
const octagon = Array.from({ length: 8 }, (_, k) => { const a = Math.PI / 8 + k * Math.PI / 4; return [5 * Math.cos(a), 5 * Math.sin(a)]; });
const cross = [[-2, -6], [2, -6], [2, -2], [6, -2], [6, 2], [2, 2], [2, 6], [-2, 6], [-2, 2], [-6, 2], [-6, -2], [-2, -2]];
const lift = (pts2, y = 0) => pts2.map(([x, z]) => [x, y, z]);
// Point-in-triangle over a flat position array; true when any triangle contains (x, z).
export function covers(positions, x, z) {
  const c2 = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = positions.slice(i, i + 9);
    const s1 = c2(ax, az, bx, bz, x, z), s2 = c2(bx, bz, cx, cz, x, z), s3 = c2(cx, cz, ax, az, x, z);
    if ((s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) || (s1 <= 1e-9 && s2 <= 1e-9 && s3 <= 1e-9)) return true;
  }
  return false;
}

test('triangulate covers convex and concave outlines exactly', () => {
  for (const pts of [octagon, cross, [...cross].reverse()]) {
    const tris = triangulate(pts);
    assert.equal(tris.length, pts.length - 2);
    near(areaOfTris(pts, tris), Math.abs(signedArea2(pts)), 1e-9);
    for (const [i, j, k] of tris) assert.ok(signedArea2([pts[i], pts[j], pts[k]]) > 0, 'triangle not counter-clockwise');
  }
});

test('triangulate drops collinear vertices instead of stalling', () => {
  const sq = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]];
  const tris = triangulate(sq);
  near(areaOfTris(sq, tris), 4);
});

test('polyPositions winds floors up and ceilings down', () => {
  const up = polyPositions(poly(lift(octagon, 3), 'floor'));
  assert.equal(up.length, 6 * 9);
  const normalY = (p) => {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p;
    return (by - ay) * (cz - az) - (bz - az) * (cy - ay) === 0 ? ((bz - az) * (cx - ax) - (bx - ax) * (cz - az)) : NaN;
  };
  for (let i = 0; i < up.length; i += 9) assert.ok(normalY(up.slice(i, i + 9)) > 0, 'floor triangle faces down');
  const down = polyPositions(poly(lift(octagon, 3), 'ceiling', true));
  for (let i = 0; i < down.length; i += 9) assert.ok(normalY(down.slice(i, i + 9)) < 0, 'ceiling triangle faces up');
  assert.ok(up.every((v, i) => i % 3 !== 1 || v === 3), 'height preserved');
});

test('clipBox keeps the inside of an axis box and interpolates y across the cut', () => {
  const ramp = [[-2, 0, 0], [2, 0, 0], [2, 4, 4], [-2, 4, 4]];
  const half = clipBox(ramp, -10, 10, 2, 10);
  near(Math.abs(signedArea2(half.map(([x, , z]) => [x, z]))), 8);
  for (const p of half) if (Math.abs(p[2] - 2) < 1e-9) near(p[1], 2);
  assert.equal(clipBox(ramp, 5, 6, -10, 10), null);
});

test('aroundWell leaves exactly the well uncovered, for a rect, an octagon and a cross', () => {
  for (const pts of [[[-9, 0, -9], [9, 0, -9], [9, 0, 9], [-9, 0, 9]], lift(octagon.map(([x, z]) => [x * 1.8, z * 1.8])), lift(cross.map(([x, z]) => [x * 1.6, z * 1.6]))]) {
    const pieces = aroundWell(pts, 0, 0, 3, 5);
    assert.equal(pieces.length, 4);
    const total = pieces.reduce((s, p) => s + Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))), 0);
    near(total, Math.abs(signedArea2(pts.map(([x, , z]) => [x, z]))) - 60, 1e-6);
    const pos = pieces.flatMap(p => polyPositions(poly(p, 'floor')));
    assert.ok(!covers(pos, 0, 0) && !covers(pos, 2.9, 4.9) && !covers(pos, -2.9, -4.9), 'well covered');
    assert.ok(covers(pos, 3.5, 0) && covers(pos, -3.5, 0) && covers(pos, 0, 5.5) && covers(pos, 0, -5.5), 'floor beside the well missing');
  }
});

test('ir knows poly: translate moves its points and boundsOf wraps them', () => {
  const [p] = translatePrims([poly(lift(cross), 'floor')], 1, 2, 3);
  assert.deepEqual(p.points[0], [-1, 2, -3]);
  assert.deepEqual(boundsOf([p]), { min: [-5, 2, -3], max: [7, 2, 9] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/poly.test.mjs`
Expected: FAIL, `Cannot find module '.../src/shapes/poly.js'`.

- [ ] **Step 3: Add `poly` to the IR**

In `src/shapes/ir.js`, after the `segs` export:

```js
// A planar filled polygon, simple (no holes), triangulated in the xz projection. `down` winds the
// face toward -y (ceilings); the default faces up.
export const poly = (points, name, down = false) => ({ kind: 'poly', points, name, down });
const hasPoints = (p) => p.kind === 'lines' || p.kind === 'segs' || p.kind === 'poly';
```

and replace the two kind checks that mean "this primitive carries `points`":

```js
function extents(p) {
  if (hasPoints(p)) {
```

```js
export const mapPoints = (p, fn) => hasPoints(p) ? { ...p, points: p.points.map(fn) } : { ...p, pos: fn(p.pos) };
```

- [ ] **Step 4: Write `src/shapes/poly.js`**

```js
// Pure polygon helpers for the `poly` primitive: triangulation and clipping. No three import,
// so Node tests the same triangles the browser uploads.

const EPS = 1e-9;
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// Shoelace area of [[u, v], ...]; positive when counter-clockwise in (u, v).
export function signedArea2(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return s / 2;
}

// Ear clipping for a simple polygon, convex or concave, any winding. Returns index triples into
// pts, each counter-clockwise in (u, v). Collinear vertices are dropped rather than clipped.
export function triangulate(pts) {
  if (pts.length < 3) return [];
  const idx = pts.map((_, i) => i);
  if (signedArea2(pts) < 0) idx.reverse();
  const strictlyInside = (p, a, b, c) => cross2(a, b, p) > EPS && cross2(b, c, p) > EPS && cross2(c, a, p) > EPS;
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const n = idx.length, ia = idx[(i + n - 1) % n], ib = idx[i], ic = idx[(i + 1) % n];
      const a = pts[ia], b = pts[ib], c = pts[ic], turn = cross2(a, b, c);
      if (Math.abs(turn) <= EPS) { idx.splice(i, 1); cut = true; break; }
      if (turn < 0) continue;
      if (idx.some(j => j !== ia && j !== ib && j !== ic && strictlyInside(pts[j], a, b, c))) continue;
      tris.push([ia, ib, ic]); idx.splice(i, 1); cut = true;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// Flat xyz positions (nine numbers per triangle) for a poly primitive, wound so the face normal
// points +y, or -y when p.down. Counter-clockwise in (x, z) gives a -y normal in three's
// right-handed frame, so the up-facing order swaps the last two corners.
export function polyPositions(p) {
  const pts2 = p.points.map(([x, , z]) => [x, z]);
  const out = [];
  for (const [a, b, c] of triangulate(pts2)) {
    for (const i of (p.down ? [a, b, c] : [a, c, b])) out.push(...p.points[i]);
  }
  return out;
}

function clipPlane(pts, axis, v, keepAbove) {
  const out = [];
  const inside = (p) => keepAbove ? p[axis] >= v - EPS : p[axis] <= v + EPS;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (v - a[axis]) / (b[axis] - a[axis]); out.push(a.map((c, k) => c + (b[k] - c) * t)); }
  }
  return out;
}
const dedupe = (pts) => pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[2] - q[2]) > 1e-6; });

// Sutherland-Hodgman clip of a 3D xz-planar-or-sloped polygon to the box [x0, x1] x [z0, z1].
// y is interpolated along cut edges, so sloped polys stay on their plane. null when nothing is left.
export function clipBox(points, x0, x1, z0, z1) {
  let p = points;
  p = clipPlane(p, 0, x0, true); p = clipPlane(p, 0, x1, false);
  p = clipPlane(p, 2, z0, true); p = clipPlane(p, 2, z1, false);
  p = dedupe(p);
  return p.length >= 3 && Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))) > 1e-6 ? p : null;
}

// The footprint minus an axis-aligned well of half-size (wx, wz) at (cx, cz): west strip, east
// strip, north and south pieces between them. A floor with a hole, as several simple polys.
export function aroundWell(points, cx, cz, wx, wz) {
  const BIG = 1e6;
  return [
    clipBox(points, -BIG, cx - wx, -BIG, BIG),
    clipBox(points, cx + wx, BIG, -BIG, BIG),
    clipBox(points, cx - wx, cx + wx, -BIG, cz - wz),
    clipBox(points, cx - wx, cx + wx, cz + wz, BIG),
  ].filter(Boolean);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/poly.test.mjs`
Expected: 6 passing.

Run: `npm test`
Expected: all green; `ir.test.mjs` still passes.

- [ ] **Step 6: Commit**

```bash
git add src/shapes/poly.js src/shapes/ir.js test/poly.test.mjs
git commit -m "feat: poly primitive with pure ear clipping and well clipping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Floors and ceilings become polys, with a hole for the well

**Files:**
- Create: `src/shapes/footprint.js`
- Modify: `src/shapes/common.js` (`slab` → `rectPoly`, add `octagonPoly`), `src/shapes/rect.js`, `src/shapes/octagon.js`, `src/shapes/cross.js`, `src/shapes/connector.js`, `src/shapes/index.js`
- Test: `test/floors.test.mjs`

**Interfaces:**
- Consumes: `poly`, `polyPositions`, `aroundWell`, `signedArea2` from Task 1.
- Produces: `footprint(hall) -> [[x, z], ...]` (counter-clockwise or clockwise, consistent per shape) in `footprint.js`; `rectPoly(cx, y, cz, hx, hz, name, down)` and `octagonPoly(cx, y, cz, ap, name, down)` in `common.js`. Every hall's floor polys are named `'floor'`, ceilings `'ceiling'`. Later tasks (windows, tests) use `footprint`.

- [ ] **Step 1: Write the failing test**

```js
// test/floors.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { footprint } from '../src/shapes/footprint.js';
import { signedArea2, polyPositions } from '../src/shapes/poly.js';
import { WELL } from '../src/shapes/stairwell.js';
import { covers } from './poly.test.mjs';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const polyArea = (p) => Math.abs(signedArea2(p.points.map(([x, , z]) => [x, z])));

test('every hall floor is filled to its footprint, and only a stair hall has a hole', () => {
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
    assert.equal(ceilings.length, 1, `${hall.shape} ceiling count`);
    assert.ok(ceilings[0].down, 'ceiling faces up');
    for (const f of floors) assert.ok(f.points.every(p => p[1] === hall.floorY), 'floor off the floor');
    const foot = Math.abs(signedArea2(footprint(hall)));
    const area = floors.reduce((s, f) => s + polyArea(f), 0);
    const hole = hall.isStair ? 4 * WELL.hx * WELL.hz : 0;
    assert.ok(Math.abs(area - (foot - hole)) < 1e-6, `${hall.shape} floor area ${area} vs ${foot - hole}`);
    if (!hall.isStair) continue;
    stairs++;
    const pos = floors.flatMap(f => polyPositions(f));
    const { cx, cz } = hall;
    assert.ok(!covers(pos, cx, cz) && !covers(pos, cx + WELL.hx - 0.1, cz + WELL.hz - 0.1), 'well sealed');
    assert.ok(covers(pos, cx + WELL.hx + 0.5, cz) && covers(pos, cx, cz - WELL.hz - 0.5), 'floor beside the well missing');
    const above = buildHall({ ...hall, y: 1, floorY: 12 }, conns, { vista: true, ceiling: false, floorHole: true });
    const abovePos = above.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f));
    assert.ok(!covers(abovePos, cx, cz) && covers(abovePos, cx + WELL.hx + 0.5, cz), 'hall above has no hole');
    const below = buildHall({ ...hall, y: -1, floorY: -12 }, conns, { vista: true, ceiling: false });
    assert.equal(below.prims.filter(p => p.kind === 'poly' && p.name === 'ceiling').length, 0);
    assert.ok(covers(below.prims.filter(p => p.kind === 'poly' && p.name === 'floor').flatMap(f => polyPositions(f)), cx, cz), 'hall below lost its floor');
  }
  assert.equal(shapes.size, 5);
  assert.ok(stairs >= 10);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/floors.test.mjs`
Expected: FAIL, `Cannot find module '.../src/shapes/footprint.js'`.

- [ ] **Step 3: Write `footprint.js` and the poly helpers in `common.js`**

```js
// src/shapes/footprint.js
// The inner outline of a hall's floor, as [[x, z], ...] in world coordinates. Used for floors,
// windows and tests. Octagon vertices start at angle pi/8 so edge k's midpoint is at angle
// pi/4 + k*pi/4: edges 1, 3, 5, 7 are the south, west, north and east axis walls.
import { rectVerts } from './rect.js';
import { crossVerts } from './cross.js';

export function octagonVerts(cx, cz, ap) {
  const R = ap / Math.cos(Math.PI / 8), pts = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); }
  return pts;
}

export function footprint(hall) {
  if (hall.shape === 'octagon') return octagonVerts(hall.cx, hall.cz, hall.hx);
  if (hall.shape === 'cross') return crossVerts(hall);
  return rectVerts(hall);
}
```

In `src/shapes/common.js`, import `poly` and replace `slab`:

```js
import { box, cyl, lines, poly, aabbOfBox } from './ir.js';

export const facingToward = (fx, fz) => Math.atan2(-fx, -fz);
export const floorPatch = (x0, x1, z0, z1, axis, y0, y1) => ({ x0, x1, z0, z1, axis, y0, y1 });
export const rectPoly = (cx, y, cz, hx, hz, name, down = false) =>
  poly([[cx - hx, y, cz - hz], [cx + hx, y, cz - hz], [cx + hx, y, cz + hz], [cx - hx, y, cz + hz]], name, down);
export function octagonPoly(cx, y, cz, ap, name, down = false) {
  const R = ap / Math.cos(Math.PI / 8), pts = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; pts.push([cx + R * Math.cos(a), y, cz + R * Math.sin(a)]); }
  return poly(pts, name, down);
}
```

(`octagonPoly` repeats the eight vertices rather than importing `footprint.js`, because `footprint.js` imports `rect.js`, which imports `common.js`.)

- [ ] **Step 4: Use them in the shape builders**

`src/shapes/rect.js`:

```js
import { axisPolygonWalls, nicheSlotsForPolygon, rectPoly, facingToward } from './common.js';
...
  prims.push(rectPoly(hall.cx, hall.floorY, hall.cz, hall.hx, hall.hz, 'floor'));
  if (opts.ceiling !== false) prims.push(rectPoly(hall.cx, hall.floorY + hall.ceiling, hall.cz, hall.hx, hall.hz, 'ceiling', true));
```

`src/shapes/octagon.js` (keep the line outlines, add the fills):

```js
import { octagonWalls, octagonSlab, octagonPoly, facingToward } from './common.js';
...
  prims.push(octagonSlab(cx, f, cz, ap), octagonPoly(cx, f, cz, ap, 'floor'));
  if (opts.ceiling !== false) prims.push(octagonSlab(cx, f + ceiling, cz, ap), octagonPoly(cx, f + ceiling, cz, ap, 'ceiling', true));
```

`src/shapes/cross.js`:

```js
import { lines, poly } from './ir.js';
...
const outline = (verts, y) => lines([...verts, verts[0]].map(([x, z]) => [x, y, z]));
const fill = (verts, y, name, down) => poly(verts.map(([x, z]) => [x, y, z]), name, down);
...
  prims.push(outline(verts, hall.floorY), fill(verts, hall.floorY, 'floor'));
  if (opts.ceiling !== false) prims.push(outline(verts, hall.floorY + hall.ceiling), fill(verts, hall.floorY + hall.ceiling, 'ceiling', true));
```

`src/shapes/connector.js`, the vestibule room (its corridor floors are already boxes and stay so until Task 4):

```js
import { octagonWalls, octagonSlab, octagonPoly, floorPatch } from './common.js';
...
    prims.push(...oct.prims, octagonSlab(ox, f, oz, r), octagonSlab(ox, f + h, oz, r), octagonPoly(ox, f, oz, r, 'vestibule'), octagonPoly(ox, f + h, oz, r, 'vestibule', true));
```

(Named `vestibule`, not `floor`, so the hall floor-area test does not count it.)

- [ ] **Step 5: Cut the well out of stair-hall floors in `buildHall`**

In `src/shapes/index.js`:

```js
import { lines, poly } from './ir.js';
import { aroundWell } from './poly.js';
...
  // The stairwell and the hole above it: the floor poly becomes four pieces around the well.
  const cutWell = (list) => list.flatMap(p => (p.kind === 'poly' && p.name === 'floor')
    ? aroundWell(p.points, hall.cx, hall.cz, WELL.hx, WELL.hz).map(pts => poly(pts, 'floor'))
    : [p]);
  if (hall.isStair && !opts.vista) {
    const w = buildStairwell(hall);
    prims = [...cutWell(prims), ...w.prims]; boxes = [...boxes, ...w.boxes]; floors = [...floors, ...w.floors];
    ...
  }
  if (opts.floorHole) {
    const { cx, cz, floorY: f } = hall, { hx, hz } = WELL;
    prims = [...cutWell(prims), lines([[cx - hx, f, cz - hz], [cx + hx, f, cz - hz], [cx + hx, f, cz + hz], [cx - hx, f, cz + hz], [cx - hx, f, cz - hz]])];
    slots = slots.filter(s => !inWell(s));
  }
```

The stairwell's own landing slabs (`box([2 * hx, 0.02, hz - ramp], ...)` in `stairwell.js`) stay: they are inside the well and fill as solids.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all green, including `floors.test.mjs`, `shapes.test.mjs` and `stairwell.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add src/shapes test/floors.test.mjs
git commit -m "feat: floors and ceilings are filled polys; stair halls keep the well open

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Doorway thresholds

**Files:**
- Modify: `src/shapes/common.js` (`axisPolygonWalls`, `octagonWalls`)
- Test: `test/floors.test.mjs`

**Interfaces:**
- Produces: for every doorway, one `poly` named `'threshold'` spanning the wall thickness at the opening's width, at the floor height.

- [ ] **Step 1: Write the failing test**

Append to `test/floors.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/floors.test.mjs`
Expected: FAIL, `long has 0 thresholds`.

- [ ] **Step 3: Emit thresholds in both wall builders**

In `axisPolygonWalls`, inside the `if (o)` branch after the lintel:

```js
    const lh = h - o.height;
    if (lh > 0) { const l = place(e, m - o.width / 2, m + o.width / 2, f + o.height + lh / 2, lh); prims.push(box(l.size, l.pos)); }
    // The floor through the wall thickness: the hall floor stops at the inner face and the
    // connector floor starts at the outer face, so without this the doorway is a slot.
    const [p0, p1] = [m - o.width / 2, m + o.width / 2];
    const at = (s, k) => [e.a[0] + e.d[0] * s + e.n[0] * k, f, e.a[1] + e.d[1] * s + e.n[1] * k];
    prims.push(poly([at(p0, 0), at(p1, 0), at(p1, t), at(p0, t)], 'threshold'));
```

In `octagonWalls`, inside the `if (o)` handling (after the lintel push, before the loop continues):

```js
    const lh = h - o.height;
    if (lh > 0) prims.push(box(alongX ? [w, lh, t] : [t, lh, w], [px, f + o.height + lh / 2, pz]));
    prims.push(poly(alongX
      ? [[px - w / 2, f, pz - t / 2], [px + w / 2, f, pz - t / 2], [px + w / 2, f, pz + t / 2], [px - w / 2, f, pz + t / 2]]
      : [[px - t / 2, f, pz - w / 2], [px + t / 2, f, pz - w / 2], [px + t / 2, f, pz + w / 2], [px - t / 2, f, pz + w / 2]], 'threshold'));
```

The vestibule's own octagon calls `octagonWalls` with array openings and gets thresholds too; they are harmless and not counted by the test, which only builds halls.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/shapes/common.js test/floors.test.mjs
git commit -m "feat: threshold floors through every doorway

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Ramps get surfaces

**Files:**
- Modify: `src/shapes/stairwell.js`, `src/shapes/connector.js`
- Test: `test/floors.test.mjs`

**Interfaces:**
- Produces: stairwell ramps as two sloped polys named `'ramp'`; the `steps` connector floor as three polys named `'floor'` (ramp up, flat, ramp down) instead of one floating box.

- [ ] **Step 1: Write the failing test**

Append to `test/floors.test.mjs`:

```js
import { buildStairwell } from '../src/shapes/stairwell.js';
import { buildConnector } from '../src/shapes/connector.js';
import { connectorParams, TYPES } from '../src/connectors.js';

test('stair ramps and steps connectors have sloped floor surfaces', () => {
  const hall = { cx: 0, cz: 0, floorY: 0 };
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/floors.test.mjs`
Expected: FAIL, ramps length `0`.

- [ ] **Step 3: Add the ramp polys to the stairwell**

In `src/shapes/stairwell.js`, import `poly` and after the `segs(steps)` push:

```js
import { box, lines, segs, poly, aabbOfBox } from './ir.js';
...
  prims.push(segs(steps));
  prims.push(
    poly([[cx - hx, f, cz], [cx + hx, f, cz], [cx + hx, f - drop, cz - ramp], [cx - hx, f - drop, cz - ramp]], 'ramp'),
    poly([[cx - hx, f, cz], [cx + hx, f, cz], [cx + hx, f + drop, cz + ramp], [cx - hx, f + drop, cz + ramp]], 'ramp'),
  );
```

- [ ] **Step 4: Replace the connector's floor box with polys that follow the ramps**

In `src/shapes/connector.js`, import `poly`, hoist `L`, and rewrite the floor inside `corridor`:

```js
import { box, segs, poly, aabbOfBox } from './ir.js';
...
  const f = 0, L = 1.5;
  const P = (along, y, across) => axis === 'x' ? [along, y, across] : [across, y, along];
  const S = (along, y, across) => axis === 'x' ? [along, y, across] : [across, y, along];
  const floorAlong = (p0, p1, y0, y1) => {
    if (p1 - p0 <= 0.01) return;
    prims.push(poly([P(p0, y0, centre - w / 2), P(p1, y1, centre - w / 2), P(p1, y1, centre + w / 2), P(p0, y0, centre + w / 2)], 'floor'));
  };
  const corridor = (p0, p1) => {
    const len = p1 - p0, mid = (p0 + p1) / 2;
    if (len <= 0.01) return;
    for (const side of [-1, 1]) {
      const size = S(len, h, 1), pos = P(mid, f + h / 2, centre + side * (w / 2 + 0.5));
      prims.push(box(size, pos)); boxes.push(aabbOfBox(size, pos));
    }
    prims.push(box(S(len, 0.02, w), P(mid, f + h, centre)));
    if (raise === 0) floorAlong(p0, p1, f, f);
    else { floorAlong(p0, p0 + L, f, f + raise); floorAlong(p0 + L, p1 - L, f + raise, f + raise); floorAlong(p1 - L, p1, f + raise, f); }
  };
```

and remove the later `const L = 1.5;` inside `if (raise > 0)`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all green, including `connector-build.test.mjs`.

- [ ] **Step 6: Commit**

```bash
git add src/shapes/stairwell.js src/shapes/connector.js test/floors.test.mjs
git commit -m "feat: stair ramps and steps connectors have sloped floor surfaces

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `moodFor`: the fields become shader settings

**Files:**
- Create: `src/mood.js`
- Test: `test/mood.test.mjs`

**Interfaces:**
- Produces: `STOPS` (three stop objects, light 0, 0.5, 1), `WATER`, `DECAY` constants, and `moodFor(light, water, decay) -> { stone, sky, bounce, key, haze, fogFar, heightFog, contact, gradient, line }`. Colours are `[r, g, b]` in 0..1 (key may exceed 1: it is colour times strength). `line` is a hex int from `palette.colorsFor`. The GLSL in Task 7 implements the same arithmetic with `STOPS` as uniforms; this function is the reference and feeds the background and global fog.

- [ ] **Step 1: Write the failing tests**

```js
// test/mood.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, STOPS } from '../src/mood.js';

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('every output stays in range for every corner of the field cube', () => {
  for (const l of [0, 0.25, 0.5, 0.75, 1]) for (const w of [0, 0.5, 1]) for (const d of [0, 0.5, 1]) {
    const m = moodFor(l, w, d);
    for (const c of [m.stone, m.sky, m.bounce, m.haze]) for (const v of c) assert.ok(v >= 0 && v <= 1, `colour out of range at ${l},${w},${d}`);
    for (const v of m.key) assert.ok(v >= 0 && v <= 2);
    assert.ok(m.fogFar >= 18 && m.fogFar <= 44);
    assert.ok(m.heightFog >= 0 && m.heightFog <= 1 && m.contact >= 0 && m.contact <= 1 && m.gradient >= 0 && m.gradient <= 1);
  }
});

test('darker means less ambient, shorter fog and more contrast; wetter means more mist', () => {
  let prev = moodFor(0, 0, 0);
  for (let l = 0.05; l <= 1; l += 0.05) {
    const m = moodFor(l, 0, 0);
    assert.ok(lum(m.sky) >= lum(prev.sky) && m.fogFar >= prev.fogFar, `ambient or fog fell at ${l}`);
    assert.ok(lum(m.key) <= lum(prev.key) + 1e-9, `key strength rose at ${l}`);
    prev = m;
  }
  prev = moodFor(0.5, 0, 0);
  for (let w = 0.1; w <= 1; w += 0.1) {
    const m = moodFor(0.5, w, 0);
    assert.ok(m.heightFog > prev.heightFog, `mist fell at ${w}`);
    prev = m;
  }
  prev = moodFor(0.5, 0, 0);
  for (let d = 0.1; d <= 1; d += 0.1) {
    const m = moodFor(0.5, 0, d);
    assert.ok(lum(m.stone) < lum(prev.stone) && m.contact >= prev.contact, `decay did not wear at ${d}`);
    prev = m;
  }
});

test('a small change in the fields is a small change in mood', () => {
  for (let i = 0; i < 200; i++) {
    const l = (i * 0.137) % 1, w = (i * 0.311) % 1, d = (i * 0.73) % 1, e = 1e-3;
    const a = moodFor(l, w, d), b = moodFor(Math.min(1, l + e), Math.min(1, w + e), Math.min(1, d + e));
    for (const k of ['stone', 'sky', 'bounce', 'key', 'haze']) assert.ok(dist(a[k], b[k]) < 0.02, `${k} jumped at ${l},${w},${d}`);
    assert.ok(Math.abs(a.fogFar - b.fogFar) < 0.2 && Math.abs(a.heightFog - b.heightFog) < 0.02);
  }
});

test('the stops are hit exactly and the function is deterministic', () => {
  assert.deepEqual(moodFor(0, 0, 0).stone, STOPS[0].stone);
  assert.deepEqual(moodFor(0.5, 0, 0).sky, STOPS[1].sky);
  assert.equal(moodFor(1, 0, 0).fogFar, 44);
  assert.equal(moodFor(0, 0, 0).fogFar, 18);
  assert.deepEqual(moodFor(0.3, 0.6, 0.2), moodFor(0.3, 0.6, 0.2));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/mood.test.mjs`
Expected: FAIL, `Cannot find module '.../src/mood.js'`.

- [ ] **Step 3: Write `src/mood.js`**

```js
// The three fields become shader settings. Three stops along `light`, lerped piecewise; `water`
// adds mist and `decay` adds wear. The surface shader (material.js) repeats this arithmetic in
// GLSL with STOPS, WATER and DECAY as uniforms, so keep the two in step: change a formula here,
// change it there. Colours are [r, g, b] in 0..1; key is colour times strength and may exceed 1.
import { colorsFor } from './palette.js';

export const STOPS = [
  // light 0: chiaroscuro. Very low ambient, one strong narrow key, haze near black.
  { stone: [0.42, 0.40, 0.40], sky: [0.10, 0.11, 0.15], bounce: [0.06, 0.05, 0.05], key: [1.60, 1.40, 1.10], haze: [0.020, 0.024, 0.040], fogFar: 18, heightFog: 0.15, contact: 0.70, gradient: 0.60 },
  // light 0.5: dusk. Cool blue-grey ambient, moderate key.
  { stone: [0.62, 0.60, 0.58], sky: [0.40, 0.44, 0.52], bounce: [0.22, 0.20, 0.19], key: [0.70, 0.68, 0.62], haze: [0.23, 0.23, 0.26], fogFar: 31, heightFog: 0.08, contact: 0.50, gradient: 0.40 },
  // light 1: luminous. High warm ambient, soft broad key, pale gold haze.
  { stone: [0.86, 0.83, 0.78], sky: [0.95, 0.93, 0.88], bounce: [0.55, 0.50, 0.44], key: [0.50, 0.47, 0.40], haze: [0.96, 0.94, 0.90], fogFar: 44, heightFog: 0.03, contact: 0.35, gradient: 0.25 },
];
export const WATER = { heightFog: 0.35, hazeCool: [0.70, 0.78, 0.84], sheen: 0.4 };
export const DECAY = { darken: 0.5, grey: 0.7, contact: 0.3 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

export function moodFor(light, water, decay) {
  const l = clamp01(light), w = clamp01(water), d = clamp01(decay);
  const [a, b, t] = l < 0.5 ? [STOPS[0], STOPS[1], l * 2] : [STOPS[1], STOPS[2], (l - 0.5) * 2];
  let stone = mix3(a.stone, b.stone, t);
  const sky = mix3(a.sky, b.sky, t), bounce = mix3(a.bounce, b.bounce, t), key = mix3(a.key, b.key, t);
  let haze = mix3(a.haze, b.haze, t);
  let heightFog = mix(a.heightFog, b.heightFog, t), contact = mix(a.contact, b.contact, t);
  const fogFar = mix(a.fogFar, b.fogFar, t), gradient = mix(a.gradient, b.gradient, t);
  // Decay darkens and greys the stone and deepens the dirt at the floor.
  const grey = lum(stone) * DECAY.grey;
  stone = mix3(stone, [grey, grey, grey], d * DECAY.darken);
  contact = clamp01(contact + DECAY.contact * d);
  // Water thickens the height fog and cools and pales the haze, halfway at most.
  heightFog = clamp01(heightFog + WATER.heightFog * w);
  haze = mix3(haze, mix3(haze, WATER.hazeCool, 0.5), w);
  return { stone, sky, bounce, key, haze, fogFar, heightFog, contact, gradient, line: colorsFor(l).line };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/mood.test.mjs`
Expected: 4 passing. If the monotonic test fails on `key`, the key luminance must fall from stop 0 to stop 2; the values above do (`1.6, 1.4, 1.1` → `0.7` → `0.5`).

- [ ] **Step 5: Commit**

```bash
git add src/mood.js test/mood.test.mjs
git commit -m "feat: moodFor turns the fields into shader settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `look` and `debug` URL flags

**Files:**
- Modify: `src/url.js`
- Test: `test/url.test.mjs`

**Interfaces:**
- Produces: `readFragment(hash) -> { seed, x, z, look: 'shaded' | 'lines', debug: boolean }`; `writeFragment({ seed, x, z, look, debug })` writes `look` only when it is `lines` and `debug` as a bare key when true. `LOOKS = ['shaded', 'lines']`.

- [ ] **Step 1: Write the failing test**

```js
// test/url.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFragment, writeFragment } from '../src/url.js';

test('look and debug default, parse and round-trip', () => {
  assert.deepEqual(readFragment('#s=ravens&x=1&z=-2'), { seed: 'ravens', x: 1, z: -2, look: 'shaded', debug: false });
  assert.equal(readFragment('#s=a&look=lines').look, 'lines');
  assert.equal(readFragment('#s=a&look=foo').look, 'shaded');
  assert.equal(readFragment('#s=a&debug').debug, true);
  assert.equal(readFragment('#s=a&debug=0').debug, true);
  assert.equal(readFragment('').debug, false);
  const f = { seed: 'ravens', x: 3, z: 4, look: 'lines', debug: true };
  assert.deepEqual(readFragment(writeFragment(f)), f);
  assert.equal(writeFragment({ seed: 'ravens', x: 0, z: 0, look: 'shaded', debug: false }), '#s=ravens&x=0&z=0');
  assert.match(writeFragment(f), /&debug(&|$)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/url.test.mjs`
Expected: FAIL on the first `deepEqual` (no `look`/`debug` keys).

- [ ] **Step 3: Implement**

In `src/url.js`:

```js
export const LOOKS = ['shaded', 'lines'];

export function readFragment(hash) {
  const p = new URLSearchParams((hash || '').replace(/^#/, ''));
  const seed = p.get('s');
  const x = Number(p.get('x')), z = Number(p.get('z'));
  const coord = (v) => Number.isInteger(v) ? Math.max(-MAX_CELL, Math.min(MAX_CELL, v)) : 0;
  const look = LOOKS.includes(p.get('look')) ? p.get('look') : 'shaded';
  // A bare key: `#…&debug` is on, and so is `debug=0`; only its absence is off.
  return { seed: seed && seed.length ? seed : null, x: coord(x), z: coord(z), look, debug: p.has('debug') };
}

export function writeFragment({ seed, x, z, look = 'shaded', debug = false }) {
  const p = new URLSearchParams();
  p.set('s', seed); p.set('x', String(x)); p.set('z', String(z));
  if (look !== 'shaded') p.set('look', look);
  let out = '#' + p.toString();
  if (debug) out += '&debug';
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/url.js test/url.test.mjs
git commit -m "feat: look and debug flags in the fragment

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Surface meshes and the House material

**Files:**
- Create: `src/material.js`
- Modify: `src/build.js`, `src/world.js`, `src/water.js`, `src/sky.js`, `src/gallery.js`

**Interfaces:**
- Consumes: `polyPositions` (Task 1), `STOPS`, `WATER`, `DECAY` (Task 5), `fields` from `makeFields`.
- Produces: `buildGroup(prims, { color, ghost = 0, surface = null })` where `surface = { material, fields, offset: [cx, floorY, cz] }`; the group contains the line mesh, the optional ghost mesh, and when `surface` is given a `THREE.Mesh` named `'surface'`. `surfaceMaterial({ keyDir, floorY, ceiling, side }) -> ShaderMaterial` and `KIND = { arch: 0, statue: 1, pool: 2 }` in `material.js`. Primitives may carry `tag: 'statue'`; a poly named `'pool'` is kind 2.

No Node test: this module imports three. Verified by walking in Step 6.

- [ ] **Step 1: Write `src/material.js`**

```js
// The House material: one ShaderMaterial that fakes sky, a window key light, a height gradient,
// contact darkening, distance fog and height fog. Per-vertex `fields` (light, water, decay) are
// turned into a mood with the same arithmetic as mood.js; keep them in step.
import * as THREE from 'three';
import { STOPS, WATER, DECAY } from './mood.js';

export const KIND = { arch: 0, statue: 1, pool: 2 };

const v3 = (a) => new THREE.Vector3(...a);
const stopUniforms = () => ({
  uStone: { value: STOPS.map(s => v3(s.stone)) },
  uSky: { value: STOPS.map(s => v3(s.sky)) },
  uBounce: { value: STOPS.map(s => v3(s.bounce)) },
  uKey: { value: STOPS.map(s => v3(s.key)) },
  uHaze: { value: STOPS.map(s => v3(s.haze)) },
  // fogFar, heightFog, contact, gradient
  uScalar: { value: STOPS.map(s => new THREE.Vector4(s.fogFar, s.heightFog, s.contact, s.gradient)) },
  uWater: { value: new THREE.Vector4(WATER.heightFog, ...WATER.hazeCool) },
  uWaterSheen: { value: WATER.sheen },
  uDecay: { value: new THREE.Vector3(DECAY.darken, DECAY.grey, DECAY.contact) },
});

// Shared GLSL: piecewise lerp over the three stops and the mood adjustments, mirroring moodFor.
export const MOOD_GLSL = /* glsl */`
  uniform vec3 uStone[3], uSky[3], uBounce[3], uKey[3], uHaze[3];
  uniform vec4 uScalar[3];
  uniform vec4 uWater;        // heightFog gain, hazeCool rgb
  uniform float uWaterSheen;
  uniform vec3 uDecay;        // darken, grey, contact
  struct Mood { vec3 stone, sky, bounce, key, haze; float fogFar, heightFog, contact, gradient; };
  vec3 lerp3(vec3 a[3], float l) { return l < 0.5 ? mix(a[0], a[1], l * 2.0) : mix(a[1], a[2], (l - 0.5) * 2.0); }
  vec4 lerp4(vec4 a[3], float l) { return l < 0.5 ? mix(a[0], a[1], l * 2.0) : mix(a[1], a[2], (l - 0.5) * 2.0); }
  Mood moodFor(vec3 f) {
    float l = clamp(f.x, 0.0, 1.0), w = clamp(f.y, 0.0, 1.0), d = clamp(f.z, 0.0, 1.0);
    Mood m;
    m.stone = lerp3(uStone, l); m.sky = lerp3(uSky, l); m.bounce = lerp3(uBounce, l); m.key = lerp3(uKey, l); m.haze = lerp3(uHaze, l);
    vec4 s = lerp4(uScalar, l);
    m.fogFar = s.x; m.heightFog = s.y; m.contact = s.z; m.gradient = s.w;
    float grey = dot(m.stone, vec3(0.3, 0.59, 0.11)) * uDecay.y;
    m.stone = mix(m.stone, vec3(grey), d * uDecay.x);
    m.contact = clamp(m.contact + uDecay.z * d, 0.0, 1.0);
    m.heightFog = clamp(m.heightFog + uWater.x * w, 0.0, 1.0);
    m.haze = mix(m.haze, mix(m.haze, uWater.yzw, 0.5), w);
    return m;
  }
  // Distance fog from 2 m to fogFar, plus height fog in the bottom 3 m that needs some distance to build.
  float fogAmount(Mood m, float dist, float h) {
    float distFog = clamp((dist - 2.0) / (m.fogFar - 2.0), 0.0, 1.0);
    float heightFog = m.heightFog * clamp(1.0 - h / 3.0, 0.0, 1.0) * clamp(dist / 8.0, 0.0, 1.0);
    return max(distFog, heightFog);
  }
`;

const SURFACE_VERT = /* glsl */`
  attribute vec3 fields;
  attribute float kind;
  varying vec3 vN, vW, vFields;
  varying float vKind;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vFields = fields; vKind = kind;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const SURFACE_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uKeyDir;        // direction the light travels, normalised
  uniform float uFloorY, uCeiling, uDim;
  varying vec3 vN, vW, vFields;
  varying float vKind;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(vFields);
    vec3 n = normalize(vN);
    float h = vW.y - uFloorY;
    vec3 stone = m.stone * (1.0 + 0.12 * step(0.5, vKind) * step(vKind, 1.5));   // statues a touch lighter
    stone *= 1.0 - 0.25 * step(1.5, vKind);                                        // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    vec3 viewDir = normalize(cameraPosition - vW);
    float sheen = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0) * uWaterSheen * vFields.y * step(1.5, vKind);
    color += m.sky * sheen;
    color *= uDim;
    float dist = length(vW - cameraPosition);
    color = mix(color, m.haze, fogAmount(m, dist, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], floorY = 0, ceiling = 8, side = THREE.FrontSide, dim = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    uniforms: { ...stopUniforms(), uKeyDir: { value: v3(keyDir).normalize() }, uFloorY: { value: floorY }, uCeiling: { value: ceiling }, uDim: { value: dim } },
    side, clipping: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}
```

- [ ] **Step 2: Add solid geometry to `src/build.js`**

Replace the file:

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polyPositions } from './shapes/poly.js';
import { KIND } from './material.js';
import { CELL } from './hall.js';

// Crease-edge lines for every primitive that draws lines. Polys draw none.
export function primGeometry(p) {
  if (p.kind === 'poly') return null;
  if (p.kind === 'lines' || p.kind === 'segs') {
    const pos = [];
    if (p.kind === 'lines') for (let i = 0; i + 1 < p.points.length; i++) pos.push(...p.points[i], ...p.points[i + 1]);
    else for (let i = 0; i + 1 < p.points.length; i += 2) pos.push(...p.points[i], ...p.points[i + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  let g;
  if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.r2, p.r1, p.h, p.seg);
  else if (p.kind === 'sphere') g = new THREE.IcosahedronGeometry(p.r, 1);
  const e = new THREE.EdgesGeometry(g, p.kind === 'sphere' ? 10 : 20);
  g.dispose();
  e.rotateX(p.rot[0]); e.rotateZ(p.rot[2]); e.rotateY(p.rot[1]);
  e.translate(p.pos[0], p.pos[1], p.pos[2]);
  return e;
}

// Solid triangles with flat normals for every primitive that has a surface. Non-indexed and
// without uvs, so every geometry merges with every other.
export function primSolid(p) {
  let g;
  if (p.kind === 'poly') {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(polyPositions(p), 3));
  } else if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.r2, p.r1, p.h, p.seg);
  else if (p.kind === 'sphere') g = new THREE.IcosahedronGeometry(p.r, 1);
  else return null;
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  if (p.kind !== 'poly') { g.rotateX(p.rot[0]); g.rotateZ(p.rot[2]); g.rotateY(p.rot[1]); g.translate(p.pos[0], p.pos[1], p.pos[2]); }
  g.computeVertexNormals();
  return g;
}

const kindOf = (p) => p.name === 'pool' ? KIND.pool : p.tag === 'statue' ? KIND.statue : KIND.arch;

// Per-vertex field samples at the vertex's world position, so mood is continuous across halls.
function addFieldAttributes(g, kind, fields, offset) {
  const pos = g.attributes.position, n = pos.count, f = new Float32Array(n * 3), k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (pos.getX(i) + offset[0]) / CELL, z = (pos.getZ(i) + offset[2]) / CELL;
    f[i * 3] = fields.light(x, z); f[i * 3 + 1] = fields.water(x, z); f[i * 3 + 2] = fields.decay(x, z);
    k[i] = kind;
  }
  g.setAttribute('fields', new THREE.BufferAttribute(f, 3));
  g.setAttribute('kind', new THREE.BufferAttribute(k, 1));
}

// A group of line meshes (and optionally a ghost pass) for a primitive list; with `surface`, also
// one solid mesh named 'surface'. surface = { material, fields, offset: [cx, floorY, cz] }.
export function buildGroup(prims, { color, ghost = 0, surface = null } = {}) {
  const group = new THREE.Group();
  if (prims.length === 0) return group;
  const lineGeoms = prims.map(primGeometry).filter(Boolean);
  if (lineGeoms.length) {
    const merged = mergeGeometries(lineGeoms, false);
    lineGeoms.forEach(g => g.dispose());
    if (ghost > 0) {
      const gm = new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost, depthTest: false, depthWrite: false }));
      gm.renderOrder = -1;
      group.add(gm);
    }
    group.add(new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color })));
  }
  if (surface) {
    const solids = [];
    for (const p of prims) {
      const g = primSolid(p);
      if (!g) continue;
      addFieldAttributes(g, kindOf(p), surface.fields, surface.offset);
      solids.push(g);
    }
    if (solids.length) {
      const merged = mergeGeometries(solids, false);
      solids.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, surface.material);
      mesh.name = 'surface';
      group.add(mesh);
    }
  }
  return group;
}

export function disposeGroup(group) {
  const seen = new Set();
  group.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { o.geometry.dispose(); seen.add(o.geometry); }
    if (o.material) o.material.dispose();
  });
  group.removeFromParent();
}
```

- [ ] **Step 3: Update every caller to the options signature**

`src/world.js`: the constructor takes `look`, statues are tagged, and the hall gets a surface when shaded:

```js
import { buildGroup, disposeGroup } from './build.js';
import { surfaceMaterial } from './material.js';
import { colorsFor } from './palette.js';
...
  constructor(scene, seedHash, fields, hooks = {}, look = 'shaded') {
    this.scene = scene; this.seedHash = seedHash; this.fields = fields; this.hooks = hooks; this.look = look;
    this.cells = new Map(); this.params = new Map();
  }
...
    for (const s of statues) { prims.push(...s.prims.map(p => ({ ...p, tag: 'statue' }))); boxes.push(...s.boxes); }
...
    const shaded = this.look === 'shaded';
    const surface = shaded ? { material: surfaceMaterial({ floorY: hall.floorY, ceiling: hall.ceiling }), fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] } : null;
    const group = buildGroup(translatePrims(prims, -hall.cx, -hall.floorY, -hall.cz), { color: colorsFor(hall.light).line, ghost: shaded ? 0 : 0.15, surface });
```

(`uFloorY` is in world space, and the surface mesh's vertices are hall-relative but the group is placed at `hall.floorY`, so `vW.y` in the shader is world `y`; `floorY: hall.floorY` is right.)

`src/water.js`: `buildGroup(translatePrims(prims, -hall.cx, 0, -hall.cz), { color, ghost: 0 })`.
`src/sky.js`: `buildGroup([sphere(rng.range(3, 6), [0, 0, 0])], { color, ghost: 0 })`.
`src/gallery.js`: `buildGroup(body.prims, { color: LINE, ghost: 0.12 })`.

- [ ] **Step 4: Tell `main.js` which look to build**

Minimal wiring now; Task 8 finishes it. In `src/main.js`:

```js
const world = new World(scene, seedHash, fields, {
  onAdd: (c) => { water.add(c); clouds.add(c); flocks.add(c); },
  onRemove: (c) => { water.remove(c); clouds.remove(c); flocks.remove(c); },
}, frag.look);
```

and carry the flags in both `writeFragment` calls: `writeFragment({ seed, x: curX, z: curZ, look: frag.look, debug: frag.debug })`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all green (nothing pure changed).

- [ ] **Step 6: Walk it**

Run `npm run serve`, open `http://localhost:8080/#s=ravens&x=0&z=0`. Expected: solid pale walls, floors and ceilings with the line work crisp on top and no flicker between them; a stair hall shows the well open with ramps you can see; every doorway has a floor through the wall; statues read slightly lighter than walls; distance fog closes in and the floor mists faintly. The console shows no shader compile errors. Then open `#s=ravens&x=0&z=0&look=lines`. Expected: the v0 wireframe House, ghost pass included.

If walls are black: `uKeyDir` and the hemisphere both depend on `normal`; check `computeVertexNormals` ran after `toNonIndexed` and `deleteAttribute('normal')`. If the whole hall is one flat colour: the `fields` attribute is missing; check `addFieldAttributes` ran for every solid.

- [ ] **Step 7: Commit**

```bash
git add src/material.js src/build.js src/world.js src/water.js src/sky.js src/gallery.js src/main.js
git commit -m "feat: shaded surface mesh per hall with the House material

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Background, global fog and line colour from the mood

**Files:**
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `moodFor` (Task 5), `frag.look` (Task 6).

- [ ] **Step 1: Ease all three fields and drive the background and global fog from `moodFor`**

Replace the light/fog block and `easeLight` in `src/main.js`:

```js
import { moodFor } from './mood.js';
import { colorsFor, fogFar } from './palette.js';
...
const shaded = frag.look === 'shaded';
const eased = { light: start.light, water: start.water, decay: start.decay };
const toHex = ([r, g, b]) => new THREE.Color(r, g, b).getHex();
function sceneColours() {
  if (!shaded) { const g = colorsFor(eased.light).ground; return { bg: g, far: fogFar(eased.light) }; }
  const m = moodFor(eased.light, eased.water, eased.decay);
  return { bg: toHex(m.haze), far: m.fogFar };
}
const first = sceneColours();
scene.background = new THREE.Color(first.bg);
scene.fog = new THREE.Fog(first.bg, 2, first.far);

// The lines, water grid and birds still use scene.fog; surfaces fog themselves per vertex. Both
// ease toward the current hall over about 1.5 s so the background never steps at a doorway.
function easeMood(dt, cx, cz) {
  const here = world.hall(cx, 0, cz), k = 1 - Math.exp(-dt / 1.5);
  for (const f of ['light', 'water', 'decay']) eased[f] += (here[f] - eased[f]) * k;
  const { bg, far } = sceneColours();
  scene.background.setHex(bg); scene.fog.color.setHex(bg); scene.fog.far = far;
}
```

and call `easeMood(dt, cx, cz)` where `easeLight` was called. Remove `let light = start.light;` and `easeLight`.

- [ ] **Step 2: Walk it**

Open `#s=ravens&x=0&z=0` and walk east through a bright quarter, then west into a dark one, then find water (south is wetter). Expected: the background matches the haze the surfaces fade into, so far walls dissolve with no visible fog plane; the lines keep the palette colour (dark on bright stone, pale in the dark); the drowned halls hold a low mist at the floor. Nothing steps at a doorway.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: background and fog follow the mood

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Build scheduling and the debug overlay

**Files:**
- Create: `src/schedule.js`, `src/debug.js`
- Modify: `src/world.js`, `src/main.js`
- Test: `test/schedule.test.mjs`

**Interfaces:**
- Produces: `planLoads(have, cx, cz) -> { now: [[x, z], ...], later: [[x, z], ...] }` in `schedule.js`, pure; `have` is a `Set` of `"x,z"` keys. `now` is the collision neighbourhood (the cell and its four axis neighbours) not yet built; `later` is the rest of the 5×5 block, nearest first, deterministic order.
- Produces: `World.update(cx, cz)` builds `now` synchronously and queues `later`; `World.tick()` builds one queued hall; `World.lastBuildMs` is the duration of the last `ensure` that built something. `Debug` in `debug.js`: `new Debug(renderer)`, `.update(dt, world)`.

- [ ] **Step 1: Write the failing test**

```js
// test/schedule.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLoads } from '../src/schedule.js';

test('planLoads builds the collision neighbourhood now and the rest nearest first', () => {
  const { now, later } = planLoads(new Set(), 0, 0);
  assert.deepEqual(now.map(String).sort(), ['0,0', '0,1', '0,-1', '1,0', '-1,0'].sort());
  assert.equal(later.length, 20);
  const d = ([x, z]) => Math.max(Math.abs(x), Math.abs(z));
  for (let i = 1; i < later.length; i++) assert.ok(d(later[i]) >= d(later[i - 1]), 'later is not nearest first');
  assert.deepEqual(planLoads(new Set(), 0, 0), planLoads(new Set(), 0, 0));
});

test('planLoads skips cells already built and follows the player', () => {
  const have = new Set();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) have.add(`${x},${z}`);
  const { now, later } = planLoads(have, 1, 0);
  assert.deepEqual(now, []);
  assert.deepEqual(later.map(String).sort(), ['3,-2', '3,-1', '3,0', '3,1', '3,2'].sort());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/schedule.test.mjs`
Expected: FAIL, `Cannot find module '.../src/schedule.js'`.

- [ ] **Step 3: Write `src/schedule.js`**

```js
// Which halls to build when the player stands in (cx, cz). Collision reads the cell and its four
// axis neighbours synchronously (World.near), so those build now; the rest of the 5x5 block
// builds one per frame, nearest first, so a crossing never costs more than a few halls of work
// in one frame. Pure, so the order is testable.
export function planLoads(have, cx, cz) {
  const key = (x, z) => `${x},${z}`;
  const now = [], later = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const x = cx + dx, z = cz + dz;
    if (have.has(key(x, z))) continue;
    if (Math.abs(dx) + Math.abs(dz) <= 1) now.push([x, z]); else later.push([x, z]);
  }
  const d = ([x, z]) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) * 10 + Math.abs(x - cx) + Math.abs(z - cz);
  later.sort((a, b) => d(a) - d(b) || a[0] - b[0] || a[1] - b[1]);
  return { now, later };
}
```

- [ ] **Step 4: Queue builds in `World`**

In `src/world.js`:

```js
import { planLoads } from './schedule.js';
...
  constructor(scene, seedHash, fields, hooks = {}, look = 'shaded') {
    ...
    this.queue = []; this.lastBuildMs = 0;
  }
  update(cx, cz) {
    const have = new Set([...this.cells.values()].filter(c => c.hall.y === 0).map(c => `${c.hall.x},${c.hall.z}`));
    const { now, later } = planLoads(have, cx, cz);
    for (const [x, z] of now) this.ensure(x, 0, z);
    this.queue = later;
    for (const [k, cell] of this.cells) {
      if (Math.max(Math.abs(cell.hall.x - cx), Math.abs(cell.hall.z - cz)) > 3) { this.hooks.onRemove?.(cell); disposeGroup(cell.group); this.cells.delete(k); }
    }
  }
  // One queued hall per frame.
  tick() {
    const next = this.queue.shift();
    if (next) this.ensure(next[0], 0, next[1]);
  }
  ensure(x, y, z, opts = {}) {
    const k = key(x, y, z);
    if (this.cells.has(k)) return this.cells.get(k);
    const t0 = performance.now();
    ... (existing body, unchanged, up to `this.hooks.onAdd?.(cell);`)
    this.lastBuildMs = performance.now() - t0;
    return cell;
  }
```

(A stair hall's `ensure` recursion builds its two vista halls inside the same call, so `lastBuildMs` for it covers all three; that is the number the budget cares about.)

- [ ] **Step 5: Write `src/debug.js`**

```js
// The ?debug overlay: fps, draw calls, triangles and the last hall-build time.
export class Debug {
  constructor(renderer) {
    this.renderer = renderer; this.fps = 60; this.acc = 0;
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;font:12px/1.4 ui-monospace,monospace;color:#d8d4cc;background:rgba(5,6,10,.6);pointer-events:none;z-index:10';
    document.body.appendChild(this.el);
  }
  update(dt, world) {
    this.fps += ((1 / Math.max(dt, 1e-3)) - this.fps) * 0.05;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const r = this.renderer.info.render;
    this.el.textContent = `fps ${this.fps.toFixed(0)}\ncalls ${r.calls}\ntris ${(r.triangles / 1000).toFixed(0)}k\nbuild ${world.lastBuildMs.toFixed(1)} ms\nqueue ${world.queue.length}`;
  }
}
```

`renderer.info.render` is reset by each `render()` call (autoReset is on), so reading it after `renderer.render` in the loop gives this frame's numbers.

- [ ] **Step 6: Wire both into `main.js`**

```js
import { Debug } from './debug.js';
...
const debug = frag.debug ? new Debug(renderer) : null;
...
renderer.setAnimationLoop((t) => {
  ...
  world.tick();
  ...
  renderer.render(scene, camera);
  debug?.update(dt, world);
});
```

- [ ] **Step 7: Run the tests, then walk with `?debug`**

Run: `npm test`
Expected: all green.

Open `#s=ravens&x=0&z=0&debug`. Expected: an overlay in the top-left; fps near 60; calls under 100 while standing in a hall; tris in the low hundreds of thousands; `build` shows a number after each crossing and `queue` counts down to 0 over a few frames. Cross into a stair hall and watch `build`: it is the three-hall number. Record fps, calls, tris and the worst `build` in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/schedule.js src/debug.js src/world.js src/main.js test/schedule.test.mjs
git commit -m "feat: spread hall builds over frames; ?debug overlay

Measured on <machine>: fps <n>, calls <n>, tris <n>k, worst build <n> ms.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Phase A tuning walk

**Files:**
- Modify: `src/mood.js` (values only), `docs/superpowers/specs/2026-10-13-the-house-look-design.md` (status line)

- [ ] **Step 1: Walk the three moods**

Open `#s=ravens&x=0&z=0&debug`. Walk east until the overlay fps settles, then west into the dark, then south into the water. Adjust `STOPS` values in `src/mood.js` only (the tests pin directions and ranges, not hex). Targets: luminous halls read as pale warm stone with soft bright ceilings; chiaroscuro halls are nearly black except where the key hits; dusk is cool and even; drowned halls hold mist in the bottom metre or two. Run `npm test` after each change to keep the monotonic and range tests green.

- [ ] **Step 2: Check the budget**

With `?debug` on: fps 60, calls under 100, tris under 600k, worst build under 16 ms per crossing. If tris are over budget, lower `seg` on columns in `src/shapes/common.js` `column()` from 12 to 8 and re-check. If build time is over, confirm `queue` drains one per frame and the `now` set is small.

- [ ] **Step 3: Record and commit**

Update the spec's **Status** line to `phase A shipped <date>; fps <n>, calls <n>, tris <n>k, worst build <n> ms on <machine>`.

```bash
git add src/mood.js docs/superpowers/specs/2026-10-13-the-house-look-design.md
git commit -m "feat: phase A mood tuning and measured budget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

Alex walks phase A on Pages before phase B starts.

---

## Phase B: windows and light shafts

### Task 11: `windowsFor`: the window wall, windows and shafts

**Files:**
- Create: `src/windows.js`
- Test: `test/windows.test.mjs`

**Interfaces:**
- Consumes: `footprint(hall)` (Task 2), `connsFor`, `stream`, `placeStatues` output shape (`statues[i].slot.x/z`, `statues[i].boxes`).
- Produces in `windows.js`:
  - `footprintEdges(hall, conns) -> [{ a: [x, z], b: [x, z], len, d: [dx, dz], n: [nx, nz], doorway: conn | null }]` where `n` is the inward normal and `doorway` is set on axis walls that carry one.
  - `moodBand(light) -> 'chiaroscuro' | 'dusk' | 'luminous'` (`< 1/3`, `< 2/3`, else).
  - `windowsFor(seedHash, hall, conns, statues) -> { wall, keyDir: [x, y, z], windows: [{ c: [x, y, z], w, h, d: [dx, dz], n: [nx, nz] }], shafts: [{ from: [x, y, z], to: [x, y, z], w, strength }] }`. `keyDir` is the direction light travels (downward), normalised. Every shaft's `to` lies on the floor inside the footprint.

- [ ] **Step 1: Write the failing tests**

```js
// test/windows.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues } from '../src/statues/place.js';
import { footprint } from '../src/shapes/footprint.js';
import { footprintEdges, windowsFor, moodBand } from '../src/windows.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const RANGE = { luminous: [2, 4], dusk: [1, 2], chiaroscuro: [1, 2] };
const build = (x, z, over = {}) => {
  const hall = { ...hallParams(seed, x, 0, z, fields), ...over }, conns = connsFor(seed, hall, fields);
  const built = buildHall(hall, conns);
  return { hall, conns, statues: placeStatues(seed, hall, built.slots, built.boxes) };
};

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
  let seen = { luminous: 0, dusk: 0, chiaroscuro: 0 };
  for (let i = 0; i < 600; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const { hall, conns, statues } = build(x, z);
    const out = windowsFor(seed, hall, conns, statues);
    const band = moodBand(hall.light); seen[band]++;
    const [lo, hi] = RANGE[band];
    assert.ok(out.windows.length >= lo && out.windows.length <= hi, `${band} has ${out.windows.length} windows`);
    const e = out.wall, top = hall.floorY + hall.ceiling;
    for (const w of out.windows) {
      assert.ok(top - (w.c[1] + w.h / 2) <= 1.5 + 1e-9 && w.c[1] + w.h / 2 <= top, 'window top not within 1.5 m of the ceiling');
      assert.ok(w.c[1] - w.h / 2 > hall.floorY + 0.5, 'window reaches the floor');
      // along-wall position: project onto the edge
      const s = (w.c[0] - e.a[0]) * e.d[0] + (w.c[2] - e.a[1]) * e.d[1];
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

test('a 6 m hall with 6 m arches still puts its windows on the wall segments beside the opening', () => {
  const { hall, conns, statues } = build(0, 0, { ceiling: 6 });
  for (const side of ['n', 'e', 's', 'w']) conns[side] = { ...conns[side], type: 'arch', width: 4, height: 6 };
  const out = windowsFor(seed, hall, conns, statues);
  assert.ok(out.windows.length >= 1);
  for (const w of out.windows) assert.ok(w.c[1] + w.h / 2 <= 6 && w.c[1] - w.h / 2 > 0.5);
});

test('every shaft lands inside the hall; chiaroscuro shafts land on a statue when one is in front', () => {
  let checked = 0, aimed = 0;
  for (let i = 0; i < 1500 && checked < 300; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
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

test('a chiaroscuro hall with every statue behind the window wall falls back to the key direction', () => {
  const { hall, conns } = build(0, 0, { light: 0.05 });
  const out = windowsFor(seed, hall, conns, []);
  assert.ok(out.shafts.length >= 1);
  for (const s of out.shafts) {
    assert.ok(pointInPolygon([s.to[0], s.to[2]], footprint(hall)));
    const horiz = Math.hypot(s.to[0] - s.from[0], s.to[2] - s.from[2]);
    const dirDot = ((s.to[0] - s.from[0]) * out.wall.n[0] + (s.to[2] - s.from[2]) * out.wall.n[1]) / horiz;
    assert.ok(dirDot > 0.99, 'fallback shaft is not along the key light');
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/windows.test.mjs`
Expected: FAIL, `Cannot find module '.../src/windows.js'`.

- [ ] **Step 3: Write `src/windows.js`**

```js
// Windows and light shafts for a hall, decided in the spec's order: wall, then windows, then
// shafts. Pure: one stream (salt `windows`), the hall, its connectors and its statues.
import { stream } from './rng.js';
import { footprint } from './shapes/footprint.js';

const DEG = Math.PI / 180;
const COUNT = { luminous: [2, 4], dusk: [1, 2], chiaroscuro: [1, 2] };
const STRENGTH = { luminous: 0.35, dusk: 0.15, chiaroscuro: 0.9 };

export const moodBand = (light) => light < 1 / 3 ? 'chiaroscuro' : light < 2 / 3 ? 'dusk' : 'luminous';

// Which footprint edge carries which doorway, per shape (see footprint.js for the octagon order).
function doorwayIndex(hall) {
  if (hall.shape === 'octagon') return { 5: 'n', 7: 'e', 1: 's', 3: 'w' };
  if (hall.shape === 'cross') return { 0: 'n', 3: 'e', 6: 's', 9: 'w' };
  return { 0: 'n', 1: 'e', 2: 's', 3: 'w' };
}

export function footprintEdges(hall, conns) {
  const verts = footprint(hall), doors = doorwayIndex(hall), out = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [d[1], -d[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((hall.cx - mid[0]) * n[0] + (hall.cz - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
    out.push({ a, b, len, d, n, doorway: doors[i] ? conns[doors[i]] : null });
  }
  return out;
}

// Distance from (x, z) along unit direction (dx, dz) to the footprint boundary.
function reach(poly, x, z, dx, dz) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * dz - (az - z) * dx) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

export function windowsFor(seedHash, hall, conns, statues) {
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'windows');
  const edges = footprintEdges(hall, conns), poly = footprint(hall);
  const doorless = edges.filter(e => !e.doorway && e.len >= 3);
  const wall = rng.pick(doorless.length ? doorless : edges);
  const band = moodBand(hall.light), [lo, hi] = COUNT[band];
  const count = rng.int(lo, hi);
  const top = hall.floorY + hall.ceiling;
  const windows = [];
  for (let k = 0; k < count; k++) {
    let placed = null;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const h = Math.min(rng.range(1.2, 2.5), hall.ceiling * 0.35), w = rng.range(0.8, 2.0);
      const drop = rng.range(0.3, 1.5), cy = top - drop - h / 2;
      if (wall.len < w + 0.6) break;
      const s = rng.range(0.3 + w / 2, wall.len - 0.3 - w / 2);
      if (wall.doorway) {
        const m = wall.len / 2, half = wall.doorway.width / 2 + 0.2;
        if (s + w / 2 > m - half && s - w / 2 < m + half) continue;
      }
      if (windows.some(o => Math.abs(o.s - s) < (o.w + w) / 2 + 0.3)) continue;
      placed = { s, w, h, c: [wall.a[0] + wall.d[0] * s, cy, wall.a[1] + wall.d[1] * s], d: wall.d, n: wall.n };
    }
    if (placed) windows.push(placed);
  }
  if (windows.length < lo) {
    // Fallback so every hall has at least `lo` windows: centre of the doorless span nearest the ceiling.
    const w = Math.min(1.2, wall.len - 0.6), h = Math.min(1.5, hall.ceiling * 0.35);
    const s = wall.doorway ? Math.max(0.3 + w / 2, wall.len / 2 - wall.doorway.width / 2 - 0.2 - w / 2) : wall.len / 2;
    while (windows.length < lo) windows.push({ s, w, h, c: [wall.a[0] + wall.d[0] * s, top - 0.75 - h / 2, wall.a[1] + wall.d[1] * s], d: wall.d, n: wall.n });
  }
  // Key light: along the wall's inward normal with a small jitter, nominally 40 to 60 degrees down.
  const jitter = rng.range(-8, 8) * DEG, elev = rng.range(40, 60) * DEG;
  const cosJ = Math.cos(jitter), sinJ = Math.sin(jitter);
  const kn = [wall.n[0] * cosJ - wall.n[1] * sinJ, wall.n[0] * sinJ + wall.n[1] * cosJ];
  const keyDir = [kn[0] * Math.cos(elev), -Math.sin(elev), kn[1] * Math.cos(elev)];
  const shafts = windows.map(win => {
    const [wx, wy, wz] = win.c, height = wy - hall.floorY;
    let dir = kn, land = null;
    if (band === 'chiaroscuro' && statues.length) {
      // Aim at the statue most nearly in front of the window, if any is in front at all.
      const scored = statues.map(st => {
        const dx = st.slot.x - wx, dz = st.slot.z - wz, dist = Math.hypot(dx, dz);
        return { st, dist, dot: dist > 1e-6 ? (dx * kn[0] + dz * kn[1]) / dist : -1 };
      }).filter(o => o.dot > 0.3 && o.dist > 1.5).sort((p, q) => q.dot - p.dot || p.dist - q.dist);
      if (scored.length) { const o = scored[0]; dir = [(o.st.slot.x - wx) / o.dist, (o.st.slot.z - wz) / o.dist]; land = [o.st.slot.x, o.st.slot.z]; }
    }
    if (!land) {
      // Nominal landing distance, clamped so the shaft lands at least 0.5 m inside the hall.
      const nominal = height / Math.tan(elev);
      const maxDist = Math.max(0.5, reach(poly, wx, wz, dir[0], dir[1]) - 0.5);
      const dist = Math.min(nominal, maxDist);
      land = [wx + dir[0] * dist, wz + dir[1] * dist];
    }
    return { from: [wx, wy, wz], to: [land[0], hall.floorY, land[1]], w: win.w, strength: STRENGTH[band] };
  });
  return { wall, keyDir, windows: windows.map(({ s, ...w }) => w), shafts };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/windows.test.mjs`
Expected: 5 passing. If `window off its wall` fails on small octagons: the diagonal wall is short, and the `wall.len < w + 0.6` guard breaks the loop; the fallback then places a window of width `wall.len - 0.6`. If the chiaroscuro aim test fails for a statue just past the `0.6` m tolerance, the statue's `slot` is its plinth centre and large plinths can be wider; widen the tolerance in the test to `1.0`, not the aim.

- [ ] **Step 5: Commit**

```bash
git add src/windows.js test/windows.test.mjs
git commit -m "feat: windowsFor places the window wall, windows and light shafts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: The effects mesh: glows and shafts

**Files:**
- Create: `src/effects.js`
- Modify: `src/material.js` (add `effectsMaterial`), `src/world.js`

**Interfaces:**
- Consumes: `windowsFor` (Task 11), `MOOD_GLSL`, `surfaceMaterial` (Task 7), `moodFor` (Task 5).
- Produces: `effectsMaterial({ fields: [l, w, d], floorY }) -> ShaderMaterial` (additive, no depth write, fogged by the hall-centre mood); `buildEffects(hall, out, fields) -> THREE.Mesh | null` in `effects.js`, hall-relative like the surface mesh, named `'effects'`. `World.ensure` passes `keyDir` to `surfaceMaterial` and adds the effects mesh to the hall group.

- [ ] **Step 1: Add the effects material**

Append to `src/material.js`:

```js
const EFFECTS_VERT = /* glsl */`
  attribute float alpha;
  attribute vec3 tint;
  varying vec3 vW, vTint; varying vec2 vUv; varying float vAlpha;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vUv = uv; vAlpha = alpha; vTint = tint;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const EFFECTS_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uFields; uniform float uFloorY;
  varying vec3 vW, vTint; varying vec2 vUv; varying float vAlpha;
  void main() {
    Mood m = moodFor(uFields);
    // Soft edges across the quad; uv.x runs across a shaft or glow, uv.y along it.
    float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(0.0, 0.35, 1.0 - vUv.x);
    float a = vAlpha * edge;
    float dist = length(vW - cameraPosition);
    a *= 1.0 - fogAmount(m, dist, vW.y - uFloorY);
    gl_FragColor = vec4(vTint * a, a);
  }
`;
export function effectsMaterial({ fields = [0.5, 0, 0], floorY = 0 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: EFFECTS_VERT, fragmentShader: EFFECTS_FRAG,
    uniforms: { ...stopUniforms(), uFields: { value: v3(fields) }, uFloorY: { value: floorY } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
```

- [ ] **Step 2: Write `src/effects.js`**

```js
// Window glows and light shafts for one hall, as one additive mesh. Geometry is hall-relative
// (subtract cx, floorY, cz) like the surface mesh; the group places it.
import * as THREE from 'three';
import { effectsMaterial } from './material.js';
import { moodFor } from './mood.js';

const GLOW = [1.0, 0.95, 0.85], SHAFT = [1.0, 0.93, 0.8];

export function buildEffects(hall, out, fields) {
  if (!out.windows.length) return null;
  const pos = [], uv = [], alpha = [], tint = [];
  const rel = ([x, y, z]) => [x - hall.cx, y - hall.floorY, z - hall.cz];
  // A quad from four corners (a b c d counter-clockwise seen from the lit side) with per-corner alpha.
  const quad = (a, b, c, d, al, colour, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) => {
    const corners = [a, b, c, d].map(rel), order = [0, 1, 2, 0, 2, 3];
    for (const i of order) { pos.push(...corners[i]); uv.push(...uvs[i]); alpha.push(al[i]); tint.push(...colour); }
  };
  const band = moodFor(hall.light, hall.water, hall.decay);
  const glowA = 0.25 + 0.5 * hall.light;
  for (const w of out.windows) {
    const [cx, cy, cz] = w.c, hx = w.d[0] * w.w / 2, hz = w.d[1] * w.w / 2, nx = w.n[0] * 0.02, nz = w.n[1] * 0.02;
    quad([cx - hx + nx, cy - w.h / 2, cz - hz + nz], [cx + hx + nx, cy - w.h / 2, cz + hz + nz],
      [cx + hx + nx, cy + w.h / 2, cz + hz + nz], [cx - hx + nx, cy + w.h / 2, cz - hz + nz], [glowA, glowA, glowA, glowA], GLOW);
  }
  for (const s of out.shafts) {
    const [fx, fy, fz] = s.from, [tx, ty, tz] = s.to;
    const dx = tx - fx, dz = tz - fz, horiz = Math.hypot(dx, dz) || 1;
    // Across the shaft: horizontal, perpendicular to its travel. Top half-width from the window, bottom wider.
    const px = -dz / horiz, pz = dx / horiz, r0 = s.w / 2, r1 = s.w * 0.7;
    const top = (k) => [fx + px * k, fy, fz + pz * k], bot = (k) => [tx + px * k, ty + 0.02, tz + pz * k];
    const a0 = s.strength, a1 = 0.0;
    // Two crossed ribbons: one across the travel direction, one along it. Four quads in all with the landing patch.
    quad(top(-r0), top(r0), bot(r1), bot(-r1), [a0, a0, a1, a1], SHAFT);
    const ux = dx / horiz * r0, uz = dz / horiz * r0, vx = dx / horiz * r1, vz = dz / horiz * r1;
    quad([fx - ux, fy, fz - uz], [fx + ux, fy, fz + uz], [tx + vx, ty + 0.02, tz + vz], [tx - vx, ty + 0.02, tz - vz], [a0, a0, a1, a1], SHAFT);
    // Landing patch: a flat quad on the floor, brightest at the centre via the edge falloff in both axes.
    const pa = s.strength * 0.6, R = r1 * 1.6;
    quad([tx - px * R - vx * 1.6, ty + 0.03, tz - pz * R - vz * 1.6], [tx + px * R - vx * 1.6, ty + 0.03, tz + pz * R - vz * 1.6],
      [tx + px * R + vx * 1.6, ty + 0.03, tz + pz * R + vz * 1.6], [tx - px * R + vx * 1.6, ty + 0.03, tz - pz * R + vz * 1.6], [pa, pa, pa, pa], SHAFT);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  const mesh = new THREE.Mesh(g, effectsMaterial({ fields: [hall.light, hall.water, hall.decay], floorY: hall.floorY }));
  mesh.name = 'effects'; mesh.renderOrder = 2; mesh.frustumCulled = true;
  return mesh;
}
```

(The landing patch's `uv.y` runs along the travel direction and the fragment shader only softens `uv.x`; that leaves a hard edge along the shaft axis at the patch ends, which the additive low alpha hides. If it shows, soften `uv.y` the same way in `EFFECTS_FRAG`: `edge *= smoothstep(0.0, 0.35, vUv.y) * smoothstep(0.0, 0.35, 1.0 - vUv.y)` for the patch only, by giving the patch a `tint` with a marker alpha; keep it simple first.)

- [ ] **Step 3: Wire windows into `World.ensure`**

In `src/world.js`:

```js
import { connsFor } from './connectors.js';
import { windowsFor } from './windows.js';
import { buildEffects } from './effects.js';
...
    const shaded = this.look === 'shaded';
    const win = shaded && y === 0 ? windowsFor(this.seedHash, hall, conns, statues) : null;
    const surface = shaded ? { material: surfaceMaterial({ floorY: hall.floorY, ceiling: hall.ceiling, keyDir: win ? win.keyDir : undefined }), fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] } : null;
    const group = buildGroup(translatePrims(prims, -hall.cx, -hall.floorY, -hall.cz), { color: colorsFor(hall.light).line, ghost: shaded ? 0 : 0.15, surface });
    if (win) { const fx = buildEffects(hall, win, this.fields); if (fx) group.add(fx); }
    group.position.set(hall.cx, hall.floorY, hall.cz);
```

`disposeGroup` already disposes every child's geometry and material.

- [ ] **Step 4: Run the tests, then walk**

Run: `npm test`
Expected: all green.

Open `#s=ravens&x=0&z=0&debug`. Expected: each hall has one wall with glowing rectangles high up; shafts slant down from them and land inside; luminous halls are soft and broad, chiaroscuro halls have one or two hard shafts that fall on statues; distant shafts fade with the haze rather than shining through it; the wall the shafts come from is the dark wall (backlit). Calls still under 100 (one extra per hall). Record fps, calls and tris.

If shafts are invisible: `AdditiveBlending` with alpha premultiplied in the fragment needs `transparent: true`; check the material. If they look like flat paper, the two crossed ribbons are coplanar with the view; that is expected head-on and acceptable.

- [ ] **Step 5: Commit and push**

```bash
git add src/effects.js src/material.js src/world.js
git commit -m "feat: window glows and light shafts per hall

Measured: fps <n>, calls <n>, tris <n>k.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

Alex walks phase B before phase C starts.

---

## Phase C: water, mirrors and clouds

### Task 13: Water fill and shaded mirrors

> **Decision 2026-10-13 (Alex, after the phase A walk):** pools are cut out of the hall floor rather than
> covered by an opaque `'pool'` poly, so the swaying mirror statues below `floorY` show through as in v0.
> The opaque floor in phase A hides them (final-review finding I-3). Re-plan this task around the cut-out
> before executing it: the floor needs the pool polygon removed (`poly` has no holes, so clip the floor into
> pieces as `aroundWell` does), and the water fill stays translucent over the opening.

**Files:**
- Modify: `src/shapes/index.js` (pool floor poly), `src/material.js` (add `waterMaterial`), `src/water.js`, `src/main.js`
- Test: `test/floors.test.mjs`

**Interfaces:**
- Produces: a poly named `'pool'` at `floorY + 0.01` for every hall with a pool (kind 2 in the surface shader: darker, with sheen). `waterMaterial({ fields, floorY }) -> ShaderMaterial` (translucent, Fresnel brightening, opacity capped at 0.6). `Water` takes `(scene, renderer, fields, look)` and adds a fill mesh and a shaded mirror.

- [ ] **Step 1: Write the failing test**

Append to `test/floors.test.mjs`:

```js
test('a hall with a pool has a pool floor poly on its outline, and a dry hall has none', () => {
  let wet = 0;
  for (let i = 0; i < 600; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields), conns = connsFor(seed, hall, fields);
    const pools = buildHall(hall, conns).prims.filter(p => p.kind === 'poly' && p.name === 'pool');
    if (!hall.pool) { assert.equal(pools.length, 0); continue; }
    wet++;
    assert.equal(pools.length, 1);
    assert.equal(pools[0].points.length, hall.pool.length);
    for (const [k, p] of pools[0].points.entries()) {
      assert.ok(Math.abs(p[0] - (hall.cx + hall.pool[k][0])) < 1e-9 && Math.abs(p[2] - (hall.cz + hall.pool[k][1])) < 1e-9);
      assert.ok(Math.abs(p[1] - (hall.floorY + 0.01)) < 1e-9);
    }
  }
  assert.ok(wet > 50);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/floors.test.mjs`
Expected: FAIL, `pools.length` is `0` for a wet hall.

- [ ] **Step 3: Emit the pool floor in `buildHall`**

In `src/shapes/index.js`, after the builder runs and before the stairwell block:

```js
  if (hall.pool) prims = [...prims, poly(hall.pool.map(([px, pz]) => [hall.cx + px, hall.floorY + 0.01, hall.cz + pz]), 'pool')];
```

- [ ] **Step 4: Add the water material**

Append to `src/material.js`:

```js
const WATER_VERT = /* glsl */`
  varying vec3 vW, vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const WATER_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uFields; uniform float uFloorY;
  varying vec3 vW, vN;
  void main() {
    Mood m = moodFor(uFields);
    vec3 viewDir = normalize(cameraPosition - vW);
    float fresnel = pow(1.0 - max(dot(normalize(vN), viewDir), 0.0), 3.0);
    // Tinted from haze and sky; brighter and more opaque at grazing angles, but never past 0.6,
    // so the mirrored statues below stay visible.
    vec3 tint = mix(m.haze * 0.8, m.sky, 0.35 + 0.5 * fresnel);
    float a = min(0.6, 0.18 + 0.6 * fresnel);
    float dist = length(vW - cameraPosition);
    tint = mix(tint, m.haze, fogAmount(m, dist, vW.y - uFloorY));
    gl_FragColor = vec4(tint, a);
  }
`;
export function waterMaterial({ fields = [0.5, 1, 0], floorY = 0 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: { ...stopUniforms(), uFields: { value: v3(fields) }, uFloorY: { value: floorY } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
```

- [ ] **Step 5: Fill the pool and shade the mirror in `water.js`**

```js
import * as THREE from 'three';
import { pointInPolygon } from './hall.js';
import { colorsFor, lerpHex } from './palette.js';
import { buildGroup, disposeGroup, primSolid } from './build.js';
import { surfaceMaterial, waterMaterial } from './material.js';
import { translatePrims, poly } from './shapes/ir.js';

export class Water {
  constructor(scene, renderer, fields, look = 'shaded') {
    this.scene = scene; this.pools = new Map(); this.fields = fields; this.shaded = look === 'shaded';
    renderer.localClippingEnabled = true;
  }

  add(cell) {
    const { hall } = cell;
    if (!hall.pool || this.pools.has(cell)) return;
    ... (existing grid-line construction, unchanged, through `this.scene.add(mesh);`)
    const waterY = hall.floorY + hall.depth;
    const wet = (cell.statues || []).filter(s => pointInPolygon([s.slot.x - hall.cx, s.slot.z - hall.cz], hall.pool));
    const prims = wet.flatMap(s => s.prims.map(p => ({ ...p, tag: 'statue' })));
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), waterY);
    const surface = this.shaded
      ? { material: surfaceMaterial({ floorY: hall.floorY, ceiling: hall.ceiling, side: THREE.DoubleSide, dim: 0.6 }), fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] }
      : null;
    const mirror = buildGroup(translatePrims(prims, -hall.cx, 0, -hall.cz), { color, ghost: 0, surface });
    mirror.scale.y = -1;
    mirror.position.set(hall.cx, 2 * waterY, hall.cz);
    mirror.traverse(o => {
      if (!o.material) return;
      o.material.clippingPlanes = [clip];
      if (o.name !== 'surface') { o.material.transparent = true; o.material.opacity = 0.4; }
    });
    this.scene.add(mirror);
    let fill = null;
    if (this.shaded) {
      const g = primSolid(poly(hall.pool.map(([x, z]) => [x, 0, z]), 'water'));
      fill = new THREE.Mesh(g, waterMaterial({ fields: [hall.light, hall.water, hall.decay], floorY: hall.floorY }));
      fill.position.set(hall.cx, waterY - 0.005, hall.cz);
      fill.renderOrder = 1;
      this.scene.add(fill);
    }
    this.pools.set(cell, { mesh, base, mirror, fill, cx: hall.cx, cz: hall.cz });
  }

  remove(cell) {
    const p = this.pools.get(cell);
    if (!p) return;
    p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh.removeFromParent();
    disposeGroup(p.mirror);
    if (p.fill) { p.fill.geometry.dispose(); p.fill.material.dispose(); p.fill.removeFromParent(); }
    this.pools.delete(cell);
  }
  ... (update unchanged)
}
```

The mirror surface uses the `uFloorY` of the real hall and `uDim: 0.6`, so it shades like its statue, dimmer. `scale.y = -1` flips winding, hence `DoubleSide`.

In `src/main.js`: `const water = new Water(scene, renderer, fields, frag.look);`.

- [ ] **Step 6: Run the tests, then walk to water**

Run: `npm test`
Expected: all green.

Open `#s=ravens&x=0&z=0&debug` and walk south. Expected: pools have a tinted translucent surface under the moving grid, brighter and milkier at grazing angles but never opaque; the darker pool floor shows through; mirrored statues are shaded, dim, and still visible at a distance; the pool fill fogs with the hall. Calls rise by two per pool hall and stay under 100.

- [ ] **Step 7: Commit**

```bash
git add src/shapes/index.js src/material.js src/water.js src/main.js test/floors.test.mjs
git commit -m "feat: shaded water fill, darker pool floors and shaded mirrors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: One cloud mesh per hall, drifting in the shader

**Files:**
- Modify: `src/material.js` (add `cloudMaterials`), `src/sky.js`, `src/main.js`

**Interfaces:**
- Produces: `cloudMaterials({ fields }) -> { surface, line }`: two `ShaderMaterial`s sharing a vertex shader that drifts each blob along `x` from its `centreX` attribute at its `drift` attribute speed, wrapping within ±12 m of the hall centre; `uTime` uniform. `Clouds` builds one `Group` per hall (one surface mesh, one line mesh) and `update(dt)` advances `uTime`.

- [ ] **Step 1: Add the cloud materials**

Append to `src/material.js`:

```js
const CLOUD_VERT = /* glsl */`
  attribute float drift, centreX;
  uniform float uTime;
  varying vec3 vN, vW;
  void main() {
    // Each blob drifts as a whole: its centre moves and wraps, every vertex follows the centre.
    float c = centreX + drift * uTime;
    float wrapped = mod(c + 12.0, 24.0) - 12.0;
    vec3 p = vec3(position.x - centreX + wrapped, position.y, position.z);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const CLOUD_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uFields; uniform float uLines;
  varying vec3 vN, vW;
  void main() {
    Mood m = moodFor(uFields);
    vec3 viewDir = normalize(cameraPosition - vW);
    float facing = abs(dot(normalize(vN), viewDir));
    vec3 pale = mix(m.haze, m.sky, 0.6);
    float a = uLines > 0.5 ? 0.25 : 0.35 * (0.5 + 0.5 * facing);
    vec3 colour = uLines > 0.5 ? mix(pale, vec3(1.0), 0.3) : pale;
    gl_FragColor = vec4(colour, a);
  }
`;
export function cloudMaterials({ fields = [0.5, 0, 0] } = {}) {
  const make = (lines) => new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    uniforms: { ...stopUniforms(), uFields: { value: v3(fields) }, uTime: { value: 0 }, uLines: { value: lines ? 1 : 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return { surface: make(false), line: make(true) };
}
```

- [ ] **Step 2: Rebuild `src/sky.js` around one group per hall**

```js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { primGeometry, primSolid, disposeGroup } from './build.js';
import { cloudMaterials } from './material.js';
import { sphere } from './shapes/ir.js';
import { stream } from './rng.js';
import { colorsFor } from './palette.js';
import { buildGroup } from './build.js';

const withDrift = (g, drift, centreX) => {
  const n = g.attributes.position.count;
  g.setAttribute('drift', new THREE.BufferAttribute(new Float32Array(n).fill(drift), 1));
  g.setAttribute('centreX', new THREE.BufferAttribute(new Float32Array(n).fill(centreX), 1));
  return g;
};

export class Clouds {
  constructor(scene, seedHash, look = 'shaded') { this.scene = scene; this.seedHash = seedHash; this.items = new Map(); this.shaded = look === 'shaded'; this.time = 0; }

  add(cell) {
    const { hall } = cell;
    if (hall.y !== 1 || this.items.has(cell)) return;
    const rng = stream(this.seedHash, hall.x, hall.y, hall.z, 'cloud');
    const n = Math.round(1 + 8 * hall.light), baseY = hall.floorY + hall.ceiling + 6;
    const blobs = [];
    for (let i = 0; i < n; i++) blobs.push({ r: rng.range(3, 6), x: rng.range(-12, 12), y: baseY + rng.range(2, 10), z: rng.range(-12, 12), speed: rng.range(0.2, 0.5) });
    if (!this.shaded) {
      // The lines look keeps v0's per-blob groups, moved in update().
      const color = colorsFor(hall.light).line, groups = blobs.map(b => {
        const g = buildGroup([sphere(b.r, [0, 0, 0])], { color, ghost: 0 });
        g.position.set(hall.cx + b.x, b.y, hall.cz + b.z); this.scene.add(g); return { g, speed: b.speed, cx: hall.cx };
      });
      this.items.set(cell, { groups });
      return;
    }
    const prims = blobs.map(b => sphere(b.r, [b.x, b.y, b.z]));
    const solids = prims.map((p, i) => withDrift(primSolid(p), blobs[i].speed, blobs[i].x));
    const lines = prims.map((p, i) => withDrift(primGeometry(p), blobs[i].speed, blobs[i].x));
    const mats = cloudMaterials({ fields: [hall.light, hall.water, hall.decay] });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(mergeGeometries(solids, false), mats.surface));
    group.add(new THREE.LineSegments(mergeGeometries(lines, false), mats.line));
    solids.forEach(g => g.dispose()); lines.forEach(g => g.dispose());
    group.position.set(hall.cx, 0, hall.cz);
    this.scene.add(group);
    this.items.set(cell, { group, mats });
  }

  remove(cell) {
    const it = this.items.get(cell);
    if (!it) return;
    if (it.groups) for (const { g } of it.groups) disposeGroup(g);
    if (it.group) disposeGroup(it.group);
    this.items.delete(cell);
  }

  update(dt) {
    this.time += dt;
    for (const it of this.items.values()) {
      if (it.mats) { it.mats.surface.uniforms.uTime.value = this.time; it.mats.line.uniforms.uTime.value = this.time; continue; }
      for (const b of it.groups) { b.g.position.x += b.speed * dt; if (b.g.position.x > b.cx + 12) b.g.position.x -= 24; }
    }
  }
}
```

The `withDrift` attributes are added before merging, so every geometry has the same attribute set (`position`, `normal` for solids; `position` for lines) plus `drift` and `centreX`. Lines from `primGeometry` have no `normal`; the cloud vertex shader reads `normal`, which three supplies as a zero default when the attribute is missing, so `vN` is zero and `facing` is `0` for lines: the line branch ignores it.

In `src/main.js`: `const clouds = new Clouds(scene, seedHash, frag.look);`.

- [ ] **Step 3: Walk to a stair hall and go up**

Open `#s=ravens&x=0&z=0&debug`, find a stair hall (they are commoner where `light > 0.7` or `water > 0.6`), climb to the hall above. Expected: soft pale translucent clouds with faint lines drifting slowly across the open sky, wrapping without a jump; two draw calls for all of them. Check `#...&look=lines` still shows the v0 wireframe blobs moving.

- [ ] **Step 4: Commit**

```bash
git add src/material.js src/sky.js src/main.js
git commit -m "feat: shaded clouds in one mesh per hall, drifting in the shader

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Phase C walk, numbers and the record

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-the-house-look-design.md` (status), `README.md` (one line on `look` and `debug`), `docs/superpowers/specs/2026-10-13-the-house-design.md` (§6 note already points here; no change unless numbers moved)

- [ ] **Step 1: The three-mood walk (spec "done when" 1)**

Open `#s=ravens&x=0&z=0&debug`. Walk from a bright quarter into a dark one and into the drowned halls. Expected: three distinct moods, no seam at any doorway, shafts and glows fogging with distance, mist in the water. Try two other seeds.

- [ ] **Step 2: The budget (spec "done when" 2)**

Record fps, calls, tris and worst build from the overlay standing in the busiest hall you can find (a colonnade stair hall with a pool nearby). All within budget, or cut column segments and shaft count as §7 says, and re-measure.

- [ ] **Step 3: The lines look (spec "done when" 3)**

Open `#s=ravens&x=0&z=0&look=lines`. Expected: v0 exactly: wireframe, ghost pass, palette colours, moving cloud blobs, line mirrors.

- [ ] **Step 4: Record**

Spec status line: `shipped <date>: phases A, B, C; <machine>: fps <n>, calls <n>, tris <n>k, worst build <n> ms`. README: under the existing controls or URL section add `look=lines` for the wireframe House and `debug` for the overlay.

```bash
git add docs/superpowers/specs/2026-10-13-the-house-look-design.md README.md
git commit -m "docs: look and atmosphere shipped; measured budget

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

---

## Self-review notes

- **Spec coverage.** §2 surfaces, lines, effects, `poly`, floors, ramps, thresholds, ghost pass, mirror winding: Tasks 1 to 4, 7, 12, 13. §3 four terms, surface colour, haze, per-vertex mood, line colour: Tasks 5, 7, 8. §4 `moodFor` and rules: Task 5. §5 windows and shafts in order, fog on effects: Tasks 11, 12. §6 water, mirrors, clouds: Tasks 13, 14; birds unchanged. §7 flags, overlay, budget, per-crossing builds: Tasks 6, 9, 10, 15. §8 every listed pure test exists: `poly.test`, `floors.test` (floors, thresholds, ramps, pool), `mood.test`, `windows.test`, `url.test`, `schedule.test`. §9 phases match task groups. §10 nothing out of scope is built.
- **Known deviation from the spec.** §2 says the effects mesh holds water and clouds too. Water needs a non-additive blend and clouds live over a different hall (`y = 1`), so each is its own mesh: a pool hall costs two more calls (fill, mirror), a cloud hall two. The Global Constraints line states this; the budget holds at 25 loaded halls because only a few are wet or cloud halls at once. Update the spec's §2 cost bullet in Task 15 if the measured call count makes it matter.
- **Type consistency.** `buildGroup(prims, { color, ghost, surface })` is used identically in `world.js`, `water.js`, `sky.js`, `gallery.js`. `surfaceMaterial({ keyDir, floorY, ceiling, side, dim })` matches its two call sites. `windowsFor` returns `{ wall, keyDir, windows, shafts }` and `buildEffects` reads `out.windows[].c/w/h/d/n` and `out.shafts[].from/to/w/strength`, as defined. `World` constructor `(scene, seedHash, fields, hooks, look)` matches `main.js`.
- **Review Focus mapping.** 1 → Task 11 test "6 m hall"; 2 → Task 2 test over 1000 cells, all five shapes; 3 → Task 11 fallback test; 4 → Task 9 `planLoads` tests and the `lastBuildMs` reading on a stair hall; 5 → Task 6 test (`look=foo`, `debug=0`).
