# The House — v0 design

**Status:** approved in conversation 2026-10-13; this file is the written spec for review.
**Owner:** Alex, building in Claude Code sessions. No Aleph agents.
**Inspiration:** Susanna Clarke's *Piranesi*. Inspired by, never copied: no text from the book, no
named places or statues from it, our own subjects throughout. The book is credited in the README.

## 1. Intent

A seeded, infinite, first-person 3D world in the browser, drawn in wireframe: endless halls of
statues, water in the lower halls, cloud above the upper ones, a place that is kind and
indifferent at once. Each hall is different from the last and the same every time you return.
Visual, not textual. Nothing graphically intense.

**v0 is wandering only.** There is no goal. The reward is the next hall and the feeling of the
place. Later cuts add a journal and map (v1) and tides (v2); v0 has to earn them.

**v0 is done when both of these are true:**

1. **The private test.** Alex walks it for twenty minutes and opens it again the next day
   without being asked to.
2. **The company test.** It is live at a public URL with the seed and hall in the address, so
   two people can stand in the same hall.

Not a v0 test, kept for v1: someone who has read the book, shown it untitled, names the book.

**Budget:** ten two-hour sessions. The first three (one weekend) produce a deployed grey box so
the private test starts early.

## 2. The shape of the House

- **Lattice.** The walkable storey is an infinite grid of cells. One cell is one hall. A cell is
  a 24 m square on the ground. Coordinates are integer `(x, y, z)`; `y` is the storey and only
  `y = 0` is walkable in v0. Storeys are 12 m apart.
- **Four doorways, always.** Every hall has a doorway in the middle of each of its four sides.
  The grid is fully connected: nothing on this storey is ever sealed, so the player can never be
  trapped and going back is always the same way you came.
- **Connectors.** The passage between `(x, z)` and `(x+1, z)` is the *east connector* of
  `(x, z)`; the passage to `(x, z+1)` is its *south connector*. A connector's type comes from its
  own stream, seeded by the owning cell and the side, so both neighbouring halls derive the same
  answer. Types: wide arch (4 m wide, 6 m high), narrow door (1.6 m by 3 m), vestibule (an
  octagonal room 6 m across with a door at each end), two steps up (a 0.4 m rise as a 1.5 m ramp,
  so there is no stair logic). A vestibule is only allowed when the combined passage length
  between the two halls' footprints is at least 7 m; otherwise the stream's choice downgrades to
  an arch.
- **Hall shapes.** Five authored shapes, parameterised: long hall (narrow, long axis north-south
  or east-west), square hall, octagonal hall, cross-shaped hall, colonnaded hall (a double row of
  columns down the middle). The footprint fills 60 to 95 percent of the cell; the remainder is
  wall thickness (1 to 2 m) and passage. Ceiling height is 6 to 14 m.
- **Regions.** Four slow noise fields over `(x, z)` give geography:
  - `water` — dry, puddles, pool, waist-deep;
  - `light` — bright, dim, dark;
  - `decay` — clean, cracked, fallen blocks;
  - `theme` — which statue family dominates.
  The hash decides the hall; the fields bias it. Walk south and the halls get wetter; walk east
  and they get darker.
- **Stair halls.** A hall is a stair hall with probability 8 percent, doubled where `water > 0.6`
  or `light > 0.7`. A stair hall has a stairwell in its centre: steps down to a landing 4 m below
  the floor, a balcony inside the top of the hall at `y = -1`; steps up to a landing 4 m above
  the floor, a balcony at the foot of the hall at `y = +1`. Both landings end in a balustrade. These are the only places the other storeys are seen in v0. The halls above and
  below are real halls from the same generator, so unblocking the stairs later changes nothing.

## 3. Generation, seeds and the address bar

- **Hash.** `hash32(seedHash, x, y, z, saltHash)` is a 32-bit mix (splitmix-style) feeding a
  `mulberry32` stream. Every number a hall needs comes from a stream: shape, footprint, ceiling,
  connector types (via the connector's own stream), statue count and placement, debris, pool
  outline. The `salt` separates streams, so changing statue placement never changes a hall's
  shape. A hall is a pure function of `(seed, x, y, z)`; no world state is stored.
- **Fields.** 2D simplex noise, one feature every 8 to 12 cells, each field with its own seed
  offset, values in `[0, 1]`. Fields are sampled at the cell's integer coordinates.
- **Load and dispose.** Halls within 2 cells of the player (a 5 by 5 block) are built; halls
  beyond 3 cells are disposed. Building means parameters, then wireframe geometry, then statues.
  The `y = ±1` halls are built only for stair halls in range, and only the one cell directly
  above and below. Fog hides the load boundary. A hall rebuilt later is identical.
- **URL.** The fragment is the save file: `#s=<seed>&x=<int>&z=<int>`, rewritten on each hall
  crossing (debounced to once per crossing). On load with a fragment, the player starts at that
  hall's centre facing north. With no fragment, a seed of two words from a small built-in list
  is drawn and written to the fragment so it can be shared.
- **Determinism tests** (section 7) are the acceptance test for this section.

## 4. The player

- **Controls.** Click to capture the pointer; mouse to look; `W A S D` to walk; `Shift` to walk
  slower (1.4 m/s); `Escape` releases the pointer. No jump, crouch or run. Walking speed 2.8 m/s
  (doubled from 1.4 after the first walk, 2026-10-13).
  Eye height 1.7 m. Field of view 70 degrees. Look input is smoothed with a short exponential
  ease, 100 to 150 ms, tuned by feel. (The chat design said half a second; that is too laggy for
  mouse look, so the spec sets a shorter range.)
- **Collision.** Each hall exports axis-aligned boxes: walls, columns, plinths, fallen blocks,
  balustrades, vestibule walls. The player is a vertical capsule (radius 0.35 m) tested against
  the boxes of the current hall and its four neighbours, sliding along surfaces. Doorways are
  gaps in the wall boxes. No physics engine.
- **Water.** A pool's depth comes from the `water` field: below 0.35 dry; 0.35 to 0.55 puddles
  (0.05 m, decorative); 0.55 to 0.75 pool (0.4 m); above 0.75 waist-deep (1.0 m). The pool
  outline is a rounded polygon from the hall's stream, inset from the walls. In water the player's
  speed is multiplied by `1 - 0.6 * depth` and the camera drops by half the depth. You can always
  wade out.
- **Vistas.** The two stairwells of a stair hall are walkable to their landings (steps as a ramp
  underfoot, with step edges drawn). Each landing's balustrade is a collision box. The downward
  landing overlooks the flooded hall below (its water plane and statue tops); the upward landing
  looks into the hall above, which has no ceiling and shows cloud.
- **Feel.** A slight head bob at walking pace, slower and deeper in water. Standing still should
  feel like a reasonable thing to do.

## 5. The statues

- **Unique by construction.** A statue is `plinth + subject + pose + prop + damage + scale`, each
  from the hall's statue stream. Within a hall no two statues share `(subject, pose)`; the
  generator rejects and redraws. Statue count per hall is 2 to 14, scaled by footprint.
- **Subjects, four families, weighted by `theme`.**
  - Figures: standing, seated, kneeling, reaching, carrying, reading, listening.
  - Animals: horse, ox, fox, hare, bear, heron, owl, dog.
  - Objects: urn, boat, ladder, bell, wheel, loom.
  - Groups: two figures; a figure and an animal; a figure and a child.
  These are our subjects. Nothing is taken from the book.
- **Figures from primitives.** About twelve boxes and cylinders (head, neck, torso, pelvis, upper
  arms, forearms, thighs, shins, feet) on a seven-and-a-half-heads canon with a slight
  contrapposto by default. A pose library sets joint angles; the hash picks a pose and perturbs
  it slightly. **The first six poses are the quality lever** and get two sessions: standing,
  seated, kneeling, reaching up, carrying, reading. Later six: listening, walking, lying, pointing,
  bowed, holding (child or animal).
- **Plinths and placement.** Plinths are boxes, stepped boxes, or a column drum. Placement
  follows the hall shape: niches at a regular interval along walls; a row down a colonnade; one
  colossal figure in the centre of a square hall; a group on a dais in an octagon. Scale runs from
  life-size (1.8 m) to three times it, biased larger in bigger halls. No statue box may overlap a
  doorway gap.
- **Damage.** The `decay` field scales probabilities: missing arm `0.25 * decay`, missing head
  `0.10 * decay`, fallen `0.08 * decay`, crack line `0.50 * decay`. A fallen statue lies on its
  side beside an empty plinth and is a collision box.
- **Interface.** The figure builder is one module: given `(subject, pose, scale)` it returns a
  mesh and its collision boxes. A low-poly mesh library can replace it without touching placement,
  damage or halls.

## 6. The look and the air

- **Wireframe, but not raw.** Meshes render as crease edges (edge geometry with a 20 degree
  threshold) as one-pixel line segments, so a column is a few long lines. A second pass draws the
  same lines with depth test off at about 15 percent opacity, so the far side of an object reads
  faintly and depth is legible. No fills, no textures.
- **Colour from `light`.** Ground and line colours interpolate continuously across three stops:
  bright (pale lines `#6b6660` on near-white `#f4f1ea`), dim (pale lines `#d8d4cc` on deep grey
  `#3a3a40`), dark (blue-grey lines `#4a5566` on near-black `#05060a`). The player notices they
  have walked into the dark, not that they crossed a line.
- **Fog.** Distance fog matched to the ground colour. Far distance from `light`: about 55 m in
  the bright, about 18 m in the dark. The loaded block extends 60 m from the player along the
  axes, so even the brightest hall fades out before the load boundary.
- **Water.** The pool plane is a grid whose vertices move on two slow sine waves, drawn in a
  cooler line colour. Statues standing in water get a mirrored copy below the plane, dimmer and
  broken by the undulation.
- **Sky.** The hall above a stair hall has no ceiling. A slow layer of large soft wireframe blobs
  drifts past at height: rare in the dark, constant in the bright.
- **Birds.** With probability `0.15 * light * (1 - water)` a hall has a flock of 8 to 14
  two-line chevrons flying a looping path between columns and settling on cornices. They, the
  water and the cloud are the only things that move.
- **Sound, minimal and last.** Five samples: room tone filtered by hall size, step on stone, step
  in water, drip (drowned quarter), wings (flock take-off). No music. v0 ships without sound if
  time runs out.

## 7. Code, tests, deploy

- **Stack.** Plain ES modules. Three.js from a CDN import map pinned to one version. No bundler.
  Static files only.
- **Modules.** Pure (run in Node for tests): `rng`, `noise`, `fields`, `hall` (parameters),
  `shapes/` (five halls), `connectors`, `statues/` (`figure`, `animal`, `object`, `group`,
  `poses`, `damage`, `place`), `edges`. Browser-only: `world` (load and dispose), `player`
  (controls and collision), `water`, `sky`, `birds`, `audio`, `url`, `main`. One job per module.
- **Tests** (`node --test`, pure side only):
  1. Generating a hall twice, in any order and from any load path, gives byte-identical
     parameters and geometry.
  2. One thousand random cells: every hall has four doorways and at least one statue; every
     connector derives identically from both of its halls.
  3. Every pose keeps every joint inside its allowed range.
  4. No statue collision box overlaps a doorway gap.
  The browser side is checked by walking it.
- **Repo and deploy.** Repo `the-house`, GitHub `piranesi0/the-house`, public when live, MIT for
  the code, inspiration credited in the README. Deployed with GitHub Pages from `main`: no Caddy
  route, no webhook, no host work. `piranesi.cc` can point at it later with a CNAME.

## 8. Sessions

| Session | Builds | Checkpoint |
|---|---|---|
| 1 to 3 (one weekend) | `rng`, `fields`, one hall shape, four doorways and connectors, controls, collision, load and dispose, seed in the URL, Pages deploy | Grey box live. Private test starts. |
| 4 to 5 | The other four shapes, regions visible through colour and fog, pools and wading | Geography is felt. |
| 6 to 7 | Figure canon, the first six poses, placement patterns, damage; then animals and objects | Halls read as remembered, not decorated. |
| 8 | Stair halls, both vistas, cloud | Looking down at water, up at sky. |
| 9 | Birds, polish, sound if time | Something moves. |
| 10 | Tests green, link shared | Did you open it yesterday without meaning to? |

## 9. Hooks for later, costing nothing now

- **v1 journal and map.** The map is the lattice. A visited-hall set per seed is kept in the
  browser (`localStorage`), and the journal is written against it.
- **v2 tides.** The `water` field's constant becomes a slow function of time, and the
  balustrades are removed so the stairs lead somewhere. The generator does not change.

## 10. Out of scope for v0

No journal, map or tides. No goal. No multiplayer or presence. No save beyond the URL. No
mobile or touch controls. No textures or fills. No Aleph agent work; the ticket can be linked to
the public-artefact goal when it is live, but nothing here waits on the company.
