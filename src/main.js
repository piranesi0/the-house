import * as THREE from 'three';
import { fnv1a } from './rng.js';
import { makeFields } from './fields.js';
import { cellOf, spawnPoint } from './hall.js';
import { World } from './world.js';
import { Player } from './player.js';
import { colorsFor, fogFar } from './palette.js';

const seedHash = fnv1a('ravens');
const fields = makeFields(seedHash);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
const world = new World(scene, seedHash, fields);
const player = new Player(camera, renderer.domElement);
const hint = document.getElementById('hint');
document.addEventListener('pointerlockchange', () => hint.classList.toggle('hidden', player.locked));

const start = world.hall(0, 0, 0);
world.update(0, 0);
player.place(...spawnPoint(start), 0);
let colors = colorsFor(start.light);
scene.background = new THREE.Color(colors.ground);
scene.fog = new THREE.Fog(colors.ground, 2, fogFar(start.light));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now(), curX = 0, curZ = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  player.update(dt, world);
  const cx = cellOf(player.pos.x), cz = cellOf(player.pos.z);
  if (cx !== curX || cz !== curZ) { curX = cx; curZ = cz; world.update(cx, cz); }
  renderer.render(scene, camera);
});
