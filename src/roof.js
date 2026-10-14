// Roofless halls: about one in twelve of the bright halls stands open to the sky (the roll is 0.2;
// halls beside a stair hall and colonnades keep their roof, which takes it to about 8%). Pure, one stream
// (salt `roof`), so shapes, windows and the world all ask the same question and get one answer.
import { stream } from './rng.js';
import { hallParams } from './hall.js';
import { makeFields } from './fields.js';

export const ROOF = { light: 0.66, chance: 0.2, elevation: [70, 80] };
const DEG = Math.PI / 180;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The fields are a pure function of the seed; made once per seed, for the neighbour check.
const FIELDS = new Map();
const fieldsFor = (seedHash) => {
  if (!FIELDS.has(seedHash)) FIELDS.set(seedHash, makeFields(seedHash));
  return FIELDS.get(seedHash);
};

// Never a stair hall (its ceiling holds the well's shaft), never a vista hall (y != 0, only seen
// through a well), never a colonnade (its thin columns would rise 18-40 m holding nothing; final
// review S2 m1), and never a hall beside a stair hall, whose vista hall 44 m up would stand over
// the open hall's wall (D7). The neighbour check only runs for halls the roll has opened, and
// draws nothing from the `roof` stream, so the roll and overheadKey's draws are unchanged.
export function isRoofless(seedHash, hall) {
  if (hall.y !== 0 || hall.isStair || hall.shape === 'colonnade' || !(hall.light > ROOF.light)) return false;
  if (!stream(seedHash, hall.x, hall.y, hall.z, 'roof').chance(ROOF.chance)) return false;
  const fields = fieldsFor(seedHash);
  return !NEIGHBOURS.some(([dx, dz]) => hallParams(seedHash, hall.x + dx, 0, hall.z + dz, fields).isStair);
}

// The key light of a roofless hall: almost straight down, 70 to 80 degrees below horizontal, from
// an azimuth drawn after the roofless draw in the same stream. Unit vector, the way light travels.
export function overheadKey(seedHash, hall) {
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'roof');
  rng.next();
  const elev = rng.range(...ROOF.elevation) * DEG, az = rng.range(0, 2 * Math.PI);
  return [Math.cos(az) * Math.cos(elev), -Math.sin(elev), Math.sin(az) * Math.cos(elev)];
}
