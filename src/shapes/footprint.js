// The inner outline of a hall's floor, as [[x, z], ...] in world coordinates. Used for floors,
// windows and tests. Octagon vertices start at angle pi/8 so edge k's midpoint is at angle
// pi/4 + k*pi/4: edges 1, 3, 5, 7 are the south, west, north and east axis walls.
import { rectVerts } from './rect.js';
import { crossVerts } from './cross.js';

export function octagonVerts(cx, cz, ap) {
  const R = ap / Math.cos(Math.PI / 8), pts = [];
  for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; pts.push([cx + R * Math.cos(a), cz + R * Math.sin(a)]); }
  return pts;
}

export function footprint(hall) {
  if (hall.shape === 'octagon') return octagonVerts(hall.cx, hall.cz, hall.hx);
  if (hall.shape === 'cross') return crossVerts(hall);
  return rectVerts(hall);
}
