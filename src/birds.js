import * as THREE from 'three';
import { stream } from './rng.js';
import { colorsFor } from './palette.js';

function chevron(color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0.1, 0, 0, -0.15, 0, 0, -0.15, 0.25, 0, 0.1], 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}

export class Flocks {
  constructor(scene, seedHash) { this.scene = scene; this.seedHash = seedHash; this.flocks = new Map(); }

  add(cell) {
    const { hall } = cell;
    if (!hall.hasBirds || hall.y !== 0 || this.flocks.has(cell)) return;
    const rng = stream(this.seedHash, hall.x, hall.y, hall.z, 'birds');
    const n = rng.int(8, 14), color = colorsFor(hall.light).line, birds = [];
    const h = hall.floorY + hall.ceiling * 0.6, A = hall.hx * 0.6, B = hall.hz * 0.6;
    for (let i = 0; i < n; i++) {
      const mesh = chevron(color); this.scene.add(mesh);
      const perchX = hall.cx - hall.hx + 1 + (i / n) * (2 * hall.hx - 2);
      birds.push({ mesh, phase: rng.range(0, Math.PI * 2), perch: [perchX, hall.floorY + hall.ceiling - 0.3, hall.cz - hall.hz + 0.6] });
    }
    this.flocks.set(cell, { birds, hall, h, A, B, omega: rng.range(0.25, 0.4), period: rng.range(25, 40), settleAt: rng.range(10, 30), settling: 0 });
  }

  remove(cell) {
    const f = this.flocks.get(cell);
    if (!f) return;
    for (const b of f.birds) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.mesh.removeFromParent(); }
    this.flocks.delete(cell);
  }

  update(t, dt) {
    for (const f of this.flocks.values()) {
      const cycle = (t - f.settleAt) % f.period;
      const target = cycle >= 0 && cycle < 10 ? 1 : 0;
      f.settling += (target - f.settling) * (1 - Math.exp(-dt / 1.2));
      for (const b of f.birds) {
        const a = f.omega * t + b.phase;
        const fx = f.hall.cx + f.A * Math.sin(a), fz = f.hall.cz + f.B * 0.6 * Math.sin(2 * a), fy = f.h + 0.8 * Math.sin(3 * a);
        const x = fx + (b.perch[0] - fx) * f.settling, y = fy + (b.perch[1] - fy) * f.settling, z = fz + (b.perch[2] - fz) * f.settling;
        const vx = f.A * f.omega * Math.cos(a), vz = f.B * 1.2 * f.omega * Math.cos(2 * a);
        b.mesh.position.set(x, y, z);
        b.mesh.rotation.y = Math.atan2(-vx, -vz) * (1 - f.settling);
      }
    }
  }
}
