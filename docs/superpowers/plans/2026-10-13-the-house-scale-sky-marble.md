# The House — Scale, Sky and Marble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the House tall (18 to 40 m ceilings, 44 m storeys, doubled doorways, colossi), give every window and a few roofless courts a sky, and turn the stone into district marbles with Venetian inlaid floors, keeping the line work on top and 60 fps.

**Architecture:** The pure side changes constants in `hall.js`, `connectors.js` and `windows.js`, and grows three small pure modules: `statues/colossus.js` (one extra statue on the most open floor), `roof.js` (`isRoofless`, `overheadKey`) and `marble.js` (marble table, `marbleFor`, `isInlaid`, `footprintLocal`). The browser side grows `skydome.js` (a 150 m dome around the camera and the one GLSL sky function), a sky-portal material for window panes (one mesh per hall), marble veins plus floor patterns in the existing surface shader, and a flattened fog distance (horizontal plus a third of vertical) in the shared fog function; every shader keeps working in view space with hall-relative positions.

**Tech Stack:** Plain ES modules, Three.js `0.170.0` via the CDN import map (`ShaderMaterial`, `SphereGeometry`), `node --test` (Node 24). No bundler, no npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md` (amends `2026-10-13-the-house-look-design.md` §3 to §7 and §9, and the v0 spec's hall dimensions). Phase C of the look spec is not in this plan.

## Global Constraints

- Ceiling range goes from `6..14` m to `18..40` m. `long` halls draw from `18..26`, the other shapes from `18..40`. The draw is the same `rng.range` call in the same place, so the hall stream's order and every later draw are unchanged; only the value differs.
- `STOREY` goes from `12` to `44`. Stair halls keep `ceiling <= STOREY - 1`.
- `CELL` (24 m), shapes, half-extents, wall thickness, walking speed (2.8 m/s) and eye height are unchanged.
- Doorways: `arch` and `steps` go from 6 to 12 m, `door` and `vestibule` from 3 to 6 m. Widths are unchanged.
- Ordinary statues keep today's scale range and placement. A colossus is 10 to 15 m tall, placed **in addition to** the ordinary statues, never replacing one; if it does not fit, the hall has none.
- Windows keep their top within 1.5 m of the ceiling. Window height becomes about 30% of the ceiling height (so 5 to 12 m).
- The nominal key-light elevation range becomes 50 to 75 degrees below horizontal (was 40 to 60), still clamped so every shaft lands inside the hall and off the well.
- Fog far by light is unchanged: 18 m (chiaroscuro), about 31 m at dusk, 44 m luminous; `moodFor` is unchanged. The surface, effects and window-portal shaders measure fog distance as `d = length(off.xz) + abs(off.y) / 3` with `off` the camera-to-fragment offset in world orientation (view-space offset turned by the view rotation only, no world-scale positions). Height fog is unchanged. Lines and the water grid keep three's built-in distance fog. The camera's far plane stays at 200 m.
- Same seed, same House. No existing stream's draw order changes; the only new salts are `colossus`, `roof` and `marble`.
- One sky dome of radius 150 m centred on the camera every frame, drawn first (`renderOrder` below everything, depth write off, no fog), eased with the fields over about 1.5 s. The sun or moon sits opposite the current hall's key-light direction.
- Roofless: about 1 in 10 halls with `light > 0.66`; stair halls and vista halls never. No ceiling `poly`, no ceiling outline, no windows, no shafts; key light 70 to 80 degrees.
- `look=lines`: no dome and no portals; the v0 background stays.
- Marble: six marbles by `theme`; vein contrast fades to zero between 10 and 15 m; chequer squares about 1.2 m set diagonally; the footprint uniform holds up to 12 vertices; pattern edges antialiased with `fwidth`.
- Budget: 60 fps, at most 100 draw calls in view, about 600,000 triangles in view, at most 16 ms of hall building per frame. Four draw calls per hall with windows (lines, surfaces, effects, portals) plus one dome.
- Three.js pinned to `three@0.170.0` on jsdelivr. Pure modules under `src/` never import `three`: `roof.js`, `marble.js`, `statues/colossus.js` are pure; `skydome.js` is browser-only.
- Shader colours are raw sRGB, passed as `THREE.Vector3` uniforms (never `THREE.Color`, which linearises); only `scene.background` and fog go through `THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)`, as `main.js` does today.
- Commits: `git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit`, message ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A stair hall with an 18 m ceiling under a 44 m storey**: 26 m of open well between the ceiling hole and the floor above. Looking up it must be a closed shaft, not a slot onto the void between storeys. Pinned in Task 2.
2. **The lowest ceiling over the tallest arch** (an 18 m square hall with 12 m arches): a window 30% of the ceiling tall reaches below the arch head, so it must still sit beside the opening, not over it. Pinned in Task 4.
3. **A colossus in a stair hall or a crowded hall**: it must stand clear of the well, the doorway zones, the walls and every ordinary statue, shrinking toward 10 m to fit, or not appear at all. Pinned in Task 3.
4. **A bright stair hall, or a bright vista hall above or below a well**: never roofless, or the well's shaft opens onto the sky and the vista halls disagree with the hall they belong to. Pinned in Task 6.
5. **A cross hall's footprint**: exactly 12 vertices, the shader uniform's cap; every footprint must fit and be hall-relative, or the bands pattern draws a wrong outline. Pinned in Task 10.

## File map

```
src/
  hall.js                ceiling ranges, STOREY 44                                          (pure)
  connectors.js          doorway heights 12 / 6                                             (pure)
  shapes/stairwell.js    shaft walls to the floor above, lining above the ceiling           (pure)
  shapes/index.js        opts.roofless builds without ceiling                               (pure)
  statues/place.js       export doorZones, fitter(hall, solids, placed)                     (pure)
  statues/colossus.js    COLOSSUS, openestPoint, placeColossus                              (pure, new)
  windows.js             HEIGHT_SHARE, ELEVATION; roofless halls return no windows          (pure)
  roof.js                ROOF, isRoofless, overheadKey                                      (pure, new)
  marble.js              MARBLES, MARBLE_ORDER, THEME_CUTS, PATTERNS, districtTheme, marbleFor,
                         isInlaid, footprintLocal                                           (pure, new)
  skydome.js             SKY_UNIFORMS, SKY_GLSL, SkyDome                                    (browser, new)
  material.js            flattened fog distance; portalMaterial; marble veins, inlaid
                         floors, KIND.floor                                                 (browser)
  effects.js             buildPortals                                                       (browser)
  build.js               kindOf knows floors                                                (browser)
  world.js               colossus, roofless, portals, keyDirAt, marble uniforms             (browser)
  main.js                the dome, eased sun                                                (browser)
test/
  colossus.test.mjs  roof.test.mjs  marble.test.mjs                                         (new)
  hall, connectors, stairwell, floors, windows .test.mjs                                    (updated)
```

Phase S1 is Tasks 1 to 5, S2 is Tasks 6 to 9, S3 is Tasks 10 to 13. Alex walks each phase before the next starts (spec §8).

**Current-code facts this plan relies on** (the look plan predates some of them): the surface shader works in view space (`modelViewMatrix`, `vH = position.y` is the height above the hall floor; vertices are hall-local, the group sits at `(cx, floorY, cz)`; no world-space float32); surfaces are `DoubleSide`; stair-hall vista halls are queued as `{ x, y, z, opts }` and built by `World.tick()`; the effects material uses `premultipliedAlpha` and `forceSinglePass`; `windowsFor` exports `PATCH` and steepens the key light to the steepest keyed shaft (the D5 clamp), so the final elevation is never below the nominal draw.

**Serving for walks:** `npm run serve`, then `http://localhost:8080/#s=ravens&x=<x>&z=<z>&debug`. Coordinates below are for seed `ravens`, computed from the code as this plan leaves it.

---

## Phase S1: scale

### Task 1: Taller ceilings, 44 m storeys, doubled doorways

**Files:**
- Modify: `src/hall.js:4` (`STOREY`), `src/hall.js:44` (ceiling draw)
- Modify: `src/connectors.js:4-9` (`TYPES` heights)
- Test: `test/hall.test.mjs:5`, `:34`, `:44`, plus two new tests; `test/connectors.test.mjs` (new test); `test/stairwell.test.mjs:5`, `:32`, `:66`; `test/floors.test.mjs:5`, `:45`, `:48`

Existing tests that encode the old dimensions, all updated here, none deleted:
- `test/hall.test.mjs:34` ceiling `6..14`; `:44` `below.floorY` `-12`.
- `test/stairwell.test.mjs:32` vista `floorY: -12`; `:66` `hall.ceiling <= 11`.
- `test/floors.test.mjs:45` `floorY: 12`; `:48` `floorY: -12`.
- `test/palette.test.mjs:14-16` (fog 18 to 44 m) is the `look=lines` fog and stays as it is.

**Interfaces:**
- Produces: `STOREY === 44`; `hall.ceiling` in `18..26` for `long`, `18..40` otherwise; `TYPES.arch.height === 12`, `steps 12`, `door 6`, `vestibule 6`.

- [ ] **Step 1: Write the failing tests**

In `test/hall.test.mjs`, change the import on line 5:

```js
import { hallParams, cellOf, depthFor, CELL, SHAPES, STOREY, spawnPoint } from '../src/hall.js';
```

line 34:

```js
    assert.ok(a.ceiling >= 18 && a.ceiling <= (a.shape === 'long' ? 26 : 40), `${a.shape} ceiling ${a.ceiling}`);
```

line 44:

```js
  assert.equal(below.floorY, -STOREY);
```

and append:

```js
test('STOREY is 44 and every ceiling, stair halls included, fits under the floor above', () => {
  assert.equal(STOREY, 44);
  let tall = 0, long = 0;
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const h = hallParams(seed, x, 0, z, fields);
    assert.ok(h.ceiling <= STOREY - 1);
    if (h.shape === 'long') { long++; assert.ok(h.ceiling <= 26); }
    else if (h.ceiling > 28) tall++;
  }
  assert.ok(long > 100 && tall > 200, `long ${long}, tall ${tall}`);
});

test('the taller ceilings leave every other output of the hall stream as it was', () => {
  // Fingerprint of everything hallParams returns except ceiling and floorY (which follow from the
  // ceiling range and STOREY), over 1000 cells on three storeys, taken from the code before the
  // change. A different hash means a draw moved in the hall stream.
  const KEYS = ['x', 'y', 'z', 'shape', 'hx', 'hz', 'wall', 'water', 'light', 'decay', 'theme', 'depth', 'pool', 'isStair', 'hasBirds', 'cx', 'cz'];
  const rows = [];
  for (let i = 0; i < 1000; i++) {
    const x = (i * 7919) % 201 - 100, z = (i * 104729) % 201 - 100, y = (i % 3) - 1;
    const h = hallParams(seed, x, y, z, fields);
    rows.push(KEYS.map(k => h[k]));
  }
  assert.equal(fnv1a(JSON.stringify(rows)).toString(16), '74b8ebac');
});
```

(`74b8ebac` was computed from the code at commit `c72edf5`; it passes before and after this task, and guards every later task.)

Append to `test/connectors.test.mjs`:

```js
test('every doorway, plus a 1 m lintel, fits under the ceilings of both halls it joins', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.height])), { arch: 12, door: 6, vestibule: 6, steps: 12 });
  for (let i = 0; i < 1000; i++) {
    const x = (i * 31) % 101 - 50, z = (i * 17) % 101 - 50;
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const a = H(x, z), b = H(x + dx, z + dz), c = connectorParams(seed, a, b);
      assert.ok(c.height + 1 <= Math.min(a.ceiling, b.ceiling), `${c.type} ${c.height} m under ${a.ceiling.toFixed(1)} / ${b.ceiling.toFixed(1)} m`);
    }
  }
});
```

In `test/stairwell.test.mjs` line 5:

```js
import { hallParams, STOREY } from '../src/hall.js';
```

line 32:

```js
    const vista = buildHall({ ...hall, y: -1, floorY: -STOREY }, conns, { vista: true, ceiling: false });
```

line 66:

```js
    assert.ok(hall.ceiling <= STOREY - 1, `stair hall ceiling ${hall.ceiling}`);
```

In `test/floors.test.mjs` line 5:

```js
import { hallParams, STOREY } from '../src/hall.js';
```

line 45:

```js
    const above = buildHall({ ...hall, y: 1, floorY: STOREY }, conns, { vista: true, ceiling: false, floorHole: true });
```

line 48:

```js
    const below = buildHall({ ...hall, y: -1, floorY: -STOREY }, conns, { vista: true, ceiling: false });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/hall.test.mjs test/connectors.test.mjs`
Expected: FAIL in `hallParams is deterministic...` (`long ceiling 9.8...`-style message), `STOREY is 44...` (`12 !== 44`), `storeys offset floorY...`, and the doorway test (`{ arch: 6, ... }` vs `{ arch: 12, ... }`). The fingerprint test passes.

- [ ] **Step 3: Change the constants**

`src/hall.js` line 4:

```js
export const STOREY = 44;
```

`src/hall.js` line 44:

```js
  // One draw in the same place as before, so every later draw in this stream is unchanged.
  let ceiling = shape === 'long' ? rng.range(18, 26) : rng.range(18, 40);
```

`src/connectors.js` lines 4 to 9:

```js
export const TYPES = {
  arch:      { width: 4,   height: 12, raise: 0,   room: 0 },
  door:      { width: 1.6, height: 6,  raise: 0,   room: 0 },
  vestibule: { width: 1.6, height: 6,  raise: 0,   room: 6 },
  steps:     { width: 4,   height: 12, raise: 0.4, room: 0 },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 82 passing, 0 failing (79 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/hall.js src/connectors.js test/hall.test.mjs test/connectors.test.mjs test/stairwell.test.mjs test/floors.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: 18 to 40 m ceilings, 44 m storeys, doorways twice as tall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The stairwell becomes a shaft

The shaft walls today are `12 + drop` tall: they ran from the lower landing to the floor above when a storey was 12 m. With 44 m storeys they stop in mid-air, and above the stair hall's ceiling the well's ends and the 1.5 m side entrances open onto the void between storeys. The walls rise to `STOREY` again, and four lining boxes close the well from the ceiling to the floor above (drawn, not collided with: they are out of reach).

**Files:**
- Modify: `src/shapes/stairwell.js:1-2` (import), `:17-21` (shaft walls)
- Test: `test/stairwell.test.mjs` (new test); `test/floors.test.mjs:73` (the bare stairwell hall gains a ceiling)

**Interfaces:**
- Consumes: `STOREY` from Task 1.
- Produces: `buildStairwell(hall)` reads `hall.ceiling`; four prims named `'lining'`.

- [ ] **Step 1: Write the failing test**

Append to `test/stairwell.test.mjs`:

```js
test('above the ceiling of a stair hall the well is a closed shaft up to the floor above', () => {
  let checked = 0;
  for (let i = 0; i < 3000 && checked < 20; i++) {
    const x = (i * 31) % 201 - 100, z = (i * 17) % 201 - 100;
    const hall = hallParams(seed, x, 0, z, fields);
    if (!hall.isStair) continue;
    checked++;
    const b = buildHall(hall, connsFor(seed, hall, fields));
    const { cx, cz } = hall, { hx, hz, wallT } = WELL;
    const lining = b.prims.filter(p => p.name === 'lining');
    assert.equal(lining.length, 4);
    const solidAt = (px, py, pz) => [...lining, ...b.prims.filter(p => p.kind === 'box')].some(p => Math.abs(px - p.pos[0]) < p.size[0] / 2 && Math.abs(py - p.pos[1]) < p.size[1] / 2 && Math.abs(pz - p.pos[2]) < p.size[2] / 2);
    for (const y of [hall.ceiling + 0.5, (hall.ceiling + STOREY) / 2, STOREY - 0.5]) {
      for (const [px, pz] of [[cx + hx + wallT / 2, cz], [cx - hx - wallT / 2, cz], [cx, cz + hz + wallT / 2], [cx, cz - hz - wallT / 2], [cx + hx + wallT / 2, cz + 3], [cx - hx - wallT / 2, cz - 3]]) {
        assert.ok(solidAt(px, y, pz), `${hall.shape} shaft open at (${px - cx}, ${y.toFixed(1)}, ${pz - cz})`);
      }
    }
    for (const p of lining) assert.ok(p.pos[1] - p.size[1] / 2 >= hall.ceiling - 1e-9 && p.pos[1] + p.size[1] / 2 <= STOREY + 1e-9);
    assert.ok(!b.boxes.some(q => q.min[1] >= hall.ceiling - 1e-9), 'lining collides');
  }
  assert.ok(checked >= 10);
});
```

In `test/floors.test.mjs` line 73:

```js
  const hall = { cx: 0, cz: 0, floorY: 0, ceiling: 18 };
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/stairwell.test.mjs`
Expected: FAIL in the new test, `0 !== 4`.

- [ ] **Step 3: Raise the shaft walls and line the well**

`src/shapes/stairwell.js`, after the `floorPatch` import:

```js
import { STOREY } from '../hall.js';
```

Replace the shaft-wall loop (lines 19 to 21) with:

```js
  // They rise from the lower landing to the floor above, as they did when a storey was 12 m.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    solid([wallT, STOREY + drop, segLen], [cx + sx * (hx + wallT / 2), f - drop + (STOREY + drop) / 2, cz + sz * (gap + segLen / 2)]);
  }
  // Above the ceiling the well is a closed shaft up to the floor above: the gaps in the side walls
  // and both open ends are lined there. Out of reach, so drawn but not collided with.
  const top = f + hall.ceiling, lh = STOREY - hall.ceiling;
  if (lh > 0.01) {
    for (const sx of [-1, 1]) prims.push(box([wallT, lh, 2 * gap], [cx + sx * (hx + wallT / 2), top + lh / 2, cz], [0, 0, 0], 'lining'));
    for (const sz of [-1, 1]) prims.push(box([2 * hx + 2 * wallT, lh, wallT], [cx, top + lh / 2, cz + sz * (hz + wallT / 2)], [0, 0, 0], 'lining'));
  }
```

`hall.js` imports only `rng.js`, so `stairwell.js` importing `hall.js` makes no cycle (`shapes/index.js` already does).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 83 passing.

- [ ] **Step 5: Commit**

```bash
git add src/shapes/stairwell.js test/stairwell.test.mjs test/floors.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: the stairwell is a closed shaft from the landing to the floor above

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Colossi

A colossus is a figure 10 to 15 m tall on the hall's most open floor, in about one hall in four taller than 28 m. Measured before writing this plan: the ordinary statues crowd the floor (median clearance about 2.2 m, a 12.5 m figure's half-footprint is 2.2 to 3.4 m), so about half of the halls that roll a colossus cannot fit one even after it shrinks toward 10 m. The roll is therefore one in two, which lands one in four tall halls with a colossus (0.24, 0.24 and 0.25 over three seeds). The spec's outcome, "about one case in four", is what the test pins.

Statue height is linear in `scale` (body and `0.5 * scale` plinth both scale), so the colossus is built once at scale 1, measured, and scaled to the drawn height. Only upright figure poses (not `lying`: 10 m tall on a bier would be 40 m long). It is never fallen. Its facing is one of four from the stream, so its turned collision boxes stay tight.

**Files:**
- Modify: `src/statues/place.js:59-60` (export `doorZones`), `:73-79` (extract `fitter`), `:85` (`out` moves up)
- Create: `src/statues/colossus.js`
- Modify: `src/world.js` (imports, `ensure`)
- Test: `test/colossus.test.mjs`

**Interfaces:**
- Produces: in `place.js`: `export function doorZones(hall) -> [{ x0, x1, z0, z1 }]`, `export function fitter(hall, solids, placed) -> (boxes) => boolean` (reads `placed` when called).
- Produces: in `colossus.js`: `COLOSSUS = { minCeiling: 28, chance: 0.5, height: [10, 15], step: 0.5 }`, `openestPoint(hall, solids, statues) -> { x, z, clear } | null`, `placeColossus(seedHash, hall, solids, statues) -> statue | null` where the statue has the fields of a `placeStatues` record (`slot, family, subject, pose, plinth, variant, scale, damage, prims, boxes`) plus `colossus: true`, and `slot.kind === 'colossus'`.

- [ ] **Step 1: Write the failing tests**

```js
// test/colossus.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams, pointInPolygon } from '../src/hall.js';
import { connsFor } from '../src/connectors.js';
import { buildHall } from '../src/shapes/index.js';
import { placeStatues, doorZones } from '../src/statues/place.js';
import { placeColossus, COLOSSUS } from '../src/statues/colossus.js';
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
  for (let x = -20; x < 20; x++) for (let z = -20; z < 20; z++) {
    const { hall, built, statues } = hallAt(seed, fields, x, z);
    const c = placeColossus(seed, hall, built.boxes, statues);
    if (!c) continue;
    n++;
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
        stairs++;
        const { cx, cz } = hall;
        assert.ok(b.max[0] <= cx - WELL.hx || b.min[0] >= cx + WELL.hx || b.max[2] <= cz - WELL.hz || b.min[2] >= cz + WELL.hz, 'colossus stands in the stairwell');
      }
    }
  }
  assert.ok(n >= 60, `only ${n} colossi`);
  assert.ok(stairs >= 1, 'no stair hall colossus checked');
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
```

(`5f81ebd0` was computed from the code at `c72edf5`; Tasks 1 and 2 leave it unchanged.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/colossus.test.mjs`
Expected: FAIL, `Cannot find module '.../src/statues/colossus.js'`.

- [ ] **Step 3: Export the fit check from `place.js`**

Line 60, `function doorZones(` becomes:

```js
export function doorZones({ cx, cz, hx, hz, wall }) {
```

Replace lines 73 to 79 (the `solids` comment through the `fits` arrow) with:

```js
// The fit check every statue passes: clear of the doorway zones, inside the hall's box, and off
// the hall's solids and every statue in `placed` (read when called, so it may still be growing).
export function fitter(hall, solids, placed) {
  const zones = doorZones(hall);
  const { cx, cz, hx, hz } = hall;
  return (boxes) => !blocksDoor(boxes, zones)
    && boxes.every(b => b.min[0] >= cx - hx && b.max[0] <= cx + hx && b.min[2] >= cz - hz && b.max[2] <= cz + hz)
    && !boxes.some(b => solids.some(w => overlaps(b, w)) || placed.some(s => s.boxes.some(o => overlaps(b, o))));
}

// solids: the hall's own collision boxes (walls, columns, stairwell), which no statue may enter.
export function placeStatues(seedHash, hall, slots, solids = []) {
  const out = [], fits = fitter(hall, solids, out);
```

and line 85, `const used = new Set(), out = [];`, becomes:

```js
  const used = new Set();
```

- [ ] **Step 4: Write `src/statues/colossus.js`**

```js
// Colossi: in about one hall in four taller than 28 m, a figure 10 to 15 m tall stands on the most
// open stretch of floor. Its own stream (salt `colossus`), placed after the ordinary statues and
// around them, so the ordinary statues never change. Pure.
import { stream } from '../rng.js';
import { pointInPolygon } from '../hall.js';
import { POSES } from './poses.js';
import { rollDamage } from './damage.js';
import { buildStatue, fitter, doorZones } from './place.js';
import { boundsOf, translatePrims, translateBoxes, rotateYPrims, rotateYBoxes } from '../shapes/ir.js';
import { footprint } from '../shapes/footprint.js';
import { WELL } from '../shapes/stairwell.js';

// chance is the roll; about half the rolls fail to fit, so about a quarter of tall halls have one.
export const COLOSSUS = { minCeiling: 28, chance: 0.5, height: [10, 15], step: 0.5 };
// Upright poses only: a lying figure scaled to 10 m tall would be 40 m long.
const UPRIGHT = Object.keys(POSES).filter(p => !POSES[p].lie);
const FACINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// Chebyshev distance in xz from (x, z) to an axis-aligned rect { x0, x1, z0, z1 }; 0 inside it.
// A square of half-size r centred at (x, z) clears the rect exactly when this is at least r.
const rectDist = (x, z, r) => Math.max(r.x0 - x, 0, x - r.x1, r.z0 - z, z - r.z1);
// Distance from (x, z) to the segment from a to b.
function segDist(x, z, [ax, az], [bx, bz]) {
  const ex = bx - ax, ez = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
  return Math.hypot(x - ax - ex * t, z - az - ez * t);
}

// The point of the floor farthest from everything a colossus must clear: the footprint's edges, the
// hall's solids, the statues already placed, the doorway zones and the stairwell. Scanned on a
// 0.5 m grid from the hall's north-west corner; the first best point wins, so it is deterministic.
export function openestPoint(hall, solids, statues) {
  const poly = footprint(hall), { cx, cz, hx, hz } = hall;
  const rects = [
    ...[...solids, ...statues.flatMap(s => s.boxes)].map(b => ({ x0: b.min[0], x1: b.max[0], z0: b.min[2], z1: b.max[2] })),
    ...doorZones(hall),
  ];
  if (hall.isStair) rects.push({ x0: cx - WELL.hx - WELL.wallT, x1: cx + WELL.hx + WELL.wallT, z0: cz - WELL.hz - 0.3, z1: cz + WELL.hz + 0.3 });
  let best = null;
  for (let x = cx - hx; x <= cx + hx + 1e-9; x += COLOSSUS.step) for (let z = cz - hz; z <= cz + hz + 1e-9; z += COLOSSUS.step) {
    if (!pointInPolygon([x, z], poly)) continue;
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
    for (const r of rects) d = Math.min(d, rectDist(x, z, r));
    if (!best || d > best.clear + 1e-9) best = { x, z, clear: d };
  }
  return best;
}

// solids: the hall's collision boxes; statues: the ordinary statues already placed. Returns one
// statue shaped like placeStatues' records (slot, family, subject, pose, plinth, variant, scale,
// damage, prims, boxes) plus `colossus: true`, or null.
export function placeColossus(seedHash, hall, solids, statues) {
  if (hall.ceiling <= COLOSSUS.minCeiling) return null;
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'colossus');
  if (!rng.chance(COLOSSUS.chance)) return null;
  const pose = rng.pick(UPRIGHT);
  const inst = { family: 'figure', subject: pose, pose, plinth: rng.pick(['box', 'stepped', 'drum']), variant: Math.floor(rng.next() * 2 ** 32) };
  const height = rng.range(...COLOSSUS.height);
  const facing = rng.pick(FACINGS);
  // A colossus may be worn, but never lies fallen: lying down it would not fit the hall.
  const damage = { ...rollDamage(rng, hall.decay), fallen: false };
  const spot = openestPoint(hall, solids, statues);
  if (!spot) return null;
  // Statue height is linear in scale (body and plinth both scale), so measure once at scale 1.
  const unit = boundsOf(buildStatue(inst, 1, damage).prims), unitH = unit.max[1] - unit.min[1];
  const poly = footprint(hall), fits = fitter(hall, solids, statues);
  const inside = (boxes) => boxes.every(b => [[b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]]].every(c => pointInPolygon(c, poly)));
  // The drawn height if it fits the open spot, else 5% shorter at a time, down to 10 m. No draws.
  for (let h = height; ; h = Math.max(COLOSSUS.height[0], h * 0.95)) {
    const scale = h / unitH, built = buildStatue(inst, scale, damage);
    const boxes = translateBoxes(rotateYBoxes(built.boxes, facing), spot.x, hall.floorY, spot.z);
    if (inside(boxes) && fits(boxes)) {
      return {
        slot: { x: spot.x, z: spot.z, facing, maxScale: scale, kind: 'colossus' },
        ...inst, scale, damage, colossus: true,
        prims: translatePrims(rotateYPrims(built.prims, facing), spot.x, hall.floorY, spot.z),
        boxes,
      };
    }
    if (h === COLOSSUS.height[0]) return null;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/colossus.test.mjs`
Expected: 3 passing in under 2 s.

Run: `npm test`
Expected: 86 passing.

- [ ] **Step 6: Put the colossus in the world**

`src/world.js`, after the `placeStatues` import:

```js
import { placeColossus } from './statues/colossus.js';
```

In `ensure`, after `const statues = placeStatues(this.seedHash, hall, built.slots, built.boxes);`:

```js
    // A colossus goes in after the ordinary statues and around them; null in most halls.
    const giant = placeColossus(this.seedHash, hall, built.boxes, statues);
    if (giant) statues.push(giant);
```

It then flows through the existing loop into prims (tagged `statue`, so kind 1 in the shader) and collision boxes, into `windowsFor` (a chiaroscuro shaft may aim at it), and into `cell.statues` (a colossus standing in a pool is mirrored).

- [ ] **Step 7: Check it in the browser**

`npm run serve`, open `http://localhost:8080/#s=ravens&x=2&z=2&debug` (a 38 m cross hall with a 10.6 m colossus) and `#s=ravens&x=-3&z=2&debug` (33 m cross, 13.2 m). Expected: one figure far taller than the 12 m-high arches is near enough to walk round, shaded like the other statues, and solid (you cannot walk into its plinth). The console is clean.

- [ ] **Step 8: Commit**

```bash
git add src/statues/place.js src/statues/colossus.js src/world.js test/colossus.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: colossi, 10 to 15 m, in about a quarter of the tall halls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Window height, key-light elevation and the fog distance measure

Fog far stays at 18 / 31 / 44 m (the loaded ring reaches 48 m, so nothing unloaded may show at the horizon). What changes is the distance the shaders fog by: the horizontal distance plus a third of the vertical, so a 40 m vault overhead fogs like something 13 m away and stays visible while the horizon fogs exactly as before. `moodFor` and its tests do not change.

**Files:**
- Modify: `src/windows.js:11` (new exports), `:98` (window height draw), `:120` (fallback height), `:127-128` (elevation)
- Modify: `src/material.js:46-51` (`fogAmount` in `MOOD_GLSL`), `:100-101` (surface fog lines), `:144` (effects fog call)
- Test: `test/windows.test.mjs:11` (import), `:78-91` (D3, rewritten for the new dimensions), plus one new test

Existing tests that encode the old dimensions, updated here: `test/windows.test.mjs:78-91` (a 6 m hall under 6 m arches; the lowest ceiling is now 18 m and the tallest arch 12 m). Every other phase B window test (`:37`, `:64`, `:93`, `:116`, `:139`, `:154`, `:175`) runs unchanged at the new dimensions. `test/mood.test.mjs` and `test/palette.test.mjs` are untouched (fog far is unchanged).

**Interfaces:**
- Produces: `HEIGHT_SHARE = [0.27, 0.33]`, `ELEVATION = [50, 75]` exported from `windows.js`. The draws keep their places in the `windows` stream; only their bounds change.
- Produces: GLSL `float fogAmount(Mood m, vec3 view, float h)` in `MOOD_GLSL`, where `view` is the fragment's view-space position (it was a distance). Tasks 8, 11 and 12 call it as `fogAmount(m, vV, h)`.

- [ ] **Step 1: Write the failing tests**

`test/windows.test.mjs` line 11:

```js
import { footprintEdges, windowsFor, moodBand, PATCH, HEIGHT_SHARE, ELEVATION } from '../src/windows.js';
```

Replace the test at lines 78 to 91 with these two:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/windows.test.mjs`
Expected: FAIL; `windows.test.mjs` cannot import `ELEVATION` (`does not provide an export named 'ELEVATION'`).

- [ ] **Step 3: Change the draws**

`src/windows.js`, after line 11 (`const EDGE = 0.3, ...`):

```js
// Window height as a share of the ceiling, and the nominal key-light elevation in degrees.
export const HEIGHT_SHARE = [0.27, 0.33];
export const ELEVATION = [50, 75];
```

Line 98:

```js
      const h = hall.ceiling * rng.range(...HEIGHT_SHARE), w = rng.range(0.8, 2.0);
```

Line 120 (the evenly spaced fallback):

```js
    const h = hall.ceiling * 0.3, cy = top - 0.75 - h / 2;
```

Lines 127 and 128:

```js
  // Key light: along the wall's inward normal with a small jitter, nominally 50 to 75 degrees down.
  const jitter = rng.range(-8, 8) * DEG, elev0 = rng.range(...ELEVATION) * DEG;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 87 passing.

- [ ] **Step 5: Fog by a flattened distance**

`src/material.js`, replace `fogAmount` in `MOOD_GLSL` (lines 46 to 51) with:

```js
  // Distance fog from 2 m to fogFar, plus height fog in the bottom 3 m that needs some distance to
  // build. view: the fragment's view-space position. Distance fog measures the horizontal distance
  // plus a third of the vertical, so a 40 m vault stays visible while the horizon fogs as before;
  // the offset is turned to world orientation by the view rotation alone (a row-vector product is
  // the transpose), so no world position is formed. Height fog keeps the true distance.
  float fogAmount(Mood m, vec3 view, float h) {
    vec3 off = (vec4(view, 0.0) * viewMatrix).xyz;
    float dist = length(view), flatDist = length(off.xz) + abs(off.y) / 3.0;
    float distFog = clamp((flatDist - 2.0) / (m.fogFar - 2.0), 0.0, 1.0);
    float heightFog = m.heightFog * clamp(1.0 - h / 3.0, 0.0, 1.0) * clamp(dist / 8.0, 0.0, 1.0);
    return max(distFog, heightFog);
  }
```

(`flat` would be a GLSL ES 3.00 keyword, hence `flatDist`. Three declares `viewMatrix` in every `ShaderMaterial` fragment prefix; `MOOD_GLSL` is only ever included in fragment shaders.)

Lines 100 and 101 in `SURFACE_FRAG` (`float dist = length(vV);` and the fog mix) become one:

```js
    color = mix(color, m.haze, fogAmount(m, vV, h));
```

Line 144, in `EFFECTS_FRAG`:

```js
    float a = vAlpha * edge * (1.0 - fogAmount(m, vV, vH));
```

Lines, the water grid and birds still use `scene.fog` (true distance), so high line work fades a little sooner than the stone it is drawn on; that is intended.

- [ ] **Step 6: Check it by walking**

`npm test` (expected: 87 passing). Open `#s=ravens&x=2&z=2&debug` (38 m ceiling) in a bright quarter and look up: the vault and the top of the colossus are clearly visible, not lost in haze; the ceiling lines fade a little before the stone. Look along a row of halls toward the edge of the loaded block: the far halls are fully fogged by about 44 m, and walking a few cells shows no hall popping in at the horizon. In a dark hall (`x=-8&z=0` and west) the vault is still dark, as chiaroscuro wants (fog far 18 m: a 40 m vault fogs at about 13 m, nearly gone). Console clean.

- [ ] **Step 7: Commit**

```bash
git add src/windows.js src/material.js test/windows.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: windows 30% of the ceiling, key light 50 to 75 degrees, fog measured flat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phase S1 walk

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md` (Status line)

- [ ] **Step 1: Walk the scale**

Alex opens `http://localhost:8080/#s=ravens&x=0&z=0&debug` (a 19.8 m cross hall). Expected: the ceiling is overhead enough that you look up to find it; doorways are tall and narrow. Walk to `x=2&z=2` and `x=-3&z=2`: colossi taller than the arches beside them. Walk to the stair halls at `x=-1&z=-1` (20 m ceiling) and `x=-2&z=1`: stand on the upper landing and look up, a closed shaft to the hall above; look down from the hall above (walk up), a deep shaft. Windows are tall slits near the ceiling; shafts land inside the hall. In a bright quarter, look up in a 35 to 40 m hall: the vault is visible through the haze; look level along a row of halls: no hall pops in at the edge of the 5x5 loaded block (48 m away).

- [ ] **Step 2: Check the budget and record**

With `?debug`, stand in the busiest tall hall you find. Expected: fps 60, calls under 100, tris under 600k, worst build under 16 ms. Update the spec's **Status** line to `S1 shipped <date>: fps <n>, calls <n>, tris <n>k, worst build <n> ms on <machine>; vault visible overhead: <yes | no>; pop-in at the horizon: <none | seen>`.

```bash
git add docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "docs: phase S1 walked; measured budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Phase S2: sky

### Task 6: Roofless halls

A roofless hall is built as if seen from below: `opts.ceiling = false` drops the ceiling poly and outline in every shape builder already. The walls keep their full height, and their box edges are the top edge line, so nothing new is drawn. `hallParams` is not touched (its fingerprint in Task 1 stays); the world asks `isRoofless` and passes `opts.roofless`.

**Files:**
- Create: `src/roof.js`
- Modify: `src/shapes/index.js:13` (first line of `buildHall`), `src/windows.js` (import, top of `windowsFor`), `src/world.js` (import, `buildHall` call)
- Test: `test/roof.test.mjs`; `test/windows.test.mjs:41-42` (the count test skips roofless halls, which have none)

**Interfaces:**
- Produces: `ROOF = { light: 0.66, chance: 0.1, elevation: [70, 80] }`, `isRoofless(seedHash, hall) -> boolean`, `overheadKey(seedHash, hall) -> [x, y, z]` (unit, the way the light travels, `y < 0`).
- Produces: `buildHall(hall, conns, { roofless: true })`; `windowsFor` returns `{ wall: null, keyDir: overheadKey(...), windows: [], shafts: [] }` for a roofless hall.

- [ ] **Step 1: Write the failing tests**

```js
// test/roof.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
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
```

In `test/windows.test.mjs`, after the `windows.js` import:

```js
import { isRoofless } from '../src/roof.js';
```

and in the count test (line 41, after `const { hall, conns, statues } = build(x, z);`):

```js
    // A roofless hall has no windows at all; roof.test.mjs covers it.
    if (isRoofless(seed, hall)) continue;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/roof.test.mjs test/windows.test.mjs`
Expected: FAIL, `Cannot find module '.../src/roof.js'`.

- [ ] **Step 3: Write `src/roof.js`**

```js
// Roofless halls: about one in ten of the bright halls stands open to the sky. Pure, one stream
// (salt `roof`), so shapes, windows and the world all ask the same question and get one answer.
import { stream } from './rng.js';

export const ROOF = { light: 0.66, chance: 0.1, elevation: [70, 80] };
const DEG = Math.PI / 180;

// Never a stair hall (its ceiling holds the well's shaft) and never a vista hall (y != 0, only
// seen through a well).
export function isRoofless(seedHash, hall) {
  if (hall.y !== 0 || hall.isStair || !(hall.light > ROOF.light)) return false;
  return stream(seedHash, hall.x, hall.y, hall.z, 'roof').chance(ROOF.chance);
}

// The key light of a roofless hall: almost straight down, 70 to 80 degrees below horizontal, from
// an azimuth drawn after the roofless draw in the same stream. Unit vector, the way light travels.
export function overheadKey(seedHash, hall) {
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'roof');
  rng.next();
  const elev = rng.range(...ROOF.elevation) * DEG, az = rng.range(0, 2 * Math.PI);
  return [Math.cos(az) * Math.cos(elev), -Math.sin(elev), Math.sin(az) * Math.cos(elev)];
}
```

- [ ] **Step 4: Teach `buildHall` and `windowsFor`**

`src/shapes/index.js`, first lines of `buildHall` (line 13):

```js
export function buildHall(hall, conns, opts = {}) {
  // A roofless hall is built like one seen from below: no ceiling poly and no ceiling outline. Its
  // walls keep their full height, so their own box edges are the line along the top.
  if (opts.roofless) opts = { ...opts, ceiling: false };
```

`src/windows.js`, after the `WELL` import:

```js
import { isRoofless, overheadKey } from './roof.js';
```

and the first line inside `windowsFor`, before the stream is made:

```js
  // Open to the sky: no window wall, no windows, no shafts, and the key light from nearly overhead.
  if (isRoofless(seedHash, hall)) return { wall: null, keyDir: overheadKey(seedHash, hall), windows: [], shafts: [] };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: 91 passing.

- [ ] **Step 6: Build roofless halls in the world**

`src/world.js`, after the `placeStatues` import:

```js
import { isRoofless } from './roof.js';
```

and in `ensure`:

```js
    const built = buildHall(hall, conns, isRoofless(this.seedHash, hall) ? { ...opts, roofless: true } : opts);
```

`buildEffects` already returns `null` for a hall with no windows. This applies in both looks: in `look=lines` a roofless hall simply has no ceiling lines.

- [ ] **Step 7: Check it in the browser**

Open `#s=ravens&x=-3&z=5&debug` (roofless square) and `#s=ravens&x=3&z=5&look=lines` (roofless octagon). Expected: no ceiling, walls ending in their top edges against the background; in the lines look, no ceiling outline. Before Task 7 the open top shows the haze background; that is expected.

- [ ] **Step 8: Commit**

```bash
git add src/roof.js src/shapes/index.js src/windows.js src/world.js test/roof.test.mjs test/windows.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: roofless halls, one bright hall in ten, lit from overhead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The sky dome

Browser-only. The dome is a sphere of radius 150 m on the camera, drawn first with depth test and write off, so everything else draws over it. Its fragment colour is `skyColour(dir)`, one GLSL source that Task 8's portals include too, reading two shared uniform objects: the eased fields and the sun direction. The sun eases toward `-keyDir` of the hall you stand in with the fields' own factor (`1 - exp(-dt / 1.5)`); the first frame snaps.

**Files:**
- Create: `src/skydome.js`
- Modify: `src/world.js` (`cell.keyDir`, `keyDirAt`), `src/main.js` (import, dome, `easeMood`)

**Interfaces:**
- Produces: `SKY_UNIFORMS = { uSkyFields: { value: Vector3 }, uSunDir: { value: Vector3 } }`, `SKY_GLSL` (declares `uSkyFields`, `uSunDir`, `skyHash`, `skyNoise`, `skyStops`, `vec3 skyColour(vec3 dir)`), `class SkyDome { constructor(scene); update(camera, eased, keyDir, k) }`.
- Produces: `World.prototype.keyDirAt(cx, cz) -> [x, y, z] | null`; cells carry `keyDir`.

- [ ] **Step 1: Write `src/skydome.js`**

```js
// The sky: one dome around the camera, drawn before everything else, and the GLSL function that
// colours it, shared with the window portals (material.js) so a window shows the dome's own sky.
// Colours are raw sRGB like the mood colours: the shaders write them unconverted.
import * as THREE from 'three';

// Shared uniform objects. The dome and every portal material spread these same objects into their
// uniforms, so one update per frame moves the dome and every window together.
export const SKY_UNIFORMS = {
  uSkyFields: { value: new THREE.Vector3(0.5, 0, 0) },                 // eased light, water, decay
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },    // toward the sun or moon
};

export const SKY_GLSL = /* glsl */`
  uniform vec3 uSkyFields, uSunDir;
  float skyHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float skyNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skyHash(i), skyHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 0.0)), skyHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(skyHash(i + vec3(0.0, 0.0, 1.0)), skyHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 1.0)), skyHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  // The three light stops, as moodFor: chiaroscuro (night), dusk, luminous (day).
  vec3 skyStops(vec3 a, vec3 b, vec3 c, float l) { return l < 0.5 ? mix(a, b, l * 2.0) : mix(b, c, (l - 0.5) * 2.0); }
  // Sky colour along a world direction (any length).
  vec3 skyColour(vec3 dir) {
    vec3 d = normalize(dir);
    float l = clamp(uSkyFields.x, 0.0, 1.0), w = clamp(uSkyFields.y, 0.0, 1.0), dc = clamp(uSkyFields.z, 0.0, 1.0);
    float up = d.y;
    vec3 zenith = skyStops(vec3(0.010, 0.012, 0.025), vec3(0.08, 0.13, 0.32), vec3(0.60, 0.72, 0.86), l);
    vec3 horizon = skyStops(vec3(0.030, 0.035, 0.060), vec3(0.88, 0.56, 0.28), vec3(0.97, 0.94, 0.86), l);
    vec3 col = mix(zenith, horizon, pow(1.0 - smoothstep(0.0, 0.3, max(up, 0.0)), 1.5));
    col = mix(col, horizon * 0.6, smoothstep(0.0, 0.25, -up));          // below the horizon
    // Sun by day and dusk, moon by night: a small disc and a broad glow toward uSunDir.
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    vec3 sunCol = skyStops(vec3(0.55, 0.60, 0.75), vec3(1.0, 0.70, 0.40), vec3(1.0, 0.96, 0.86), l);
    col += sunCol * (smoothstep(0.9990, 0.9996, s) * 0.9 + pow(s, 8.0) * mix(0.08, 0.35, l));
    // Faint cloud bands: noise stretched along the horizon, gone overhead and at night.
    vec3 q = d / max(up + 0.25, 0.05);
    float cloud = smoothstep(0.55, 0.85, skyNoise(vec3(q.x * 1.5, 0.0, q.z * 6.0)) * 0.65 + skyNoise(q * 4.0) * 0.35);
    col = mix(col, mix(horizon, vec3(1.0), 0.4), cloud * 0.35 * smoothstep(0.0, 0.15, up) * smoothstep(0.2, 0.5, l));
    // Stars in the dark: one hashed point per cell of direction, fading in as the light goes.
    vec3 sc = d * 160.0;
    float star = step(0.996, skyHash(floor(sc))) * (1.0 - smoothstep(0.0, 0.35, length(fract(sc) - 0.5)));
    col += vec3(star) * (1.0 - smoothstep(0.1, 0.35, l)) * smoothstep(0.0, 0.1, up);
    // Water pales and greys the sky; decay dulls it.
    return mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.35 * w + 0.25 * dc);
  }
`;

const DOME_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    // The dome sits on the camera, unturned, so its local position is the world direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOME_FRAG = /* glsl */`
  precision highp float;
  ${SKY_GLSL}
  varying vec3 vDir;
  void main() { gl_FragColor = vec4(skyColour(vDir), 1.0); }
`;

export class SkyDome {
  constructor(scene) {
    const material = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: { ...SKY_UNIFORMS },
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
    this.mesh.name = 'sky'; this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.target = new THREE.Vector3();
  }
  // eased: { light, water, decay }; keyDir: the current hall's key light (the way the light
  // travels) or null to hold the sun where it is; k: this frame's easing factor, 1 to snap.
  update(camera, eased, keyDir, k) {
    this.mesh.position.copy(camera.position);
    SKY_UNIFORMS.uSkyFields.value.set(eased.light, eased.water, eased.decay);
    if (keyDir) {
      this.target.set(-keyDir[0], -keyDir[1], -keyDir[2]);
      SKY_UNIFORMS.uSunDir.value.lerp(this.target, k).normalize();
    }
  }
}
```

`ShaderMaterial` has `fog: false` by default, so the dome takes no fog. `renderOrder = -10` sorts it first in the opaque list (the `look=lines` ghost pass uses `-1`, and there is no dome in that look).

- [ ] **Step 2: Remember each hall's key light**

`src/world.js`, in `ensure`, the `cell` line:

```js
    const cell = { hall, group, boxes, floors, slots: built.slots, statues, keyDir: win?.keyDir ?? null };
```

and a method before `near`:

```js
  // The key light of the loaded y = 0 hall at (cx, cz), the way the light travels; null when the
  // hall is not built yet or the look has no windows.
  keyDirAt(cx, cz) { return this.cells.get(key(cx, 0, cz))?.keyDir ?? null; }
```

- [ ] **Step 3: Put the dome in the scene**

`src/main.js`, after the `Debug` import:

```js
import { SkyDome } from './skydome.js';
```

after `const shaded = frag.look === 'shaded';`:

```js
// The sky dome is the shaded look's alone; look=lines keeps the v0 background.
const dome = shaded ? new SkyDome(scene) : null;
let sunK = 1;   // the first frame puts the sun straight where the starting hall's light comes from
```

and at the end of `easeMood`, after the `scene.fog.far = far;` line:

```js
  // The sun or moon sits where the current hall's key light comes from, eased with the fields.
  dome?.update(camera, eased, world.keyDirAt(cx, cz), sunK); sunK = k;
```

`easeMood` runs after `player.update` and before `renderer.render`, so the dome is on this frame's camera.

- [ ] **Step 4: Check it by walking**

`npm test` (expected: 91 passing, nothing pure changed). Open `#s=ravens&x=-3&z=5&debug` (roofless, luminous) and look up: pale warm sky, a bright sun glow roughly overhead, faint cloud bands toward the horizon. Roofless halls are all bright, so check the dusk and dark skies another way: from the upper landing of the stair hall at `x=-2&z=1` look up the shaft into the hall above, which has no ceiling (vista halls are built with `ceiling: false`) and so shows the dome. The browser console is clean (a GLSL error prints `THREE.WebGLProgram: Shader Error`). `#s=ravens&x=-3&z=5&look=lines`: no dome, the v0 background. `?debug` calls rise by exactly one.

- [ ] **Step 5: Commit**

```bash
git add src/skydome.js src/world.js src/main.js
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: sky dome on the camera, sun opposite the hall's key light

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Windows become openings

Browser-only. The window panes of a hall become one mesh with a sky-portal material: each pixel is `skyColour` along the view ray, fogged like the wall it sits in. The ray's world direction comes from the view-space position turned back by the view rotation (`vec4(v, 0.0) * viewMatrix` is the transpose product), so no world position is formed and the view-space precision of the surface shader holds. The glow quad stays in the effects mesh, unchanged, 1 cm in front of the pane.

**Files:**
- Modify: `src/material.js:5` (imports), end of file (`portalMaterial`)
- Modify: `src/effects.js:4` (import), end of file (`buildPortals`)
- Modify: `src/world.js` (import, effects line)

**Interfaces:**
- Consumes: `SKY_GLSL`, `SKY_UNIFORMS` from Task 7; `MOOD_GLSL` (with Task 4's `fogAmount(m, view, h)`), `stopUniforms`, `v3` already in `material.js`.
- Produces: `portalMaterial({ fields }) -> ShaderMaterial`, `buildPortals(hall, out) -> Mesh | null` (name `'portals'`, `renderOrder` 1).

- [ ] **Step 1: The portal material**

`src/material.js`, after the `mood.js` import:

```js
import { SKY_GLSL, SKY_UNIFORMS } from './skydome.js';
```

and at the end of the file:

```js
// Window panes as openings: each pixel takes the sky dome's colour along the view ray, fogged like
// the wall it sits in. View space as everywhere else: the ray's world direction is the view-space
// position turned back by the view rotation (a row-vector product is the transpose), so no world
// position is ever formed.
const PORTAL_VERT = /* glsl */`
  varying vec3 vV, vDir;
  varying float vH;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y;
    vDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const PORTAL_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  ${SKY_GLSL}
  uniform vec3 uFields;
  varying vec3 vV, vDir;
  varying float vH;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(uFields);
    gl_FragColor = vec4(mix(skyColour(vDir), m.haze, fogAmount(m, vV, vH)), 1.0);
  }
`;
export function portalMaterial({ fields = [0.5, 0, 0] } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
    uniforms: { ...stopUniforms(), ...SKY_UNIFORMS, uFields: { value: v3(fields) } },
    side: THREE.DoubleSide, clipping: true,
  });
}
```

`disposeGroup` disposes the material, not the shared uniform objects, so removing a hall never touches the dome.

- [ ] **Step 2: The portal mesh**

`src/effects.js` line 4:

```js
import { effectsMaterial, portalMaterial } from './material.js';
```

and at the end of the file:

```js
// The window panes of one hall as one mesh with the sky-portal material, so each window reads as
// an opening onto the sky without cutting the wall. Hall-relative like the rest, 0.01 m in from
// the wall face (the glow quad sits at 0.02 m). Returns null when the hall has no windows.
export function buildPortals(hall, out) {
  if (!out.windows.length) return null;
  const pos = [];
  const rel = ([x, y, z]) => [x - hall.cx, y - hall.floorY, z - hall.cz];
  for (const w of out.windows) {
    const [cx, cy, cz] = w.c, hx = w.d[0] * w.w / 2, hz = w.d[1] * w.w / 2, nx = w.n[0] * 0.01, nz = w.n[1] * 0.01;
    const a = [cx - hx + nx, cy - w.h / 2, cz - hz + nz], b = [cx + hx + nx, cy - w.h / 2, cz + hz + nz];
    const c = [cx + hx + nx, cy + w.h / 2, cz + hz + nz], d = [cx - hx + nx, cy + w.h / 2, cz - hz + nz];
    for (const p of [a, b, c, a, c, d]) pos.push(...rel(p));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(g, portalMaterial({ fields: [hall.light, hall.water, hall.decay] }));
  mesh.name = 'portals'; mesh.renderOrder = 1;
  return mesh;
}
```

`w.n` is the wall's inward normal (`footprintEdges` flips it toward the hall centre), so `+ n * 0.01` is inside the hall, in front of the wall surface (which the surface material pushes back with its polygon offset).

- [ ] **Step 3: Add the portals per hall**

`src/world.js`:

```js
import { buildEffects, buildPortals } from './effects.js';
```

and the effects line in `ensure` becomes:

```js
    if (win) for (const mesh of [buildEffects(hall, win), buildPortals(hall, win)]) if (mesh) group.add(mesh);
```

`win` is only computed for `shaded` y = 0 halls, so `look=lines` and vista halls get no portals.

- [ ] **Step 4: Check it by walking**

`npm test` (expected: 91 passing). Open `#s=ravens&x=0&z=1&debug` and face north (the window is above the far doorway): a tall slit of dusk sky, deep blue above to amber below, the glow over it. Walk into a bright quarter (`x=3&z=-2` and east) and a dark one (west of `x=-6`): each window's sky matches its hall's mood and agrees with the dome seen in a roofless hall nearby. Walk away from a window until fog takes the wall: the pane fogs with it, it does not shine through the haze. Calls per hall with windows are four (lines, surface, effects, portals). Console clean.

- [ ] **Step 5: Commit**

```bash
git add src/material.js src/effects.js src/world.js
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: window panes show the sky along the view ray

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Phase S2 walk

**Files:**
- Modify: `src/skydome.js` (`SKY_GLSL` colour constants only), `docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md` (Status line)

- [ ] **Step 1: Walk the sky**

Alex walks from `#s=ravens&x=0&z=0&debug` through a bright quarter, a dusk one and a dark one. Expected: every window shows sky in its hall's mood; luminous halls a pale warm sky with a sun glow, dusk a blue-to-amber band, chiaroscuro near-black with stars; looking at a window means looking toward its light. Roofless courts at `x=-3&z=5`, `x=3&z=5`, `x=-4&z=1`. The sun swings smoothly, never jumps, when crossing between halls. Tune only the colour constants in `SKY_GLSL`; if the glow quad washes out the pane, lower `glowA` in `effects.js` (`0.25 + 0.5 * hall.light`).

- [ ] **Step 2: Check the budget and record**

Expected: fps 60, calls under 100 (about 30 in view), tris under 600k. If fps drops, the sky's cloud octaves (`skyNoise` called twice) go first. Status line: `S2 shipped <date>: fps <n>, calls <n>, tris <n>k, worst build <n> ms on <machine>`.

```bash
git add src/skydome.js docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "docs: phase S2 walked; sky tuned, measured budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Phase S3: marble

### Task 10: The marble table and `marbleFor`

The marble comes from the `theme` field sampled at one-third resolution, `fields.theme(hall.x / 3, hall.z / 3)` (the field is continuous noise, so fractional cell coordinates are fine). At full resolution the field moves about 0.07 per hall and 47% of neighbouring halls would change marble; at one third, 16 to 20% do (0.179, 0.204, 0.163 over three seeds), so a district spans several halls. The field is cut at its sextiles (about 0.24, 0.37, 0.50, 0.63, 0.76 at either resolution), so each marble covers about a sixth of the House. `marbleFor` therefore takes the fields as a third argument; the pattern is still a draw from salt `marble`. Verde antico's veins are "black and pale green": its vein is black and its first inlay pale green, keeping the spec's one-vein-colour record.

**Files:**
- Create: `src/marble.js`
- Test: `test/marble.test.mjs`

**Interfaces:**
- Produces: `MARBLES` keyed `carrara, bardiglio, rosso, verde, giallo, nero`, each `{ name, base, vein, strength, inlay: [a, b] }`; `MARBLE_ORDER`, `THEME_CUTS`, `PATTERNS = ['chequer', 'medallion', 'bands']`, `MAX_FOOTPRINT = 12`; `marbleOf(theme) -> key`; `districtTheme(fields, hall) -> number`; `marbleFor(seedHash, hall, fields) -> { marble: key, pattern }`; `isInlaid(prim) -> boolean`; `footprintLocal(hall) -> [x0, z0, x1, z1, ...]` hall-relative.

- [ ] **Step 1: Write the failing tests**

```js
// test/marble.test.mjs
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/marble.test.mjs`
Expected: FAIL, `Cannot find module '.../src/marble.js'`.

- [ ] **Step 3: Write `src/marble.js`**

```js
// Marble by district: the `theme` field, at one-third resolution, picks one of six marbles, so a
// district is one stone over several halls; each hall's own stream (salt `marble`) picks its floor
// pattern. Pure. Colours are [r, g, b] in 0..1, raw sRGB like the mood colours: the surface shader
// tints mood stone by `base` and mixes `vein` on top at `strength`; floors inlay `base` with
// `inlay[0]` and `inlay[1]`.
import { stream } from './rng.js';
import { footprint } from './shapes/footprint.js';

export const MARBLES = {
  carrara:   { name: 'Carrara',      base: [0.93, 0.92, 0.90], vein: [0.52, 0.54, 0.57], strength: 0.55, inlay: [[0.42, 0.44, 0.47], [0.80, 0.77, 0.71]] },
  bardiglio: { name: 'Bardiglio',    base: [0.62, 0.66, 0.72], vein: [0.34, 0.38, 0.45], strength: 0.60, inlay: [[0.90, 0.89, 0.86], [0.28, 0.31, 0.37]] },
  rosso:     { name: 'Rosso Verona', base: [0.80, 0.50, 0.44], vein: [0.95, 0.88, 0.78], strength: 0.50, inlay: [[0.93, 0.90, 0.84], [0.52, 0.28, 0.24]] },
  verde:     { name: 'Verde antico', base: [0.22, 0.34, 0.27], vein: [0.04, 0.05, 0.05], strength: 0.65, inlay: [[0.62, 0.74, 0.62], [0.08, 0.10, 0.09]] },
  giallo:    { name: 'Giallo',       base: [0.86, 0.70, 0.40], vein: [0.66, 0.42, 0.16], strength: 0.50, inlay: [[0.95, 0.90, 0.78], [0.45, 0.30, 0.14]] },
  nero:      { name: 'Nero',         base: [0.10, 0.10, 0.11], vein: [0.92, 0.91, 0.88], strength: 0.60, inlay: [[0.88, 0.86, 0.82], [0.38, 0.38, 0.40]] },
};
// In theme order. The cut points are the field's sextiles (measured over three seeds), so each
// marble covers about a sixth of the House.
export const MARBLE_ORDER = ['carrara', 'bardiglio', 'rosso', 'verde', 'giallo', 'nero'];
export const THEME_CUTS = [0.24, 0.37, 0.5, 0.63, 0.76];
export const PATTERNS = ['chequer', 'medallion', 'bands'];
// The surface shader's footprint uniform holds at most this many vertices (a cross has 12).
export const MAX_FOOTPRINT = 12;

export const marbleOf = (theme) => MARBLE_ORDER[THEME_CUTS.filter(c => theme >= c).length];

// The theme field at one-third resolution: districts span several halls, not the two or three
// the field's own grain gives (it moves about 0.07 per hall at full resolution).
export const districtTheme = (fields, hall) => fields.theme(hall.x / 3, hall.z / 3);

export function marbleFor(seedHash, hall, fields) {
  return { marble: marbleOf(districtTheme(fields, hall)), pattern: stream(seedHash, hall.x, hall.y, hall.z, 'marble').pick(PATTERNS) };
}

// Polys that carry the inlaid floor: hall floors, doorway thresholds, ramps and vestibule floors.
const INLAID = new Set(['floor', 'threshold', 'ramp', 'vestibule']);
export const isInlaid = (p) => p.kind === 'poly' && !p.down && INLAID.has(p.name);

// The hall's footprint relative to its centre, flattened [x0, z0, x1, z1, ...], for the shader.
export function footprintLocal(hall) {
  const pts = footprint(hall);
  if (pts.length > MAX_FOOTPRINT) throw new Error(`footprint has ${pts.length} vertices`);
  return pts.flatMap(([x, z]) => [x - hall.cx, z - hall.cz]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: 97 passing.

- [ ] **Step 5: Commit**

```bash
git add src/marble.js test/marble.test.mjs
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: six marbles by district and a floor pattern per hall

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Veined stone

Browser-only. The surface shader gets a hall-relative position varying `vP = position` (vertices are already hall-local; nothing becomes world-space), the marble's base tints the mood's stone, and veins (a sine bent by four octaves of 3D value noise) mix on top, faded to nothing between 10 and 15 m and at a third on statues. The kind tests become bounded (`isStatue`, `isPool`) so Task 12's new kind cannot be mistaken for a pool.

**Files:**
- Modify: `src/material.js:5-6` (import), `:54-112` (`SURFACE_VERT`, `SURFACE_FRAG`, `surfaceMaterial`)
- Modify: `src/world.js` (import, `surface` line)

**Interfaces:**
- Consumes: `MARBLES`, `marbleFor(seedHash, hall, fields)` from Task 10.
- Produces: `surfaceMaterial({ keyDir, ceiling, side, dim, marble })` where `marble` is a `MARBLES` entry (default Carrara).

- [ ] **Step 1: Replace the surface shader and material**

`src/material.js`, after the `skydome.js` import:

```js
import { MARBLES } from './marble.js';
```

Replace everything from `const SURFACE_VERT` to the end of `surfaceMaterial` with:

```js
const SURFACE_VERT = /* glsl */`
  attribute vec3 fields;
  attribute float kind;
  // vN: world-oriented normal (the key light is a world direction); vNV: view-space normal and vV:
  // view-space position, for the sheen and fog; vH: height above the hall floor; vP: hall-relative
  // position, the marble's coordinates (each hall is its own block of stone).
  varying vec3 vN, vNV, vV, vFields, vP;
  varying float vH, vKind;
  #include <clipping_planes_pars_vertex>
  void main() {
    // Vertices are hall-local and the group sits at (cx, floorY, cz), so modelViewMatrix (built on
    // the CPU in float64) keeps far-from-origin halls precise, and position.y is the height above
    // the floor. Nothing here touches world coordinates.
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y; vP = position;
    vN = normalize(mat3(modelMatrix) * normal); vNV = normalize(normalMatrix * normal);
    vFields = fields; vKind = kind;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// Marble veins: a turbulent sine over 3D value noise, antialiased with fwidth.
const MARBLE_GLSL = /* glsl */`
  uniform vec3 uMarbleBase, uMarbleVein;
  uniform float uVeinStrength;
  float mHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float mNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mHash(i), mHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 0.0)), mHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(mHash(i + vec3(0.0, 0.0, 1.0)), mHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 1.0)), mHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  // 1 on a vein, 0 in the field: where a sine, bent by four octaves of turbulence, crosses zero.
  float marbleVeins(vec3 p) {
    float t = 0.0, a = 0.5;
    vec3 q = p * 0.45;
    for (int i = 0; i < 4; i++) { t += a * abs(mNoise(q) * 2.0 - 1.0); q *= 2.03; a *= 0.5; }
    float s = sin(dot(p, vec3(0.55, 0.32, 0.41)) + 7.0 * t);
    return 1.0 - smoothstep(0.0, 0.08 + fwidth(s), abs(s));
  }
`;

const SURFACE_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  ${MARBLE_GLSL}
  uniform vec3 uKeyDir;        // direction the light travels, normalised
  uniform float uCeiling, uDim;
  varying vec3 vN, vNV, vV, vFields, vP;
  varying float vH, vKind;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(vFields);
    // Double-sided: a floor or ramp seen from below is lit as its underside.
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vN) * facing;
    float h = vH, dist = length(vV);
    float isStatue = step(0.5, vKind) * step(vKind, 1.5), isPool = step(1.5, vKind) * step(vKind, 2.5);
    // The marble tints the mood's stone; veins mix on top, calm beyond 10 to 15 m and fainter on statues.
    float vein = marbleVeins(vP) * uVeinStrength * (1.0 - smoothstep(10.0, 15.0, dist)) * mix(1.0, 0.35, isStatue);
    vec3 stone = m.stone * mix(uMarbleBase, uMarbleVein, vein);
    stone *= 1.0 + 0.12 * isStatue;   // statues a touch lighter
    stone *= 1.0 - 0.25 * isPool;     // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    float sheen = pow(1.0 - max(dot(normalize(vNV) * facing, -normalize(vV)), 0.0), 3.0) * uWaterSheen * vFields.y * isPool;
    color += m.sky * sheen;
    color *= uDim;
    color = mix(color, m.haze, fogAmount(m, vV, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// marble: a MARBLES entry.
export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], ceiling = 8, side = THREE.DoubleSide, dim = 1, marble = MARBLES.carrara } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    uniforms: {
      ...stopUniforms(), uKeyDir: { value: v3(keyDir).normalize() }, uCeiling: { value: ceiling }, uDim: { value: dim },
      uMarbleBase: { value: v3(marble.base) }, uMarbleVein: { value: v3(marble.vein) }, uVeinStrength: { value: marble.strength },
    },
    side, clipping: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}
```

- [ ] **Step 2: Give each hall its marble**

`src/world.js`:

```js
import { MARBLES, marbleFor } from './marble.js';
```

and the `surface` line in `ensure` becomes:

```js
    const stone = marbleFor(this.seedHash, hall, this.fields);
    const material = shaded ? surfaceMaterial({ ceiling: hall.ceiling, keyDir: win?.keyDir, marble: MARBLES[stone.marble] }) : null;
    const surface = shaded ? { material, fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] } : null;
```

Vista halls get their own hall's marble; a hall's connectors (east and south) share its material and so its stone.

- [ ] **Step 3: Check it by walking**

`npm test` (expected: 97 passing). Walk `#s=ravens&x=0&z=0&debug` (Verde antico), `x=1&z=-1` (Giallo), `x=-2&z=0` (Rosso Verona), `x=3&z=2` (Nero), `x=-5&z=-2` (Bardiglio), `x=-7&z=-1` (Carrara). Neighbouring halls mostly share their stone; the marble changes every few halls, not at every doorway. Expected: each reads as its stone; veins crisp on near walls and columns, gone by 15 m, faint on statues; a dark hall of Carrara still reads dark. The line work does not shimmer. Console clean.

- [ ] **Step 4: Commit**

```bash
git add src/material.js src/world.js
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: veined marble per district in the surface shader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Venetian floors

Browser-only. A new surface kind `floor` (3) marks inlaid polys (`isInlaid`). The fragment shader computes the inlay everywhere and mixes it in by kind, because `fwidth` is undefined inside a branch on a varying. Patterns: chequer (1.2 m squares set diagonally, box-filtered), medallion (rings and an eight-point star at the hall centre), bands (a 1 m band 0.5 m in from the hall's own outline, from a signed distance to the footprint uniform, round a 0.6 m chequer). Outside the footprint (thresholds, corridors) the bands pattern is plain base.

**Files:**
- Modify: `src/material.js:7` (`KIND`), the marble import, `MARBLE_GLSL`, `SURFACE_FRAG`, `surfaceMaterial`
- Modify: `src/build.js:4-5` (import), `:47` (`kindOf`)
- Modify: `src/world.js` (import, `material` line)

**Interfaces:**
- Consumes: `PATTERNS`, `MAX_FOOTPRINT`, `isInlaid`, `footprintLocal` from Task 10.
- Produces: `KIND.floor === 3`; `surfaceMaterial({ ..., marble, pattern, footprint })`.

- [ ] **Step 1: The kind**

`src/material.js` line 7:

```js
export const KIND = { arch: 0, statue: 1, pool: 2, floor: 3 };
```

`src/build.js`, after the `CELL` import:

```js
import { isInlaid } from './marble.js';
```

line 47:

```js
const kindOf = (p) => p.name === 'pool' ? KIND.pool : p.tag === 'statue' ? KIND.statue : isInlaid(p) ? KIND.floor : KIND.arch;
```

- [ ] **Step 2: The floor patterns in the shader**

`src/material.js`, the marble import becomes:

```js
import { MARBLES, PATTERNS, MAX_FOOTPRINT } from './marble.js';
```

Replace `MARBLE_GLSL`, `SURFACE_FRAG` and `surfaceMaterial` (from Task 11; `SURFACE_VERT` stays) with:

```js
// Marble: a turbulent sine over 3D value noise gives the veins; floors add an inlaid pattern.
// Every edge is filtered over the pixel's footprint (fwidth), so nothing shimmers at a distance.
const MARBLE_GLSL = /* glsl */`
  uniform vec3 uMarbleBase, uMarbleVein, uInlayA, uInlayB;
  uniform float uVeinStrength, uPattern;   // pattern: 0 chequer, 1 medallion, 2 bands
  uniform vec2 uFoot[12];                  // the hall's footprint, hall-relative (x, z)
  uniform int uFootN;
  uniform vec2 uHalf;                      // the footprint's half-extents
  float mHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float mNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mHash(i), mHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 0.0)), mHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(mHash(i + vec3(0.0, 0.0, 1.0)), mHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(mHash(i + vec3(0.0, 1.0, 1.0)), mHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  // 1 on a vein, 0 in the field: where a sine, bent by four octaves of turbulence, crosses zero.
  float marbleVeins(vec3 p) {
    float t = 0.0, a = 0.5;
    vec3 q = p * 0.45;
    for (int i = 0; i < 4; i++) { t += a * abs(mNoise(q) * 2.0 - 1.0); q *= 2.03; a *= 0.5; }
    float s = sin(dot(p, vec3(0.55, 0.32, 0.41)) + 7.0 * t);
    return 1.0 - smoothstep(0.0, 0.08 + fwidth(s), abs(s));
  }
  // A step from 0 to 1 where v crosses edge, one pixel wide.
  float aaStep(float edge, float v) { return clamp((v - edge) / max(fwidth(v), 1e-4) + 0.5, 0.0, 1.0); }
  // 1 on [0, duty) of every unit period of x, box-filtered over the pixel (the pulse train's integral).
  float stripe(float x, float duty) {
    float w = max(fwidth(x), 1e-4), a = x - 0.5 * w, b = x + 0.5 * w;
    return ((floor(b) * duty + min(fract(b), duty)) - (floor(a) * duty + min(fract(a), duty))) / w;
  }
  // 0 and 1 unit squares, box-filtered over the pixel.
  float checker(vec2 p) {
    vec2 w = max(fwidth(p), vec2(1e-4));
    vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
    return 0.5 - 0.5 * i.x * i.y;
  }
  // Distance from p to the footprint's outline: positive inside, negative in doorways and corridors.
  float footDist(vec2 p) {
    float d = 1e9, s = 1.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uFootN) break;
      vec2 vi = uFoot[i], vj = uFoot[i == 0 ? uFootN - 1 : i - 1];
      vec2 e = vj - vi, w = p - vi, b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s = -s;
    }
    return -s * sqrt(d);
  }
  // The floor's tint at hall-relative (x, z): the marble's base inlaid with its two inlay colours.
  vec3 inlay(vec2 p) {
    if (uPattern < 0.5) {
      // Chequer: 1.2 m squares set diagonally.
      return mix(uMarbleBase, uInlayA, checker(vec2(p.x + p.y, p.x - p.y) * (0.70710678 / 1.2)));
    }
    if (uPattern < 1.5) {
      // Medallion: rings and an eight-point star, centred on the hall.
      float r = length(p), R = 0.8 * min(uHalf.x, uHalf.y);
      float point = abs(fract(atan(p.y, p.x) * 8.0 / 6.2831853) - 0.5) * 2.0;   // 1 at a star point
      float starR = R * mix(0.28, 0.55, point);
      vec3 c = mix(uMarbleBase, uInlayB, aaStep(0.0, R - r) * aaStep(0.0, r - 0.6 * R) * stripe(r / 0.9, 0.33));
      c = mix(c, uInlayA, aaStep(0.0, starR - r));
      return mix(c, uInlayB, aaStep(0.0, 0.1 * R - r));
    }
    // Bands: a 1 m band 0.5 m in from the hall's own outline, round a field of small chequer.
    float d = footDist(p);
    vec3 c = mix(uMarbleBase, uInlayA, checker(p / 0.6));
    c = mix(c, uInlayB, aaStep(0.5, d) * (1.0 - aaStep(1.5, d)));
    return mix(uMarbleBase, c, aaStep(0.0, d));
  }
`;

const SURFACE_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  ${MARBLE_GLSL}
  uniform vec3 uKeyDir;        // direction the light travels, normalised
  uniform float uCeiling, uDim;
  varying vec3 vN, vNV, vV, vFields, vP;
  varying float vH, vKind;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(vFields);
    // Double-sided: a floor or ramp seen from below is lit as its underside.
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vN) * facing;
    float h = vH, dist = length(vV);
    float isStatue = step(0.5, vKind) * step(vKind, 1.5), isPool = step(1.5, vKind) * step(vKind, 2.5), isFloor = step(2.5, vKind);
    // The marble tints the mood's stone; floors are inlaid; veins mix on top, calm beyond 10 to 15 m
    // and fainter on statues.
    vec3 tint = mix(uMarbleBase, inlay(vP.xz), isFloor);   // computed everywhere: fwidth needs uniform flow
    float vein = marbleVeins(vP) * uVeinStrength * (1.0 - smoothstep(10.0, 15.0, dist)) * mix(1.0, 0.35, isStatue);
    vec3 stone = m.stone * mix(tint, uMarbleVein, vein);
    stone *= 1.0 + 0.12 * isStatue;   // statues a touch lighter
    stone *= 1.0 - 0.25 * isPool;     // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    float sheen = pow(1.0 - max(dot(normalize(vNV) * facing, -normalize(vV)), 0.0), 3.0) * uWaterSheen * vFields.y * isPool;
    color += m.sky * sheen;
    color *= uDim;
    color = mix(color, m.haze, fogAmount(m, vV, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// marble: a MARBLES entry; pattern: one of PATTERNS; footprint: footprintLocal(hall), flat x, z.
export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], ceiling = 8, side = THREE.DoubleSide, dim = 1, marble = MARBLES.carrara, pattern = 'chequer', footprint = [] } = {}) {
  const foot = Array.from({ length: MAX_FOOTPRINT }, (_, i) => new THREE.Vector2(footprint[2 * i] ?? 0, footprint[2 * i + 1] ?? 0));
  const n = footprint.length / 2, used = foot.slice(0, n);
  const half = new THREE.Vector2(Math.max(0, ...used.map(p => Math.abs(p.x))), Math.max(0, ...used.map(p => Math.abs(p.y))));
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    uniforms: {
      ...stopUniforms(), uKeyDir: { value: v3(keyDir).normalize() }, uCeiling: { value: ceiling }, uDim: { value: dim },
      uMarbleBase: { value: v3(marble.base) }, uMarbleVein: { value: v3(marble.vein) }, uVeinStrength: { value: marble.strength },
      uInlayA: { value: v3(marble.inlay[0]) }, uInlayB: { value: v3(marble.inlay[1]) }, uPattern: { value: PATTERNS.indexOf(pattern) },
      uFoot: { value: foot }, uFootN: { value: n }, uHalf: { value: half },
    },
    side, clipping: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}
```

Three r170 compiles `ShaderMaterial` as GLSL ES 3.00 (WebGL2), so `fwidth`, the dynamic index `uFoot[i]` and the `break` on a uniform bound are all legal.

- [ ] **Step 3: Pass pattern and footprint**

`src/world.js`, the marble import becomes:

```js
import { MARBLES, marbleFor, footprintLocal } from './marble.js';
```

and the `material` line:

```js
    const material = shaded ? surfaceMaterial({ ceiling: hall.ceiling, keyDir: win?.keyDir, marble: MARBLES[stone.marble], pattern: stone.pattern, footprint: footprintLocal(hall) }) : null;
```

- [ ] **Step 4: Check it by walking**

`npm test` (expected: 97 passing). Patterns for seed `ravens`: bands in a cross `x=0&z=0`, bands in an octagon `x=3&z=3`, bands in a rect `x=-1&z=-1`, medallion in an octagon `x=0&z=-1`, in a rect `x=1&z=1`, in a cross `x=-1&z=2`, chequer `x=0&z=1` and in a cross `x=2&z=1`. Expected: the band follows the octagon's and the cross's actual outline (12 corners, no straight cut across an arm); the medallion sits in the hall centre; thresholds, ramps and corridor floors carry the pattern (chequer, medallion's plain base, or plain base for bands); veins cross the inlay. Stand still and look along a long floor: no shimmer or moiré at a distance. Walls and ceilings are not inlaid. Console clean.

- [ ] **Step 5: Commit**

```bash
git add src/material.js src/build.js src/world.js
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "feat: Venetian inlaid floors: chequer, medallion, bands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Phase S3 walk

**Files:**
- Modify: `src/marble.js` (colour values only), `docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md` (Status line), `README.md` (one line)

- [ ] **Step 1: Walk the marble**

Alex walks from `#s=ravens&x=0&z=0&debug` across several districts (the six marbles are all within seven halls of the origin, listed in Task 11). Expected (spec "done when" 3): halls in different districts read as different marbles, floors read as inlaid patterns, the line work does not shimmer and the stone is calm at a distance. Tune only colour values and strengths in `MARBLES` (the tests pin ranges and the Carrara/Nero contrast, not hex), and re-run `npm test`.

- [ ] **Step 2: Budget, look=lines, record**

With `?debug` in the busiest tall hall: fps 60, calls under 100, tris under 600k, worst build under 16 ms (spec "done when" 4). If fps drops, cut `marbleVeins` from four octaves to two first, then the pattern antialiasing. Open `#s=ravens&x=0&z=0&look=lines` (spec "done when" 5): the v0 wireframe at the new dimensions, no dome, no portals, roofless halls without ceiling lines. Status line: `S1, S2, S3 shipped <date>; <machine>: fps <n>, calls <n>, tris <n>k, worst build <n> ms`. README, under "What is here": `- Tall halls with colossi, sky through the windows and a few roofless courts, and district marbles with inlaid floors.`

```bash
git add src/marble.js docs/superpowers/specs/2026-10-13-the-house-scale-sky-marble-design.md README.md
git -c user.name=piranesi0 -c user.email=piranesi16@gmail.com commit -m "docs: scale, sky and marble shipped; measured budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Self-review notes

- **Spec coverage.** §2 halls, storeys, doorways: Task 1; stairwells: Task 2; colossi: Task 3; windows, elevation, the flattened fog distance, far plane: Task 4 (fog stops and far plane untouched). §2 determinism: Task 1 fingerprint (hall stream), Task 3 fingerprint (statues), Task 10 (marble salt). §3 dome, easing, sun opposite the key light, clouds, stars: Task 7; portals: Task 8; roofless: Task 6; `look=lines`: Tasks 6, 7, 8 and 13. §4 table, `marbleFor`, theme to marble: Task 10; veins, fade, statues weaker, hall-relative coordinates: Task 11; `floor` kind, three patterns, footprint uniform, `fwidth`: Task 12. §6 budget: Tasks 5, 9, 13, with four calls per hall plus the dome by construction. §7 every listed pure test exists: hall ranges, `STOREY`, 1000-cell stream identity (Task 1); doorways plus lintel (Task 1); colossi rate, fit, ordinary statues unchanged (Task 3); roofless rate, none elsewhere, no ceiling polys or windows, 70 to 80 degrees (Task 6); window heights, tops, elevation, phase B tests green (Task 4); mood unchanged, so `mood.test.mjs` stays as it is and the flattened fog is walked (Task 4); marble determinism, reachability, district constancy at one-third resolution (Task 10). §8 phases match task groups; look phase C is not here.
- **Rulings on the spec.** Colossus roll is one in two because half the rolls cannot fit among the ordinary statues; the realised rate is one in four. A colossus shrinks in 5% steps toward 10 m to fit, is an upright figure, never fallen, faces one of four ways. The roofless "top edge line" is the walls' own box edges; nothing new is drawn. Roofless is passed to `buildHall` as `opts.roofless` by the world, so `hallParams` is untouched. `marble` is the table key; `marbleFor` takes `fields` as a third argument (controller ruling: theme at one-third resolution). Fog stops stay 18 / 31 / 44 with a flattened fog distance (controller ruling). Verde antico: black vein, pale green as its first inlay. The glow quad is unchanged over the portal. The stairwell's shaft walls rise to `STOREY` and are lined above the ceiling.
- **Type consistency.** `placeColossus(seedHash, hall, solids, statues)` matches its call in `world.js` and the tests; `fitter(hall, solids, placed)` matches `placeStatues` and `colossus.js`. `windowsFor` returns `{ wall, keyDir, windows, shafts }` in both branches; `buildEffects` and `buildPortals` read `out.windows[].c/w/h/d/n`. `SkyDome.update(camera, eased, keyDir, k)` matches `main.js`; `World.keyDirAt(cx, cz)` reads `cell.keyDir`. `surfaceMaterial({ keyDir, ceiling, side, dim, marble, pattern, footprint })` matches `world.js`; GLSL `fogAmount(m, view, h)` takes the view-space position in the surface, effects and portal shaders alike; `footprintLocal` returns the flat array it expects.
- **Review Focus mapping.** 1 → Task 2 shaft test; 2 → Task 4 D3 test at 18 m and 12 m; 3 → Task 3 fit test (stair halls included, `stairs >= 1`); 4 → Task 6 vista-hall and stair-hall tests; 5 → Task 10 footprint test.
- **Verified before writing.** Every pure task's code and tests were run against a copy of the repo at `c72edf5`: 97 tests green at the end, each new test failing first as stated. The S2 and S3 shaders were loaded in a browser on that copy: no shader errors, a dusk sky in a window pane, veins and inlay visible.
