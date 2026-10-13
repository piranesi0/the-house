// Which halls to build when the player stands in (cx, cz). Collision reads the cell and its four
// axis neighbours synchronously (World.near), so those build now; the rest of the 5x5 block
// builds one per frame, nearest first, so a crossing never costs more than a few halls of work
// in one frame. Pure, so the order is testable.
export function planLoads(have, cx, cz) {
  const key = (x, z) => `${x},${z}`;
  const now = [], later = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const x = cx + dx, z = cz + dz;
    if (have.has(key(x, z))) continue;
    if (Math.abs(dx) + Math.abs(dz) <= 1) now.push([x, z]); else later.push([x, z]);
  }
  const d = ([x, z]) => Math.max(Math.abs(x - cx), Math.abs(z - cz)) * 10 + Math.abs(x - cx) + Math.abs(z - cz);
  later.sort((a, b) => d(a) - d(b) || a[0] - b[0] || a[1] - b[1]);
  return { now, later };
}
