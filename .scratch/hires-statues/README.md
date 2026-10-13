# Higher-resolution statues (earmarked, 2026-10-13)

Paused mid-brainstorm by Alex; pick up here.

Decided:
- Procedural, sculpted in code: smooth shaped parts (tapered limbs, shaped torso and head,
  simple drapery), no asset files, same pose system and seed. Swaps in behind spec §5's
  builder interface (`figure` / `animal` / `object` / `group` -> `{ prims, boxes }`).

Open, next question:
- Line style for smooth shapes. The renderer draws crease edges (EdgesGeometry, 20°), and
  smooth surfaces have almost no creases, so a smooth statue would nearly vanish. Options:
  deliberately faceted low-poly, view-dependent silhouette/contour lines, or cross-section
  rings along limbs. Alex was offered side-by-side visual mockups for this; decide then.
