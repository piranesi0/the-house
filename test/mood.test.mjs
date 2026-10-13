import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, STOPS } from '../src/mood.js';

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('every output stays in range for every corner of the field cube', () => {
  for (const l of [0, 0.25, 0.5, 0.75, 1]) for (const w of [0, 0.5, 1]) for (const d of [0, 0.5, 1]) {
    const m = moodFor(l, w, d);
    for (const c of [m.stone, m.sky, m.bounce, m.haze]) for (const v of c) assert.ok(v >= 0 && v <= 1, `colour out of range at ${l},${w},${d}`);
    for (const v of m.key) assert.ok(v >= 0 && v <= 2);
    assert.ok(m.fogFar >= 18 && m.fogFar <= 44);
    assert.ok(m.heightFog >= 0 && m.heightFog <= 1 && m.contact >= 0 && m.contact <= 1 && m.gradient >= 0 && m.gradient <= 1);
  }
});

test('darker means less ambient, shorter fog and more contrast; wetter means more mist', () => {
  let prev = moodFor(0, 0, 0);
  for (let l = 0.05; l <= 1; l += 0.05) {
    const m = moodFor(l, 0, 0);
    assert.ok(lum(m.sky) >= lum(prev.sky) && m.fogFar >= prev.fogFar, `ambient or fog fell at ${l}`);
    assert.ok(lum(m.key) <= lum(prev.key) + 1e-9, `key strength rose at ${l}`);
    prev = m;
  }
  prev = moodFor(0.5, 0, 0);
  for (let w = 0.1; w <= 1; w += 0.1) {
    const m = moodFor(0.5, w, 0);
    assert.ok(m.heightFog > prev.heightFog, `mist fell at ${w}`);
    prev = m;
  }
  prev = moodFor(0.5, 0, 0);
  for (let d = 0.1; d <= 1; d += 0.1) {
    const m = moodFor(0.5, 0, d);
    assert.ok(lum(m.stone) < lum(prev.stone) && m.contact >= prev.contact, `decay did not wear at ${d}`);
    prev = m;
  }
});

test('a small change in the fields is a small change in mood', () => {
  for (let i = 0; i < 200; i++) {
    const l = (i * 0.137) % 1, w = (i * 0.311) % 1, d = (i * 0.73) % 1, e = 1e-3;
    const a = moodFor(l, w, d), b = moodFor(Math.min(1, l + e), Math.min(1, w + e), Math.min(1, d + e));
    for (const k of ['stone', 'sky', 'bounce', 'key', 'haze']) assert.ok(dist(a[k], b[k]) < 0.02, `${k} jumped at ${l},${w},${d}`);
    assert.ok(Math.abs(a.fogFar - b.fogFar) < 0.2 && Math.abs(a.heightFog - b.heightFog) < 0.02);
  }
});

test('the stops are hit exactly and the function is deterministic', () => {
  assert.deepEqual(moodFor(0, 0, 0).stone, STOPS[0].stone);
  assert.deepEqual(moodFor(0.5, 0, 0).sky, STOPS[1].sky);
  assert.equal(moodFor(1, 0, 0).fogFar, 44);
  assert.equal(moodFor(0, 0, 0).fogFar, 18);
  assert.deepEqual(moodFor(0.3, 0.6, 0.2), moodFor(0.3, 0.6, 0.2));
});
