import { boundsOf, translatePrims } from '../shapes/ir.js';
import { figure } from './figure.js';
import { animal } from './animal.js';

const shift = (b, dx, dz) => translatePrims(b.prims, dx, 0, dz);
const done = (prims) => ({ prims, boxes: [boundsOf(prims)] });

export function group(subject, scale = 1) {
  if (subject === 'pair') return done([...shift(figure('standing', scale), -0.5 * scale, 0), ...shift(figure('seated', scale), 0.5 * scale, 0)]);
  if (subject === 'companion') return done([...shift(figure('standing', scale), -0.3 * scale, 0), ...shift(animal('dog', scale * 0.9), 0.5 * scale, 0.1 * scale)]);
  return done([...shift(figure('standing', scale), -0.35 * scale, 0), ...shift(figure('standing', scale * 0.55), 0.4 * scale, -0.1 * scale)]);
}
