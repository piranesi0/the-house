import { buildRect } from './rect.js';

export const BUILDERS = { long: buildRect, square: buildRect };

export function buildHall(hall, conns, opts = {}) {
  // Shapes without a builder yet are drawn as rectangles until Task 12 adds them.
  const built = (BUILDERS[hall.shape] ?? buildRect)(hall, conns, opts);
  return { prims: built.prims, boxes: built.boxes, floors: built.floors, slots: built.slots };
}
