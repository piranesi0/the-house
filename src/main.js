// Placeholder scene; replaced in Task 7.
import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.7, 6);
const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2), 20);
const cube = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xd8d4cc }));
scene.add(cube);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop((t) => { cube.rotation.y = t / 2000; renderer.render(scene, camera); });
