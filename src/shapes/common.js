import { box, cyl, lines, aabbOfBox } from './ir.js';

export const facingToward = (fx, fz) => Math.atan2(-fx, -fz);
export const floorPatch = (x0, x1, z0, z1, axis, y0, y1) => ({ x0, x1, z0, z1, axis, y0, y1 });
export const slab = (cx, y, cz, hx, hz) => box([2 * hx, 0.02, 2 * hz], [cx, y, cz]);

function edgeInfo(verts, i) {
  const n = verts.length, a = verts[i], b = verts[(i + 1) % n];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return { a, b, len, d, n: [d[1], -d[0]] };
}
function convexAt(verts, i) {
  const n = verts.length;
  const p = edgeInfo(verts, (i + n - 1) % n).d, q = edgeInfo(verts, i).d;
  return p[0] * q[1] - p[1] * q[0] > 0;
}

export function axisPolygonWalls(verts, h, t, f, openings = {}) {
  const prims = [], boxes = [];
  const yMid = f + h / 2;
  const place = (e, s0, s1, y, height) => {
    const mid = (s0 + s1) / 2, len = s1 - s0;
    const px = e.a[0] + e.d[0] * mid + e.n[0] * t / 2, pz = e.a[1] + e.d[1] * mid + e.n[1] * t / 2;
    const size = e.d[0] !== 0 ? [len, height, t] : [t, height, len];
    return { size, pos: [px, y, pz] };
  };
  for (let i = 0; i < verts.length; i++) {
    const e = edgeInfo(verts, i);
    const alongX = e.d[1] === 0;
    const ext0 = alongX && convexAt(verts, i) ? t : 0;
    const ext1 = alongX && convexAt(verts, (i + 1) % verts.length) ? t : 0;
    const s0 = -ext0, s1 = e.len + ext1, o = openings[i];
    if (!o) {
      const w = place(e, s0, s1, yMid, h); prims.push(box(w.size, w.pos)); boxes.push(aabbOfBox(w.size, w.pos)); continue;
    }
    const m = e.len / 2;
    for (const [p, q] of [[s0, m - o.width / 2], [m + o.width / 2, s1]]) {
      if (q - p < 0.01) continue;
      const w = place(e, p, q, yMid, h); prims.push(box(w.size, w.pos)); boxes.push(aabbOfBox(w.size, w.pos));
    }
    const lh = h - o.height;
    if (lh > 0) { const l = place(e, m - o.width / 2, m + o.width / 2, f + o.height + lh / 2, lh); prims.push(box(l.size, l.pos)); }
  }
  return { prims, boxes };
}

export function nicheSlotsForPolygon(verts, openings = {}, inset = 2.0, spacing = 4, maxScale = 1.4) {
  const slots = [];
  for (let i = 0; i < verts.length; i++) {
    const e = edgeInfo(verts, i);
    if (e.len < 2 * spacing) continue;
    const inward = [-e.n[0], -e.n[1]], facing = facingToward(inward[0], inward[1]);
    const o = openings[i], m = e.len / 2;
    for (let s = spacing; s <= e.len - spacing + 1e-6; s += spacing) {
      if (o && Math.abs(s - m) < o.width / 2 + 1.5) continue;
      slots.push({ x: e.a[0] + e.d[0] * s + inward[0] * inset, z: e.a[1] + e.d[1] * s + inward[1] * inset, facing, maxScale, kind: 'niche' });
    }
  }
  return slots;
}

export function diagonalBoxes(px, pz, len, t, yaw, f, h, n = 6) {
  const out = [], ux = Math.cos(yaw), uz = -Math.sin(yaw), nx = -uz, nz = ux;
  for (let i = 0; i < n; i++) {
    const a = -len / 2 + (i + 0.5) * (len / n), half = len / n / 2;
    const cxp = px + ux * a, czp = pz + uz * a, corners = [];
    for (const s of [-1, 1]) for (const q of [-1, 1]) corners.push([cxp + ux * s * half + nx * q * t / 2, czp + uz * s * half + nz * q * t / 2]);
    const xs = corners.map(c => c[0]), zs = corners.map(c => c[1]);
    out.push({ min: [Math.min(...xs), f, Math.min(...zs)], max: [Math.max(...xs), f + h, Math.max(...zs)] });
  }
  return out;
}

export function octagonWalls(cx, cz, ap, h, t, f, openings) {
  const side = 2 * ap * Math.tan(Math.PI / 8), prims = [], boxes = [], yMid = f + h / 2;
  const axisDefs = [['n', cx, cz - ap - t / 2, true], ['s', cx, cz + ap + t / 2, true], ['e', cx + ap + t / 2, cz, false], ['w', cx - ap - t / 2, cz, false]];
  for (const [s, px, pz, alongX] of axisDefs) {
    const o = Array.isArray(openings) ? (openings.includes(s) ? { width: side, height: h } : null) : openings[s];
    const size = alongX ? [side, h, t] : [t, h, side];
    if (!o) { prims.push(box(size, [px, yMid, pz])); boxes.push(aabbOfBox(size, [px, yMid, pz])); continue; }
    const w = o.width, seg = (side - w) / 2;
    if (seg > 0.01) for (const d of [-1, 1]) {
      const sz = alongX ? [seg, h, t] : [t, h, seg];
      const pos = alongX ? [px + d * (w / 2 + seg / 2), yMid, pz] : [px, yMid, pz + d * (w / 2 + seg / 2)];
      prims.push(box(sz, pos)); boxes.push(aabbOfBox(sz, pos));
    }
    const lh = h - o.height;
    if (lh > 0) prims.push(box(alongX ? [w, lh, t] : [t, lh, w], [px, f + o.height + lh / 2, pz]));
  }
  for (const [dx, dz] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) {
    const d = (ap + t / 2) / Math.SQRT2, px = cx + dx * d, pz = cz + dz * d;
    const yaw = dx * dz > 0 ? Math.PI / 4 : -Math.PI / 4;
    prims.push(box([side, h, t], [px, yMid, pz], [0, yaw, 0]));
    boxes.push(...diagonalBoxes(px, pz, side, t, yaw, f, h, 6));
  }
  return { prims, boxes };
}

export function octagonSlab(cx, y, cz, ap) {
  const R = ap / Math.cos(Math.PI / 8), pts = [];
  for (let k = 0; k <= 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; pts.push([cx + R * Math.cos(a), y, cz + R * Math.sin(a)]); }
  return lines(pts);
}

export function column(x, y0, z, r, h) {
  return { prim: cyl(r, r, h, [x, y0 + h / 2, z]), box: { min: [x - r, y0, z - r], max: [x + r, y0 + h, z + r] } };
}
