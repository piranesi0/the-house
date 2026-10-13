import { hallParams } from './hall.js';
import { connsFor } from './connectors.js';
import { buildHall } from './shapes/index.js';
import { buildConnector } from './shapes/connector.js';
import { buildGroup, disposeGroup } from './build.js';
import { colorsFor } from './palette.js';

const key = (x, y, z) => `${x},${y},${z}`;

export class World {
  constructor(scene, seedHash, fields) {
    this.scene = scene; this.seedHash = seedHash; this.fields = fields;
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
      if (Math.max(Math.abs(cell.hall.x - cx), Math.abs(cell.hall.z - cz)) > 3) { disposeGroup(cell.group); this.cells.delete(k); }
    }
  }
  ensure(x, y, z, opts = {}) {
    const k = key(x, y, z);
    if (this.cells.has(k)) return this.cells.get(k);
    const hall = this.hall(x, y, z);
    const conns = connsFor(this.seedHash, hall, this.fields);
    const built = buildHall(hall, conns, opts);
    const prims = [...built.prims], boxes = [...built.boxes], floors = [...built.floors];
    if (y === 0) for (const c of [conns.e, conns.s]) {
      const b = buildConnector(c); prims.push(...b.prims); boxes.push(...b.boxes); floors.push(...b.floors);
    }
    const group = buildGroup(prims, colorsFor(hall.light).line);
    this.scene.add(group);
    const cell = { hall, group, boxes, floors, slots: built.slots };
    this.cells.set(k, cell);
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
  depthAt() { return 0; }   // pools arrive in Task 14
}
