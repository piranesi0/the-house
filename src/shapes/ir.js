export const box = (size, pos, rot = [0, 0, 0], name) => ({ kind: 'box', size, pos, rot, name });
export const cyl = (r1, r2, h, pos, rot = [0, 0, 0], seg = 12, name) => ({ kind: 'cyl', r1, r2, h, pos, rot, seg, name });
export const sphere = (r, pos, name) => ({ kind: 'sphere', r, pos, rot: [0, 0, 0], name });
export const lines = (points, name) => ({ kind: 'lines', points, name });
export const segs = (points, name) => ({ kind: 'segs', points, name });
// A planar filled polygon, simple (no holes), triangulated in the xz projection. `down` winds the
// face toward -y (ceilings); the default faces up.
export const poly = (points, name, down = false) => ({ kind: 'poly', points, name, down });
const hasPoints = (p) => p.kind === 'lines' || p.kind === 'segs' || p.kind === 'poly';

export function aabbOfBox(size, pos) {
  return {
    min: [pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2],
    max: [pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2],
  };
}

const isUpright = (rot) => rot[0] === 0 && rot[1] === 0 && rot[2] === 0;

function extents(p) {
  if (hasPoints(p)) {
    const xs = p.points.map(q => q[0]), ys = p.points.map(q => q[1]), zs = p.points.map(q => q[2]);
    return { min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] };
  }
  if (p.kind === 'sphere') return { min: p.pos.map(v => v - p.r), max: p.pos.map(v => v + p.r) };
  const r = p.kind === 'cyl' ? Math.max(p.r1, p.r2) : 0;
  const half = p.kind === 'box' ? p.size.map(s => s / 2) : [r, p.h / 2, r];
  if (isUpright(p.rot)) return { min: p.pos.map((v, i) => v - half[i]), max: p.pos.map((v, i) => v + half[i]) };
  // The part's own bounding prism, its eight corners turned X, then Z, then Y.
  const [ax, ay, az] = p.rot, out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    let [x, y, z] = [sx * half[0], sy * half[1], sz * half[2]];
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
    const c = [x, y, z];
    for (let i = 0; i < 3; i++) { out.min[i] = Math.min(out.min[i], p.pos[i] + c[i]); out.max[i] = Math.max(out.max[i], p.pos[i] + c[i]); }
  }
  return out;
}

export function boundsOf(prims) {
  const out = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of prims) {
    const e = extents(p);
    for (let i = 0; i < 3; i++) { out.min[i] = Math.min(out.min[i], e.min[i]); out.max[i] = Math.max(out.max[i], e.max[i]); }
  }
  return out;
}

export const mapPoints = (p, fn) => hasPoints(p) ? { ...p, points: p.points.map(fn) } : { ...p, pos: fn(p.pos) };

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
