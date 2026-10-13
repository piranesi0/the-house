import { box, segs, poly, aabbOfBox } from './ir.js';
import { octagonWalls, octagonSlab, octagonPoly, floorPatch } from './common.js';
import { CELL } from '../hall.js';

export function buildConnector(conn) {
  const prims = [], boxes = [], floors = [];
  const { axis, width: w, height: h, raise, room, faceA, faceB } = conn;
  const centre = axis === 'x' ? conn.a.z * CELL : conn.a.x * CELL;
  const f = 0, L = 1.5;
  const P = (along, y, across) => axis === 'x' ? [along, y, across] : [across, y, along];
  const S = (along, y, across) => axis === 'x' ? [along, y, across] : [across, y, along];
  const floorAlong = (p0, p1, y0, y1) => {
    if (p1 - p0 <= 0.01) return;
    prims.push(poly([P(p0, y0, centre - w / 2), P(p1, y1, centre - w / 2), P(p1, y1, centre + w / 2), P(p0, y0, centre + w / 2)], 'floor'));
    // Polys draw no lines: keep the floor's outline (side edges and both ends, as v0's floor box drew).
    prims.push(segs([P(p0, y0, centre - w / 2), P(p1, y1, centre - w / 2), P(p0, y0, centre + w / 2), P(p1, y1, centre + w / 2),
      P(p0, y0, centre - w / 2), P(p0, y0, centre + w / 2), P(p1, y1, centre - w / 2), P(p1, y1, centre + w / 2)]));
  };
  const corridor = (p0, p1) => {
    const len = p1 - p0, mid = (p0 + p1) / 2;
    if (len <= 0.01) return;
    for (const side of [-1, 1]) {
      const size = S(len, h, 1), pos = P(mid, f + h / 2, centre + side * (w / 2 + 0.5));
      prims.push(box(size, pos)); boxes.push(aabbOfBox(size, pos));
    }
    prims.push(box(S(len, 0.02, w), P(mid, f + h, centre)));
    if (raise === 0) floorAlong(p0, p1, f, f);
    else { floorAlong(p0, p0 + L, f, f + raise); floorAlong(p0 + L, p1 - L, f + raise, f + raise); floorAlong(p1 - L, p1, f + raise, f); }
  };
  if (room > 0) {
    const mid = (faceA + faceB) / 2, r = room / 2;
    corridor(faceA, mid - r); corridor(mid + r, faceB);
    const [ox, oz] = axis === 'x' ? [mid, centre] : [centre, mid];
    const oct = octagonWalls(ox, oz, r, h, 0.5, f, axis === 'x' ? ['w', 'e'] : ['n', 's']);
    prims.push(...oct.prims, octagonSlab(ox, f, oz, r), octagonSlab(ox, f + h, oz, r), octagonPoly(ox, f, oz, r, 'vestibule'), octagonPoly(ox, f + h, oz, r, 'vestibule', true));
    boxes.push(...oct.boxes);
  } else {
    corridor(faceA, faceB);
  }
  if (raise > 0) {
    const patch = (p0, p1, y0, y1) => axis === 'x'
      ? floorPatch(p0, p1, centre - w / 2, centre + w / 2, 'x', y0, y1)
      : floorPatch(centre - w / 2, centre + w / 2, p0, p1, 'z', y0, y1);
    floors.push(patch(faceA, faceA + L, f, f + raise), patch(faceA + L, faceB - L, f + raise, f + raise), patch(faceB - L, faceB, f + raise, f));
    for (const [p, y] of [[faceA + L / 2, f + raise / 2], [faceA + L, f + raise], [faceB - L, f + raise], [faceB - L / 2, f + raise / 2]]) {
      prims.push(segs([P(p, y, centre - w / 2), P(p, y, centre + w / 2)]));
    }
  }
  return { prims, boxes, floors };
}
