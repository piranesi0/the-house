import { makeSimplex2 } from './noise.js';
import { hash32, fnv1a } from './rng.js';

const NAMES = ['water', 'light', 'decay', 'theme'];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const grad = (v, scale) => Math.max(-1, Math.min(1, v / scale));

export function makeFields(seedHash) {
  const out = {};
  for (const name of NAMES) {
    const h = hash32(seedHash, 0, 0, 0, fnv1a('field:' + name));
    const noise = makeSimplex2(h);
    const freq = 1 / (8 + (h % 5));            // one feature every 8..12 cells
    const ox = (h >>> 8) % 1000, oz = (h >>> 16) % 1000;
    const base = (x, z) => 0.5 + 0.5 * noise(x * freq + ox, z * freq + oz);
    if (name === 'water') out[name] = (x, z) => clamp01(base(x, z) + 0.2 * grad(z, 60));
    else if (name === 'light') out[name] = (x, z) => clamp01(base(x, z) - 0.2 * grad(x, 60));
    else out[name] = (x, z) => clamp01(base(x, z));
  }
  return out;
}
