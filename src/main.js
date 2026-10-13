import * as THREE from 'three';
import { fnv1a } from './rng.js';
import { makeFields } from './fields.js';
import { hallParams } from './hall.js';
import { connsFor } from './connectors.js';
import { buildHall, BUILDERS } from './shapes/index.js';
import { buildGroup } from './build.js';
import { colorsFor, fogFar } from './palette.js';

const seedHash = fnv1a('ravens');
const fields = makeFields(seedHash);
let hx = 0;
while (!BUILDERS[hallParams(seedHash, hx, 0, 0, fields).shape]) hx++;
const hall = hallParams(seedHash, hx, 0, 0, fields);
const built = buildHall(hall, connsFor(seedHash, hall, fields));
const colors = colorsFor(hall.light);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(colors.ground);
scene.fog = new THREE.Fog(colors.ground, 2, fogFar(hall.light));
scene.add(buildGroup(built.prims, colors.line));
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop((t) => {
  const a = t / 6000;
  camera.position.set(hall.cx + Math.sin(a) * 4, 1.7, hall.cz + Math.cos(a) * 4);
  camera.lookAt(hall.cx + Math.sin(a + 1.2) * 10, 2.5, hall.cz + Math.cos(a + 1.2) * 10);
  renderer.render(scene, camera);
});
