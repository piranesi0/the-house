# The House

A seeded, infinite, first-person wireframe House. Endless halls of statues, water in the
lower halls, cloud above the upper ones.

Live: https://piranesi0.github.io/the-house/ (the seed and hall are in the address bar).

Inspired by Susanna Clarke's *Piranesi*. Inspired by, not adapted: nothing here is taken
from the book.

Open `index.html` over HTTP (`npm run serve`, then http://localhost:8080/). Click to look
around, `W A S D` to walk, `Shift` to walk slowly, `Escape` to release the mouse.

The address bar is the save file: `#s=<seed>&x=<hall>&z=<hall>`. Send the link and someone
else stands in the same hall.

## What is here

- A seeded lattice of halls: five shapes, four doorway types, regions of water, light and decay.
- Statues built from primitives: figures in six poses, eight animals, six objects, three groups, with damage from the decay field.
- Stair halls with landings over the drowned halls and under open sky.
- Pools you wade through, birds, cloud, and a little synthesised sound.

Nothing is stored. Every hall is a function of the seed and its coordinates.

Tests: `npm test` (Node 24).
