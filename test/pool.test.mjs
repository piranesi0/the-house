import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, poolOutline } from '../src/hall.js';
import { stream, fnv1a } from '../src/rng.js';

test('pointInPolygon on a square and on a generated pool', () => {
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  assert.ok(pointInPolygon([0, 0], sq));
  assert.ok(!pointInPolygon([2, 0], sq));
  assert.ok(!pointInPolygon([0, -1.5], sq));
  const pool = poolOutline(stream(fnv1a('ravens'), 0, 0, 0, 'hall'), 9, 9);
  assert.ok(pointInPolygon([0, 0], pool));
  assert.ok(!pointInPolygon([8.9, 8.9], pool));
});
