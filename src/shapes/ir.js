export const box = (size, pos, rot = [0, 0, 0], name) => ({ kind: 'box', size, pos, rot, name });
export const cyl = (r1, r2, h, pos, rot = [0, 0, 0], seg = 12, name) => ({ kind: 'cyl', r1, r2, h, pos, rot, seg, name });
export const sphere = (r, pos, name) => ({ kind: 'sphere', r, pos, rot: [0, 0, 0], name });
export const lines = (points, name) => ({ kind: 'lines', points, name });
export const segs = (points, name) => ({ kind: 'segs', points, name });

export function aabbOfBox(size, pos) {
  return {
    min: [pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2],
    max: [pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2],
  };
}

const isUpright = (rot) => rot[0] === 0 && rot[1] === 0 && rot[2] === 0;

function extents(p) {
  if (p.kind === 'lines' || p.kind === 'segs') {
    const xs = p.points.map(q => q[0]), ys = p.points.map(q => q[1]), zs = p.points.map(q => q[2]);
    return { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] };
  }
  let half;
  if (p.kind === 'sphere') half = [p.r, p.r, p.r];
  else if (p.kind === 'box') half = isUpright(p.rot) ? p.size.map(s => s / 2) : Array(3).fill(Math.hypot(...p.size) / 2);
  else { const r = Math.max(p.r1, p.r2); half = isUpright(p.rot) ? [r, p.h / 2, r] : Array(3).fill(Math.hypot(2 * r, p.h) / 2); }
  return { min: p.pos.map((v, i) => v - half[i]), max: p.pos.map((v, i) => v + half[i]) };
}

export function boundsOf(prims) {
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of prims) {
    const e = extents(p);
    for (let i = 0; i < 3; i++) { out.min[i] = Math.min(out.min[i], e.min[i]); out.max[i] = Math.max(out.max[i], e.max[i]); }
  }
  return out;
}

export const mapPoints = (p, fn) => (p.kind === 'lines' || p.kind === 'segs') ? { ...p, points: p.points.map(fn) } : { ...p, pos: fn(p.pos) };

export function translatePrims(prims, dx, dy, dz) {
  return prims.map(p => mapPoints(p, ([x, y, z]) => [x + dx, y + dy, z + dz]));
}
export function translateBoxes(boxes, dx, dy, dz) {
  return boxes.map(b => ({ min: [b.min[0] + dx, b.min[1] + dy, b.min[2] + dz], max: [b.max[0] + dx, b.max[1] + dy, b.max[2] + dz] }));
}
export function scalePrims(prims, s) {
  return prims.map(p => {
    const q = mapPoints(p, ([x, y, z]) => [x * s, y * s, z * s]);
    if (p.kind === 'box') q.size = p.size.map(v => v * s);
    else if (p.kind === 'cyl') { q.r1 = p.r1 * s; q.r2 = p.r2 * s; q.h = p.h * s; }
    else if (p.kind === 'sphere') q.r = p.r * s;
    return q;
  });
}
const rotY = (yaw) => ([x, y, z]) => [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)];

export function rotateYPrims(prims, yaw) {
  const r = rotY(yaw);
  return prims.map(p => {
    const q = mapPoints(p, r);
    if (p.rot) q.rot = [p.rot[0], p.rot[1] + yaw, p.rot[2]];
    return q;
  });
}
export function rotateYBoxes(boxes, yaw) {
  const r = rotY(yaw);
  return boxes.map(b => {
    const corners = [[b.min[0], 0, b.min[2]], [b.max[0], 0, b.min[2]], [b.min[0], 0, b.max[2]], [b.max[0], 0, b.max[2]]].map(r);
    const xs = corners.map(c => c[0]), zs = corners.map(c => c[2]);
    return { min: [Math.min(...xs), b.min[1], Math.min(...zs)], max: [Math.max(...xs), b.max[1], Math.max(...zs)] };
  });
}
