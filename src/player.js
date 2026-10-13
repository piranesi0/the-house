import { cellOf } from './hall.js';

const EYE = 1.7, RADIUS = 0.35, SPEED = 1.4, SLOW = 0.7, LOOK_EASE = 0.12;

export function floorAt(floors, x, z) {
  for (const f of floors) {
    if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
    const t = f.axis === 'x' ? (x - f.x0) / (f.x1 - f.x0) : (z - f.z0) / (f.z1 - f.z0);
    return f.y0 + (f.y1 - f.y0) * t;
  }
  return 0;
}

// Unit input (fx right, fz back) turned by the camera's yaw into a world direction.
export function moveDir(fx, fz, yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return [fx * c + fz * s, -fx * s + fz * c];
}

export class Player {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    // A Vector3 without importing three, so floorAt stays loadable under Node.
    this.pos = camera.position.clone().set(0, 0, 0);
    this.yaw = 0; this.pitch = 0; this.tYaw = 0; this.tPitch = 0;
    this.keys = new Set(); this.locked = false; this.phase = 0; this.moving = 0;
    this.onStep = null;
    dom.addEventListener('click', () => dom.requestPointerLock());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; this.keys.clear(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.tYaw -= e.movementX * 0.002;
      this.tPitch = Math.max(-1.5, Math.min(1.5, this.tPitch - e.movementY * 0.002));
    });
    document.addEventListener('keydown', (e) => { if (this.locked) this.keys.add(e.code); });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, 0, z); this.yaw = this.tYaw = yaw; this.pitch = this.tPitch = 0;
  }

  update(dt, world) {
    const k = 1 - Math.exp(-dt / LOOK_EASE);
    this.yaw += (this.tYaw - this.yaw) * k;
    this.pitch += (this.tPitch - this.pitch) * k;

    let fx = 0, fz = 0;
    if (this.keys.has('KeyW')) fz -= 1; if (this.keys.has('KeyS')) fz += 1;
    if (this.keys.has('KeyA')) fx -= 1; if (this.keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz);
    const cx = cellOf(this.pos.x), cz = cellOf(this.pos.z);
    const { boxes, floors } = world.near(cx, cz);
    const depth = world.depthAt(this.pos.x, this.pos.z);
    this.pos.y = floorAt(floors, this.pos.x, this.pos.z);
    if (len > 0) {
      const slow = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = (slow ? SLOW : SPEED) * (1 - 0.6 * depth);
      fx /= len; fz /= len;
      const [ux, uz] = moveDir(fx, fz, this.yaw);
      const dx = ux * speed * dt, dz = uz * speed * dt;
      this.moveAxis(boxes, dx, 0); this.moveAxis(boxes, 0, dz);
      const before = this.phase;
      this.phase += speed * dt * (depth > 0.2 ? 4 : 6);
      if (Math.floor(this.phase / Math.PI) !== Math.floor(before / Math.PI) && this.onStep) this.onStep(depth > 0.2);
    }
    this.moving += ((len > 0 ? 1 : 0) - this.moving) * (1 - Math.exp(-dt / 0.15));
    this.pos.y = floorAt(floors, this.pos.x, this.pos.z);
    const bob = Math.sin(this.phase) * (depth > 0.2 ? 0.05 : 0.03) * this.moving;
    this.camera.position.set(this.pos.x, this.pos.y + EYE - depth / 2 + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  moveAxis(boxes, dx, dz) {
    this.pos.x += dx; this.pos.z += dz;
    const y0 = this.pos.y + 0.2, y1 = this.pos.y + 1.8;
    for (const b of boxes) {
      if (b.max[1] < y0 || b.min[1] > y1) continue;
      const minX = b.min[0] - RADIUS, maxX = b.max[0] + RADIUS, minZ = b.min[2] - RADIUS, maxZ = b.max[2] + RADIUS;
      if (this.pos.x <= minX || this.pos.x >= maxX || this.pos.z <= minZ || this.pos.z >= maxZ) continue;
      if (dx !== 0) this.pos.x = dx > 0 ? minX : maxX;
      else if (dz !== 0) this.pos.z = dz > 0 ? minZ : maxZ;
    }
  }
}
