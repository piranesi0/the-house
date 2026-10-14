import * as THREE from 'three';
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

// The shaded look: one translucent mesh holding every blob of every loaded cloud hall, drifting in
// the vertex shader (cloudMaterial), so the clouds cost one draw call in all, wherever they are.
// Each hall's blobs are built once, on add, around its own centre; the shared mesh is put together
// on the next update after a cloud hall comes or goes (as water.js does its sheets), relative to the
// first hall's centre so float32 positions stay small. No line mesh: the faint lines are in the shader.
export class ShadedClouds {
  constructor(scene, seedHash) {
    this.scene = scene; this.seedHash = seedHash; this.items = new Map(); this.time = 0;
    this.mesh = null; this.dirty = false;
  }

  add(cell) {
    const { hall } = cell;
    if (this.items.has(cell)) return;
    const blobs = cloudsFor(this.seedHash, hall);
    if (!blobs.length) return;
    const parts = blobs.map(b => primSolid(sphere(b.r, [b.x, b.y, b.z])));
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const position = new Float32Array(n * 3), centre = new Float32Array(n * 3), drift = new Float32Array(n);
    let v = 0;
    parts.forEach((g, k) => {
      const b = blobs[k], m = g.attributes.position.count;
      position.set(g.attributes.position.array, v * 3);
      for (let i = v; i < v + m; i++) { centre[i * 3] = b.x; centre[i * 3 + 1] = b.y; centre[i * 3 + 2] = b.z; drift[i] = b.speed; }
      v += m; g.dispose();
    });
    // y range of the blobs, for the shared mesh's bounds: they drift across the whole square.
    const ys = blobs.map(b => b.y);
    this.items.set(cell, { hall, n, position, centre, drift, y0: Math.min(...ys) - CLOUD.r[1], y1: Math.max(...ys) + CLOUD.r[1] });
    this.dirty = true;
  }

  remove(cell) {
    if (this.items.delete(cell)) this.dirty = true;
  }

  rebuild() {
    this.dirty = false;
    const halls = [...this.items.values()];
    if (this.mesh) {
      this.mesh.geometry.dispose();
      if (!halls.length) { this.mesh.material.dispose(); this.mesh.removeFromParent(); this.mesh = null; }
    }
    if (!halls.length) return;
    const ox = halls[0].hall.cx, oz = halls[0].hall.cz, total = halls.reduce((a, h) => a + h.n, 0);
    const position = new Float32Array(total * 3), centre = new Float32Array(total * 3), bary = new Float32Array(total * 3);
    const hallAt = new Float32Array(total * 3), fields = new Float32Array(total * 3), drift = new Float32Array(total);
    const w = CLOUD.spread + CLOUD.r[1], box = new THREE.Box3();
    let v = 0;
    for (const it of halls) {
      const { hall } = it, dx = hall.cx - ox, dy = hall.floorY, dz = hall.cz - oz;
      for (let i = 0; i < it.n; i++) {
        const j = (v + i) * 3, s = i * 3;
        position[j] = it.position[s] + dx; position[j + 1] = it.position[s + 1] + dy; position[j + 2] = it.position[s + 2] + dz;
        centre[j] = it.centre[s] + dx; centre[j + 1] = it.centre[s + 1] + dy; centre[j + 2] = it.centre[s + 2] + dz;
        // primSolid of a sphere is non-indexed, so vertex i is corner i % 3 of its triangle.
        bary[j + (i % 3)] = 1;
        hallAt[j] = dx; hallAt[j + 1] = dy; hallAt[j + 2] = dz;
        fields[j] = hall.light; fields[j + 1] = hall.water; fields[j + 2] = hall.decay;
      }
      drift.set(it.drift, v);
      box.expandByPoint(new THREE.Vector3(dx - w, dy + it.y0, dz - w)).expandByPoint(new THREE.Vector3(dx + w, dy + it.y1, dz + w));
      v += it.n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3));
    g.setAttribute('centre', new THREE.BufferAttribute(centre, 3));
    g.setAttribute('bary', new THREE.BufferAttribute(bary, 3));
    g.setAttribute('hall', new THREE.BufferAttribute(hallAt, 3));
    g.setAttribute('fields', new THREE.BufferAttribute(fields, 3));
    g.setAttribute('drift', new THREE.BufferAttribute(drift, 1));
    g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    if (!this.mesh) {
      this.mesh = new THREE.Mesh(g, cloudMaterial({ spread: CLOUD.spread }));
      this.mesh.material.uniforms.uTime.value = this.time;
      this.scene.add(this.mesh);
    } else this.mesh.geometry = g;
    this.mesh.position.set(ox, 0, oz);
  }

  update(dt) {
    this.time += dt;
    if (this.dirty) this.rebuild();
    if (this.mesh) this.mesh.material.uniforms.uTime.value = this.time;
  }
}
