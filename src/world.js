import { hallParams, pointInPolygon, cellOf } from './hall.js';
import { connsFor } from './connectors.js';
import { buildHall } from './shapes/index.js';
import { buildConnector } from './shapes/connector.js';
import { placeStatues } from './statues/place.js';
import { translatePrims } from './shapes/ir.js';
import { buildGroup, disposeGroup } from './build.js';
import { surfaceMaterial } from './material.js';
import { colorsFor } from './palette.js';

const key = (x, y, z) => `${x},${y},${z}`;

export class World {
  constructor(scene, seedHash, fields, hooks = {}, look = 'shaded') {
    this.scene = scene; this.seedHash = seedHash; this.fields = fields; this.hooks = hooks; this.look = look;
    this.cells = new Map(); this.params = new Map();
  }
  hall(x, y, z) {
    const k = key(x, y, z);
    if (!this.params.has(k)) this.params.set(k, hallParams(this.seedHash, x, y, z, this.fields));
    return this.params.get(k);
  }
  update(cx, cz) {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) this.ensure(cx + dx, 0, cz + dz);
    for (const [k, cell] of this.cells) {
      if (Math.max(Math.abs(cell.hall.x - cx), Math.abs(cell.hall.z - cz)) > 3) { this.hooks.onRemove?.(cell); disposeGroup(cell.group); this.cells.delete(k); }
    }
  }
  ensure(x, y, z, opts = {}) {
    const k = key(x, y, z);
    if (this.cells.has(k)) return this.cells.get(k);
    const hall = this.hall(x, y, z);
    const conns = connsFor(this.seedHash, hall, this.fields);
    const built = buildHall(hall, conns, opts);
    const prims = [...built.prims], boxes = [...built.boxes], floors = [...built.floors];
    const statues = placeStatues(this.seedHash, hall, built.slots, built.boxes);
    for (const s of statues) { prims.push(...s.prims.map(p => ({ ...p, tag: 'statue' }))); boxes.push(...s.boxes); }
    if (y === 0) for (const c of [conns.e, conns.s]) {
      const b = buildConnector(c); prims.push(...b.prims); boxes.push(...b.boxes); floors.push(...b.floors);
    }
    // Geometry is built around the hall's own centre and placed by the group, so float32 vertex
    // buffers stay precise however far from the origin the hall is.
    const shaded = this.look === 'shaded';
    const surface = shaded ? { material: surfaceMaterial({ floorY: hall.floorY, ceiling: hall.ceiling }), fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] } : null;
    const group = buildGroup(translatePrims(prims, -hall.cx, -hall.floorY, -hall.cz), { color: colorsFor(hall.light).line, ghost: shaded ? 0 : 0.15, surface });
    group.position.set(hall.cx, hall.floorY, hall.cz);
    this.scene.add(group);
    const cell = { hall, group, boxes, floors, slots: built.slots, statues };
    this.cells.set(k, cell);
    if (y === 0 && hall.isStair) {
      this.ensure(x, -1, z, { vista: true, ceiling: false });
      this.ensure(x, 1, z, { vista: true, ceiling: false, floorHole: true });
    }
    this.hooks.onAdd?.(cell);
    return cell;
  }
  near(cx, cz) {
    const boxes = [], floors = [];
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = this.cells.get(key(cx + dx, 0, cz + dz));
      if (c) { boxes.push(...c.boxes); floors.push(...c.floors); }
    }
    return { boxes, floors };
  }
  depthAt(wx, wz) {
    const hall = this.hall(cellOf(wx), 0, cellOf(wz));
    if (!hall.pool) return 0;
    return pointInPolygon([wx - hall.cx, wz - hall.cz], hall.pool) ? hall.depth : 0;
  }
}
