import * as THREE from 'three';
import { stream } from './rng.js';
import { colorsFor } from './palette.js';
import { isRoofless } from './roof.js';

// One bird: a chevron of two segments, flat, pointing along -z.
const CHEVRON = [-0.25, 0, 0.1, 0, 0, -0.15, 0, 0, -0.15, 0.25, 0, 0.1];

// Where a flock perches: a row under the ceiling by the north wall, 0.6 m in from it. A roofless
// hall has no ceiling, so its birds sit on the north wall's top instead, along the wall's centre
// line and only where that wall runs (final review S2 m2): the full width in a rectangular hall,
// the north arm's end in a cross, the north side in an octagon (hz = hx there).
function perchRow(seedHash, hall) {
  if (!isRoofless(seedHash, hall)) return { x0: hall.cx - hall.hx + 1, x1: hall.cx + hall.hx - 1, y: hall.floorY + hall.ceiling - 0.3, z: hall.cz - hall.hz + 0.6 };
  const half = hall.shape === 'cross' ? hall.hx * 0.5 : hall.shape === 'octagon' ? hall.hx * Math.tan(Math.PI / 8) : hall.hx;
  return { x0: hall.cx - half + 0.5, x1: hall.cx + half - 0.5, y: hall.floorY + hall.ceiling + 0.1, z: hall.cz - hall.hz - hall.wall / 2 };
}

// A whole flock is one LineSegments (final review S2 I2: one mesh per bird was 8-14 draw calls a
// flock). update() turns and places each bird's chevron on the CPU and writes it into the shared
// buffer. The mesh sits at the hall's centre and floor, so the buffer holds hall-local, float32-safe
// offsets, as the halls' own geometry does; its bounds are the hall, set once, so it culls as one.
function flockMesh(n, hall, color) {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.Float32BufferAttribute(new Float32Array(n * CHEVRON.length), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pos);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, hall.ceiling / 2, 0), Math.hypot(hall.hx, hall.hz, hall.ceiling / 2) + 2);
  const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
  mesh.position.set(hall.cx, hall.floorY, hall.cz);
  return mesh;
}

export class Flocks {
  constructor(scene, seedHash) {
    this.scene = scene; this.seedHash = seedHash; this.flocks = new Map();
    this.focus = null; this.onWings = null;   // the player's cell, and a callback for take-off and landing there
  }

  add(cell) {
    const { hall } = cell;
    if (!hall.hasBirds || hall.y !== 0 || this.flocks.has(cell)) return;
    const rng = stream(this.seedHash, hall.x, hall.y, hall.z, 'birds');
    const n = rng.int(8, 14), color = colorsFor(hall.light).line, birds = [];
    const h = hall.floorY + hall.ceiling * 0.6, A = hall.hx * 0.6, B = hall.hz * 0.6;
    const mesh = flockMesh(n, hall, color); this.scene.add(mesh);
    const row = perchRow(this.seedHash, hall);
    for (let i = 0; i < n; i++) {
      const perchX = row.x0 + (i / n) * (row.x1 - row.x0);
      birds.push({ phase: rng.range(0, Math.PI * 2), perch: [perchX, row.y, row.z] });
    }
    this.flocks.set(cell, { mesh, birds, hall, h, A, B, omega: rng.range(0.25, 0.4), period: rng.range(25, 40), settleAt: rng.range(10, 30), settling: 0 });
  }

  remove(cell) {
    const f = this.flocks.get(cell);
    if (!f) return;
    f.mesh.geometry.dispose(); f.mesh.material.dispose(); f.mesh.removeFromParent();
    this.flocks.delete(cell);
  }

  update(t, dt) {
    for (const f of this.flocks.values()) {
      const cycle = (t - f.settleAt) % f.period;
      const target = cycle >= 0 && cycle < 10 ? 1 : 0;
      if (f.target !== undefined && target !== f.target && this.focus
        && Math.max(Math.abs(f.hall.x - this.focus[0]), Math.abs(f.hall.z - this.focus[1])) <= 1) this.onWings?.();
      f.target = target;
      f.settling += (target - f.settling) * (1 - Math.exp(-dt / 1.2));
      const out = f.mesh.geometry.attributes.position, buf = out.array, { cx, floorY, cz } = f.hall;
      f.birds.forEach((b, i) => {
        const a = f.omega * t + b.phase;
        const fx = f.hall.cx + f.A * Math.sin(a), fz = f.hall.cz + f.B * 0.6 * Math.sin(2 * a), fy = f.h + 0.8 * Math.sin(3 * a);
        const x = fx + (b.perch[0] - fx) * f.settling, y = fy + (b.perch[1] - fy) * f.settling, z = fz + (b.perch[2] - fz) * f.settling;
        const vx = f.A * f.omega * Math.cos(a), vz = f.B * 1.2 * f.omega * Math.cos(2 * a);
        // As Object3D.rotation.y then position did per bird: turn about y, then move.
        const r = Math.atan2(-vx, -vz) * (1 - f.settling), c = Math.cos(r), s = Math.sin(r);
        const ox = x - cx, oy = y - floorY, oz = z - cz;
        for (let k = 0, o = i * CHEVRON.length; k < CHEVRON.length; k += 3, o += 3) {
          const px = CHEVRON[k], pz = CHEVRON[k + 2];
          buf[o] = ox + c * px + s * pz; buf[o + 1] = oy + CHEVRON[k + 1]; buf[o + 2] = oz - s * px + c * pz;
        }
      });
      out.needsUpdate = true;
    }
  }
}
