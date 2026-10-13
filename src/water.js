import * as THREE from 'three';
import { pointInPolygon } from './hall.js';
import { colorsFor, lerpHex } from './palette.js';

export class Water {
  constructor(scene) { this.scene = scene; this.pools = new Map(); }

  add(cell) {
    const { hall } = cell;
    if (!hall.pool || this.pools.has(cell)) return;
    const xs = hall.pool.map(p => p[0]), zs = hall.pool.map(p => p[1]);
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
    const z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs));
    const inside = (x, z) => pointInPolygon([x, z], hall.pool);
    const pos = [], base = [];
    const push = (ax, az, bx, bz) => { pos.push(ax, 0, az, bx, 0, bz); base.push([ax, az], [bx, bz]); };
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      if (!inside(x, z)) continue;
      if (inside(x + 1, z)) push(x, z, x + 1, z);
      if (inside(x, z + 1)) push(x, z, x, z + 1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const color = lerpHex(colorsFor(hall.light).line, 0x7fa0c0, 0.5);
    const mesh = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color }));
    mesh.position.set(hall.cx, hall.floorY + hall.depth, hall.cz);
    this.scene.add(mesh);
    this.pools.set(cell, { mesh, base });
  }

  remove(cell) {
    const p = this.pools.get(cell);
    if (!p) return;
    p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh.removeFromParent();
    this.pools.delete(cell);
  }

  update(t) {
    for (const { mesh, base } of this.pools.values()) {
      const a = mesh.geometry.attributes.position;
      for (let i = 0; i < base.length; i++) {
        const [x, z] = base[i];
        a.setY(i, 0.03 * Math.sin(0.7 * t + 0.5 * x) + 0.02 * Math.sin(0.5 * t + 0.7 * z));
      }
      a.needsUpdate = true;
    }
  }
}
