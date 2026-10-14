import { hallParams, pointInPolygon, cellOf } from './hall.js';
import { connsFor } from './connectors.js';
import { buildHall } from './shapes/index.js';
import { buildConnector } from './shapes/connector.js';
import { placeStatues } from './statues/place.js';
import { placeColossus } from './statues/colossus.js';
import { isRoofless } from './roof.js';
import { translatePrims } from './shapes/ir.js';
import { buildGroup, disposeGroup } from './build.js';
import { surfaceMaterial } from './material.js';
import { windowsFor } from './windows.js';
import { buildEffects, buildPortals } from './effects.js';
import { colorsFor } from './palette.js';
import { planLoads } from './schedule.js';

const key = (x, y, z) => `${x},${y},${z}`;

export class World {
  constructor(scene, seedHash, fields, hooks = {}, look = 'shaded') {
    this.scene = scene; this.seedHash = seedHash; this.fields = fields; this.hooks = hooks; this.look = look;
    this.cells = new Map(); this.params = new Map();
    this.queue = []; this.lastBuildMs = 0; this.maxBuildMs = 0;   // max: since the last crossing
  }
  hall(x, y, z) {
    const k = key(x, y, z);
    if (!this.params.has(k)) this.params.set(k, hallParams(this.seedHash, x, y, z, this.fields));
    return this.params.get(k);
  }
  update(cx, cz) {
    this.maxBuildMs = 0;
    const have = new Set([...this.cells.values()].filter(c => c.hall.y === 0).map(c => `${c.hall.x},${c.hall.z}`));
    const { now, later } = planLoads(have, cx, cz);
    for (const [x, z] of now) this.ensure(x, 0, z);
    for (const [k, cell] of this.cells) {
      if (Math.max(Math.abs(cell.hall.x - cx), Math.abs(cell.hall.z - cz)) > 3) { this.hooks.onRemove?.(cell); disposeGroup(cell.group); this.cells.delete(k); }
    }
    // Vista halls queued by a stair hall (here or on an earlier crossing) stay at the front while
    // their stair hall is still loaded; planLoads only knows about y = 0.
    const vistas = this.queue.filter(e => e.y !== 0 && this.cells.has(key(e.x, 0, e.z)) && !this.cells.has(key(e.x, e.y, e.z)));
    this.queue = [...vistas, ...later.map(([x, z]) => ({ x, y: 0, z }))];
  }
  // One queued hall per frame. Entries are { x, y, z, opts }.
  tick() {
    const next = this.queue.shift();
    if (next) this.ensure(next.x, next.y, next.z, next.opts);
  }
  ensure(x, y, z, opts = {}) {
    const k = key(x, y, z);
    if (this.cells.has(k)) return this.cells.get(k);
    const t0 = performance.now();
    const hall = this.hall(x, y, z);
    const conns = connsFor(this.seedHash, hall, this.fields);
    const built = buildHall(hall, conns, isRoofless(this.seedHash, hall) ? { ...opts, roofless: true } : opts);
    const prims = [...built.prims], boxes = [...built.boxes], floors = [...built.floors];
    const statues = placeStatues(this.seedHash, hall, built.slots, built.boxes);
    // A colossus goes in after the ordinary statues and around them, at y = 0 only (the vista halls
    // above and below stair halls have holes and no ground to stand on); null in most halls.
    const giant = y === 0 ? placeColossus(this.seedHash, hall, built.boxes, statues) : null;
    if (giant) statues.push(giant);
    for (const s of statues) { prims.push(...s.prims.map(p => ({ ...p, tag: 'statue' }))); boxes.push(...s.boxes); }
    if (y === 0) for (const c of [conns.e, conns.s]) {
      const b = buildConnector(c); prims.push(...b.prims); boxes.push(...b.boxes); floors.push(...b.floors);
    }
    // Geometry is built around the hall's own centre and placed by the group, so float32 vertex
    // buffers stay precise however far from the origin the hall is.
    const shaded = this.look === 'shaded';
    // Windows, the key light and the effects mesh belong to y = 0 halls; vista halls keep the
    // default key light and get no effects (they are only seen through the well).
    const win = shaded && y === 0 ? windowsFor(this.seedHash, hall, conns, statues) : null;
    const surface = shaded ? { material: surfaceMaterial({ ceiling: hall.ceiling, keyDir: win?.keyDir }), fields: this.fields, offset: [hall.cx, hall.floorY, hall.cz] } : null;
    const group = buildGroup(translatePrims(prims, -hall.cx, -hall.floorY, -hall.cz), { color: colorsFor(hall.light).line, ghost: shaded ? 0 : 0.15, surface });
    if (win) for (const mesh of [buildEffects(hall, win), buildPortals(hall, win)]) if (mesh) group.add(mesh);
    group.position.set(hall.cx, hall.floorY, hall.cz);
    this.scene.add(group);
    const cell = { hall, group, boxes, floors, slots: built.slots, statues, keyDir: win?.keyDir ?? null };
    this.cells.set(k, cell);
    // The vista halls above and below a stair hall are only seen through the well and never feed
    // collision (near() reads y = 0), so they build on the next frames instead of this one.
    if (y === 0 && hall.isStair) {
      this.queue.unshift({ x, y: -1, z, opts: { vista: true, ceiling: false } }, { x, y: 1, z, opts: { vista: true, ceiling: false, floorHole: true } });
    }
    this.hooks.onAdd?.(cell);
    this.lastBuildMs = performance.now() - t0;
    this.maxBuildMs = Math.max(this.maxBuildMs, this.lastBuildMs);
    return cell;
  }
  // The key light of the loaded y = 0 hall at (cx, cz), the way the light travels; null when the
  // hall is not built yet or the look has no windows.
  keyDirAt(cx, cz) { return this.cells.get(key(cx, 0, cz))?.keyDir ?? null; }
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
