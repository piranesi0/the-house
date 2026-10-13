import { buildRect } from './rect.js';
import { buildOctagon } from './octagon.js';
import { buildCross } from './cross.js';
import { buildColonnade } from './colonnade.js';
import { buildStairwell, WELL } from './stairwell.js';
import { lines } from './ir.js';
import { facingToward } from './common.js';
import { STOREY } from '../hall.js';

export const BUILDERS = { long: buildRect, square: buildRect, octagon: buildOctagon, cross: buildCross, colonnade: buildColonnade };

export function buildHall(hall, conns, opts = {}) {
  // A hall seen from a stairwell above stops short of the floor it is seen through.
  if (opts.vista && hall.y < 0) hall = { ...hall, ceiling: Math.min(hall.ceiling, STOREY - 1) };
  const built = BUILDERS[hall.shape](hall, conns, opts);
  let { prims, boxes, floors, slots } = built;
  const inWell = (s) => Math.abs(s.x - hall.cx) <= WELL.hx + 1 && Math.abs(s.z - hall.cz) <= WELL.hz + 1;
  if (hall.isStair && !opts.vista) {
    const w = buildStairwell(hall);
    prims = [...prims, ...w.prims]; boxes = [...boxes, ...w.boxes]; floors = [...floors, ...w.floors];
    slots = slots.filter(s => !inWell(s));
    // Beside the shaft, off the east-west line that leads to the well's side entrance.
    if (slots.length < 2) for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = hall.cx + dx * (WELL.hx + 2.6), z = hall.cz + dz * 3.2;
      slots.push({ x, z, facing: facingToward(-dx, 0), maxScale: 1, kind: 'niche' });
    }
  }
  if (opts.floorHole) {
    const { cx, cz, floorY: f } = hall, { hx, hz } = WELL;
    prims = [...prims, lines([[cx - hx, f, cz - hz], [cx + hx, f, cz - hz], [cx + hx, f, cz + hz], [cx - hx, f, cz + hz], [cx - hx, f, cz - hz]])];
    slots = slots.filter(s => !inWell(s));
  }
  return { prims, boxes, floors, slots };
}
