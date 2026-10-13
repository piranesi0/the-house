import { box, lines, segs, poly, aabbOfBox } from './ir.js';
import { floorPatch } from './common.js';

export const WELL = { hx: 3, hz: 5, drop: 4, ramp: 4, wallT: 0.5 };

export function buildStairwell(hall) {
  const { cx, cz, floorY: f } = hall, { hx, hz, drop, ramp, wallT } = WELL;
  const prims = [], boxes = [], floors = [];
  const solid = (size, pos) => { prims.push(box(size, pos)); boxes.push(aabbOfBox(size, pos)); };

  floors.push(
    floorPatch(cx - hx, cx + hx, cz - ramp, cz, 'z', f - drop, f),
    floorPatch(cx - hx, cx + hx, cz - hz, cz - ramp, 'z', f - drop, f - drop),
    floorPatch(cx - hx, cx + hx, cz, cz + ramp, 'z', f, f + drop),
    floorPatch(cx - hx, cx + hx, cz + ramp, cz + hz, 'z', f + drop, f + drop),
  );
  // Shaft walls either side, open for 1.5 m at the middle, where both ramps meet the floor: the way in.
  const gap = 0.75, segLen = hz + wallT / 2 - gap;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    solid([wallT, 12 + drop, segLen], [cx + sx * (hx + wallT / 2), f - drop + (12 + drop) / 2, cz + sz * (gap + segLen / 2)]);
  }
  for (const [sz, ys] of [[-1, [f, f - drop]], [1, [f, f + drop]]]) {
    for (const y of ys) solid([2 * hx + 2 * wallT, 1, 0.3], [cx, y + 0.5, cz + sz * (hz + 0.15)]);
  }
  prims.push(lines([[cx - hx, f, cz - hz], [cx + hx, f, cz - hz], [cx + hx, f, cz + hz], [cx - hx, f, cz + hz], [cx - hx, f, cz - hz]]));
  const steps = [];
  for (let i = 1; i <= 8; i++) {
    const d = i * (ramp / 8), y = i * (drop / 8);
    steps.push([cx - hx, f - y, cz - d], [cx + hx, f - y, cz - d], [cx - hx, f + y, cz + d], [cx + hx, f + y, cz + d]);
  }
  prims.push(segs(steps));
  prims.push(
    poly([[cx - hx, f, cz], [cx + hx, f, cz], [cx + hx, f - drop, cz - ramp], [cx - hx, f - drop, cz - ramp]], 'ramp'),
    poly([[cx - hx, f, cz], [cx + hx, f, cz], [cx + hx, f + drop, cz + ramp], [cx - hx, f + drop, cz + ramp]], 'ramp'),
  );
  // Polys draw no lines: keep the ramps' long side edges as the wireframe.
  const sides = [];
  for (const sx of [-1, 1]) sides.push([cx + sx * hx, f, cz], [cx + sx * hx, f - drop, cz - ramp], [cx + sx * hx, f, cz], [cx + sx * hx, f + drop, cz + ramp]);
  prims.push(segs(sides));
  prims.push(box([2 * hx, 0.02, hz - ramp], [cx, f - drop, cz - (hz + ramp) / 2]), box([2 * hx, 0.02, hz - ramp], [cx, f + drop, cz + (hz + ramp) / 2]));
  return { prims, boxes, floors };
}
