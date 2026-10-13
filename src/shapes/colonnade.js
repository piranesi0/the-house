import { buildRect } from './rect.js';
import { column } from './common.js';
import { WELL } from './stairwell.js';

export function buildColonnade(hall, conns, opts = {}) {
  const base = buildRect(hall, conns, opts);
  const { cx, cz, hx, hz, ceiling, floorY: f } = hall;
  const prims = [...base.prims], boxes = [...base.boxes];
  // In a stair hall the rows stand clear of the stairwell.
  const rowX = Math.max(hx / 3, hall.isStair ? WELL.hx + 1.5 : 3.0);
  for (const x of [cx - rowX, cx + rowX]) {
    for (let z = cz - hz + 3; z <= cz + hz - 3 + 1e-6; z += 4) {
      const c = column(x, f, z, 0.45, ceiling); prims.push(c.prim); boxes.push(c.box);
    }
  }
  const slots = base.slots.filter(s => s.kind !== 'centre');
  for (let z = cz - hz + 6; z <= cz + hz - 6 + 1e-6; z += 8) slots.push({ x: cx, z, facing: 0, maxScale: 1.8, kind: 'row' });
  return { prims, boxes, floors: [], slots };
}
