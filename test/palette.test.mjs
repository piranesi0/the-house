import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorsFor, fogFar, lerpHex } from '../src/palette.js';

test('palette hits the three stops and interpolates between them', () => {
  assert.deepEqual(colorsFor(0), { line: 0x4a5566, ground: 0x05060a });
  assert.deepEqual(colorsFor(0.5), { line: 0xd8d4cc, ground: 0x3a3a40 });
  assert.deepEqual(colorsFor(1), { line: 0x6b6660, ground: 0xf4f1ea });
  const mid = colorsFor(0.25);
  assert.ok(mid.ground > 0x05060a && mid.ground < 0x3a3a40);
  assert.equal(lerpHex(0x000000, 0xffffff, 0.5), 0x808080);
});

test('fog runs from 18 m in the dark to 55 m in the bright', () => {
  assert.equal(fogFar(0), 18); assert.equal(fogFar(1), 55); assert.ok(fogFar(0.5) > 18 && fogFar(0.5) < 55);
});
