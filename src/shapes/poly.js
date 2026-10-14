// Pure polygon helpers for the `poly` primitive: triangulation and clipping. No three import,
// so Node tests the same triangles the browser uploads.

const EPS = 1e-9;
const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// Shoelace area of [[u, v], ...]; positive when counter-clockwise in (u, v).
export function signedArea2(pts) {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return s / 2;
}

// Ear clipping for a simple polygon, convex or concave, any winding. Returns index triples into
// pts, each counter-clockwise in (u, v). Collinear vertices are dropped rather than clipped.
export function triangulate(pts) {
  if (pts.length < 3) return [];
  const idx = pts.map((_, i) => i);
  if (signedArea2(pts) < 0) idx.reverse();
  const strictlyInside = (p, a, b, c) => cross2(a, b, p) > EPS && cross2(b, c, p) > EPS && cross2(c, a, p) > EPS;
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const n = idx.length, ia = idx[(i + n - 1) % n], ib = idx[i], ic = idx[(i + 1) % n];
      const a = pts[ia], b = pts[ib], c = pts[ic], turn = cross2(a, b, c);
      if (Math.abs(turn) <= EPS) { idx.splice(i, 1); cut = true; break; }
      if (turn < 0) continue;
      if (idx.some(j => j !== ia && j !== ib && j !== ic && strictlyInside(pts[j], a, b, c))) continue;
      tris.push([ia, ib, ic]); idx.splice(i, 1); cut = true;
    }
    if (!cut) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// Flat xyz positions (nine numbers per triangle) for a poly primitive, wound so the face normal
// points +y, or -y when p.down. Counter-clockwise in (x, z) gives a -y normal in three's
// right-handed frame, so the up-facing order swaps the last two corners.
export function polyPositions(p) {
  const pts2 = p.points.map(([x, , z]) => [x, z]);
  const out = [];
  for (const [a, b, c] of triangulate(pts2)) {
    for (const i of (p.down ? [a, b, c] : [a, c, b])) out.push(...p.points[i]);
  }
  return out;
}

function clipPlane(pts, axis, v, keepAbove) {
  const out = [];
  const inside = (p) => keepAbove ? p[axis] >= v - EPS : p[axis] <= v + EPS;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (v - a[axis]) / (b[axis] - a[axis]); out.push(a.map((c, k) => c + (b[k] - c) * t)); }
  }
  return out;
}
const dedupe = (pts) => pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[2] - q[2]) > 1e-6; });

// Sutherland-Hodgman clip of a 3D xz-planar-or-sloped polygon to the box [x0, x1] x [z0, z1].
// y is interpolated along cut edges, so sloped polys stay on their plane. null when nothing is left.
export function clipBox(points, x0, x1, z0, z1) {
  let p = points;
  p = clipPlane(p, 0, x0, true); p = clipPlane(p, 0, x1, false);
  p = clipPlane(p, 2, z0, true); p = clipPlane(p, 2, z1, false);
  p = dedupe(p);
  return p.length >= 3 && Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))) > 1e-6 ? p : null;
}

// The footprint minus an axis-aligned well of half-size (wx, wz) at (cx, cz): west strip, east
// strip, north and south pieces between them. A floor with a hole, as several simple polys.
export function aroundWell(points, cx, cz, wx, wz) {
  const BIG = 1e6;
  return [
    clipBox(points, -BIG, cx - wx, -BIG, BIG),
    clipBox(points, cx + wx, BIG, -BIG, BIG),
    clipBox(points, cx - wx, cx + wx, -BIG, cz - wz),
    clipBox(points, cx - wx, cx + wx, cz + wz, BIG),
  ].filter(Boolean);
}

// Keeps the part of a polygon on the left of the line through o = [x, z] along d = [dx, dz] (in
// (x, z), counter-clockwise is left), interpolating every coordinate across the cut.
function clipLeft(pts, o, d) {
  const out = [], side = (p) => d[0] * (p[2] - o[1]) - d[1] * (p[0] - o[0]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], sa = side(a), sb = side(b), ia = sa >= -EPS, ib = sb >= -EPS;
    if (ia) out.push(a);
    if (ia !== ib) { const t = sa / (sa - sb); out.push(a.map((c, k) => c + (b[k] - c) * t)); }
  }
  return out;
}

// The floor minus a pool: one piece per pool edge, the part of the floor inside the wedge from the
// hall centre (cx, cz) through that edge's two ends, beyond the edge. pool: hall-relative [[x, z], ...]
// (hall.pool). Needs the pool star-shaped about the centre and inside the floor, which poolOutline
// guarantees (a smoothed radial 10-gon at most 0.95 of the way to the nearest wall, clearing every
// footprint edge by 0.85 m or more over 7000 pools). A floor with a pool in it, as simple polys.
export function aroundPool(points, cx, cz, pool) {
  const ring = signedArea2(pool) < 0 ? [...pool].reverse() : pool, pieces = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    let p = clipLeft(points, [cx, cz], a);                              // counter-clockwise of the ray through a
    p = clipLeft(p, [cx, cz], [-b[0], -b[1]]);                          // clockwise of the ray through b
    p = clipLeft(p, [cx + a[0], cz + a[1]], [a[0] - b[0], a[1] - b[1]]); // beyond the edge, away from the centre
    p = dedupe(p);
    if (p.length >= 3 && Math.abs(signedArea2(p.map(([x, , z]) => [x, z]))) > 1e-6) pieces.push(p);
  }
  return pieces;
}
