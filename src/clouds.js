// Clouds over the storey above a stair hall: where each blob floats and how fast it drifts. Pure.
// One stream (salt `cloud`), drawn in v0's order (radius, x, height, z, speed), so look=lines keeps
// its clouds exactly and the shaded look puts its soft ones in the same places.
import { stream } from './rng.js';

// lift: above the storey's wall tops (its unbuilt ceiling); rise: further up; spread: the half-width
// of the square they float and drift in, about the hall centre (they wrap at its x edges).
export const CLOUD = { lift: 6, rise: [2, 10], r: [3, 6], spread: 12, speed: [0.2, 0.5] };

// Blobs { r, x, y, z, speed }: x, z from the hall centre, y above the hall floor, speed in m/s
// along +x. Only the storey above a stair hall (y = 1) has clouds; World builds that hall only as a
// stair hall's vista, without a ceiling, so they are what you see up the shaft.
export function cloudsFor(seedHash, hall) {
  if (hall.y !== 1) return [];
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'cloud'), { spread } = CLOUD, out = [];
  const n = Math.round(1 + 8 * hall.light);
  for (let i = 0; i < n; i++) {
    const r = rng.range(...CLOUD.r);
    const x = rng.range(-spread, spread), y = hall.ceiling + CLOUD.lift + rng.range(...CLOUD.rise), z = rng.range(-spread, spread);
    out.push({ r, x, y, z, speed: rng.range(...CLOUD.speed) });
  }
  return out;
}
