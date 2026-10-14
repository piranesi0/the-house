# The House — scale, sky and marble

**Status:** design approved in conversation 2026-10-13, section by section (scale, sky, marble).
Ready for planning.
S1 (scale) and S2 (sky) shipped 2026-10-14: fps 180 (locked to a 180 Hz display), worst frame 7 ms,
typical hall build 9 ms, worst hall build 21 ms (over the 16 ms budget; being fixed) on Alex's machine.
**Owner:** Alex, building in Claude Code sessions. No Aleph agents.
**Amends:** `2026-10-13-the-house-look-design.md` §3 (key light elevation; haze measured with a flattened distance), §5
(window height), §6 (sky), §7 (draw calls per hall), §9 (rollout); and the v0 spec's hall
dimensions (`STOREY`, ceiling range, doorway heights). Everything else in both specs stands.

## 1. Intent

After walking phases A and B, Alex found three things missing: a real sense of scale, a sky, and
the richness of marble. This spec adds all three without changing what the House is: a seeded,
drawn, walkable world where mood comes from the fields and the line work stays on top.

**Decided in conversation:**

- **Scale is height, not width** (option A of four). The grid, floor plans and walking pace stay;
  ceilings, doorways and some statues grow. You feel small because of what is above you.
- **Sky through every window, and rare roofless halls** (option C of three). The book shows the sky
  through windows and never opens a roof; the House copies nothing from it, and roofless courts are
  a deliberate departure, kept rare.
- **Veined marble and Venetian inlaid floors** (option B of three), procedural, in the shader.
  Architectural relief (pilasters, cornices, coffers) is a later, separate pass.

**Done when:**

1. Standing in an ordinary hall, the ceiling is far enough overhead that you look up to find it;
   one hall in a short walk holds a statue taller than the doorway beside it.
2. Every window shows sky in the hall's mood; a short walk through a bright quarter finds a hall
   open to the sky.
3. Halls in different districts read as different marbles, and the floors read as inlaid patterns,
   without the line work shimmering or the stone looking noisy at a distance.
4. 60 fps on Alex's machine with `?debug`, inside the budget of §6.
5. `look=lines` still gives the v0 wireframe House (at the new dimensions).

## 2. Scale

**Halls** (`src/hall.js`):

- Ceiling range goes from `6..14` m to `18..40` m. `long` halls draw from `18..26`, the other
  shapes from `18..40`. The draw is the same `rng.range` call in the same place, so the hall
  stream's order and every later draw are unchanged; only the value differs.
- `STOREY` goes from `12` to `44`, so the tallest ceiling (40) fits under the floor above with the
  slab and a margin. Stair halls keep `ceiling <= STOREY - 1`.
- `CELL` (24 m), shapes, half-extents, wall thickness, walking speed (2.8 m/s) and eye height are
  unchanged.

**Doorways** (`src/connectors.js` `TYPES`): heights double. `arch` and `steps` go from 6 to 12 m,
`door` and `vestibule` from 3 to 6 m. Widths are unchanged, so the openings become tall and narrow.
Every ceiling (at least 18 m) stays above the tallest opening plus a lintel.

**Stairwells:** the well's footprint and its sealed landings are unchanged. The halls above and
below are now 44 m away, so the well is a deep shaft to look down into or up out of. The vista
halls are still built, queued as today.

**Statues:**

- Ordinary statues keep today's scale range (about 1 to 3 times human size) and placement, so there
  is always something human-sized to measure the hall against.
- **Colossi:** a hall with a ceiling above 28 m holds one colossus in about one case in four,
  decided by a new stream with salt `colossus`. A colossus is 10 to 15 m tall (statue scale chosen
  for that height), stands on the hall's largest open floor area, and is placed **in addition to**
  the ordinary statues, never replacing one, so the ordinary placement stream is unchanged. If it
  does not fit (the existing fit check against walls, the well and other statues), the hall has
  none. Its triangle count is that of any statue.

**Light and fog:**

- Windows (`src/windows.js`) keep their top within 1.5 m of the ceiling. Window height becomes
  about 30% of the ceiling height (so 5 to 12 m) instead of today's fixed range.
- The nominal key-light elevation range becomes 50 to 75 degrees below horizontal (was 40 to 60),
  still clamped so every shaft lands inside the hall and off the well. A 35 m-high window over a
  22 m hall then lands its shaft without being forced to vertical.
- Fog far by light is unchanged: 18 m (chiaroscuro), about 31 m at dusk, 44 m luminous, so no hall
  beyond the loaded ring (48 m at worst) ever shows at the horizon. `moodFor` is unchanged.
- What changes is how the surface, effects and window-portal shaders measure fog distance: the
  horizontal distance plus one third of the vertical, `d = length(off.xz) + abs(off.y) / 3`, where
  `off` is the camera-to-fragment offset in world orientation (the view-space offset turned back by
  the view rotation only, so no world-scale position is formed). A 40 m vault overhead then fogs
  like something 13 m away and stays visible; the horizon fogs exactly as before. Height fog is
  unchanged.
- Lines, the water grid and birds keep three's built-in fog, but its distance is patched once at
  startup (`src/fogchunk.js`) to the same measure, so vault line work stays drawn wherever the stone
  does. Built-in fog still eases with smoothstep where the stone fades linearly.
- The camera's far plane stays at 200 m.

**Determinism:** same seed, same House. Old links open at the same cell, but the hall there is
taller. No existing stream's draw order changes; the only new salts are `colossus` and `roof`
(§3).

## 3. Sky

**One sky dome** (`src/skydome.js`, browser): a sphere of radius 150 m centred on the camera every
frame, drawn first (`renderOrder` below everything, depth write off, no fog). Its colour follows
the same eased fields as the background (`light`, `water`, `decay`, over about 1.5 s):

- **Luminous:** pale warm sky, a soft sun glow, faint cloud bands.
- **Dusk:** deep blue overhead fading to an amber horizon band, faint cloud bands.
- **Chiaroscuro:** near-black with stars (a hashed star field in the shader, no texture).

The sun or moon glow sits opposite the current hall's key-light direction (where the light comes
from), eased with the fields, so looking at a window means looking toward its light. Cloud bands
are shader noise in the dome; they are not the upper-hall clouds of the look spec's phase C.

**Windows become openings:** each window pane is drawn with a sky-portal material that colours each
pixel from the sky dome's function along the view ray, so the pane reads as a hole in the wall
without cutting the wall geometry. The panes of one hall are one mesh (one draw call). The glow
quad around each window stays in the effects mesh.

**Roofless halls:**

- About 1 in 10 halls with `light > 0.66` is roofless, decided by a new stream with salt `roof`.
  Stair halls and vista halls are never roofless.
- A roofless hall has no ceiling `poly` and no ceiling outline. Its walls rise to their full height
  and end in a top edge line.
- It has no windows and no shafts. Its key light comes from almost straight above: elevation 70
  to 80 degrees, azimuth drawn from the `roof` stream.
- A pure function `isRoofless(seedHash, hall)` decides it, so shapes, windows and world agree.

**`look=lines`:** no dome and no portals; the v0 background stays. Roofless halls simply have no
ceiling lines.

## 4. Marble

**Marbles by district** (`src/marble.js`, pure): the `theme` field, sampled at one-third resolution
(`fields.theme(hall.x / 3, hall.z / 3)`), picks one of six marbles per district, so a district spans
several halls rather than the two or three the field's own grain would give:

| marble | base | veins |
|---|---|---|
| Carrara | white | grey |
| Bardiglio | blue-grey | darker blue-grey |
| Rosso Verona | warm pink-red | cream |
| Verde antico | dark green | black and pale green |
| Giallo | honey yellow | amber |
| Nero | black | white |

Each marble is a base colour, a vein colour and a vein strength, plus two inlay colours for floors.
Mood still sets the light: the marble tints `stone` multiplicatively and the veins mix on top, so
a dark hall of Carrara reads dark, not white. `moodFor` is unchanged; the surface shader combines
mood and marble.

**Veins:** a classic marble function (turbulent sine over 3D noise) in the surface shader, on walls,
floors and ceilings, at reduced strength on statues (kind 1). Coordinates are the vertex's
hall-relative position (already passed for precision), so each hall is its own block of stone and
the far-coordinate precision fix of the look spec holds. Vein contrast fades to zero between 10 and
15 m from the camera, so distant stone is calm and the lines stay crisp.

**Venetian floors:** floors, thresholds and ramps (a new surface kind, `floor`) get an inlaid
pattern in two or three colours from the district's marble, chosen per hall by `marbleFor`:

- **Chequer:** squares about 1.2 m, set diagonally.
- **Medallion:** concentric rings and an eight-point star centred on the hall.
- **Bands:** a border band following the hall's actual outline (octagon and cross included; the
  footprint is passed to the shader as a uniform array of up to 12 vertices), around a field of
  small chequer.

Pattern edges are antialiased with screen-space derivatives (`fwidth`), so they do not shimmer at a
distance. Veins run across the inlay as well.

**Pure interface:** `marbleFor(seedHash, hall, fields) -> { marble, pattern }` where `marble` is one of the
six table entries (by name) and `pattern` is `'chequer' | 'medallion' | 'bands'`. It is a function
of the theme field at one-third resolution (marble) and a draw from a new stream with salt `marble`
(pattern).

## 5. What changes where

| file | change |
|---|---|
| `src/hall.js` | ceiling ranges, `STOREY` |
| `src/connectors.js` | doorway heights |
| `src/statues/place.js` (+ new colossus helper) | one colossus per qualifying hall |
| `src/windows.js` | window height, elevation range; roofless halls return no windows and an overhead key |
| `src/roof.js` (new, pure) | `isRoofless`, overhead key direction |
| `src/shapes/*` | roofless halls omit ceiling poly and outline, add a top edge line |
| `src/material.js`, `src/effects.js` | fog distance: horizontal plus one third of vertical |
| `src/marble.js` (new, pure) | marble table, `marbleFor` |
| `src/material.js` | veins, floor patterns, marble uniforms, `floor` kind; sky portal material |
| `src/skydome.js` (new) | the dome and its shader function, shared with the portals |
| `src/effects.js`, `src/world.js`, `src/main.js` | portal mesh per hall, marble uniforms, dome per frame |

## 6. Budget

Unchanged limits: 60 fps, at most 100 draw calls in view, about 600,000 triangles in view, at most
16 ms of hall building per frame.

- Draw calls per hall become four for a hall with windows: lines, surfaces, effects, window
  portals. The dome is one call per frame. About 30 calls in view in practice.
- Triangles: colossi add one statue's worth in a quarter of tall halls; the dome is a low-poly
  sphere. Negligible.
- Fragment cost rises (veins, patterns, portals). Checked against fps on the walk; if it costs
  frames, vein octaves are cut first, then the pattern antialiasing.

## 7. Testing

**Pure side (Node):**

- Halls: ceilings within the new ranges per shape; stair-hall ceilings at most `STOREY - 1`;
  `STOREY` is 44; for 1000 cells, the hall stream's other outputs (shape, half-extents, wall,
  stair, pool) are identical to before the change.
- Doorways: every opening's height plus a lintel fits under both halls' ceilings.
- Colossi: present in roughly a quarter of halls with a ceiling above 28 m (a wide band, over many
  cells), none in lower halls; every colossus fits (no overlap with walls, the well or statues);
  ordinary statues are identical with and without the colossus stream.
- Roofless: roughly 10% of non-stair halls with `light > 0.66` (wide band), none elsewhere; a
  roofless hall has no ceiling polys and no windows; its key elevation is 70 to 80 degrees.
- Windows: heights about 30% of the ceiling, tops within 1.5 m of it, elevation range 50 to 75
  before clamping, and every phase B window test still green at the new dimensions.
- Mood: unchanged; fog far stays within `18..44`. The flattened fog distance is shader-only and is
  checked on the walk (a 40 m vault visible overhead, no pop-in at the horizon).
- Marble: `marbleFor` is deterministic; all six marbles and all three patterns are reachable over
  many halls; the marble is constant within a district (neighbouring cells change marble only across
  a cut of the one-third-resolution theme, and far less often than at full resolution).
- Every existing test stays green, with constants that encode the old dimensions updated, not
  deleted.

**Browser side:** walked, with `?debug` numbers recorded per phase.

## 8. Rollout

Three phases, each walked by Alex before the next. The look spec's phase C (water, mirrors,
clouds; Task 13 re-planned so pools are cut out of the floor) follows after them, built at the new
dimensions.

| phase | builds |
|---|---|
| S1 | scale: ceilings, storeys, doorways, colossi, window height and elevation, fog distance measure |
| S2 | sky: dome, window portals, roofless halls |
| S3 | marble: marble table, veins, Venetian floors |

## 9. Out of scope

- Architectural relief: pilasters, cornices, coffered ceilings (a later pass).
- Wider halls or a larger grid (option B, not chosen).
- Longer sightlines and aligned enfilades (option C, not chosen).
- Image textures, normal maps, reflections on the marble.
