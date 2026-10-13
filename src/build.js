import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polyPositions } from './shapes/poly.js';
import { KIND } from './material.js';
import { CELL } from './hall.js';

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
  let g;
  if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.r2, p.r1, p.h, p.seg);
  else if (p.kind === 'sphere') g = new THREE.IcosahedronGeometry(p.r, 1);
  const e = new THREE.EdgesGeometry(g, p.kind === 'sphere' ? 10 : 20);
  g.dispose();
  e.rotateX(p.rot[0]); e.rotateZ(p.rot[2]); e.rotateY(p.rot[1]);
  e.translate(p.pos[0], p.pos[1], p.pos[2]);
  return e;
}

// Solid triangles with flat normals for every primitive that has a surface. Non-indexed and
// without uvs, so every geometry merges with every other.
export function primSolid(p) {
  let g;
  if (p.kind === 'poly') {
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(polyPositions(p), 3));
  } else if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.r2, p.r1, p.h, p.seg);
  else if (p.kind === 'sphere') g = new THREE.IcosahedronGeometry(p.r, 1);
  else return null;
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  if (p.kind !== 'poly') { g.rotateX(p.rot[0]); g.rotateZ(p.rot[2]); g.rotateY(p.rot[1]); g.translate(p.pos[0], p.pos[1], p.pos[2]); }
  g.computeVertexNormals();
  return g;
}

const kindOf = (p) => p.name === 'pool' ? KIND.pool : p.tag === 'statue' ? KIND.statue : KIND.arch;

// Per-vertex field samples at the vertex's world position, so mood is continuous across halls.
function addFieldAttributes(g, kind, fields, offset) {
  const pos = g.attributes.position, n = pos.count, f = new Float32Array(n * 3), k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (pos.getX(i) + offset[0]) / CELL, z = (pos.getZ(i) + offset[2]) / CELL;
    f[i * 3] = fields.light(x, z); f[i * 3 + 1] = fields.water(x, z); f[i * 3 + 2] = fields.decay(x, z);
    k[i] = kind;
  }
  g.setAttribute('fields', new THREE.BufferAttribute(f, 3));
  g.setAttribute('kind', new THREE.BufferAttribute(k, 1));
}

// A group of line meshes (and optionally a ghost pass) for a primitive list; with `surface`, also
// one solid mesh named 'surface'. surface = { material, fields, offset: [cx, floorY, cz] }.
export function buildGroup(prims, { color, ghost = 0, surface = null } = {}) {
  const group = new THREE.Group();
  if (prims.length === 0) return group;
  const lineGeoms = prims.map(primGeometry).filter(Boolean);
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
