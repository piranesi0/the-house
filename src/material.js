// The House material: one ShaderMaterial that fakes sky, a window key light, a height gradient,
// contact darkening, distance fog and height fog. Per-vertex `fields` (light, water, decay) are
// turned into a mood with the same arithmetic as mood.js; keep them in step.
import * as THREE from 'three';
import { STOPS, WATER, DECAY } from './mood.js';

export const KIND = { arch: 0, statue: 1, pool: 2 };

const v3 = (a) => new THREE.Vector3(...a);
const stopUniforms = () => ({
  uStone: { value: STOPS.map(s => v3(s.stone)) },
  uSky: { value: STOPS.map(s => v3(s.sky)) },
  uBounce: { value: STOPS.map(s => v3(s.bounce)) },
  uKey: { value: STOPS.map(s => v3(s.key)) },
  uHaze: { value: STOPS.map(s => v3(s.haze)) },
  // fogFar, heightFog, contact, gradient
  uScalar: { value: STOPS.map(s => new THREE.Vector4(s.fogFar, s.heightFog, s.contact, s.gradient)) },
  uWater: { value: new THREE.Vector4(WATER.heightFog, ...WATER.hazeCool) },
  uWaterSheen: { value: WATER.sheen },
  uDecay: { value: new THREE.Vector3(DECAY.darken, DECAY.grey, DECAY.contact) },
});

// Shared GLSL: piecewise lerp over the three stops and the mood adjustments, mirroring moodFor.
export const MOOD_GLSL = /* glsl */`
  uniform vec3 uStone[3], uSky[3], uBounce[3], uKey[3], uHaze[3];
  uniform vec4 uScalar[3];
  uniform vec4 uWater;        // heightFog gain, hazeCool rgb
  uniform float uWaterSheen;
  uniform vec3 uDecay;        // darken, grey, contact
  struct Mood { vec3 stone, sky, bounce, key, haze; float fogFar, heightFog, contact, gradient; };
  vec3 lerp3(vec3 a[3], float l) { return l < 0.5 ? mix(a[0], a[1], l * 2.0) : mix(a[1], a[2], (l - 0.5) * 2.0); }
  vec4 lerp4(vec4 a[3], float l) { return l < 0.5 ? mix(a[0], a[1], l * 2.0) : mix(a[1], a[2], (l - 0.5) * 2.0); }
  Mood moodFor(vec3 f) {
    float l = clamp(f.x, 0.0, 1.0), w = clamp(f.y, 0.0, 1.0), d = clamp(f.z, 0.0, 1.0);
    Mood m;
    m.stone = lerp3(uStone, l); m.sky = lerp3(uSky, l); m.bounce = lerp3(uBounce, l); m.key = lerp3(uKey, l); m.haze = lerp3(uHaze, l);
    vec4 s = lerp4(uScalar, l);
    m.fogFar = s.x; m.heightFog = s.y; m.contact = s.z; m.gradient = s.w;
    float grey = dot(m.stone, vec3(0.3, 0.59, 0.11)) * uDecay.y;
    m.stone = mix(m.stone, vec3(grey), d * uDecay.x);
    m.contact = clamp(m.contact + uDecay.z * d, 0.0, 1.0);
    m.heightFog = clamp(m.heightFog + uWater.x * w, 0.0, 1.0);
    m.haze = mix(m.haze, mix(m.haze, uWater.yzw, 0.5), w);
    return m;
  }
  // Distance fog from 2 m to fogFar, plus height fog in the bottom 3 m that needs some distance to build.
  float fogAmount(Mood m, float dist, float h) {
    float distFog = clamp((dist - 2.0) / (m.fogFar - 2.0), 0.0, 1.0);
    float heightFog = m.heightFog * clamp(1.0 - h / 3.0, 0.0, 1.0) * clamp(dist / 8.0, 0.0, 1.0);
    return max(distFog, heightFog);
  }
`;

const SURFACE_VERT = /* glsl */`
  attribute vec3 fields;
  attribute float kind;
  // vN: world-oriented normal (the key light is a world direction); vNV: view-space normal and vV:
  // view-space position, for the sheen and fog; vH: height above the hall floor.
  varying vec3 vN, vNV, vV, vFields;
  varying float vH, vKind;
  #include <clipping_planes_pars_vertex>
  void main() {
    // Vertices are hall-local and the group sits at (cx, floorY, cz), so modelViewMatrix (built on
    // the CPU in float64) keeps far-from-origin halls precise, and position.y is the height above
    // the floor. Nothing here touches world coordinates.
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y;
    vN = normalize(mat3(modelMatrix) * normal); vNV = normalize(normalMatrix * normal);
    vFields = fields; vKind = kind;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const SURFACE_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uKeyDir;        // direction the light travels, normalised
  uniform float uCeiling, uDim;
  varying vec3 vN, vNV, vV, vFields;
  varying float vH, vKind;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(vFields);
    // Double-sided: a floor or ramp seen from below is lit as its underside.
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vN) * facing;
    float h = vH;
    vec3 stone = m.stone * (1.0 + 0.12 * step(0.5, vKind) * step(vKind, 1.5));   // statues a touch lighter
    stone *= 1.0 - 0.25 * step(1.5, vKind);                                        // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    float sheen = pow(1.0 - max(dot(normalize(vNV) * facing, -normalize(vV)), 0.0), 3.0) * uWaterSheen * vFields.y * step(1.5, vKind);
    color += m.sky * sheen;
    color *= uDim;
    float dist = length(vV);
    color = mix(color, m.haze, fogAmount(m, dist, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], ceiling = 8, side = THREE.DoubleSide, dim = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    uniforms: { ...stopUniforms(), uKeyDir: { value: v3(keyDir).normalize() }, uCeiling: { value: ceiling }, uDim: { value: dim } },
    side, clipping: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}
