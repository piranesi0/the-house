// Interim; replaced again in Task 9.
import * as THREE from 'three';
import { fnv1a } from './rng.js';
import { makeFields } from './fields.js';
import { World } from './world.js';
import { colorsFor, fogFar } from './palette.js';

const seedHash = fnv1a('ravens');
const fields = makeFields(seedHash);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const world = new World(scene, seedHash, fields);
world.update(0, 0);
const hall = world.hall(0, 0, 0);
const colors = colorsFor(hall.light);
scene.background = new THREE.Color(colors.ground);
scene.fog = new THREE.Fog(colors.ground, 2, fogFar(hall.light));
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
