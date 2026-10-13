// Windows and light shafts for a hall, decided in the spec's order: wall, then windows, then
// shafts. Pure: one stream (salt `windows`), the hall, its connectors and its statues.
import { stream } from './rng.js';
import { pointInPolygon } from './hall.js';
import { footprint } from './shapes/footprint.js';
import { WELL } from './shapes/stairwell.js';

const DEG = Math.PI / 180;
const COUNT = { luminous: [2, 4], dusk: [1, 2], chiaroscuro: [1, 2] };
const STRENGTH = { luminous: 0.35, dusk: 0.15, chiaroscuro: 0.9 };
const EDGE = 0.3, DOOR_PAD = 0.2, GAP = 0.3;

// Half-size of a shaft's landing patch per metre of shaft width: effects.js draws a square of
// half-size PATCH * shaft.w around `to`, square to the shaft's travel. windowsFor keeps it inside.
export const PATCH = 1.12;

export const moodBand = (light) => light < 1 / 3 ? 'chiaroscuro' : light < 2 / 3 ? 'dusk' : 'luminous';

// Which footprint edge carries which doorway, per shape (see footprint.js for the octagon order).
function doorwayIndex(hall) {
  if (hall.shape === 'octagon') return { 5: 'n', 7: 'e', 1: 's', 3: 'w' };
  if (hall.shape === 'cross') return { 0: 'n', 3: 'e', 6: 's', 9: 'w' };
  return { 0: 'n', 1: 'e', 2: 's', 3: 'w' };
}

export function footprintEdges(hall, conns) {
  const verts = footprint(hall), doors = doorwayIndex(hall), out = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [d[1], -d[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((hall.cx - mid[0]) * n[0] + (hall.cz - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
    out.push({ a, b, len, d, n, doorway: doors[i] ? conns[doors[i]] : null });
  }
  return out;
}

// The stretches of a wall, as [from, to] along it, where a window may go: in from both ends, and
// either side of a centred doorway with a little clearance.
function clearSpans(wall) {
  if (!wall.doorway) return [[EDGE, wall.len - EDGE]];
  const m = wall.len / 2, half = wall.doorway.width / 2 + DOOR_PAD;
  return [[EDGE, m - half], [m + half, wall.len - EDGE]].filter(([a, b]) => b - a > 0.05);
}
const widestSpan = (wall) => Math.max(0, ...clearSpans(wall).map(([a, b]) => b - a));

// Distance from (x, z) along unit direction (dx, dz) to the first crossing of a polygon's boundary.
function reach(poly, x, z, dx, dz) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * dz - (az - z) * dx) / den;
    if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}

const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
// True when segments pq and rs cross at a point interior to both.
const segsCross = (p, q, r, s) => cross2(p, q, r) * cross2(p, q, s) < -1e-12 && cross2(r, s, p) * cross2(r, s, q) < -1e-12;

// Does the landing patch (a square of half-size `half` at (x, z), axes u and its perpendicular)
// lie inside the footprint and clear of the stairwell hole?
function patchFits(poly, well, x, z, u, half) {
  const p = [-u[1], u[0]];
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + (u[0] * a + p[0] * b) * half, z + (u[1] * a + p[1] * b) * half]);
  const inSq = ([vx, vz]) => Math.abs((vx - x) * u[0] + (vz - z) * u[1]) < half && Math.abs((vx - x) * p[0] + (vz - z) * p[1]) < half;
  const edgesCross = (q) => q.some((a, i) => sq.some((c, j) => segsCross(a, q[(i + 1) % q.length], c, sq[(j + 1) % 4])));
  if (!sq.every(c => pointInPolygon(c, poly)) || poly.some(inSq) || edgesCross(poly)) return false;
  if (!well) return true;
  const inWell = ([vx, vz]) => vx > well[0][0] && vx < well[2][0] && vz > well[0][1] && vz < well[2][1];
  return !(sq.some(inWell) || well.some(inSq) || edgesCross(well) || inWell([x, z]));
}

// The widest shaft, up to `w`, whose landing patch at (x, z) fits: shrinks by a fifth and retries; no draws.
function fitWidth(poly, well, x, z, u, w) {
  while (w > 1e-3 && !patchFits(poly, well, x, z, u, PATCH * w)) w *= 0.8;
  return w;
}

export function windowsFor(seedHash, hall, conns, statues) {
  const rng = stream(seedHash, hall.x, hall.y, hall.z, 'windows');
  const edges = footprintEdges(hall, conns), poly = footprint(hall);
  // Doorless walls first; otherwise a wall with room for a window beside its doorway.
  const doorless = edges.filter(e => !e.doorway && e.len >= 3), roomy = edges.filter(e => widestSpan(e) >= 1);
  const wall = rng.pick(doorless.length ? doorless : roomy.length ? roomy : edges);
  const band = moodBand(hall.light), [lo, hi] = COUNT[band];
  const count = rng.int(lo, hi);
  const top = hall.floorY + hall.ceiling;
  const at = (s, w, h, cy) => ({ s, w, h, c: [wall.a[0] + wall.d[0] * s, cy, wall.a[1] + wall.d[1] * s], d: wall.d, n: wall.n });
  let windows = [];
  for (let k = 0; k < count; k++) {
    let placed = null;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const h = Math.min(rng.range(1.2, 2.5), hall.ceiling * 0.35), w = rng.range(0.8, 2.0);
      const drop = rng.range(0.3, 1.5), cy = top - drop - h / 2;
      if (wall.len < w + 2 * EDGE) break;
      const s = rng.range(EDGE + w / 2, wall.len - EDGE - w / 2);
      if (wall.doorway) {
        const m = wall.len / 2, half = wall.doorway.width / 2 + DOOR_PAD;
        if (s + w / 2 > m - half && s - w / 2 < m + half) continue;
      }
      if (windows.some(o => Math.abs(o.s - s) < (o.w + w) / 2 + GAP)) continue;
      placed = at(s, w, h, cy);
    }
    if (placed) windows.push(placed);
  }
  if (windows.length < lo) {
    // Too few fitted: lay out exactly `lo` windows afresh over the wall's clear spans, sharing
    // them out so the longest spans take the most, evenly spaced with a gap, so none overlap.
    const spans = clearSpans(wall), share = spans.map(() => 0);
    for (let k = 0; k < lo; k++) {
      let best = 0;
      spans.forEach(([a, b], i) => { if ((b - a) / (share[i] + 1) > (spans[best][1] - spans[best][0]) / (share[best] + 1)) best = i; });
      share[best]++;
    }
    const h = Math.min(1.5, hall.ceiling * 0.35), cy = top - 0.75 - h / 2;
    windows = [];
    spans.forEach(([a, b], i) => {
      const n = share[i], cellLen = (b - a - GAP * (n - 1)) / n, w = Math.min(1.2, cellLen);
      for (let j = 0; j < n; j++) windows.push(at(a + j * (cellLen + GAP) + cellLen / 2, w, h, cy));
    });
  }
  // Key light: along the wall's inward normal with a small jitter, nominally 40 to 60 degrees down.
  const jitter = rng.range(-8, 8) * DEG, elev0 = rng.range(40, 60) * DEG;
  const cosJ = Math.cos(jitter), sinJ = Math.sin(jitter);
  const kn = [wall.n[0] * cosJ - wall.n[1] * sinJ, wall.n[0] * sinJ + wall.n[1] * cosJ];
  const well = hall.isStair
    ? [[hall.cx - WELL.hx, hall.cz - WELL.hz], [hall.cx + WELL.hx, hall.cz - WELL.hz], [hall.cx + WELL.hx, hall.cz + WELL.hz], [hall.cx - WELL.hx, hall.cz + WELL.hz]]
    : null;
  // First pass: where each shaft would land. Aimed shafts land on their statue; the rest go along
  // the key light, as far as the nominal elevation takes them but short of the walls and the
  // stairwell, and pulled back until the landing patch fits.
  const plans = windows.map(win => {
    const [wx, wy, wz] = win.c, height = wy - hall.floorY;
    if (band === 'chiaroscuro' && statues.length) {
      // Aim at the statue most nearly in front of the window, if any is in front at all.
      const scored = statues.map(st => {
        const dx = st.slot.x - wx, dz = st.slot.z - wz, dist = Math.hypot(dx, dz);
        return { st, dist, dot: dist > 1e-6 ? (dx * kn[0] + dz * kn[1]) / dist : -1 };
      }).filter(o => o.dot > 0.3 && o.dist > 1.5).sort((p, q) => q.dot - p.dot || p.dist - q.dist);
      if (scored.length) {
        const o = scored[0];
        return { win, height, aimed: true, dir: [(o.st.slot.x - wx) / o.dist, (o.st.slot.z - wz) / o.dist], land: [o.st.slot.x, o.st.slot.z] };
      }
    }
    const nominal = height / Math.tan(elev0);
    const ahead = Math.min(reach(poly, wx, wz, kn[0], kn[1]), well ? reach(well, wx, wz, kn[0], kn[1]) : Infinity);
    let dist = Math.min(nominal, Math.max(0.5, ahead - 0.5));
    const full = PATCH * win.w;
    for (let d = dist; d >= 0.5; d -= 0.25) {
      if (patchFits(poly, well, wx + kn[0] * d, wz + kn[1] * d, kn, full)) { dist = d; break; }
    }
    return { win, height, aimed: false, dir: kn, dist };
  });
  // The landing rule wins over the nominal elevation: the key light takes the steepest keyed
  // shaft's elevation, and every keyed shaft is brought to it, so light and shafts agree.
  const keyed = plans.filter(p => !p.aimed);
  const elev = keyed.length ? Math.max(...keyed.map(p => Math.atan2(p.height, p.dist))) : elev0;
  const keyDir = [kn[0] * Math.cos(elev), -Math.sin(elev), kn[1] * Math.cos(elev)];
  const shafts = plans.map(p => {
    const [wx, wy, wz] = p.win.c, dist = p.height / Math.tan(elev);
    const [tx, tz] = p.aimed ? p.land : [wx + p.dir[0] * dist, wz + p.dir[1] * dist];
    const w = fitWidth(poly, well, tx, tz, p.dir, p.win.w);
    return { from: [wx, wy, wz], to: [tx, hall.floorY, tz], w, strength: STRENGTH[band] };
  });
  return { wall, keyDir, windows: windows.map(({ s, ...w }) => w), shafts };
}
