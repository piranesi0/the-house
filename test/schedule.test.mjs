import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLoads } from '../src/schedule.js';

test('planLoads builds the collision neighbourhood now and the rest nearest first', () => {
  const { now, later } = planLoads(new Set(), 0, 0);
  assert.deepEqual(now.map(String).sort(), ['0,0', '0,1', '0,-1', '1,0', '-1,0'].sort());
  assert.equal(later.length, 20);
  const d = ([x, z]) => Math.max(Math.abs(x), Math.abs(z));
  for (let i = 1; i < later.length; i++) assert.ok(d(later[i]) >= d(later[i - 1]), 'later is not nearest first');
  assert.deepEqual(planLoads(new Set(), 0, 0), planLoads(new Set(), 0, 0));
});

test('planLoads skips cells already built and follows the player', () => {
  const have = new Set();
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) have.add(`${x},${z}`);
  const { now, later } = planLoads(have, 1, 0);
  assert.deepEqual(now, []);
  assert.deepEqual(later.map(String).sort(), ['3,-2', '3,-1', '3,0', '3,1', '3,2'].sort());
});
