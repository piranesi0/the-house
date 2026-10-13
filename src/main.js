import * as THREE from 'three';
import { fnv1a } from './rng.js';
import { makeFields } from './fields.js';
import { cellOf, freeSpawn } from './hall.js';
import { World } from './world.js';
import { Water } from './water.js';
import { Clouds } from './sky.js';
import { Flocks } from './birds.js';
import { Player } from './player.js';
import { colorsFor, fogFar } from './palette.js';
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
const water = new Water(scene);
const clouds = new Clouds(scene, seedHash);
const flocks = new Flocks(scene, seedHash);
const world = new World(scene, seedHash, fields, {
  onAdd: (c) => { water.add(c); clouds.add(c); flocks.add(c); },
  onRemove: (c) => { water.remove(c); clouds.remove(c); flocks.remove(c); },
});
const player = new Player(camera, renderer.domElement);
const hint = document.getElementById('hint');
document.addEventListener('pointerlockchange', () => hint.classList.toggle('hidden', player.locked));

const start = world.hall(frag.x, 0, frag.z);
world.update(frag.x, frag.z);
player.place(...freeSpawn(start, world.ensure(frag.x, 0, frag.z).boxes), 0);
let curX = frag.x, curZ = frag.z;
history.replaceState(null, '', writeFragment({ seed, x: curX, z: curZ }));
let light = start.light;
scene.background = new THREE.Color(colorsFor(light).ground);
scene.fog = new THREE.Fog(colorsFor(light).ground, 2, fogFar(light));

function easeLight(dt, cx, cz) {
  const target = world.hall(cx, 0, cz).light;
  light += (target - light) * (1 - Math.exp(-dt / 1.5));
  const g = colorsFor(light).ground;
  scene.background.setHex(g); scene.fog.color.setHex(g); scene.fog.far = fogFar(light);
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
    history.replaceState(null, '', writeFragment({ seed, x: cx, z: cz }));
  }
  easeLight(dt, cx, cz);
  water.update(t / 1000);
  clouds.update(dt);
  flocks.update(t / 1000, dt);
  renderer.render(scene, camera);
});
