import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function primGeometry(p) {
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

export function buildGroup(prims, color, ghost = 0.15) {
  const group = new THREE.Group();
  if (prims.length === 0) return group;
  const geoms = prims.map(primGeometry);
  const merged = mergeGeometries(geoms, false);
  geoms.forEach(g => g.dispose());
  if (ghost > 0) {
    const gm = new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color, transparent: true, opacity: ghost, depthTest: false, depthWrite: false }));
    gm.renderOrder = -1;
    group.add(gm);
  }
  group.add(new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color })));
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
