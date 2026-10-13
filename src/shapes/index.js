import { buildRect } from './rect.js';

export const BUILDERS = { long: buildRect, square: buildRect };

export function buildHall(hall, conns, opts = {}) {
  const built = BUILDERS[hall.shape](hall, conns, opts);
  return { prims: built.prims, boxes: built.boxes, floors: built.floors, slots: built.slots };
}
