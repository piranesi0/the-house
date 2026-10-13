// The inner outline of a hall's floor, as [[x, z], ...] in world coordinates. Used for floors,
// windows and tests. Octagon vertices start at angle pi/8 so edge k's midpoint is at angle
// pi/4 + k*pi/4: edges 1, 3, 5, 7 are the south, west, north and east axis walls.
import { rectVerts } from './rect.js';
import { crossVerts } from './cross.js';
import { octagonVerts } from './common.js';

export { octagonVerts };

export function footprint(hall) {
  if (hall.shape === 'octagon') return octagonVerts(hall.cx, hall.cz, hall.hx);
  if (hall.shape === 'cross') return crossVerts(hall);
  return rectVerts(hall);
}
