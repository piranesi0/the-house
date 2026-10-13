import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDamage, applyDamage } from '../src/statues/damage.js';
import { figure } from '../src/statues/figure.js';
import { boundsOf } from '../src/shapes/ir.js';
import { stream, fnv1a } from '../src/rng.js';

test('no decay means no damage; full decay produces every kind', () => {
  const clean = stream(fnv1a('x'), 0, 0, 0, 'd');
  for (let i = 0; i < 200; i++) assert.deepEqual(rollDamage(clean, 0), { missingArm: null, missingHead: false, fallen: false, crack: false });
  const dirty = stream(fnv1a('x'), 1, 0, 0, 'd');
  const seen = { arm: 0, head: 0, fallen: 0, crack: 0 };
  for (let i = 0; i < 1000; i++) { const d = rollDamage(dirty, 1); if (d.missingArm) seen.arm++; if (d.missingHead) seen.head++; if (d.fallen) seen.fallen++; if (d.crack) seen.crack++; }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, k);
  assert.ok(seen.crack > seen.fallen);
});

test('applyDamage removes parts, adds a crack, and lays a fallen figure down', () => {
  const body = figure('standing', 1);
  const noArm = applyDamage(body, { missingArm: 'L', missingHead: false, fallen: false, crack: false });
  assert.ok(!noArm.prims.some(p => p.name.startsWith('armL')) && noArm.prims.some(p => p.name.startsWith('armR')));
  const noHead = applyDamage(body, { missingArm: null, missingHead: true, fallen: false, crack: false });
  assert.ok(!noHead.prims.some(p => p.name === 'head' || p.name === 'neck'));
  const cracked = applyDamage(body, { missingArm: null, missingHead: false, fallen: false, crack: true });
  assert.ok(cracked.prims.some(p => p.name === 'crack'));
  const fallen = applyDamage(body, { missingArm: null, missingHead: false, fallen: true, crack: false });
  const b = boundsOf(fallen.prims);
  assert.ok(fallen.fallen);
  assert.ok(b.max[1] - b.min[1] < b.max[0] - b.min[0], 'fallen figure should be longer than tall');
  assert.ok(b.min[1] > -0.05 && b.min[1] < 0.4);
  const untouched = applyDamage(body, null);
  assert.equal(untouched.prims.length, body.prims.length); assert.equal(untouched.fallen, false);
});
