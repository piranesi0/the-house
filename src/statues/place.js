import { stream } from '../rng.js';
import { box, cyl, boundsOf, translatePrims, translateBoxes, rotateYPrims, rotateYBoxes } from '../shapes/ir.js';
import { figure } from './figure.js';
import { rollDamage, applyDamage } from './damage.js';
import { animal } from './animal.js';
import { object } from './object.js';
import { group } from './group.js';

export const FAMILIES = {
  figure: ['standing', 'seated', 'kneeling', 'reaching', 'carrying', 'reading'],
  animal: ['horse', 'ox', 'fox', 'hare', 'bear', 'heron', 'owl', 'dog'],
  object: ['urn', 'boat', 'ladder', 'bell', 'wheel', 'loom'],
  group:  ['pair', 'companion', 'child'],
};
export const FAMILY_BUILDERS = { figure, animal, object, group };
const PEAKS = { figure: 0.2, animal: 0.45, object: 0.7, group: 0.9 };

export function pickFamily(theme, rng, slotKind) {
  if (slotKind === 'dais' && FAMILIES.group) return 'group';
  const names = Object.keys(FAMILIES);
  const weights = names.map(n => Math.max(0.1, 1 - 3 * Math.abs(theme - PEAKS[n])));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < names.length; i++) { r -= weights[i]; if (r <= 0) return names[i]; }
  return names[names.length - 1];
}

export function plinth(kind, footprint, scale) {
  const w = footprint, h = 0.5 * scale;
  if (kind === 'drum') return {
    prims: [cyl(w / 2, w / 2, h, [0, h / 2, 0], [0, 0, 0], 16, 'plinth')],
    boxes: [{ min: [-w / 2, 0, -w / 2], max: [w / 2, h, w / 2] }], top: h,
  };
  if (kind === 'stepped') return {
    prims: [box([w * 1.4, h / 2, w * 1.4], [0, h / 4, 0], [0, 0, 0], 'plinth'), box([w, h / 2, w], [0, h * 0.75, 0], [0, 0, 0], 'plinth')],
    boxes: [{ min: [-w * 0.7, 0, -w * 0.7], max: [w * 0.7, h, w * 0.7] }], top: h,
  };
  return {
    prims: [box([w, h, w], [0, h / 2, 0], [0, 0, 0], 'plinth')],
    boxes: [{ min: [-w / 2, 0, -w / 2], max: [w / 2, h, w / 2] }], top: h,
  };
}

export function buildStatue(inst, scale, damage = null, side = 1) {
  const raw = FAMILY_BUILDERS[inst.family](inst.subject, scale);
  const body = applyDamage(raw, damage);
  const b = boundsOf(body.prims);
  const extent = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]);
  const foot = (body.fallen ? 1.1 * scale : extent) + 0.3;
  const base = plinth(inst.plinth, foot, scale);
  const dx = body.fallen ? side * (foot / 2 + extent / 2 + 0.2) : 0;
  const dy = body.fallen ? 0 : base.top;
  return {
    prims: [...base.prims, ...translatePrims(body.prims, dx, dy, 0)],
    boxes: [...base.boxes, ...translateBoxes(body.boxes, dx, dy, 0)],
  };
}

// Doorway approach zones at the widest door (4 m) plus 0.5 m, 2 m deep into the hall.
function doorZones({ cx, cz, hx, hz, wall }) {
  const w = 2.5;
  return [
    { x0: cx - w, x1: cx + w, z0: cz - hz - wall, z1: cz - hz + 2 },
    { x0: cx - w, x1: cx + w, z0: cz + hz - 2, z1: cz + hz + wall },
    { x0: cx + hx - 2, x1: cx + hx + wall, z0: cz - w, z1: cz + w },
    { x0: cx - hx - wall, x1: cx - hx + 2, z0: cz - w, z1: cz + w },
  ];
}
const blocksDoor = (boxes, zones) => boxes.some(b => zones.some(r => b.min[0] < r.x1 && b.max[0] > r.x0 && b.min[2] < r.z1 && b.max[2] > r.z0));
const overlaps = (a, b) => a.min[0] < b.max[0] - 1e-6 && a.max[0] > b.min[0] + 1e-6 && a.min[2] < b.max[2] - 1e-6 && a.max[2] > b.min[2] + 1e-6
  && a.min[1] < b.max[1] && a.max[1] > b.min[1];

// solids: the hall's own collision boxes (walls, columns, stairwell), which no statue may enter.
export function placeStatues(seedHash, hall, slots, solids = []) {
  const zones = doorZones(hall);
  const { cx, cz, hx, hz } = hall;
  const fits = (boxes) => !blocksDoor(boxes, zones)
    && boxes.every(b => b.min[0] >= cx - hx && b.max[0] <= cx + hx && b.min[2] >= cz - hz && b.max[2] <= cz + hz)
    && !boxes.some(b => solids.some(w => overlaps(b, w)) || out.some(s => s.boxes.some(o => overlaps(b, o))));
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'statues');
  const areaFrac = Math.min(1, (4 * hall.hx * hall.hz) / (22.8 * 22.8));
  const count = Math.min(slots.length, Math.max(2, Math.round(2 + 12 * areaFrac)));
  const order = [...slots];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const used = new Set(), out = [];
  const attempt = (slot) => {
    let inst = null;
    for (let tries = 0; tries < 20 && !inst; tries++) {
      const family = pickFamily(hall.theme, rng, slot.kind);
      const subject = rng.pick(FAMILIES[family]);
      const pose = family === 'figure' ? subject : 'default';
      const key = `${subject}:${pose}`;
      if (used.has(key)) continue;
      used.add(key);
      inst = { family, subject, pose, plinth: rng.pick(['box', 'box', 'stepped', 'drum']) };
    }
    if (!inst) return null;
    let scale = Math.min(slot.maxScale, 1 + rng.next() * rng.next() * 2 * (0.5 + areaFrac));
    let damage = rollDamage(rng, hall.decay);
    const place = (side) => {
      const built = buildStatue(inst, scale, damage, side);
      return {
        prims: translatePrims(rotateYPrims(built.prims, slot.facing), slot.x, hall.floorY, slot.z),
        boxes: translateBoxes(rotateYBoxes(built.boxes, slot.facing), slot.x, hall.floorY, slot.z),
      };
    };
    let placed = place(1);
    // A fallen statue lies beside its plinth on whichever side fits;
    // if neither does, it stays standing.
    if (damage.fallen && !fits(placed.boxes)) placed = place(-1);
    if (damage.fallen && !fits(placed.boxes)) { damage = { ...damage, fallen: false }; placed = place(1); }
    // Big subjects (a horse, a boat) can reach a doorway, a wall or a neighbour: try life-size, else give the subject back.
    if (!fits(placed.boxes) && scale > 1) { scale = 1; placed = place(1); }
    if (!fits(placed.boxes)) { used.delete(`${inst.subject}:${inst.pose}`); return null; }
    return { slot, ...inst, scale, damage, ...placed };
  };
  for (const slot of order) {
    if (out.length >= count) break;
    let statue = null;
    for (let tries = 0; tries < 6 && !statue; tries++) statue = attempt(slot);
    if (statue) out.push(statue);
  }
  return out;
}
