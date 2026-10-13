// Window glows and light shafts for one hall, as one additive mesh. Geometry is hall-relative
// (subtract cx, floorY, cz) like the surface mesh; the group places it.
import * as THREE from 'three';
import { effectsMaterial } from './material.js';
import { PATCH } from './windows.js';

const GLOW = [1.0, 0.95, 0.85], SHAFT = [1.0, 0.93, 0.8];

// out = windowsFor(...). Returns null when the hall has no windows.
export function buildEffects(hall, out) {
  if (!out.windows.length) return null;
  const pos = [], uv = [], alpha = [], tint = [];
  const rel = ([x, y, z]) => [x - hall.cx, y - hall.floorY, z - hall.cz];
  // A quad from four corners (a b c d in order round the quad) with per-corner alpha.
  const quad = (a, b, c, d, al, colour, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) => {
    const corners = [a, b, c, d].map(rel), order = [0, 1, 2, 0, 2, 3];
    for (const i of order) { pos.push(...corners[i]); uv.push(...uvs[i]); alpha.push(al[i]); tint.push(...colour); }
  };
  const glowA = 0.25 + 0.5 * hall.light;
  for (const w of out.windows) {
    const [cx, cy, cz] = w.c, hx = w.d[0] * w.w / 2, hz = w.d[1] * w.w / 2, nx = w.n[0] * 0.02, nz = w.n[1] * 0.02;
    quad([cx - hx + nx, cy - w.h / 2, cz - hz + nz], [cx + hx + nx, cy - w.h / 2, cz + hz + nz],
      [cx + hx + nx, cy + w.h / 2, cz + hz + nz], [cx - hx + nx, cy + w.h / 2, cz - hz + nz], [glowA, glowA, glowA, glowA], GLOW);
  }
  for (const s of out.shafts) {
    const [fx, fy, fz] = s.from, [tx, ty, tz] = s.to;
    const dx = tx - fx, dz = tz - fz, horiz = Math.hypot(dx, dz) || 1;
    // u: horizontal travel direction; p: across it. Top half-width from the window, bottom wider.
    const ux = dx / horiz, uz = dz / horiz, px = -uz, pz = ux, r0 = s.w / 2, r1 = s.w * 0.7;
    const a0 = s.strength, a1 = 0.0, by = ty + 0.02;
    // Two crossed ribbons: one across the travel direction, one along it.
    quad([fx - px * r0, fy, fz - pz * r0], [fx + px * r0, fy, fz + pz * r0],
      [tx + px * r1, by, tz + pz * r1], [tx - px * r1, by, tz - pz * r1], [a0, a0, a1, a1], SHAFT);
    quad([fx - ux * r0, fy, fz - uz * r0], [fx + ux * r0, fy, fz + uz * r0],
      [tx + ux * r1, by, tz + uz * r1], [tx - ux * r1, by, tz - uz * r1], [a0, a0, a1, a1], SHAFT);
    // Landing patch: a flat square of half-size PATCH * w on the floor, the size windowsFor keeps inside.
    const pa = s.strength * 0.6, R = PATCH * s.w, py = ty + 0.03;
    quad([tx - px * R - ux * R, py, tz - pz * R - uz * R], [tx + px * R - ux * R, py, tz + pz * R - uz * R],
      [tx + px * R + ux * R, py, tz + pz * R + uz * R], [tx - px * R + ux * R, py, tz - pz * R + uz * R], [pa, pa, pa, pa], SHAFT);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
  const mesh = new THREE.Mesh(g, effectsMaterial({ fields: [hall.light, hall.water, hall.decay] }));
  mesh.name = 'effects'; mesh.renderOrder = 2;
  return mesh;
}
