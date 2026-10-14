import { SKY_FOG } from './fogchunk.js';   // first: patches three's fog chunk before any material compiles
import * as THREE from 'three';
import { fnv1a } from './rng.js';
import { makeFields } from './fields.js';
import { cellOf, freeSpawn } from './hall.js';
import { World } from './world.js';
import { Water } from './water.js';
import { Clouds } from './sky.js';
import { Flocks } from './birds.js';
import { Sound } from './audio.js';
import { Player } from './player.js';
import { colorsFor, fogFar } from './palette.js';
import { moodFor } from './mood.js';
import { Debug } from './debug.js';
import { SkyDome } from './skydome.js';
import { readFragment, writeFragment, randomSeed } from './url.js';

const frag = readFragment(location.hash);
const seed = frag.seed ?? randomSeed();
const seedHash = fnv1a(seed);
const fields = makeFields(seedHash);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
const water = new Water(scene, renderer, frag.look);
// The old wire-sphere clouds are look=lines only: over the shaded look's sky dome they draw as
// haze-coloured spheres, so that look has none until its own clouds replace them.
const clouds = frag.look === 'shaded' ? null : new Clouds(scene, seedHash);
const flocks = new Flocks(scene, seedHash);
const world = new World(scene, seedHash, fields, {
  onAdd: (c) => { water.add(c); clouds?.add(c); flocks.add(c); },
  onRemove: (c) => { water.remove(c); clouds?.remove(c); flocks.remove(c); },
}, frag.look);
const player = new Player(camera, renderer.domElement);
const debug = frag.debug ? new Debug(renderer) : null;
const hint = document.getElementById('hint');
const sound = new Sound();
renderer.domElement.addEventListener('click', () => sound.start(), { once: true });
player.onStep = (inWater) => sound.step(inWater);
flocks.onWings = () => sound.wings();
let nextDrip = 0;
document.addEventListener('pointerlockchange', () => hint.classList.toggle('hidden', player.locked));

const start = world.hall(frag.x, 0, frag.z);
world.update(frag.x, frag.z);
player.place(...freeSpawn(start, world.ensure(frag.x, 0, frag.z).boxes), 0);
let curX = frag.x, curZ = frag.z;
history.replaceState(null, '', writeFragment({ seed, x: curX, z: curZ, look: frag.look, debug: frag.debug }));
const shaded = frag.look === 'shaded';
// The sky dome is the shaded look's alone; look=lines keeps the v0 background.
const dome = shaded ? new SkyDome(scene) : null;
// Built-in fog (lines, water grid, birds) fades toward the dome's sky above the horizon, like the
// surfaces; look=lines has no dome and keeps the plain fog colour.
SKY_FOG.uSkyFog.value = shaded ? 1 : 0;
let sunK = 1;   // the first frame puts the sun straight where the starting hall's light comes from
const eased = { light: start.light, water: start.water, decay: start.decay };
// The surface shader writes mood colours raw (sRGB), so read them as sRGB here, not linear.
const toHex = ([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).getHex();
function sceneColours() {
  if (!shaded) { const g = colorsFor(eased.light).ground; return { bg: g, far: fogFar(eased.light) }; }
  const m = moodFor(eased.light, eased.water, eased.decay);
  return { bg: toHex(m.haze), far: m.fogFar, haze: m.haze };
}
const first = sceneColours();
scene.background = new THREE.Color(first.bg);
scene.fog = new THREE.Fog(first.bg, 2, first.far);

// The lines, water grid and birds still use scene.fog (measured like the stone, fogchunk.js);
// surfaces fog themselves per vertex. Both ease toward the current
// hall over about 1.5 s so the background never steps at a doorway.
function easeMood(dt, cx, cz) {
  const here = world.hall(cx, 0, cz), k = 1 - Math.exp(-dt / 1.5);
  for (const f of ['light', 'water', 'decay']) eased[f] += (here[f] - eased[f]) * k;
  const { bg, far, haze } = sceneColours();
  scene.background.setHex(bg); scene.fog.color.setHex(bg); scene.fog.far = far;
  // The sun or moon sits where the current hall's key light comes from, eased with the fields;
  // the dome's horizon fades into the same haze as the background.
  dome?.update(camera, eased, world.keyDirAt(cx, cz), sunK, haze); sunK = k;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  player.update(dt, world);
  const cx = cellOf(player.pos.x), cz = cellOf(player.pos.z);
  if (cx !== curX || cz !== curZ) { curX = cx; curZ = cz; world.update(cx, cz);
    history.replaceState(null, '', writeFragment({ seed, x: cx, z: cz, look: frag.look, debug: frag.debug }));
  }
  world.tick();
  easeMood(dt, cx, cz);
  const here = world.hall(cx, 0, cz);
  sound.setRoom((here.hx * here.hz) / (11 * 11));
  if (here.depth > 0 && t / 1000 > nextDrip) { sound.drip(); nextDrip = t / 1000 + 3 + Math.random() * 5; }
  flocks.focus = [cx, cz];
  water.update(t / 1000);
  clouds?.update(dt);
  flocks.update(t / 1000, dt);
  renderer.render(scene, camera);
  debug?.update(world);
});
