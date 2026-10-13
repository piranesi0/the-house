// The three fields become shader settings. Three stops along `light`, lerped piecewise; `water`
// adds mist and `decay` adds wear. The surface shader (material.js) repeats this arithmetic in
// GLSL with STOPS, WATER and DECAY as uniforms, so keep the two in step: change a formula here,
// change it there. Colours are [r, g, b] in 0..1; key is colour times strength and may exceed 1.
import { colorsFor } from './palette.js';

export const STOPS = [
  // light 0: chiaroscuro. Very low ambient, one strong narrow key, haze near black.
  { stone: [0.42, 0.40, 0.40], sky: [0.10, 0.11, 0.15], bounce: [0.06, 0.05, 0.05], key: [1.60, 1.40, 1.10], haze: [0.020, 0.024, 0.040], fogFar: 18, heightFog: 0.15, contact: 0.70, gradient: 0.60 },
  // light 0.5: dusk. Cool blue-grey ambient, moderate key.
  { stone: [0.62, 0.60, 0.58], sky: [0.40, 0.44, 0.52], bounce: [0.22, 0.20, 0.19], key: [0.70, 0.68, 0.62], haze: [0.23, 0.23, 0.26], fogFar: 31, heightFog: 0.08, contact: 0.50, gradient: 0.40 },
  // light 1: luminous. High warm ambient, soft broad key, pale gold haze.
  { stone: [0.86, 0.83, 0.78], sky: [0.95, 0.93, 0.88], bounce: [0.55, 0.50, 0.44], key: [0.50, 0.47, 0.40], haze: [0.96, 0.94, 0.90], fogFar: 44, heightFog: 0.03, contact: 0.35, gradient: 0.25 },
];
export const WATER = { heightFog: 0.35, hazeCool: [0.70, 0.78, 0.84], sheen: 0.4 };
export const DECAY = { darken: 0.5, grey: 0.7, contact: 0.3 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

export function moodFor(light, water, decay) {
  const l = clamp01(light), w = clamp01(water), d = clamp01(decay);
  const [a, b, t] = l < 0.5 ? [STOPS[0], STOPS[1], l * 2] : [STOPS[1], STOPS[2], (l - 0.5) * 2];
  let stone = mix3(a.stone, b.stone, t);
  const sky = mix3(a.sky, b.sky, t), bounce = mix3(a.bounce, b.bounce, t), key = mix3(a.key, b.key, t);
  let haze = mix3(a.haze, b.haze, t);
  let heightFog = mix(a.heightFog, b.heightFog, t), contact = mix(a.contact, b.contact, t);
  const fogFar = mix(a.fogFar, b.fogFar, t), gradient = mix(a.gradient, b.gradient, t);
  // Decay darkens and greys the stone and deepens the dirt at the floor.
  const grey = lum(stone) * DECAY.grey;
  stone = mix3(stone, [grey, grey, grey], d * DECAY.darken);
  contact = clamp01(contact + DECAY.contact * d);
  // Water thickens the height fog and cools and pales the haze, halfway at most.
  heightFog = clamp01(heightFog + WATER.heightFog * w);
  haze = mix3(haze, mix3(haze, WATER.hazeCool, 0.5), w);
  return { stone, sky, bounce, key, haze, fogFar, heightFog, contact, gradient, line: colorsFor(l).line };
}
