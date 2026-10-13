# The House — look and atmosphere

**Status:** design approved in conversation 2026-10-13; this file is the written spec for review.
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

1. **Surface mesh (new).** Every `box`, `cyl` and `sphere` primitive also becomes solid triangles
   with normals, merged into one mesh per hall using the House material (§3).
2. **Line mesh (unchanged).** The crease edges, drawn over the surfaces. Surfaces use a polygon
   offset (factor 1, units 1) so the lines never flicker into them.
3. **Effects (new).** Window glows, light shafts (§5) and the shaded water surface (§6).

- **New primitive kind `poly`:** a flat filled polygon, `{ kind: 'poly', points: [[x, y, z], ...] }`,
  all points at one height. It fills the floors and ceilings that are outlines today: octagon
  floors and ceilings, cross floors and ceilings, and the main-floor outline around a stairwell.
  It must handle the concave cross shape and must not cover the stairwell hole or any doorway gap.
  `lines` and `segs` primitives stay lines only.
- **Ghost pass:** off by default; it reads as a glitch through solid walls. It remains available
  to the `lines` look.
- **Unchanged:** the generator, placement, collision, the URL, and every existing test. The world
  is still a pure function of the seed. New code lives in `build.js`, a material module, and an
  effects module.
- **Cost:** about three draw calls per hall instead of two.

## 3. Lighting model

One shader, four lighting terms, no shadow maps.

1. **Sky and bounce.** A hemisphere term: up-facing surfaces take the sky colour, down-facing ones a
   warmer bounce from the floor.
2. **Window key light.** One directional light per hall. Its azimuth comes from the hall's stream;
   its elevation is 40 to 60 degrees below horizontal (light slants down from high windows). Plain
   diffuse, no cast shadows.
3. **Height gradient.** Light enters high: brightness falls from the ceiling toward the floor.
4. **Contact darkening.** A soft dark band within about 0.6 m above the hall floor (wall bases,
   plinth bases, statue feet) as a stand-in for ambient occlusion.

- **Surface colour:** pale warm stone, darkened and greyed by `decay`. Statues are slightly
  lighter than the architecture so they read as the subjects.
- **Haze:** distance fog as in v0, plus height fog that thickens near the floor. Height fog is what
  makes the drowned halls misty.
- **Per hall:** each hall's material takes its own mood (§4), so the next hall's mood shows through
  the doorway before you enter. Background and fog colour still ease toward the current hall, as in
  v0 Task 13.
- **Lines** take their colour from the same mood: darker lines on bright stone, paler lines in the
  dark.

## 4. Moods from fields

A pure function `moodFor(hall)` returns every shader setting for a hall. It runs in Node and is
tested like the generator.

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

- Every output is a continuous function of the fields; neighbouring halls never jump.
- Every output stays inside a stated range.
- Darker light means lower ambient and higher contrast.
- Wetter means denser height fog.

The exact colours are tuned by eye in phase A; the tests pin directions and ranges, not hex values.

## 5. Windows and light shafts

- **Windows.** Each hall has 1 to 4 windows high on the wall its key light comes through: glowing
  rectangles on the wall surface, not holes, so geometry and collision do not change. Count,
  positions and sizes come from the hall's own stream (salt `windows`). Every window sits within its
  wall's span and its top is within 1.5 m of the ceiling.
- **Shafts.** From each window a tapered translucent volume, additive blending, depth write off,
  angled along the key light and fading toward the floor, with a soft bright patch where it lands.
  Every shaft lands inside the hall.
- **By mood:**
  - Luminous halls: several broad, soft shafts.
  - Dusk halls: faint shafts or none.
  - Chiaroscuro halls: one or two narrow, hard shafts, each aimed so it lands on a statue.
- **Cost:** about four quads per shaft.

## 6. Water, mirrors and sky

- **Water surface.** A translucent fill under the existing pool grid, tinted from haze and sky. It
  grows more opaque and brighter at grazing angles (a fake Fresnel term), so pools read as mirrors
  from a distance and as clear water close to. The floor beneath a pool is darker.
- **Mirrors.** The mirrored statues from v0 Task 22 gain the shaded surfaces too, dimmer than the
  originals, so a reflection matches its statue.
- **Clouds.** The clouds above stair halls become soft, pale, translucent shapes with faint lines.
- **Birds** stay as line chevrons.

## 7. Looks, debug and performance

**URL flags,** added to the fragment and kept when the fragment is rewritten:

- `look=lines`: the v0 wireframe House (no surfaces or effects, ghost pass on).
- `look=shaded`: the default.
- `debug`: an overlay showing fps, draw calls and triangles.

**Budget,** on integrated graphics:

- 60 fps.
- At most 100 draw calls in view.
- About 600,000 triangles in view.
- At most 8 ms to build one hall, so crossing into a new hall does not stutter.

If a phase misses the budget, it does not ship until it fits; cylinder segment counts and the number
of shafts are the first things to cut.

## 8. Testing

**Pure side (Node):**

- `moodFor`: ranges, monotonic directions (darker means less ambient; wetter means more mist),
  continuity (a small change in the fields gives a small change in mood), determinism.
- `poly`: octagon, cross (concave) and the stairwell outline fill completely and never cover the
  well or a doorway gap.
- Windows and shafts: 1 to 4 per hall, windows within their wall with tops within 1.5 m of the ceiling, shafts
  landing inside the hall, chiaroscuro shafts landing on a statue, determinism.
- URL: `look` and `debug` round-trip and default correctly.
- Every existing test stays green.

**Browser side:** checked by walking it, with `?debug` numbers recorded per phase.

## 9. Rollout

Three phases, each deployed on its own. Alex walks each phase before the next starts.

| phase | builds | sessions |
|---|---|---|
| A | surface meshes, `poly`, the shader, `moodFor`, `look` and `debug` flags | 2 |
| B | windows and light shafts | 1 |
| C | shaded water, mirrors and clouds | 1 |

## 10. Out of scope

- Real-time shadows, post-processing, textures from image files.
- Higher-resolution statues: earmarked separately in `.scratch/hires-statues/`, to follow this
  work.
- The v1 journal and map.
- A quality-settings menu: the `look` flag is the only switch.
