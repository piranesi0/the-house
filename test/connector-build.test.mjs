import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a } from '../src/rng.js';
import { makeFields } from '../src/fields.js';
import { hallParams } from '../src/hall.js';
import { connectorParams } from '../src/connectors.js';
import { buildConnector } from '../src/shapes/connector.js';
import { floorAt } from '../src/player.js';

const seed = fnv1a('ravens'), fields = makeFields(seed);
const H = (x, z) => hallParams(seed, x, 0, z, fields);
const inside = (boxes, x, y, z) => boxes.some(b => x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]);

test('corridors have walls either side and an open centre line, on both axes', () => {
  let seen = new Set();
  for (let i = 0; i < 400; i++) {
    const x = (i * 31) % 61 - 30, z = (i * 17) % 61 - 30;
    for (const [a, b] of [[H(x, z), H(x + 1, z)], [H(x, z), H(x, z + 1)]]) {
      const c = connectorParams(seed, a, b), built = buildConnector(c);
      seen.add(c.type);
      const mid = (c.faceA + c.faceB) / 2, centre = c.axis === 'x' ? a.cz : a.cx;
      const p = (along, across, y = 1) => c.axis === 'x' ? [along, y, across] : [across, y, along];
      assert.ok(!inside(built.boxes, ...p(mid, centre)), `${c.type} centre blocked`);
      const off = c.room ? c.room / 2 + 0.25 : c.width / 2 + 0.5;
      assert.ok(inside(built.boxes, ...p(mid, centre + off)) && inside(built.boxes, ...p(mid, centre - off)), `${c.type} side wall missing`);
      if (c.type === 'steps') {
        assert.equal(built.floors.length, 3);
        const atTop = c.axis === 'x' ? [mid, centre] : [centre, mid];
        assert.ok(Math.abs(floorAt(built.floors, ...atTop) - 0.4) < 1e-9);
        const atFoot = c.axis === 'x' ? [c.faceA + 0.75, centre] : [centre, c.faceA + 0.75];
        assert.ok(Math.abs(floorAt(built.floors, ...atFoot) - 0.2) < 1e-9);
      } else assert.equal(built.floors.length, 0);
    }
  }
  assert.deepEqual([...seen].sort(), ['arch', 'door', 'steps', 'vestibule']);
});
