// Point-in-triangle over a flat position array; true when any triangle contains (x, z).
export function covers(positions, x, z) {
  const c2 = (ax, az, bx, bz, px, pz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = positions.slice(i, i + 9);
    const s1 = c2(ax, az, bx, bz, x, z), s2 = c2(bx, bz, cx, cz, x, z), s3 = c2(cx, cz, ax, az, x, z);
    if ((s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) || (s1 <= 1e-9 && s2 <= 1e-9 && s3 <= 1e-9)) return true;
  }
  return false;
}
