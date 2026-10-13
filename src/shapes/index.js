import { buildRect } from './rect.js';
import { buildOctagon } from './octagon.js';
import { buildCross } from './cross.js';
import { buildColonnade } from './colonnade.js';

export const BUILDERS = { long: buildRect, square: buildRect, octagon: buildOctagon, cross: buildCross, colonnade: buildColonnade };

export function buildHall(hall, conns, opts = {}) {
  const built = BUILDERS[hall.shape](hall, conns, opts);
  return { prims: built.prims, boxes: built.boxes, floors: built.floors, slots: built.slots };
}
