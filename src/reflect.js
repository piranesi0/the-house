// What a pool reflects. Pure. The mirror hangs every part upside down under the hall floor, seen
// only through the pool's opening in it (shapes/index.js cuts it out).
//
// look=lines keeps v0: the ordinary statues standing in the pool, no colossi (final review S1 I2:
// a 10-15 m wireframe hung under a see-through floor). The shaded look reflects the hall: what
// stands in the pool (colossi included), the hall's own walls and columns, and the vault (the
// ceiling polys), so a view through the water at any angle meets the mirrored hall, not the void.
// A roofless hall has no ceiling poly, so past its mirrored walls its pool shows the void, which
// the dome below the horizon paints in the hall's haze.
//
// The shaded mirror plane is the floor itself (MIRROR_Y, hall-relative), and the mirror is cut
// there: nothing mirrored rises above the floor, so nothing standing in the water is overlapped by
// its own reflection (mirrored about the water line, the submerged part landed on itself and
// z-fought). The water sheet lies flush on the floor, SHEET_Y above it. The player still wades to
// hall.depth (player.js).
import { pointInPolygon } from './hall.js';

// hall: hallParams with a pool; statues: placeStatues records (+ the colossus); prims: the hall's
// own world-space prims (buildHall's, no connectors; tagged parts such as statues are skipped).
// Returns world-space prims, statue parts tagged.
export function reflectionPrims(hall, statues, prims, { shaded }) {
  const inPool = (x, z) => pointInPolygon([x - hall.cx, z - hall.cz], hall.pool);
  const out = statues.filter(s => (shaded || !s.colossus) && inPool(s.slot.x, s.slot.z))
    .flatMap(s => s.prims.map(p => ({ ...p, tag: 'statue' })));
  if (!shaded) return out;
  for (const p of prims) {
    if (p.tag) continue;
    if (p.kind === 'box' || (p.kind === 'cyl' && p.name === 'column') || (p.kind === 'poly' && p.name === 'ceiling')) out.push(p);
  }
  return out;
}

// The shaded look's mirror plane and cut, hall-relative: the floor.
export const MIRROR_Y = 0;
// The shaded look's water sheet, this far above the hall floor: flush with it, clear of z-fighting.
export const SHEET_Y = 0.02;

// Triangles (nine numbers each, hall-relative) turned over about y = plane: every vertex to
// (x, 2 * plane - y, z), each triangle's last two corners swapped so it still faces out.
export function mirrorTriangles(pos, plane) {
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 9) for (const [to, from] of [[0, 0], [3, 6], [6, 3]]) {
    out[i + to] = pos[i + from]; out[i + to + 1] = 2 * plane - pos[i + from + 1]; out[i + to + 2] = pos[i + from + 2];
  }
  return out;
}

// Line segments (six numbers each) turned over about y = plane and cut at y = top: a segment wholly
// above is dropped, one crossing it is shortened to end on it.
export function mirrorSegments(pos, plane, top) {
  const out = [];
  for (let i = 0; i < pos.length; i += 6) {
    const a = [pos[i], 2 * plane - pos[i + 1], pos[i + 2]], b = [pos[i + 3], 2 * plane - pos[i + 4], pos[i + 5]];
    if (a[1] > top && b[1] > top) continue;
    const cut = (p, q) => { const t = (top - p[1]) / (q[1] - p[1]); return [p[0] + (q[0] - p[0]) * t, top, p[2] + (q[2] - p[2]) * t]; };
    out.push(...(a[1] > top ? cut(a, b) : a), ...(b[1] > top ? cut(b, a) : b));
  }
  return Float32Array.from(out);
}
