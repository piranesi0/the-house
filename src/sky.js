import { buildGroup, disposeGroup } from './build.js';
import { sphere } from './shapes/ir.js';
import { stream } from './rng.js';
import { colorsFor } from './palette.js';

export class Clouds {
  constructor(scene, seedHash) { this.scene = scene; this.seedHash = seedHash; this.items = new Map(); }

  add(cell) {
    const { hall } = cell;
    if (hall.y !== 1 || this.items.has(cell)) return;
    const rng = stream(this.seedHash, hall.x, hall.y, hall.z, 'cloud');
    const n = Math.round(1 + 8 * hall.light), color = colorsFor(hall.light).line, blobs = [];
    const baseY = hall.floorY + hall.ceiling + 6;
    for (let i = 0; i < n; i++) {
      const g = buildGroup([sphere(rng.range(3, 6), [0, 0, 0])], color, 0);
      g.position.set(hall.cx + rng.range(-12, 12), baseY + rng.range(2, 10), hall.cz + rng.range(-12, 12));
      this.scene.add(g);
      blobs.push({ g, speed: rng.range(0.2, 0.5), cx: hall.cx });
    }
    this.items.set(cell, blobs);
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
      if (b.g.position.x > b.cx + 12) b.g.position.x -= 24;
    }
  }
}
