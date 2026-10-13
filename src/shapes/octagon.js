import { octagonWalls, octagonSlab, facingToward } from './common.js';

export function buildOctagon(hall, conns, opts = {}) {
  const { cx, cz, hx: ap, ceiling, wall: t, floorY: f } = hall;
  const { prims, boxes } = octagonWalls(cx, cz, ap, ceiling, t, f, { n: conns.n, s: conns.s, e: conns.e, w: conns.w });
  prims.push(octagonSlab(cx, f, cz, ap));
  if (opts.ceiling !== false) prims.push(octagonSlab(cx, f + ceiling, cz, ap));
  const slots = [];
  // In a small octagon the diagonal niches crowd the doorways; pull them in and keep them life-size.
  const small = ap < 7.6;
  const d = small ? ap - 3.35 : (ap - 2.0) / Math.SQRT2;
  for (const [dx, dz] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
    slots.push({ x: cx + dx * d, z: cz + dz * d, facing: facingToward(-dx, -dz), maxScale: small ? 1 : 1.4, kind: 'niche' });
  }
  slots.push({ x: cx, z: cz, facing: 0, maxScale: 2, kind: 'dais' });
  return { prims, boxes, floors: [], slots };
}
