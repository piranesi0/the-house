import { box, cyl, boundsOf, scalePrims, translatePrims, mapPoints, rotateYPrims } from '../shapes/ir.js';
import { POSES, perturbPose } from './poses.js';
import { mulberry32 } from '../rng.js';

export const CANON = {
  head: 1, neck: 0.3, torso: 2.2, pelvis: 0.6, thigh: 1.75, shin: 1.5, foot: 0.3,
  shoulderW: 2.0, hipW: 1.3, limbR: 0.17, torsoW: 1.6, torsoD: 0.9,
};
const HEAD_UNIT = 1.8 / 7.5;   // metres per head at scale 1

export const dirDown = (pitch, roll) => [Math.cos(pitch) * Math.sin(roll), -Math.cos(pitch) * Math.cos(roll), -Math.sin(pitch)];
export const dirUp = (lean) => [0, Math.cos(lean), -Math.sin(lean)];
const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export function figureParts(poseName, P = POSES[poseName]) {
  const C = CANON, parts = [];
  let minY = Infinity;
  const limb = (name, from, pitch, roll, len, r) => {
    const to = add(from, dirDown(pitch, roll), len);
    parts.push(cyl(r, r, len, mid(from, to), [pitch, 0, roll], 8, name));
    minY = Math.min(minY, to[1] - r);
    return to;
  };
  const hip = [0, 0, 0];
  parts.push(box([C.hipW, C.pelvis, C.torsoD * 0.8], hip, [0, 0, 0], 'pelvis'));
  const shoulder = add(hip, dirUp(P.lean), C.torso);
  parts.push(box([C.torsoW, C.torso, C.torsoD], mid(hip, shoulder), [-P.lean, 0, 0], 'torso'));
  const neckLean = P.lean + P.neck;
  const neckTop = add(shoulder, dirUp(neckLean), C.neck);
  parts.push(cyl(0.2, 0.2, C.neck, mid(shoulder, neckTop), [-neckLean, 0, 0], 8, 'neck'));
  parts.push(box([0.75, C.head, 0.85], add(neckTop, dirUp(neckLean), C.head / 2), [-neckLean, 0, 0], 'head'));
  for (const [side, sgn, sh, el] of [['L', -1, P.shL, P.elL], ['R', 1, P.shR, P.elR]]) {
    const s = [shoulder[0] + sgn * C.shoulderW / 2, shoulder[1], shoulder[2]];
    const elbow = limb(`arm${side}.upper`, s, sh[0], sgn * sh[1], 1.3, C.limbR);
    const wrist = limb(`arm${side}.fore`, elbow, sh[0] + el, sgn * sh[1], 1.2, C.limbR * 0.85);
    parts.push(box([0.3, 0.4, 0.2], add(wrist, dirDown(sh[0] + el, sgn * sh[1]), 0.2), [sh[0] + el, 0, sgn * sh[1]], `arm${side}.hand`));
  }
  for (const [side, sgn, hp, kn] of [['L', -1, P.hipL, P.kneeL], ['R', 1, P.hipR, P.kneeR]]) {
    const h = [hip[0] + sgn * C.hipW / 2, hip[1] - C.pelvis / 2 + 0.1, hip[2]];
    const knee = limb(`leg${side}.thigh`, h, hp, sgn * 0.05, C.thigh, C.limbR * 1.3);
    const ankle = limb(`leg${side}.shin`, knee, hp - kn, sgn * 0.05, C.shin, C.limbR);
    parts.push(box([0.45, C.foot, 1.0], [ankle[0], ankle[1] - C.foot / 2, ankle[2] - 0.3], [0, 0, 0], `leg${side}.foot`));
    minY = Math.min(minY, ankle[1] - C.foot);
  }
  if (P.prop === 'bundle') parts.push(box([1.4, 0.8, 0.8], add(shoulder, [0, -0.7, -1.3], 1), [0, 0, 0], 'prop'));
  if (P.prop === 'book') parts.push(box([0.9, 0.1, 0.7], add(shoulder, [0, -0.85, -1.5], 1), [0.6, 0, 0], 'prop'));
  if (P.prop === 'child') {
    // A seated child, a little under half size, sitting on the forearms and facing out.
    const seat = add(shoulder, [0, -0.75, -1.3], 1);
    const child = figureParts('seated').parts.map(p => ({ ...p, name: 'prop' }));
    parts.push(...translatePrims(scalePrims(child, 0.42), seat[0], seat[1], seat[2]));
  }
  return { parts, minY };
}

// Rotation matrices for the IR's fixed order: rot = [x, y, z] applied X, then Z, then Y (M = Ry·Rz·Rx).
const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
function eulerYZX(m) {
  const z = Math.asin(Math.max(-1, Math.min(1, m[1][0])));
  if (Math.abs(m[1][0]) < 0.9999999) return [Math.atan2(-m[1][2], m[1][1]), Math.atan2(-m[2][0], m[0][0]), z];
  return [0, Math.atan2(m[0][2], m[2][2]), z];
}
// Turn every part by `a` about the world x axis, keeping each part's own rotation exact.
export function rotateXPrims(prims, a) {
  const R = Rx(a);
  return prims.map(p => {
    const q = mapPoints(p, ([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]);
    if (p.rot) q.rot = eulerYZX(mul(R, mul(Ry(p.rot[1]), mul(Rz(p.rot[2]), Rx(p.rot[0])))));
    return q;
  });
}

// A recumbent figure on its back, face up, lying along x on a low bier.
function onBier(prims) {
  const laid = rotateYPrims(rotateXPrims(prims, Math.PI / 2), Math.PI / 2);
  const b = boundsOf(laid), bierH = 1.6;
  const body = translatePrims(laid, -(b.min[0] + b.max[0]) / 2, bierH - b.min[1], -(b.min[2] + b.max[2]) / 2);
  const len = b.max[0] - b.min[0] + 0.6, depth = b.max[2] - b.min[2] + 0.4;
  return [box([len, bierH, depth], [0, bierH / 2, 0], [0, 0, 0], 'bier'), ...body];
}

// variant: a 32-bit seed that nudges the pose (see perturbPose), or null for the pose as written.
export function figure(poseName, scale = 1, variant = null) {
  const P = variant == null ? POSES[poseName] : perturbPose(POSES[poseName], mulberry32(variant));
  const { parts, minY } = figureParts(poseName, P);
  let lifted = translatePrims(parts, 0, -minY, 0);
  if (P.lie) lifted = onBier(lifted);
  if (P.seat) {
    const hipY = -minY;
    lifted.push(box([CANON.hipW + 0.6, hipY, 1.2], [0, hipY / 2, 0.1], [0, 0, 0], 'seat'));
  }
  const prims = scalePrims(lifted, HEAD_UNIT * scale);
  return { prims, boxes: [boundsOf(prims)] };
}
