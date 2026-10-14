import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildGroup, disposeGroup, primSolid } from './build.js';
import { cloudMaterial } from './material.js';
import { sphere } from './shapes/ir.js';
import { CLOUD, cloudsFor } from './clouds.js';
import { colorsFor } from './palette.js';

// look=lines: v0's wire blobs, one group each, moved on the CPU.
export class Clouds {
  constructor(scene, seedHash) { this.scene = scene; this.seedHash = seedHash; this.items = new Map(); }

  add(cell) {
    const { hall } = cell;
    if (this.items.has(cell)) return;
    const color = colorsFor(hall.light).line, blobs = [];
    for (const b of cloudsFor(this.seedHash, hall)) {
      const g = buildGroup([sphere(b.r, [0, 0, 0])], { color, ghost: 0 });
      g.position.set(hall.cx + b.x, hall.floorY + b.y, hall.cz + b.z);
      this.scene.add(g);
      blobs.push({ g, speed: b.speed, cx: hall.cx });
    }
    if (blobs.length) this.items.set(cell, blobs);
  }

  remove(cell) {
    const blobs = this.items.get(cell);
    if (!blobs) return;
    for (const { g } of blobs) disposeGroup(g);
    this.items.delete(cell);
  }

  update(dt) {
    for (const blobs of this.items.values()) for (const b of blobs) {
      b.g.position.x += b.speed * dt;
      if (b.g.position.x > b.cx + CLOUD.spread) b.g.position.x -= 2 * CLOUD.spread;
    }
  }
}

// The shaded look: one translucent mesh per cloud hall holding every blob, drifting in the vertex
// shader (cloudMaterial). One draw call, no line mesh: the faint lines are drawn in the shader.
export class ShadedClouds {
  constructor(scene, seedHash) { this.scene = scene; this.seedHash = seedHash; this.items = new Map(); this.time = 0; }

  add(cell) {
    const { hall } = cell;
    if (this.items.has(cell)) return;
    const blobs = cloudsFor(this.seedHash, hall);
    if (!blobs.length) return;
    const parts = blobs.map(b => {
      const g = primSolid(sphere(b.r, [b.x, b.y, b.z])), n = g.attributes.position.count;
      const centre = new Float32Array(n * 3), bary = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { centre.set([b.x, b.y, b.z], i * 3); bary[i * 3 + (i % 3)] = 1; }
      g.setAttribute('centre', new THREE.BufferAttribute(centre, 3));
      g.setAttribute('bary', new THREE.BufferAttribute(bary, 3));
      g.setAttribute('drift', new THREE.BufferAttribute(new Float32Array(n).fill(b.speed), 1));
      return g;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach(g => g.dispose());
    // The blobs drift across the whole square, so the bounds cover the square, not where they start.
    const ys = blobs.map(b => b.y), y0 = Math.min(...ys) - CLOUD.r[1], y1 = Math.max(...ys) + CLOUD.r[1], w = CLOUD.spread + CLOUD.r[1];
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (y0 + y1) / 2, 0), Math.hypot(w, w, (y1 - y0) / 2));
    const mesh = new THREE.Mesh(geometry, cloudMaterial({ fields: [hall.light, hall.water, hall.decay], spread: CLOUD.spread }));
    mesh.position.set(hall.cx, hall.floorY, hall.cz);
    mesh.material.uniforms.uTime.value = this.time;
    this.scene.add(mesh);
    this.items.set(cell, mesh);
  }

  remove(cell) {
    const mesh = this.items.get(cell);
    if (!mesh) return;
    mesh.geometry.dispose(); mesh.material.dispose(); mesh.removeFromParent();
    this.items.delete(cell);
  }

  update(dt) {
    this.time += dt;
    for (const mesh of this.items.values()) mesh.material.uniforms.uTime.value = this.time;
  }
}
