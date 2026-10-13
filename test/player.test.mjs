import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorAt } from '../src/player.js';

test('floorAt interpolates along a ramp and defaults to zero', () => {
  const ramp = { x0: 0, x1: 2, z0: -1, z1: 1, axis: 'x', y0: 0, y1: 1 };
  assert.equal(floorAt([ramp], 1, 0), 0.5);
  assert.equal(floorAt([ramp], 0, 0), 0);
  assert.equal(floorAt([ramp], 2, 0.5), 1);
  assert.equal(floorAt([ramp], 5, 0), 0);
  const flat = { x0: 0, x1: 2, z0: 0, z1: 2, axis: 'z', y0: -4, y1: -4 };
  assert.equal(floorAt([flat], 1, 1), -4);
});

test('moveDir walks toward where the camera looks', async () => {
  const { moveDir } = await import('../src/player.js');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  let [dx, dz] = moveDir(0, -1, 0);            // W at yaw 0: the camera looks north (-z)
  near(dx, 0); near(dz, -1);
  [dx, dz] = moveDir(1, 0, 0);                 // D at yaw 0: east (+x)
  near(dx, 1); near(dz, 0);
  [dx, dz] = moveDir(0, -1, -Math.PI / 2);     // W at yaw -90°: the camera looks east
  near(dx, 1); near(dz, 0);
});

test('walking speed is 2.8 m/s, and Shift halves it', async () => {
  const { SPEED, SLOW } = await import('../src/player.js');
  assert.equal(SPEED, 2.8);
  assert.equal(SLOW, 1.4);
});
