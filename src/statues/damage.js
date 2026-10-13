import { lines, boundsOf, translatePrims, mapPoints } from '../shapes/ir.js';

export function rollDamage(rng, decay) {
  return {
    missingArm: rng.chance(0.25 * decay) ? rng.pick(['L', 'R']) : null,
    missingHead: rng.chance(0.10 * decay),
    fallen: rng.chance(0.08 * decay),
    crack: rng.chance(0.50 * decay),
  };
}

export function applyDamage(body, damage) {
  if (!damage) return { prims: body.prims, boxes: body.boxes, fallen: false };
  let prims = body.prims;
  if (damage.missingArm) prims = prims.filter(p => !(p.name || '').startsWith('arm' + damage.missingArm));
  if (damage.missingHead) prims = prims.filter(p => p.name !== 'head' && p.name !== 'neck');
  if (damage.crack) {
    const b = boundsOf(prims), y = (b.min[1] + b.max[1]) / 2, z = b.min[2] - 0.01;
    prims = [...prims, lines([[-0.05, y - 0.25, z], [0.03, y - 0.1, z], [-0.02, y + 0.05, z], [0.04, y + 0.2, z]], 'crack')];
  }
  if (damage.fallen) {
    prims = prims.map(p => {
      const q = mapPoints(p, ([x, y, z]) => [-y, x, z]);
      if (q.rot) q.rot = [q.rot[0], q.rot[1], q.rot[2] + Math.PI / 2];
      return q;
    });
    prims = translatePrims(prims, 0, -boundsOf(prims).min[1], 0);
  }
  return { prims, boxes: [boundsOf(prims)], fallen: !!damage.fallen };
}
