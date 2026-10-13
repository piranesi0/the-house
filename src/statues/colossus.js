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
import { reachGuard } from './reach.js';

// chance is the roll; about a third of the rolls fail to fit (or would cut the hall into pockets), so
// about a quarter of tall halls have one (measured 23-29% over four seeds, 2026-10-13).
export const COLOSSUS = { minCeiling: 28, chance: 0.7, height: [10, 15], step: 0.5 };
// Upright poses only: a lying figure scaled to 10 m tall would be 40 m long.
const UPRIGHT = Object.keys(POSES).filter(p => !POSES[p].lie);
const FACINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

// The stairwell's end rails are 0.3 m thick (stairwell.js); the shaft walls leave a 1.5 m gap at cz
// on each x side, and the 2.5 m in front of each gap mouth must stay open so you can get in.
const RAIL = 0.3, APPROACH = 2.5, GAP_HALF = 1.5;
export function wellZones({ cx, cz }) {
  const edge = WELL.hx + WELL.wallT;
  return [
    { x0: cx + edge, x1: cx + edge + APPROACH, z0: cz - GAP_HALF, z1: cz + GAP_HALF },
    { x0: cx - edge - APPROACH, x1: cx - edge, z0: cz - GAP_HALF, z1: cz + GAP_HALF },
  ];
}

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
  if (hall.isStair) rects.push({ x0: cx - WELL.hx - WELL.wallT, x1: cx + WELL.hx + WELL.wallT, z0: cz - WELL.hz - RAIL, z1: cz + WELL.hz + RAIL }, ...wellZones(hall));
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
  // Ground storey only: the halls above and below the stair halls are vistas, and have holes.
  if (hall.y !== 0 || hall.ceiling <= COLOSSUS.minCeiling) return null;
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
  const poly = footprint(hall), fits0 = fitter(hall, solids, statues), zones = hall.isStair ? wellZones(hall) : [];
  const fits = (boxes) => fits0(boxes) && !boxes.some(b => zones.some(r => b.min[0] < r.x1 && b.max[0] > r.x0 && b.min[2] < r.z1 && b.max[2] > r.z0));
  const inside = (boxes) => boxes.every(b => [[b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]]].every(c => pointInPolygon(c, poly)));
  // A colossus must not cut the hall into pockets (final review C1: in a cross hall the openest
  // point is the crossing, between the four corner statues). Every pair of doorways (and well gaps)
  // that could reach each other before it stands must still do so; see reach.js. A placement that
  // fails shrinks like one that does not fit.
  const keepsDoors = reachGuard(hall, [...solids, ...statues.flatMap(s => s.boxes)]);
  // The drawn height if it fits the open spot, else 5% shorter at a time, down to 10 m. No draws.
  for (let h = height; ; h = Math.max(COLOSSUS.height[0], h * 0.95)) {
    const scale = h / unitH, built = buildStatue(inst, scale, damage);
    const boxes = translateBoxes(rotateYBoxes(built.boxes, facing), spot.x, hall.floorY, spot.z);
    if (inside(boxes) && fits(boxes) && keepsDoors(boxes)) {
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
