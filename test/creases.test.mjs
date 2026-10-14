import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeProgram, fits, runEdges, cylinderPositions, unindex } from '../src/creases.js';

// three's EdgesGeometry walk (r170), run directly on one part: the answer a template must reproduce.
function edgesDirect(P, index, thresholdAngle) {
  const thresholdDot = Math.cos((Math.PI / 180) * thresholdAngle), count = index ? index.length : P.length / 3;
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
  const at = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const edges = {}, out = [];
  for (let i = 0; i < count; i += 3) {
    const v = index ? [index[i], index[i + 1], index[i + 2]] : [i, i + 1, i + 2];
    const [a, b, c] = v.map(at), h = v.map(key);
    const t = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let n = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const l = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
    n = l > 0 ? n.map(x => x * (1 / Math.sqrt(l))) : [0, 0, 0];
    if (h[0] === h[1] || h[1] === h[2] || h[2] === h[0]) continue;
    for (let j = 0; j < 3; j++) {
      const jn = (j + 1) % 3, hash = `${h[j]}_${h[jn]}`, rev = `${h[jn]}_${h[j]}`;
      if (rev in edges && edges[rev]) {
        const m = edges[rev].n;
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] <= thresholdDot) out.push(...at(v[j]), ...at(v[jn]));
        edges[rev] = null;
      } else if (!(hash in edges)) edges[hash] = { i0: v[j], i1: v[jn], n };
    }
  }
  for (const k in edges) if (edges[k]) out.push(...at(edges[k].i0), ...at(edges[k].i1));
  return Float32Array.from(out);
}

// CylinderGeometry's index buffer, one height segment, closed.
function cylinderIndex(seg, top, bottom) {
  const idx = [], row = (y, x) => y * (seg + 1) + x;
  for (let x = 0; x < seg; x++) {
    if (top) idx.push(row(0, x), row(1, x), row(0, x + 1));
    if (bottom) idx.push(row(1, x), row(1, x + 1), row(0, x + 1));
  }
  let base = 2 * (seg + 1);
  for (const [on, isTop] of [[top, true], [bottom, false]]) {
    if (!on) continue;
    for (let x = 0; x < seg; x++) { const c = base + x, i = base + seg + x; idx.push(...(isTop ? [i, i + 1, c] : [i + 1, i, c])); }
    base += 2 * seg + 1;
  }
  return Uint32Array.from(idx);
}

test('a cylinder template replays to the same crease edges as a direct walk, cones and tapers included', () => {
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  let replayed = 0;
  for (const seg of [3, 4, 6, 8, 12, 16, 18, 24]) for (const [top, bottom] of [[true, true], [false, true], [true, false]]) {
    const index = cylinderIndex(seg, top, bottom);
    const prog = edgeProgram(cylinderPositions(top ? 1 : 0, bottom ? 1 : 0, 1, seg), index);
    for (let i = 0; i < 60; i++) {
      const r2 = top ? 0.01 + rnd() * 3 : 0, r1 = bottom ? (rnd() < 0.3 ? r2 || 1 : 0.01 + rnd() * 3) : 0, h = 0.01 + rnd() * 6;
      const P = cylinderPositions(r2, r1, h, seg);
      assert.ok(fits(prog, P));
      assert.deepEqual(runEdges(prog, P, 20), edgesDirect(P, index, 20), `seg ${seg} r ${r1}/${r2} h ${h}`);
      assert.equal(unindex(P, index).length, index.length * 3);
      replayed++;
    }
  }
  assert.equal(replayed, 8 * 3 * 60);
});

test('a part too small to keep its corners apart does not fit the template', () => {
  const index = cylinderIndex(12, true, true), prog = edgeProgram(cylinderPositions(1, 1, 1, 12), index);
  assert.equal(fits(prog, cylinderPositions(1, 1, 0.00004, 12)), false);
  assert.equal(fits(prog, cylinderPositions(0.0001, 0.0001, 1, 12)), false);
  assert.equal(fits(prog, cylinderPositions(0.05, 0.05, 0.05, 12)), true);
});
