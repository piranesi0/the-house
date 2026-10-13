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
const water = new Water(scene, renderer);
const clouds = new Clouds(scene, seedHash);
const flocks = new Flocks(scene, seedHash);
const world = new World(scene, seedHash, fields, {
  onAdd: (c) => { water.add(c); clouds.add(c); flocks.add(c); },
  onRemove: (c) => { water.remove(c); clouds.remove(c); flocks.remove(c); },
}, frag.look);
const player = new Player(camera, renderer.domElement);
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
const eased = { light: start.light, water: start.water, decay: start.decay };
// The surface shader writes mood colours raw (sRGB), so read them as sRGB here, not linear.
const toHex = ([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).getHex();
function sceneColours() {
  if (!shaded) { const g = colorsFor(eased.light).ground; return { bg: g, far: fogFar(eased.light) }; }
  const m = moodFor(eased.light, eased.water, eased.decay);
  return { bg: toHex(m.haze), far: m.fogFar };
}
const first = sceneColours();
scene.background = new THREE.Color(first.bg);
scene.fog = new THREE.Fog(first.bg, 2, first.far);

// The lines, water grid and birds still use scene.fog; surfaces fog themselves per vertex. Both
// ease toward the current hall over about 1.5 s so the background never steps at a doorway.
function easeMood(dt, cx, cz) {
  const here = world.hall(cx, 0, cz), k = 1 - Math.exp(-dt / 1.5);
  for (const f of ['light', 'water', 'decay']) eased[f] += (here[f] - eased[f]) * k;
  const { bg, far } = sceneColours();
  scene.background.setHex(bg); scene.fog.color.setHex(bg); scene.fog.far = far;
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
  easeMood(dt, cx, cz);
  const here = world.hall(cx, 0, cz);
  sound.setRoom((here.hx * here.hz) / (11 * 11));
  if (here.depth > 0 && t / 1000 > nextDrip) { sound.drip(); nextDrip = t / 1000 + 3 + Math.random() * 5; }
  flocks.focus = [cx, cz];
  water.update(t / 1000);
  clouds.update(dt);
  flocks.update(t / 1000, dt);
  renderer.render(scene, camera);
});
