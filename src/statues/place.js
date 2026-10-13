import { stream } from '../rng.js';
import { box, cyl, boundsOf, translatePrims, translateBoxes, rotateYPrims, rotateYBoxes } from '../shapes/ir.js';
import { figure } from './figure.js';

export const FAMILIES = { figure: ['standing', 'seated', 'kneeling', 'reaching', 'carrying', 'reading'] };
export const FAMILY_BUILDERS = { figure: (subject, scale) => figure(subject, scale) };
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

export function buildStatue(inst, scale) {
  const body = FAMILY_BUILDERS[inst.family](inst.subject, scale);
  const b = boundsOf(body.prims);
  const foot = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) + 0.3;
  const base = plinth(inst.plinth, foot, scale);
  return {
    prims: [...base.prims, ...translatePrims(body.prims, 0, base.top, 0)],
    boxes: [...base.boxes, ...translateBoxes(body.boxes, 0, base.top, 0)],
  };
}

export function placeStatues(seedHash, hall, slots) {
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'statues');
  const areaFrac = Math.min(1, (4 * hall.hx * hall.hz) / (22.8 * 22.8));
  const count = Math.min(slots.length, Math.max(2, Math.round(2 + 12 * areaFrac)));
  const order = [...slots];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const used = new Set(), out = [];
  for (const slot of order) {
    if (out.length >= count) break;
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
    if (!inst) continue;
    const scale = Math.min(slot.maxScale, 1 + rng.next() * rng.next() * 2 * (0.5 + areaFrac));
    const built = buildStatue(inst, scale);
    out.push({
      slot, ...inst, scale,
      prims: translatePrims(rotateYPrims(built.prims, slot.facing), slot.x, hall.floorY, slot.z),
      boxes: translateBoxes(rotateYBoxes(built.boxes, slot.facing), slot.x, hall.floorY, slot.z),
    });
  }
  return out;
}
