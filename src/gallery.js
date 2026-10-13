// Statue gallery: every subject side by side, for judging poses by eye. Not part of the House.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FAMILIES, FAMILY_BUILDERS } from './statues/place.js';
import { buildGroup, disposeGroup } from './build.js';

const LINE = 0x6b6660, GAP = 3.2, ROW = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f1ea);
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const labels = document.getElementById('labels');
let items = [];

// Rows of [label, family, subject, variant]; with variations on, each pose gets three variant rows.
function rows(withVariants) {
  const out = [];
  const poses = FAMILIES.figure;
  if (withVariants) for (const v of [101, 202, 303]) out.push(poses.map(p => [`${p} ·${v}`, 'figure', p, v]));
  else out.push(poses.map(p => [p, 'figure', p, null]));
  for (const fam of ['animal', 'object', 'group']) out.push(FAMILIES[fam].map(s => [s, fam, s, null]));
  return out;
}

function build(withVariants) {
  for (const it of items) { disposeGroup(it.group); it.label.remove(); }
  items = [];
  const rs = rows(withVariants);
  rs.forEach((row, r) => row.forEach(([text, fam, subject, variant], c) => {
    const body = FAMILY_BUILDERS[fam](subject, 1, variant);
    const group = buildGroup(body.prims, { color: LINE, ghost: 0.12 });
    group.position.set((c - (row.length - 1) / 2) * GAP, 0, r * ROW);
    scene.add(group);
    const label = document.createElement('div');
    label.textContent = text;
    labels.appendChild(label);
    items.push({ group, label });
  }));
  const depth = (rs.length - 1) * ROW;
  controls.target.set(0, 0.9, depth / 2);
  camera.position.set(0, 9, depth / 2 + 26);
  controls.update();
}

const variants = document.getElementById('variants'), turn = document.getElementById('turn');
variants.addEventListener('change', () => build(variants.checked));
build(false);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const v = new THREE.Vector3();
let last = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (turn.checked) for (const it of items) it.group.rotation.y += dt * 0.35;
  controls.update();
  renderer.render(scene, camera);
  for (const it of items) {
    v.set(it.group.position.x, -0.15, it.group.position.z).project(camera);
    const visible = v.z < 1;
    it.label.style.display = visible ? '' : 'none';
    if (visible) { it.label.style.left = `${(v.x + 1) / 2 * window.innerWidth}px`; it.label.style.top = `${(1 - v.y) / 2 * window.innerHeight}px`; }
  }
});
