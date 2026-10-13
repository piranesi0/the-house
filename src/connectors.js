import { stream } from './rng.js';
import { hallParams } from './hall.js';

export const TYPES = {
  arch:      { width: 4,   height: 6, raise: 0,   room: 0 },
  door:      { width: 1.6, height: 3, raise: 0,   room: 0 },
  vestibule: { width: 1.6, height: 3, raise: 0,   room: 6 },
  steps:     { width: 4,   height: 6, raise: 0.4, room: 0 },
};

export function connectorParams(seedHash, hallA, hallB) {
  const axis = hallA.x !== hallB.x ? 'x' : 'z';
  const aFirst = axis === 'x' ? hallA.x < hallB.x : hallA.z < hallB.z;
  const a = aFirst ? hallA : hallB, b = aFirst ? hallB : hallA;
  const rng = stream(seedHash, a.x, a.y, a.z, axis === 'x' ? 'conn:e' : 'conn:s');
  const faceA = axis === 'x' ? a.cx + a.hx + a.wall : a.cz + a.hz + a.wall;
  const faceB = axis === 'x' ? b.cx - b.hx - b.wall : b.cz - b.hz - b.wall;
  const gap = faceB - faceA;
  let type = rng.pick(['arch', 'arch', 'door', 'vestibule', 'steps']);
  if (type === 'vestibule' && gap < 7) type = 'arch';
  if (type === 'steps' && gap < 3.2) type = 'arch';
  const t = TYPES[type];
  return {
    axis, type, width: t.width, height: t.height, raise: t.raise, room: t.room,
    faceA, faceB, gap, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z },
  };
}

export function connsFor(seedHash, hall, fields) {
  const nb = (dx, dz) => hallParams(seedHash, hall.x + dx, hall.y, hall.z + dz, fields);
  return {
    e: connectorParams(seedHash, hall, nb(1, 0)),
    w: connectorParams(seedHash, nb(-1, 0), hall),
    s: connectorParams(seedHash, hall, nb(0, 1)),
    n: connectorParams(seedHash, nb(0, -1), hall),
  };
}
