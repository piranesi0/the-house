import { box, cyl, boundsOf, scalePrims, translatePrims } from '../shapes/ir.js';
import { POSES } from './poses.js';

export const CANON = {
  head: 1, neck: 0.3, torso: 2.2, pelvis: 0.6, thigh: 1.75, shin: 1.5, foot: 0.3,
  shoulderW: 2.0, hipW: 1.3, limbR: 0.17, torsoW: 1.6, torsoD: 0.9,
};
const HEAD_UNIT = 1.8 / 7.5;   // metres per head at scale 1

export const dirDown = (pitch, roll) => [Math.cos(pitch) * Math.sin(roll), -Math.cos(pitch) * Math.cos(roll), -Math.sin(pitch)];
export const dirUp = (lean) => [0, Math.cos(lean), -Math.sin(lean)];
const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

export function figureParts(poseName) {
  const P = POSES[poseName], C = CANON, parts = [];
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
  return { parts, minY };
}

export function figure(poseName, scale = 1) {
  const { parts, minY } = figureParts(poseName);
  let lifted = translatePrims(parts, 0, -minY, 0);
  if (POSES[poseName].seat) {
    const hipY = -minY;
    lifted.push(box([CANON.hipW + 0.6, hipY, 1.2], [0, hipY / 2, 0.1], [0, 0, 0], 'seat'));
  }
  const prims = scalePrims(lifted, HEAD_UNIT * scale);
  return { prims, boxes: [boundsOf(prims)] };
}
