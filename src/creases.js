// Crease edges from a per-kind template instead of running three's EdgesGeometry once per part.
// No three here, so the maths is testable in node; build.js feeds it the index buffers.
//
// EdgesGeometry hashes every vertex through strings to find which triangle edges meet, then keeps an
// edge when the two faces' normals differ by more than the threshold angle. Which edges meet (the
// "program") only depends on which vertices share a hash, and that is the same for every part of one
// kind as long as no two distinct vertices round together. So the program is recorded once per kind
// on a reference part, and a real part only recomputes its face normals and replays it. The output
// matches EdgesGeometry's: same edges, same order, same float32 values.

const PRECISION = 1e4;   // EdgesGeometry's precisionPoints = 4

const hashOf = (P, i) => `${Math.round(P[i * 3] * PRECISION)},${Math.round(P[i * 3 + 1] * PRECISION)},${Math.round(P[i * 3 + 2] * PRECISION)}`;

// Records EdgesGeometry's walk over a reference part. P: float32 positions, index: triangle indices
// or null for a non-indexed part.
export function edgeProgram(P, index) {
  const nv = P.length / 3, count = index ? index.length : nv;
  const hashes = [], rep = new Int32Array(nv), first = new Map();
  for (let i = 0; i < nv; i++) {
    const h = hashOf(P, i);
    hashes.push(h);
    if (!first.has(h)) first.set(h, i);
    rep[i] = first.get(h);
  }
  const tris = [], match = [], edges = new Map();
  for (let i = 0; i < count; i += 3) {
    const v = index ? [index[i], index[i + 1], index[i + 2]] : [i, i + 1, i + 2];
    const h = v.map(k => hashes[k]);
    if (h[0] === h[1] || h[1] === h[2] || h[2] === h[0]) continue;
    const slot = tris.length / 3;
    tris.push(...v);
    for (let j = 0; j < 3; j++) {
      const jn = (j + 1) % 3, hash = `${h[j]}_${h[jn]}`, reverse = `${h[jn]}_${h[j]}`;
      if (edges.get(reverse)) { match.push(slot, edges.get(reverse).slot, v[j], v[jn]); edges.set(reverse, null); }
      else if (!edges.has(hash)) edges.set(hash, { slot, i0: v[j], i1: v[jn] });
    }
  }
  const rest = [];
  for (const e of edges.values()) if (e) rest.push(e.i0, e.i1);
  return {
    tris: Int32Array.from(tris), match: Int32Array.from(match), rest: Int32Array.from(rest), rep,
    classes: Int32Array.from(first.values()),
  };
}

// True when P splits into the same hash classes as the program's reference part, so the program
// holds for it.
export function fits(prog, P) {
  const { rep, classes } = prog, r = (i) => Math.round(P[i] * PRECISION);
  for (let i = 0; i < rep.length; i++) {
    const k = rep[i];
    if (k !== i && (r(i * 3) !== r(k * 3) || r(i * 3 + 1) !== r(k * 3 + 1) || r(i * 3 + 2) !== r(k * 3 + 2))) return false;
  }
  const n = classes.length, q = new Float64Array(n * 3);
  for (let a = 0; a < n; a++) for (let c = 0; c < 3; c++) q[a * 3 + c] = r(classes[a] * 3 + c);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (q[a * 3] === q[b * 3] && q[a * 3 + 1] === q[b * 3 + 1] && q[a * 3 + 2] === q[b * 3 + 2]) return false;
  }
  return true;
}

// The crease-edge segments of a part with float32 positions P, as float32 xyz pairs. Face normals
// and the angle test use three's Triangle.getNormal and Vector3.dot arithmetic exactly.
export function runEdges(prog, P, thresholdAngle) {
  const thresholdDot = Math.cos((Math.PI / 180) * thresholdAngle);
  const { tris, match, rest } = prog, nt = tris.length / 3, N = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
    const tx = P[c] - P[b], ty = P[c + 1] - P[b + 1], tz = P[c + 2] - P[b + 2];
    const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2];
    let x = ty * uz - tz * uy, y = tz * ux - tx * uz, z = tx * uy - ty * ux;
    const lsq = x * x + y * y + z * z;
    if (lsq > 0) { const s = 1 / Math.sqrt(lsq); x *= s; y *= s; z *= s; } else { x = 0; y = 0; z = 0; }
    N[t * 3] = x; N[t * 3 + 1] = y; N[t * 3 + 2] = z;
  }
  const out = [];
  for (let m = 0; m < match.length; m += 4) {
    const s = match[m] * 3, o = match[m + 1] * 3;
    if (N[s] * N[o] + N[s + 1] * N[o + 1] + N[s + 2] * N[o + 2] <= thresholdDot) out.push(match[m + 2], match[m + 3]);
  }
  for (let i = 0; i < rest.length; i++) out.push(rest[i]);
  const E = new Float32Array(out.length * 3);
  for (let i = 0; i < out.length; i++) { const k = out[i] * 3; E[i * 3] = P[k]; E[i * 3 + 1] = P[k + 1]; E[i * 3 + 2] = P[k + 2]; }
  return E;
}

// Vertex positions of three's CylinderGeometry(radiusTop, radiusBottom, height, seg) with one height
// segment, closed, full turn, in its vertex order and arithmetic.
const trig = new Map();
function sinCos(seg) {
  if (!trig.has(seg)) {
    const s = new Float64Array(seg + 1), c = new Float64Array(seg + 1);
    for (let x = 0; x <= seg; x++) { const theta = (x / seg) * (Math.PI * 2) + 0; s[x] = Math.sin(theta); c[x] = Math.cos(theta); }
    trig.set(seg, { s, c });
  }
  return trig.get(seg);
}
export function cylinderPositions(radiusTop, radiusBottom, height, seg) {
  const { s, c } = sinCos(seg), halfHeight = height / 2;
  const n = 2 * (seg + 1) + (radiusTop > 0 ? 2 * seg + 1 : 0) + (radiusBottom > 0 ? 2 * seg + 1 : 0);
  const P = new Float32Array(n * 3);
  let k = 0;
  const put = (x, y, z) => { P[k++] = x; P[k++] = y; P[k++] = z; };
  for (let y = 0; y <= 1; y++) {
    const v = y / 1, radius = v * (radiusBottom - radiusTop) + radiusTop, py = -v * height + halfHeight;
    for (let x = 0; x <= seg; x++) put(radius * s[x], py, radius * c[x]);
  }
  for (const top of [true, false]) {
    const radius = top ? radiusTop : radiusBottom, sign = top ? 1 : -1;
    if (!(radius > 0)) continue;
    for (let x = 1; x <= seg; x++) put(0, halfHeight * sign, 0);
    for (let x = 0; x <= seg; x++) put(radius * s[x], halfHeight * sign, radius * c[x]);
  }
  return P;
}

// Positions of a box of `size` from a template of the 2 x 2 x 2 box's (+-1) corners: three builds
// every coordinate as +-size / 2, which is what this gives.
export function boxPositions(unit, size) {
  const P = new Float32Array(unit.length), h = [size[0] / 2, size[1] / 2, size[2] / 2];
  for (let i = 0; i < unit.length; i++) P[i] = unit[i] * h[i % 3];
  return P;
}

// Positions of a sphere of radius r from float64 unit directions (PolyhedronGeometry's
// normalize().multiplyScalar(r)).
export function spherePositions(unit, r) {
  const P = new Float32Array(unit.length);
  for (let i = 0; i < unit.length; i++) P[i] = unit[i] * r;
  return P;
}

// Non-indexed copy of positions P through index.
export function unindex(P, index) {
  if (!index) return P;
  const out = new Float32Array(index.length * 3);
  for (let i = 0; i < index.length; i++) { const k = index[i] * 3; out[i * 3] = P[k]; out[i * 3 + 1] = P[k + 1]; out[i * 3 + 2] = P[k + 2]; }
  return out;
}
