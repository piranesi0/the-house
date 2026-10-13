import { lines } from './ir.js';
import { axisPolygonWalls, nicheSlotsForPolygon, rectPoly, facingToward } from './common.js';

export function rectVerts(hall) {
  const { cx, cz, hx, hz } = hall;
  return [[cx - hx, cz - hz], [cx + hx, cz - hz], [cx + hx, cz + hz], [cx - hx, cz + hz]];
}
export const rectOpenings = (conns) => ({ 0: conns.n, 1: conns.e, 2: conns.s, 3: conns.w });

export function buildRect(hall, conns, opts = {}) {
  const verts = rectVerts(hall), openings = rectOpenings(conns);
  const { prims, boxes } = axisPolygonWalls(verts, hall.ceiling, hall.wall, hall.floorY, openings);
  const outline = (y) => lines([...verts, verts[0]].map(([x, z]) => [x, y, z]));
  prims.push(outline(hall.floorY), rectPoly(hall.cx, hall.floorY, hall.cz, hall.hx, hall.hz, 'floor'));
  if (opts.ceiling !== false) {
    const cy = hall.floorY + hall.ceiling;
    prims.push(outline(cy), rectPoly(hall.cx, cy, hall.cz, hall.hx, hall.hz, 'ceiling', true));
  }
  const slots = nicheSlotsForPolygon(verts, openings);
  if (hall.shape === 'square') slots.push({ x: hall.cx, z: hall.cz, facing: 0, maxScale: 3, kind: 'centre' });
  // Small halls with wide doorways leave no room for wall niches; fall back to the corners.
  if (slots.filter(s => s.kind === 'niche').length < 2) {
    const { cx, cz, hx, hz } = hall;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = cx + dx * (hx - 1.5), z = cz + dz * (hz - 1.5);
      slots.push({ x, z, facing: facingToward(cx - x, cz - z), maxScale: 1, kind: 'niche' });
    }
  }
  return { prims, boxes, floors: [], slots };
}
