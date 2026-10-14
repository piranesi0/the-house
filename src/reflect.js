// What a pool reflects. Pure. The mirror hangs every part upside down under the water plane, seen
// only through the pool's opening in the floor (shapes/index.js cuts it out).
//
// look=lines keeps v0: the ordinary statues standing in the pool, no colossi (final review S1 I2:
// a 10-15 m wireframe hung under a see-through floor). The shaded look reflects what stands in the
// pool, colossi and colonnade columns included, and the vault over it: the hall's ceiling polys,
// which the mirror lays out at floorY + 2 * depth - ceiling, the floor seen under the water. A
// roofless hall has no ceiling poly, so its pool shows the void, which the dome below the horizon
// paints in the hall's haze.
import { pointInPolygon } from './hall.js';

// hall: hallParams with a pool; statues: placeStatues records (+ the colossus); prims: the hall's
// world-space prims as World.ensure builds them. Returns world-space prims, statue parts tagged.
export function reflectionPrims(hall, statues, prims, { shaded }) {
  const inPool = (x, z) => pointInPolygon([x - hall.cx, z - hall.cz], hall.pool);
  const out = statues.filter(s => (shaded || !s.colossus) && inPool(s.slot.x, s.slot.z))
    .flatMap(s => s.prims.map(p => ({ ...p, tag: 'statue' })));
  if (!shaded) return out;
  for (const p of prims) {
    if (p.kind === 'cyl' && p.name === 'column' && inPool(p.pos[0], p.pos[2])) out.push(p);
    else if (p.kind === 'poly' && p.name === 'ceiling') out.push(p);
  }
  return out;
}

// The shaded look's water sheet sits this far under the water line, below the grid's old lowest
// wave (0.05 m); the mirror is cut at the sheet.
export const SHEET_DROP = 0.06;

// Triangles (nine numbers each, hall-relative) turned over about the water line y = depth: every
// vertex to (x, 2 * depth - y, z), each triangle's last two corners swapped so it still faces out.
export function mirrorTriangles(pos, depth) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 9) for (const [to, from] of [[0, 0], [3, 6], [6, 3]]) {
    out[i + to] = pos[i + from]; out[i + to + 1] = 2 * depth - pos[i + from + 1]; out[i + to + 2] = pos[i + from + 2];
  }
  return out;
}

// Line segments (six numbers each) turned over about y = depth and cut at y = top: a segment wholly
// above is dropped, one crossing it is shortened to end on it.
export function mirrorSegments(pos, depth, top) {
  const out = [];
  for (let i = 0; i < pos.length; i += 6) {
    const a = [pos[i], 2 * depth - pos[i + 1], pos[i + 2]], b = [pos[i + 3], 2 * depth - pos[i + 4], pos[i + 5]];
    if (a[1] > top && b[1] > top) continue;
    const cut = (p, q) => { const t = (top - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, top, p[2] + (q[2] - p[2]) * t]; };
    out.push(...(a[1] > top ? cut(a, b) : a), ...(b[1] > top ? cut(b, a) : b));
  }
  return Float32Array.from(out);
}
