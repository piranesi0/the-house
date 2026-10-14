import * as THREE from 'three';
import { pointInPolygon } from './hall.js';
import { colorsFor, lerpHex } from './palette.js';
import { buildGroup, disposeGroup } from './build.js';
import { waterMaterial } from './material.js';
import { reflectionPrims, SHEET_DROP } from './reflect.js';
import { translatePrims, poly } from './shapes/ir.js';
import { polyPositions } from './shapes/poly.js';

// Pools. look=lines keeps v0: a rippling line grid at the water line and a swaying line mirror of
// the statues standing in the pool, per pool. The shaded look draws every loaded pool's water sheet
// in one mesh (waterMaterial, the grid drawn in its shader), rebuilt on the next update after a pool
// comes or goes; each pool's mirror is part of its hall's own meshes (world.js, build.js), seen
// through the pool's opening in the floor. So the shaded pools in view cost one draw call in all.
export class Water {
  constructor(scene, renderer, look = 'shaded') {
    this.scene = scene; this.pools = new Map(); this.shaded = look === 'shaded';
    this.sheets = null; this.dirty = false;
    renderer.localClippingEnabled = true;
  }

  add(cell) {
    const { hall } = cell;
    if (!hall.pool || this.pools.has(cell)) return;
    if (this.shaded) { this.pools.set(cell, { hall }); this.dirty = true; return; }
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
    // Colossi are left dry (final review S1 I2): this mirror is clipped only at waterY, not to the
    // pool outline, so a 10-15 m figure would hang upside down under the see-through floor.
    const prims = reflectionPrims(hall, cell.statues || [], [], { shaded: false });
    const mirror = buildGroup(translatePrims(prims, -hall.cx, 0, -hall.cz), { color, ghost: 0 });
    mirror.scale.y = -1;
    mirror.position.set(hall.cx, 2 * waterY, hall.cz);
    mirror.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.4; o.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), waterY)]; } });
    this.scene.add(mirror);
    this.pools.set(cell, { mesh, base, mirror, cx: hall.cx, cz: hall.cz });
  }

  remove(cell) {
    const p = this.pools.get(cell);
    if (!p) return;
    this.pools.delete(cell);
    if (this.shaded) { this.dirty = true; return; }
    p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.mesh.removeFromParent();
    disposeGroup(p.mirror);
  }

  // Every loaded pool's sheet in one geometry, relative to the first pool's hall centre (a multiple
  // of 24 m, so the grid's whole metres stay put) to keep float32 positions small.
  rebuild() {
    this.dirty = false;
    const halls = [...this.pools.values()].map(p => p.hall);
    if (this.sheets) { this.sheets.geometry.dispose(); if (!halls.length) { this.sheets.material.dispose(); this.sheets.removeFromParent(); this.sheets = null; } }
    if (!halls.length) return;
    const [ox, oz] = [halls[0].cx, halls[0].cz];
    const pos = [], fields = [], h = [], grid = [];
    for (const hall of halls) {
      const y = hall.floorY + hall.depth - SHEET_DROP;
      const tri = polyPositions(poly(hall.pool.map(([x, z]) => [hall.cx - ox + x, y, hall.cz - oz + z]), 'water'));
      // The pool's v0 grid colour as raw sRGB, as the shader writes it.
      const hex = lerpHex(colorsFor(hall.light).line, 0x7fa0c0, 0.5), raw = [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => v / 255);
      pos.push(...tri);
      for (let i = 0; i < tri.length / 3; i++) { fields.push(hall.light, hall.water, hall.decay); h.push(hall.depth - SHEET_DROP); grid.push(...raw); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('fields', new THREE.Float32BufferAttribute(fields, 3));
    g.setAttribute('h', new THREE.Float32BufferAttribute(h, 1));
    g.setAttribute('grid', new THREE.Float32BufferAttribute(grid, 3));
    g.computeVertexNormals();
    if (!this.sheets) { this.sheets = new THREE.Mesh(g, waterMaterial()); this.scene.add(this.sheets); }
    else this.sheets.geometry = g;
    this.sheets.position.set(ox, 0, oz);
  }

  update(t) {
    if (this.shaded) {
      if (this.dirty) this.rebuild();
      if (this.sheets) this.sheets.material.uniforms.uTime.value = t;
      return;
    }
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
