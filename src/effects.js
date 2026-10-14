// Window glows and light shafts for one hall, as one additive mesh. Geometry is hall-relative
// (subtract cx, floorY, cz) like the surface mesh; the group places it.
import * as THREE from 'three';
import { effectsMaterial, portalMaterial } from './material.js';
import { PATCH } from './windows.js';

const GLOW = [1.0, 0.95, 0.85], SHAFT = [1.0, 0.93, 0.8];

// out = windowsFor(...). Returns null when the hall has no windows.
export function buildEffects(hall, out) {
  if (!out.windows.length) return null;
  const pos = [], uv = [], alpha = [], tint = [], fogK = [];
  const rel = ([x, y, z]) => [x - hall.cx, y - hall.floorY, z - hall.cz];
  // A quad from four corners (a b c d in order round the quad) with per-corner alpha; fk scales its fog.
  const quad = (a, b, c, d, al, colour, fk = 1) => {
    const corners = [a, b, c, d].map(rel), order = [0, 1, 2, 0, 2, 3];
    for (const i of order) { pos.push(...corners[i]); uv.push(...[[0, 0], [1, 0], [1, 1], [0, 1]][i]); alpha.push(al[i]); tint.push(...colour); fogK.push(fk); }
  };
  // A halo over the sky portal behind it, not a second pane: kept low so it does not double the
  // pane's brightness or wash out the night stars.
  const glowA = 0.1 + 0.25 * hall.light;
  // The glow takes a third of the fog, like the pane under it: windows sit 16-26 m up and away, past
  // a dark hall's fog, and as the hall's light source they must still read through the haze.
  for (const w of out.windows) {
    const [cx, cy, cz] = w.c, hx = w.d[0] * w.w / 2, hz = w.d[1] * w.w / 2, nx = w.n[0] * 0.02, nz = w.n[1] * 0.02;
    quad([cx - hx + nx, cy - w.h / 2, cz - hz + nz], [cx + hx + nx, cy - w.h / 2, cz + hz + nz],
      [cx + hx + nx, cy + w.h / 2, cz + hz + nz], [cx - hx + nx, cy + w.h / 2, cz - hz + nz], [glowA, glowA, glowA, glowA], GLOW, 1 / 3);
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
  g.setAttribute('fogK', new THREE.Float32BufferAttribute(fogK, 1));
  const mesh = new THREE.Mesh(g, effectsMaterial({ fields: [hall.light, hall.water, hall.decay] }));
  mesh.name = 'effects'; mesh.renderOrder = 2;
  return mesh;
}

// The window panes of one hall as one mesh with the sky-portal material, so each window reads as
// an opening onto the sky without cutting the wall. Hall-relative like the rest, 0.01 m in from
// the wall face (the glow quad sits at 0.02 m). Returns null when the hall has no windows.
export function buildPortals(hall, out) {
  if (!out.windows.length) return null;
  const pos = [];
  const rel = ([x, y, z]) => [x - hall.cx, y - hall.floorY, z - hall.cz];
  for (const w of out.windows) {
    const [cx, cy, cz] = w.c, hx = w.d[0] * w.w / 2, hz = w.d[1] * w.w / 2, nx = w.n[0] * 0.01, nz = w.n[1] * 0.01;
    const a = [cx - hx + nx, cy - w.h / 2, cz - hz + nz], b = [cx + hx + nx, cy - w.h / 2, cz + hz + nz];
    const c = [cx + hx + nx, cy + w.h / 2, cz + hz + nz], d = [cx - hx + nx, cy + w.h / 2, cz - hz + nz];
    for (const p of [a, b, c, a, c, d]) pos.push(...rel(p));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(g, portalMaterial({ fields: [hall.light, hall.water, hall.decay] }));
  mesh.name = 'portals'; mesh.renderOrder = 1;
  return mesh;
}
