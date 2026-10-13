import { axisPolygonWalls, nicheSlotsForPolygon, facingToward } from './common.js';
import { lines, poly } from './ir.js';

export function crossVerts(hall) {
  const { cx, cz, hx, hz } = hall, ax = hx * 0.5, az = hz * 0.5;
  return [
    [cx - ax, cz - hz], [cx + ax, cz - hz], [cx + ax, cz - az], [cx + hx, cz - az],
    [cx + hx, cz + az], [cx + ax, cz + az], [cx + ax, cz + hz], [cx - ax, cz + hz],
    [cx - ax, cz + az], [cx - hx, cz + az], [cx - hx, cz - az], [cx - ax, cz - az],
  ];
}
const outline = (verts, y) => lines([...verts, verts[0]].map(([x, z]) => [x, y, z]));
const fill = (verts, y, name, down) => poly(verts.map(([x, z]) => [x, y, z]), name, down);

export function buildCross(hall, conns, opts = {}) {
  const verts = crossVerts(hall), openings = { 0: conns.n, 3: conns.e, 6: conns.s, 9: conns.w };
  const { prims, boxes } = axisPolygonWalls(verts, hall.ceiling, hall.wall, hall.floorY, openings);
  prims.push(outline(verts, hall.floorY), fill(verts, hall.floorY, 'floor'));
  if (opts.ceiling !== false) prims.push(outline(verts, hall.floorY + hall.ceiling), fill(verts, hall.floorY + hall.ceiling, 'ceiling', true));
  const slots = nicheSlotsForPolygon(verts, openings);
  const { cx, cz, hx, hz } = hall, ax = hx * 0.5, az = hz * 0.5;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + sx * (ax - 1.5), z = cz + sz * (az + 2.5);
    // In a short arm this lands by the end doorway; leave the gap clear. 4.1 and 3.6 are the widest
    // door's half-width plus 0.5 m (2 m deep), plus a diagonally turned statue's 1.6 m half-footprint.
    if (Math.abs(x - cx) < 4.1 && Math.abs(z - cz) > hz - 3.6) continue;
    slots.push({ x, z, facing: facingToward(cx - x, cz - z), maxScale: 1.4, kind: 'niche' });
  }
  // A small cross has no room in its arms; fall back to the inner corners of the crossing.
  if (slots.length < 2) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = cx + sx * (ax - 1.2), z = cz + sz * (az - 1.2);
      slots.push({ x, z, facing: facingToward(cx - x, cz - z), maxScale: 1, kind: 'niche' });
    }
  }
  return { prims, boxes, floors: [], slots };
}
