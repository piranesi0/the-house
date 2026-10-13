# The House — look and atmosphere

**Status:** design approved in conversation 2026-10-13; reviewed against the source 2026-10-13 and
amended (per-vertex mood, floor fills, window order, budgets). Ready for planning.
**Owner:** Alex, building in Claude Code sessions. No Aleph agents.
**Amends:** `2026-10-13-the-house-design.md` §6 ("No fills, no textures"). Surfaces are now shaded;
the line work stays on top. Everything else in the v0 spec stands.

## 1. Intent

Give the House shaded stone, light and air, so that walking it feels like being somewhere, while
keeping the drawn line work that is its identity. This comes before v1 (journal and map) and before
higher-resolution statues, because v0's own test is a feeling, and because the statues' open
question (how smooth shapes are drawn) is a rendering question this work answers.

**Decided in conversation:**

- **Full shading** is in scope.
- **Lines stay on top, everywhere:** walls, columns, statues.
- **Mood is region-driven:** luminous where the `light` field is high, chiaroscuro where it is low,
  misty where `water` is high. Moods blend continuously; there is never a visible boundary.
- **Runs on any ordinary laptop:** integrated graphics, 60 fps. No shadow maps, no post-processing.
- **Approach:** one stylised custom shader that fakes the lighting (approach 1 of 3).

**Done when:**

1. A walk from a bright quarter into a dark one and into the drowned halls reads as three moods,
   with no seam between them.
2. 60 fps on Alex's ordinary laptop, measured with `?debug`.
3. `?look=lines` still gives the v0 wireframe House.

## 2. Rendering pipeline

Each loaded hall is drawn in three layers, all built from the hall's existing primitive list.

1. **Surface mesh (new).** Every `box`, `cyl`, `sphere` and `poly` primitive also becomes solid
   triangles with normals, merged into one mesh per hall using the House material (§3). Each vertex
   carries two extra attributes: its **mood** (§4, sampled from the fields at the vertex's own world
   position) and a **kind** flag (architecture, statue, pool floor) so the shader can treat them
   differently inside one draw call.
2. **Line mesh (unchanged).** The crease edges, drawn over the surfaces. Surfaces use a polygon
   offset (factor 1, units 1) so the lines never flicker into them.
3. **Effects (new).** Window glows, light shafts (§5) and the shaded water surface (§6), merged
   into **one effects mesh per hall**. Effects take the same distance and height fog as the
   surfaces, so a lit window 30 m away fades like the wall it sits on.

- **New primitive kind `poly`:** a flat filled polygon with optional holes,
  `{ kind: 'poly', points: [[x, y, z], ...], holes: [[[x, y, z], ...]] }`, all points at one
  height. Triangulated with `THREE.ShapeUtils.triangulateShape`, which handles concave outlines
  and holes. It is not a line primitive: it draws no edges of its own, so existing outlines stay
  where they are. `lines` and `segs` primitives stay lines only.
- **Floors and ceilings become `poly`.** Today rect and colonnade floors are 0.02 m `box` slabs
  (`slab()` in `shapes/common.js`), while octagon and cross floors are `lines` outlines, and the
  stair hall and the hall above it only draw a `lines` rectangle around the well on top of a solid
  slab. Filling boxes as they stand would seal the stairwell from above and below. So: every hall
  floor and ceiling becomes a `poly` of the hall's footprint; in a stair hall, and in the
  `floorHole` hall above it, the floor `poly` carries the well rectangle as a hole.
- **Ramps get surfaces.** The stairwell ramps (`segs` steps in `shapes/stairwell.js`) and the
  `steps` connector ramps are lines only today. Each gets a sloped `poly` (or one box per step) so
  they are not see-through next to solid walls. The `steps` connector's flat floor box, which
  floats at `raise` height over the ramps, is split so it starts and ends where the ramps do.
- **Doorway thresholds get floors.** A hall floor stops at the wall's inner face and the connector
  floor starts at the wall's outer face (`faceA`), so the strip through the wall thickness, 1 to
  2 m long, has no floor at all. Invisible in wireframe, a hole once filled. Each doorway gets a
  threshold `poly` spanning the wall thickness at the doorway's width.
- **Ghost pass:** off by default; it reads as a glitch through solid walls. It remains available
  to the `lines` look.
- **Mirrors** (v0 Task 22) are built with `scale.y = -1`, which flips triangle winding. Their
  surface material renders `DoubleSide`, or the builder flips the winding.
- **Unchanged:** the generator, placement, collision, the URL, and every existing test. The world
  is still a pure function of the seed. New code lives in `build.js`, a material module, and an
  effects module.
- **Cost:** about three draw calls per hall instead of two, effects included.

## 3. Lighting model

One shader, four lighting terms, no shadow maps.

1. **Sky and bounce.** A hemisphere term: up-facing surfaces take the sky colour, down-facing ones a
   warmer bounce from the floor.
2. **Window key light.** One directional light per hall. Its azimuth is the inward normal of the
   hall's **window wall** (§5), with a small jitter from the stream; its elevation is nominally 40
   to 60 degrees below horizontal (light slants down from high windows), but the landing rule in
   §5 wins when the two disagree. Plain diffuse, no cast shadows.
3. **Height gradient.** Light enters high: brightness falls from the ceiling toward the floor.
4. **Contact darkening.** A soft dark band within about 0.6 m above the hall floor (wall bases,
   plinth bases, statue feet) as a stand-in for ambient occlusion.

- **Surface colour:** pale warm stone, darkened and greyed by `decay`. Statues are slightly
  lighter than the architecture so they read as the subjects (the `kind` vertex attribute, §2).
  The floor under a pool is darker, by the same attribute.
- **Haze:** distance fog as in v0, plus height fog that thickens near the floor. Height fog is what
  makes the drowned halls misty.
- **Per vertex, not per hall.** The fields are continuous noise, so the mood is sampled at each
  vertex's world position (`x / CELL`, `z / CELL`) when the hall is built and interpolated across
  the mesh. A corridor's walls therefore shade smoothly into the next hall's, and the next hall's
  mood shows through the doorway before you enter. One mood per hall would step at every doorway,
  because the connector belongs to one neighbour; that is what this rule prevents. Background and
  fog colour still ease toward the current hall's centre mood, as in v0 Task 13.
- **Tuning note:** the hemisphere term brightens floors and darkens ceilings; the height gradient
  does the opposite. They are balanced by eye in phase A; expect the gradient to win in
  chiaroscuro and the hemisphere in luminous halls.
- **Lines** take their colour from the same mood: darker lines on bright stone, paler lines in the
  dark.

## 4. Moods from fields

A pure function `moodFor(light, water, decay)` returns every shader setting for one point. It runs
in Node and is tested like the generator. `build.js` calls it per vertex with the fields sampled at
the vertex (§3); `main.js` calls it once per frame with the current hall's centre values for the
background and global fog.

**`light` is the main axis**, with three stops interpolated continuously:

| stop | light | ambient | key | haze | fog far |
|---|---|---|---|---|---|
| luminous | high | high, warm | soft and broad | pale gold | 44 m |
| dusk | middle | cool blue-grey | moderate | grey-blue | about 30 m |
| chiaroscuro | low | very low | strong and narrow | near black | 18 m |

**`water` adds mist:** height-fog density rises from dry to drowned, and the haze turns cooler and
paler. Wet floors get a faint sheen (brighter at grazing angles).

**`decay` adds wear:** stone darkens and greys, and contact darkening deepens.

**Rules:**

- Every output is a continuous function of the fields; neighbouring vertices never jump.
- Every output stays inside a stated range.
- Darker light means lower ambient and higher contrast.
- Wetter means denser height fog.

The exact colours are tuned by eye in phase A; the tests pin directions and ranges, not hex values.

## 5. Windows and light shafts

Decided in this order, because each step constrains the next:

1. **Window wall.** The hall's stream (salt `windows`) picks one exterior wall of the hall's
   footprint: one of 4 sides for rect halls, 8 for octagons, 12 edges for a cross. The key light's
   azimuth is that wall's inward normal (§3). Walls without a doorway (octagon diagonals, the sides
   of cross arms) are preferred when the hall has them.
2. **Windows.** 1 to 4 glowing rectangles on that wall's surface, not holes, so geometry and
   collision do not change. The count range depends on mood: luminous 2 to 4, dusk 1 to 2,
   chiaroscuro 1 to 2. Positions and sizes come from the same stream. Every window sits within its
   wall's span, its top is within 1.5 m of the ceiling, and it **never overlaps the doorway
   opening** on that wall (every axis wall has a centred doorway; an arch is 6 m high, so in a 6 m
   hall the lintel has zero height and the middle of the wall is open).
3. **Shafts.** One per window: a tapered translucent volume, additive blending, depth write off,
   fading toward the floor, with a soft bright patch where it lands. Angled along the key light,
   with the elevation **clamped so the landing point is inside the hall footprint**. At 40 degrees
   a window 12 m up lands 14 m away, and long halls are 10 to 15 m across, so the clamp is not a
   corner case. In chiaroscuro halls the shaft's azimuth may leave the key direction so it lands on
   a statue; a hall always has at least one (v0 test 2).
4. **By mood:**
   - Luminous halls: several broad, soft shafts.
   - Dusk halls: faint shafts; a dusk hall at the dark end of its range may have none.
   - Chiaroscuro halls: one or two narrow, hard shafts, each aimed so it lands on a statue.

- **Fog:** window glows and shafts take the hall's fog (§2) so they do not shine through the haze.
- **Cost:** about four quads per shaft, in the hall's single effects mesh.

## 6. Water, mirrors and sky

- **Water surface.** A translucent fill under the existing pool grid, tinted from haze and sky. It
  grows brighter at grazing angles (a fake Fresnel term) but its opacity is capped, about 0.6, so
  the mirrored statues below the plane stay visible: they are the reflection, and a pool that goes
  opaque at the angle a mirror shows most would hide them. Pools read as mirrors from a distance and
  as clear water close to. The floor beneath a pool is darker (§3).
- **Mirrors.** The mirrored statues from v0 Task 22 gain the shaded surfaces too, dimmer than the
  originals, so a reflection matches its statue. Winding is flipped by the mirror scale (§2).
- **Clouds.** The clouds above stair halls become soft, pale, translucent shapes with faint lines,
  merged into one mesh per hall. Today each blob is its own group and draw call, up to nine per
  cloud hall; that does not fit the draw-call budget.
- **Birds** stay as line chevrons.

## 7. Looks, debug and performance

**URL flags,** added to the fragment and kept when the fragment is rewritten:

- `look=lines`: the v0 wireframe House (no surfaces or effects, ghost pass on).
- `look=shaded`: the default.
- `debug`: an overlay showing fps, draw calls, triangles and the last hall-build time. It is a
  valueless key, so `readFragment` tests presence (`has`), not value.

`writeFragment` currently rebuilds the fragment from `s`, `x`, `z` alone; it must carry `look` and
`debug` through.

**Budget,** on integrated graphics:

- 60 fps.
- At most 100 draw calls in view. Twenty-five halls are loaded at once, so this holds only with the
  three-meshes-per-hall rule of §2: surfaces, lines, effects, with water and clouds inside the
  effects mesh.
- About 600,000 triangles in view.
- At most 16 ms to build **one crossing**, not one hall. `world.update` builds a whole row of five
  halls when the player crosses a cell boundary, seven when a stair hall is among them (its vista
  halls above and below are built with it). If one crossing cannot fit, builds are spread over
  consecutive frames, one hall per frame, farthest last.

If a phase misses the budget, it does not ship until it fits; cylinder segment counts and the number
of shafts are the first things to cut.

## 8. Testing

**Pure side (Node):**

- `moodFor`: ranges, monotonic directions (darker means less ambient; wetter means more mist),
  continuity (a small change in the fields gives a small change in mood), determinism.
- `poly` triangulation: octagon, cross (concave) and a rect with the well as a hole; the triangles
  cover the outline's area exactly (area sum matches) and no triangle centroid falls inside the
  hole.
- Floors: for one thousand random cells, the stair hall and the hall above it have a well-sized
  hole in their floor; every doorway has a threshold `poly` spanning the wall thickness; ramps
  have surfaces.
- Windows and shafts: count within the mood's range, windows within their wall with tops within
  1.5 m of the ceiling and no overlap with that wall's doorway opening, every shaft landing inside
  the hall footprint (point-in-polygon against the hall's verts), chiaroscuro shafts landing on a
  statue's collision box, determinism.
- URL: `look` and `debug` round-trip through `readFragment` and `writeFragment` and default
  correctly; `#debug` with no value reads as on.
- Every existing test stays green.

**Browser side:** checked by walking it, with `?debug` numbers recorded per phase.

## 9. Rollout

Three phases, each deployed on its own. Alex walks each phase before the next starts.

| phase | builds | sessions |
|---|---|---|
| A | surface meshes, `poly` (floors, holes, thresholds, ramps), the shader, `moodFor`, `look` and `debug` flags, build budget | 3 to 4 |
| B | windows and light shafts | 1 |
| C | shaded water, mirrors and clouds | 1 |

Phase A was two sessions in the first draft. A custom GLSL material with height fog, per-vertex
mood, polygon triangulation with holes, four new floor cases and the debug overlay is more than
four hours; three to four is the honest estimate, and the first walk happens after the shader and
the plain floors, before thresholds and ramps are done.

## 10. Out of scope

- Real-time shadows, post-processing, textures from image files.
- Higher-resolution statues: earmarked separately in `.scratch/hires-statues/`, to follow this
  work.
- The v1 journal and map.
- A quality-settings menu: the `look` flag is the only switch.
