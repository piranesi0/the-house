import { stream } from './rng.js';

export const CELL = 24;
export const STOREY = 12;
export const SHAPES = ['long', 'square', 'octagon', 'cross', 'colonnade'];

// Halves round away from zero so cellOf(-w) === -cellOf(w); "+ 0" turns -0 into 0.
export function cellOf(w) { return Math.sign(w) * Math.round(Math.abs(w) / CELL) + 0; }

export function depthFor(water) {
  if (water < 0.35) return 0;
  if (water < 0.55) return 0.05;
  if (water < 0.75) return 0.4;
  return 1.0;
}

export function poolOutline(rng, hx, hz) {
  const n = 10, r0 = Math.min(hx, hz) - 1.5;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = r0 * rng.range(0.55, 0.95);
    raw.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return raw.map((p, i) => {
    const q = raw[(i + n - 1) % n], s = raw[(i + 1) % n];
    return [(q[0] + 2 * p[0] + s[0]) / 4, (q[1] + 2 * p[1] + s[1]) / 4];
  });
}

export function hallParams(seedHash, x, y, z, fields) {
  const rng = stream(seedHash, x, y, z, 'hall');
  const water = fields.water(x, z), light = fields.light(x, z);
  const decay = fields.decay(x, z), theme = fields.theme(x, z);
  const shape = rng.pick(SHAPES);
  const wall = rng.range(1, 2);
  let fx = rng.range(0.6, 0.95), fz = rng.range(0.6, 0.95);
  if (shape === 'long') {
    if (rng.chance(0.5)) { fx = rng.range(0.6, 0.7); fz = 0.95; }
    else { fx = 0.95; fz = rng.range(0.6, 0.7); }
  }
  if (shape === 'square' || shape === 'octagon') fz = fx;
  const hx = fx * CELL / 2 - wall, hz = fz * CELL / 2 - wall;
  const ceiling = rng.range(6, 14);
  const pStair = (water > 0.6 || light > 0.7) ? 0.16 : 0.08;
  const isStair = rng.chance(pStair);
  const depth = depthFor(water);
  const pool = depth > 0 ? poolOutline(rng, hx, hz) : null;
  const hasBirds = rng.chance(0.15 * light * (1 - water));
  return {
    x, y, z, shape, hx, hz, wall, ceiling, water, light, decay, theme, depth, pool,
    isStair, hasBirds, cx: x * CELL, cz: z * CELL, floorY: y * STOREY,
  };
}

export function spawnPoint(hall) {
  return hall.isStair ? [hall.cx - 8, hall.cz] : [hall.cx, hall.cz];
}
