import { box, cyl, segs, boundsOf, scalePrims } from '../shapes/ir.js';
import { dirUp } from './figure.js';

// body is [width, height, length] with length along z; the head is at -z.
const QUADS = {
  horse: { body: [0.70, 0.80, 2.0], legH: 1.10, legR: 0.080, neck: [0.9, 0.9], head: [0.25, 0.30, 0.60], tail: 0.7 },
  ox:    { body: [0.90, 1.00, 2.2], legH: 0.90, legR: 0.100, neck: [0.5, 0.3], head: [0.35, 0.35, 0.60], tail: 0.5, horns: true },
  fox:   { body: [0.25, 0.30, 0.8], legH: 0.35, legR: 0.030, neck: [0.3, 0.6], head: [0.15, 0.15, 0.30], tail: 0.5 },
  hare:  { body: [0.20, 0.30, 0.5], legH: 0.25, legR: 0.025, neck: [0.15, 0.5], head: [0.12, 0.12, 0.20], tail: 0, ears: true },
  bear:  { body: [0.80, 0.90, 1.6], legH: 0.60, legR: 0.120, neck: [0.4, 0.2], head: [0.35, 0.30, 0.45], tail: 0 },
  dog:   { body: [0.30, 0.40, 0.9], legH: 0.45, legR: 0.040, neck: [0.35, 0.7], head: [0.18, 0.18, 0.30], tail: 0.35 },
};
const BIRDS = {
  heron: { legH: 0.6, body: [0.25, 0.30, 0.50], neck: [0.5, 0.25], head: [0.10, 0.10, 0.20], beak: 0.25 },
  owl:   { legH: 0.0, body: [0.30, 0.45, 0.28], neck: [0.0, 0.0],  head: [0.28, 0.22, 0.24], tufts: true },
};
const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

function quadruped(q) {
  const [w, h, len] = q.body, p = [];
  const bodyY = q.legH + h / 2;
  p.push(box([w, h, len], [0, bodyY, 0], [0, 0, 0], 'body'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const r = q.ears && sz > 0 ? q.legR * 1.8 : q.legR;
    p.push(cyl(r, r, q.legH, [sx * w * 0.35, q.legH / 2, sz * len * 0.38], [0, 0, 0], 8, 'leg'));
  }
  const neckBase = [0, q.legH + h * 0.9, -len / 2 + 0.1], lean = q.neck[1];
  const neckTop = add(neckBase, dirUp(lean), q.neck[0]);
  if (q.neck[0] > 0) p.push(cyl(w * 0.25, w * 0.25, q.neck[0], add(neckBase, dirUp(lean), q.neck[0] / 2), [-lean, 0, 0], 8, 'neck'));
  const headC = add(neckTop, dirUp(lean), q.head[2] / 2);
  p.push(box(q.head, headC, [-lean * 0.5, 0, 0], 'head'));
  if (q.tail > 0) p.push(cyl(w * 0.1, w * 0.05, q.tail, add([0, q.legH + h * 0.9, len / 2], dirUp(-1.0), q.tail / 2), [1.0, 0, 0], 6, 'tail'));
  if (q.horns) p.push(segs([[-q.head[0] / 2, headC[1] + q.head[1] / 2, headC[2]], [-q.head[0] * 1.2, headC[1] + q.head[1] * 1.3, headC[2]], [q.head[0] / 2, headC[1] + q.head[1] / 2, headC[2]], [q.head[0] * 1.2, headC[1] + q.head[1] * 1.3, headC[2]]], 'horns'));
  if (q.ears) p.push(segs([[-q.head[0] * 0.3, headC[1] + q.head[1] / 2, headC[2]], [-q.head[0] * 0.3, headC[1] + q.head[1] / 2 + 0.25, headC[2]], [q.head[0] * 0.3, headC[1] + q.head[1] / 2, headC[2]], [q.head[0] * 0.3, headC[1] + q.head[1] / 2 + 0.25, headC[2]]], 'ears'));
  return p;
}

function bird(b) {
  const [w, h, len] = b.body, p = [];
  if (b.legH > 0) for (const sx of [-1, 1]) p.push(cyl(0.015, 0.015, b.legH, [sx * 0.05, b.legH / 2, 0], [0, 0, 0], 6, 'leg'));
  const bodyY = b.legH + h / 2;
  if (b.tufts) p.push(cyl(w / 2, w / 2.5, h, [0, bodyY, 0], [0, 0, 0], 10, 'body'));
  else p.push(box([w, h, len], [0, bodyY, 0], [0, 0, 0], 'body'));
  const neckBase = [0, b.legH + h * 0.95, -len / 2 + 0.05], lean = b.neck[1];
  const neckTop = add(neckBase, dirUp(lean), b.neck[0]);
  if (b.neck[0] > 0) p.push(cyl(0.03, 0.03, b.neck[0], add(neckBase, dirUp(lean), b.neck[0] / 2), [-lean, 0, 0], 6, 'neck'));
  const headC = add(neckTop, [0, b.head[1] / 2, 0], 1);
  p.push(box(b.head, headC, [0, 0, 0], 'head'));
  if (b.beak) p.push(segs([[0, headC[1], headC[2] - b.head[2] / 2], [0, headC[1] - 0.05, headC[2] - b.head[2] / 2 - b.beak]], 'beak'));
  if (b.tufts) p.push(segs([[-b.head[0] * 0.3, headC[1] + b.head[1] / 2, headC[2]], [-b.head[0] * 0.45, headC[1] + b.head[1] / 2 + 0.08, headC[2]], [b.head[0] * 0.3, headC[1] + b.head[1] / 2, headC[2]], [b.head[0] * 0.45, headC[1] + b.head[1] / 2 + 0.08, headC[2]]], 'tufts'));
  return p;
}

export function animal(subject, scale = 1) {
  const parts = QUADS[subject] ? quadruped(QUADS[subject]) : bird(BIRDS[subject]);
  const prims = scalePrims(parts, scale);
  return { prims, boxes: [boundsOf(prims)] };
}
