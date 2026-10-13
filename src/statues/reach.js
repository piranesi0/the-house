// Door-to-door reachability on a coarse grid, for the colossus fit check (final review C1). Pure and
// deterministic; no random draws.
//
// The floor is sampled at cell centres REACH_CELL apart, aligned so a centre falls on the hall's
// axes (the doorways sit on them). A centre is blocked if it is outside the footprint or strictly
// inside any collision box that reaches the player's body band (floorY + 0.2 to 1.8 m, as
// Player.moveAxis), grown by a clearance r. Free centres join their four neighbours. Every grown box
// is at least 2r >= 0.7 m wide, more than a cell, so it cannot hide between two free neighbours: a
// 4-connected path of free centres is a path the player can walk. The converse is conservative: a
// gap within a cell of the player's width may read as closed.
import { pointInPolygon } from '../hall.js';
import { footprint } from '../shapes/footprint.js';
import { RADIUS } from '../player.js';
import { WELL } from '../shapes/stairwell.js';

export const REACH_CELL = 0.25;
const INSET = 1.0;    // seeds stand this far inside each doorway
// Two clearances. At the player's own radius the contract holds exactly (no pair of doorways the
// player could walk between is cut off). At radius + 0.15 a way round must also be 1 m wide, so a
// colossus never leaves only a slit to scrape through. A pair counts only at the clearances it
// already had before the colossus.
const CLEARANCES = [RADIUS, RADIUS + 0.15];

// The places that must reach each other: just inside each of the four doorways (every hall has a
// connector on each axis wall, connsFor), and in a stair hall the mouth of each gap into the well.
export function reachSeeds(hall) {
  const { cx, cz, hx, hz } = hall;
  const seeds = [[cx, cz - hz + INSET], [cx, cz + hz - INSET], [cx + hx - INSET, cz], [cx - hx + INSET, cz]];
  if (hall.isStair) { const e = WELL.hx + WELL.wallT + INSET; seeds.push([cx + e, cz], [cx - e, cz]); }
  return seeds;
}

// The footprint mask: 1 where the cell centre is on the hall's floor.
function floorMask(hall) {
  const { cx, cz, hx, hz } = hall, s = REACH_CELL;
  const nx = Math.ceil(hx / s), nz = Math.ceil(hz / s), n = 2 * nx + 1, m = 2 * nz + 1;
  const free = new Uint8Array(n * m), poly = footprint(hall);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) free[i * m + j] = pointInPolygon([cx + (i - nx) * s, cz + (j - nz) * s], poly) ? 1 : 0;
  return { cx, cz, nx, nz, n, m, free };
}

// Marks the cells under `boxes` (grown by r, body band only) as blocked, in place.
function stamp(g, hall, boxes, r) {
  const s = REACH_CELL, y0 = hall.floorY + 0.2, y1 = hall.floorY + 1.8;
  for (const b of boxes) {
    if (b.max[1] < y0 || b.min[1] > y1) continue;
    const ax = b.min[0] - r, bx = b.max[0] + r, az = b.min[2] - r, bz = b.max[2] + r;
    const i0 = Math.max(0, Math.floor((ax - g.cx) / s) + g.nx), i1 = Math.min(g.n - 1, Math.ceil((bx - g.cx) / s) + g.nx);
    const j0 = Math.max(0, Math.floor((az - g.cz) / s) + g.nz), j1 = Math.min(g.m - 1, Math.ceil((bz - g.cz) / s) + g.nz);
    for (let i = i0; i <= i1; i++) {
      const x = g.cx + (i - g.nx) * s;
      if (x <= ax || x >= bx) continue;
      for (let j = j0; j <= j1; j++) {
        const z = g.cz + (j - g.nz) * s;
        if (z > az && z < bz) g.free[i * g.m + j] = 0;
      }
    }
  }
  return g;
}

// Component label of each seed (-1 if its cell is blocked or off the grid), by flood fill.
function seedComponents(g, seeds) {
  const s = REACH_CELL, label = new Int32Array(g.n * g.m).fill(-1), stack = [];
  return seeds.map(([x, z], k) => {
    const i = Math.round((x - g.cx) / s) + g.nx, j = Math.round((z - g.cz) / s) + g.nz;
    if (i < 0 || j < 0 || i >= g.n || j >= g.m) return -1;
    const c0 = i * g.m + j;
    if (!g.free[c0]) return -1;
    if (label[c0] >= 0) return label[c0];
    label[c0] = k; stack.push(c0);
    while (stack.length) {
      const c = stack.pop(), ci = Math.floor(c / g.m), cj = c - ci * g.m;
      const visit = (d) => { if (g.free[d] && label[d] < 0) { label[d] = k; stack.push(d); } };
      if (ci > 0) visit(c - g.m);
      if (ci < g.n - 1) visit(c + g.m);
      if (cj > 0) visit(c - 1);
      if (cj < g.m - 1) visit(c + 1);
    }
    return k;
  });
}

// True when every pair of seeds connected in `before` is still connected in `after`.
function keepsPairs(before, after) {
  for (let a = 0; a < before.length; a++) for (let b = a + 1; b < before.length; b++) {
    if (before[a] >= 0 && before[a] === before[b] && (after[a] < 0 || after[a] !== after[b])) return false;
  }
  return true;
}

// Given the hall and its solids (walls, columns, well, ordinary statues), returns a test for extra
// boxes: true when adding them cuts no pair of doorways (or well gaps) apart, at either clearance.
// The grids without the extra boxes are built once, on the first call.
export function reachGuard(hall, solids) {
  let grids = null;
  const seeds = reachSeeds(hall);
  return (extra) => {
    if (!grids) {
      const mask = floorMask(hall);
      grids = CLEARANCES.map(r => {
        const g = stamp({ ...mask, free: mask.free.slice() }, hall, solids, r);
        return { r, g, before: seedComponents(g, seeds) };
      });
    }
    return grids.every(({ r, g, before }) => keepsPairs(before, seedComponents(stamp({ ...g, free: g.free.slice() }, hall, extra, r), seeds)));
  };
}
