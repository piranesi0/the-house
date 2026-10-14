import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polyPositions } from './shapes/poly.js';
import { KIND } from './material.js';
import { CELL } from './hall.js';
import { isInlaid } from './marble.js';
import { edgeProgram, fits, runEdges, cylinderPositions, boxPositions, spherePositions, unindex } from './creases.js';
import { mirrorTriangles, mirrorSegments } from './reflect.js';

// Box, cylinder and sphere parts share one template per kind (creases.js): the reference part's
// index buffer and EdgesGeometry program, built once. A part's own positions come from the same
// arithmetic three's geometry classes use, so lines and solids come out as they did when every part
// built its own BoxGeometry / CylinderGeometry / IcosahedronGeometry and EdgesGeometry.
const templates = new Map();
function template(p) {
  const key = p.kind === 'cyl' ? `cyl:${p.seg}:${p.r2 > 0}:${p.r1 > 0}` : p.kind;
  let t = templates.get(key);
  if (t) return t;
  let g, P;
  if (p.kind === 'box') { g = new THREE.BoxGeometry(2, 2, 2); P = g.attributes.position.array; }
  else if (p.kind === 'cyl') {
    g = new THREE.CylinderGeometry(p.r2 > 0 ? 1 : 0, p.r1 > 0 ? 1 : 0, 1, p.seg);
    P = cylinderPositions(p.r2 > 0 ? 1 : 0, p.r1 > 0 ? 1 : 0, 1, p.seg);
  } else { g = new THREE.IcosahedronGeometry(1, 1); P = g.attributes.position.array; }
  const index = g.index ? Uint32Array.from(g.index.array) : null;
  t = { index, prog: edgeProgram(P, index) };
  if (p.kind === 'box') t.unit = Float64Array.from(P);
  if (p.kind === 'sphere') t.unit = icosahedronDirections();
  g.dispose();
  templates.set(key, t);
  return t;
}

// IcosahedronGeometry's base vertices and faces (three 0.170.0), then PolyhedronGeometry's detail-1
// subdivision and normalize(), kept in float64 so a part's radius scales them exactly as
// IcosahedronGeometry(r, 1) does.
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTICES = [-1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI, 0, 0, -1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI, PHI, 0, -1, PHI, 0, 1, -PHI, 0, -1, -PHI, 0, 1];
const ICO_INDICES = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
function icosahedronDirections() {
  const vertices = ICO_VERTICES, indices = ICO_INDICES;
  const out = [], at = (i) => new THREE.Vector3(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);
  const cols = 2;
  for (let f = 0; f < indices.length; f += 3) {
    const a = at(indices[f]), b = at(indices[f + 1]), c = at(indices[f + 2]), v = [];
    for (let i = 0; i <= cols; i++) {
      v[i] = [];
      const aj = a.clone().lerp(c, i / cols), bj = b.clone().lerp(c, i / cols), rows = cols - i;
      for (let j = 0; j <= rows; j++) v[i][j] = j === 0 && i === cols ? aj : aj.clone().lerp(bj, j / rows);
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < 2 * (cols - i) - 1; j++) {
      const k = Math.floor(j / 2);
      const tri = j % 2 === 0 ? [v[i][k + 1], v[i + 1][k], v[i][k]] : [v[i][k + 1], v[i + 1][k + 1], v[i + 1][k]];
      for (const q of tri) { const n = q.clone().normalize(); out.push(n.x, n.y, n.z); }
    }
  }
  return Float64Array.from(out);
}

function partPositions(p, t) {
  if (p.kind === 'box') return boxPositions(t.unit, p.size);
  if (p.kind === 'cyl') return cylinderPositions(p.r2, p.r1, p.h, p.seg);
  return spherePositions(t.unit, p.r);
}

// The part's rotations (X, then Z, then Y) and translation, through three's own matrices. A zero
// angle is skipped: its rotation leaves every coordinate as it was.
function place(g, p) {
  if (p.rot[0] !== 0) g.rotateX(p.rot[0]);
  if (p.rot[2] !== 0) g.rotateZ(p.rot[2]);
  if (p.rot[1] !== 0) g.rotateY(p.rot[1]);
  g.translate(p.pos[0], p.pos[1], p.pos[2]);
}

function geometryOf(positions) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return g;
}

// Crease-edge lines for every primitive that draws lines. Polys draw none.
export function primGeometry(p) {
  if (p.kind === 'poly') return null;
  if (p.kind === 'lines' || p.kind === 'segs') {
    const pos = [];
    if (p.kind === 'lines') for (let i = 0; i + 1 < p.points.length; i++) pos.push(...p.points[i], ...p.points[i + 1]);
    else for (let i = 0; i + 1 < p.points.length; i += 2) pos.push(...p.points[i], ...p.points[i + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }
  const t = template(p), P = partPositions(p, t), threshold = p.kind === 'sphere' ? 10 : 20;
  // A part so small that distinct corners round together takes three's own path.
  const e = fits(t.prog, P) ? geometryOf(runEdges(t.prog, P, threshold)) : legacyEdges(p, threshold);
  place(e, p);
  return e;
}

function legacyEdges(p, threshold) {
  let g;
  if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.r2, p.r1, p.h, p.seg);
  else g = new THREE.IcosahedronGeometry(p.r, 1);
  const e = new THREE.EdgesGeometry(g, threshold);
  g.dispose();
  return e;
}

// Solid triangles with flat normals for every primitive that has a surface. Non-indexed and
// without uvs, so every geometry merges with every other.
export function primSolid(p) {
  let g;
  if (p.kind === 'poly') {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(polyPositions(p), 3));
  } else if (p.kind === 'box' || p.kind === 'cyl' || p.kind === 'sphere') {
    const t = template(p);
    g = geometryOf(unindex(partPositions(p, t), t.index));
    place(g, p);
  } else return null;
  g.computeVertexNormals();
  return g;
}

const kindOf = (p) => p.name === 'pool' ? KIND.pool : p.tag === 'statue' ? KIND.statue : isInlaid(p) ? KIND.floor : KIND.arch;

// Per-vertex field samples at the vertex's world position, so mood is continuous across halls. The
// solids are non-indexed, so most (x, z) pairs repeat: each distinct pair (by its float32 bits) is
// sampled once and copied to the rest, which gives the same values as sampling every vertex.
const bits = new Float32Array(2), bitsU = new Uint32Array(bits.buffer);
function addFieldAttributes(g, kind, fields, offset) {
  const pos = g.attributes.position.array, n = pos.length / 3, f = new Float32Array(n * 3), k = new Float32Array(n).fill(kind);
  let size = 16;
  while (size < n * 2) size *= 2;
  const mask = size - 1, keys = new Uint32Array(size * 2), first = new Int32Array(size).fill(-1);
  for (let i = 0; i < n; i++) {
    bits[0] = pos[i * 3]; bits[1] = pos[i * 3 + 2];
    const a = bitsU[0], b = bitsU[1];
    let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b ^ (b >>> 15), 0x85ebca6b)) & mask;
    while (first[h] !== -1 && (keys[h * 2] !== a || keys[h * 2 + 1] !== b)) h = (h + 1) & mask;
    const j = first[h];
    if (j !== -1) { f[i * 3] = f[j * 3]; f[i * 3 + 1] = f[j * 3 + 1]; f[i * 3 + 2] = f[j * 3 + 2]; continue; }
    first[h] = i; keys[h * 2] = a; keys[h * 2 + 1] = b;
    const x = (pos[i * 3] + offset[0]) / CELL, z = (pos[i * 3 + 2] + offset[2]) / CELL;
    f[i * 3] = fields.light(x, z); f[i * 3 + 1] = fields.water(x, z); f[i * 3 + 2] = fields.decay(x, z);
  }
  g.setAttribute('fields', new THREE.BufferAttribute(f, 3));
  g.setAttribute('kind', new THREE.BufferAttribute(k, 1));
}

// A pool's mirror in the hall's own meshes: each part's lines and solid turned over about the
// mirror plane (reflect.js), the lines cut at it (the solids are cut in the shader). No draw call
// of its own. mirror = { prims, plane }, hall-relative like the hall's prims.
function mirroredLines(p, { plane }) {
  const g = primGeometry(p);
  if (!g) return null;
  const pos = mirrorSegments(g.attributes.position.array, plane, plane);
  g.dispose();
  return pos.length ? geometryOf(pos) : null;
}
function mirroredSolid(p, { plane }) {
  const g = primSolid(p);
  if (!g) return null;
  const m = geometryOf(mirrorTriangles(g.attributes.position.array, plane));
  g.dispose();
  m.computeVertexNormals();
  return m;
}

// A group of line meshes (and optionally a ghost pass) for a primitive list; with `surface`, also
// one solid mesh named 'surface'. surface = { material, fields, offset: [cx, floorY, cz] }. With
// `mirror` (shaded pool halls), the pool's reflection joins both: see mirroredLines above.
export function buildGroup(prims, { color, ghost = 0, surface = null, mirror = null } = {}) {
  const group = new THREE.Group();
  if (prims.length === 0) return group;
  const reflected = mirror ? mirror.prims : [];
  const lineGeoms = [...prims.map(primGeometry), ...reflected.map(p => mirroredLines(p, mirror))].filter(Boolean);
  if (lineGeoms.length) {
    const merged = mergeGeometries(lineGeoms, false);
    lineGeoms.forEach(g => g.dispose());
    if (ghost > 0) {
      const gm = new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost, depthTest: false, depthWrite: false }));
      gm.renderOrder = -1;
      group.add(gm);
    }
    group.add(new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color })));
  }
  if (surface) {
    const solids = [];
    for (const p of prims) {
      const g = primSolid(p);
      if (!g) continue;
      addFieldAttributes(g, kindOf(p), surface.fields, surface.offset);
      solids.push(g);
    }
    for (const p of reflected) {
      const g = mirroredSolid(p, mirror);
      if (!g) continue;
      addFieldAttributes(g, kindOf(p) + KIND.mirrored, surface.fields, surface.offset);
      solids.push(g);
    }
    if (solids.length) {
      const merged = mergeGeometries(solids, false);
      solids.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, surface.material);
      mesh.name = 'surface';
      group.add(mesh);
    }
  }
  return group;
}

export function disposeGroup(group) {
  const seen = new Set();
  group.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { o.geometry.dispose(); seen.add(o.geometry); }
    if (o.material) o.material.dispose();
  });
  group.removeFromParent();
}
