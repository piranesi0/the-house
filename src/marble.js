// Marble by district: the `theme` field, at one-third resolution, picks one of six marbles, so a
// district is one stone over several halls; each hall's own stream (salt `marble`) picks its floor
// pattern. Pure. Colours are [r, g, b] in 0..1, raw sRGB like the mood colours: the surface shader
// tints mood stone by `base` and mixes `vein` on top at `strength`; floors inlay `base` with
// `inlay[0]` and `inlay[1]`.
import { stream } from './rng.js';
import { footprint } from './shapes/footprint.js';

export const MARBLES = {
  carrara:   { name: 'Carrara',      base: [0.93, 0.92, 0.90], vein: [0.52, 0.54, 0.57], strength: 0.55, inlay: [[0.42, 0.44, 0.47], [0.80, 0.77, 0.71]] },
  bardiglio: { name: 'Bardiglio',    base: [0.62, 0.66, 0.72], vein: [0.34, 0.38, 0.45], strength: 0.60, inlay: [[0.90, 0.89, 0.86], [0.28, 0.31, 0.37]] },
  rosso:     { name: 'Rosso Verona', base: [0.80, 0.50, 0.44], vein: [0.95, 0.88, 0.78], strength: 0.50, inlay: [[0.93, 0.90, 0.84], [0.52, 0.28, 0.24]] },
  verde:     { name: 'Verde antico', base: [0.22, 0.34, 0.27], vein: [0.04, 0.05, 0.05], strength: 0.65, inlay: [[0.62, 0.74, 0.62], [0.08, 0.10, 0.09]] },
  giallo:    { name: 'Giallo',       base: [0.86, 0.70, 0.40], vein: [0.66, 0.42, 0.16], strength: 0.50, inlay: [[0.95, 0.90, 0.78], [0.45, 0.30, 0.14]] },
  nero:      { name: 'Nero',         base: [0.10, 0.10, 0.11], vein: [0.92, 0.91, 0.88], strength: 0.60, inlay: [[0.88, 0.86, 0.82], [0.38, 0.38, 0.40]] },
};
// In theme order. The cut points are the field's sextiles (measured over three seeds), so each
// marble covers about a sixth of the House.
export const MARBLE_ORDER = ['carrara', 'bardiglio', 'rosso', 'verde', 'giallo', 'nero'];
export const THEME_CUTS = [0.24, 0.37, 0.5, 0.63, 0.76];
export const PATTERNS = ['chequer', 'medallion', 'bands'];
// The surface shader's footprint uniform holds at most this many vertices (a cross has 12).
export const MAX_FOOTPRINT = 12;

export const marbleOf = (theme) => MARBLE_ORDER[THEME_CUTS.filter(c => theme >= c).length];

// The theme field at one-third resolution: districts span several halls, not the two or three
// the field's own grain gives (it moves about 0.07 per hall at full resolution).
export const districtTheme = (fields, hall) => fields.theme(hall.x / 3, hall.z / 3);

export function marbleFor(seedHash, hall, fields) {
  return { marble: marbleOf(districtTheme(fields, hall)), pattern: stream(seedHash, hall.x, hall.y, hall.z, 'marble').pick(PATTERNS) };
}

// Polys that carry the inlaid floor: hall floors, doorway thresholds, ramps and vestibule floors.
const INLAID = new Set(['floor', 'threshold', 'ramp', 'vestibule']);
export const isInlaid = (p) => p.kind === 'poly' && !p.down && INLAID.has(p.name);

// The hall's footprint relative to its centre, flattened [x0, z0, x1, z1, ...], for the shader.
export function footprintLocal(hall) {
  const pts = footprint(hall);
  if (pts.length > MAX_FOOTPRINT) throw new Error(`footprint has ${pts.length} vertices`);
  return pts.flatMap(([x, z]) => [x - hall.cx, z - hall.cz]);
}
