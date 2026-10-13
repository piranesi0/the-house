import * as THREE from 'three';
import { pointInPolygon } from './hall.js';
import { colorsFor, lerpHex } from './palette.js';
import { buildGroup, disposeGroup } from './build.js';
import { translatePrims } from './shapes/ir.js';

export class Water {
  constructor(scene, renderer) { this.scene = scene; this.pools = new Map(); renderer.localClippingEnabled = true; }

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
    const waterY = hall.floorY + hall.depth;
    const wet = (cell.statues || []).filter(s => pointInPolygon([s.slot.x - hall.cx, s.slot.z - hall.cz], hall.pool));
    const prims = wet.flatMap(s => s.prims);
    const mirror = buildGroup(translatePrims(prims, -hall.cx, 0, -hall.cz), color, 0);
    mirror.scale.y = -1;
    mirror.position.set(hall.cx, 2 * waterY, hall.cz);
    mirror.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.4; o.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), waterY)]; } });
    this.scene.add(mirror);
    this.pools.set(cell, { mesh, base, mirror, cx: hall.cx, cz: hall.cz });
  }

  remove(cell) {
    const p = this.pools.get(cell);
    if (!p) return;
    p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh.removeFromParent();
    disposeGroup(p.mirror);
    this.pools.delete(cell);
  }

  update(t) {
    for (const { mesh, base, mirror, cx, cz } of this.pools.values()) {
      mirror.position.x = cx + 0.05 * Math.sin(0.7 * t); mirror.position.z = cz + 0.05 * Math.cos(0.5 * t);
      const a = mesh.geometry.attributes.position;
      for (let i = 0; i < base.length; i++) {
        const [x, z] = base[i];
        a.setY(i, 0.03 * Math.sin(0.7 * t + 0.5 * x) + 0.02 * Math.sin(0.5 * t + 0.7 * z));
      }
      a.needsUpdate = true;
    }
  }
}
