// The House material: one ShaderMaterial that fakes sky, a window key light, a height gradient,
// contact darkening, distance fog and height fog. Per-vertex `fields` (light, water, decay) are
// turned into a mood with the same arithmetic as mood.js; keep them in step.
import * as THREE from 'three';
import { STOPS, WATER, DECAY } from './mood.js';
import { SKY_GLSL, SKY_UNIFORMS } from './skydome.js';
import { MARBLES } from './marble.js';

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
  // Distance fog from 2 m to fogFar, plus height fog in the bottom 3 m that needs some distance to
  // build. view: the fragment's view-space position. Distance fog measures the horizontal distance
  // plus a third of the vertical, so a 40 m vault stays visible while the horizon fogs as before;
  // the offset is turned to world orientation by the view rotation alone (a row-vector product is
  // the transpose), so no world position is formed. Height fog keeps the true distance.
  float fogAmount(Mood m, vec3 view, float h) {
    vec3 off = (vec4(view, 0.0) * viewMatrix).xyz;
    float dist = length(view), flatDist = length(off.xz) + abs(off.y) / 3.0;
    float distFog = clamp((flatDist - 2.0) / (m.fogFar - 2.0), 0.0, 1.0);
    float heightFog = m.heightFog * clamp(1.0 - h / 3.0, 0.0, 1.0) * clamp(dist / 8.0, 0.0, 1.0);
    return max(distFog, heightFog);
  }
`;

const SURFACE_VERT = /* glsl */`
  attribute vec3 fields;
  attribute float kind;
  // vN: world-oriented normal (the key light is a world direction); vNV: view-space normal and vV:
  // view-space position, for the sheen and fog; vH: height above the hall floor; vP: hall-relative
  // position, the marble's coordinates (each hall is its own block of stone).
  varying vec3 vN, vNV, vV, vFields, vP;
  varying float vH, vKind;
  #include <clipping_planes_pars_vertex>
  void main() {
    // Vertices are hall-local and the group sits at (cx, floorY, cz), so modelViewMatrix (built on
    // the CPU in float64) keeps far-from-origin halls precise, and position.y is the height above
    // the floor. Nothing here touches world coordinates.
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y; vP = position;
    vN = normalize(mat3(modelMatrix) * normal); vNV = normalize(normalMatrix * normal);
    vFields = fields; vKind = kind;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

// Marble: the hall's stone tints the mood's stone at MARBLE_WEIGHT, so a dark marble darkens a bright
// hall without blacking it out, and veins mix the vein colour in on top at VEIN_WEIGHT. Two vein
// families, each a sine drifting along a fixed direction and meandered by four octaves of smooth
// value noise (skyNoise, SKY_GLSL, reused rather than duplicated); a vein is where the sine crosses
// zero. Its width is a world width (thicker and thinner along the vein) measured in pixels through
// the sine's screen-space gradient, so a vein stays a thin line where the turbulence flattens the
// sine, rather than swelling into a blotch, and fades out, not aliases, once thinner than a pixel.
const MARBLE_WEIGHT = '0.6', VEIN_WEIGHT = '0.85';
const MARBLE_GLSL = /* glsl */`
  uniform vec3 uMarbleBase, uMarbleVein;
  uniform float uVeinStrength;
  #define VEIN_WARP 1.6
  // Smooth signed fbm, about -1..1: bends a vein without creasing it (abs-turbulence makes kinks).
  float marbleWarp(vec3 q) {
    float t = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { t += a * (skyNoise(q) * 2.0 - 1.0); q *= 2.03; a *= 0.4; }
    return t * 2.2;
  }
  // Coverage, 0..1, of a vein of half-width w metres along the zero set of s. wpp: metres per pixel.
  float veinLine(float s, float w, float wpp) {
    float px = abs(s) / max(fwidth(s), 1e-4);   // distance to the zero crossing, in pixels
    float hw = w / wpp;                           // half-width in pixels
    float hwc = max(hw, 0.5);
    return (1.0 - smoothstep(hwc - 0.5, hwc + 0.5, px)) * clamp(hw * 2.0, 0.0, 1.0);
  }
  // 1 on a vein, 0 in the field.
  float marbleVeins(vec3 p) {
    float wpp = max(length(fwidth(p)), 1e-5);
    float width = mix(0.006, 0.03, skyNoise(p * 0.7 + 3.1));   // varies along the vein
    // The drift term sets the veins' run and spacing (a zero crossing about every 3 m); the warp
    // meanders them. Warp much stronger than drift turns the veins into closed contour loops.
    float main = veinLine(sin(dot(p, vec3(0.62, 0.36, 0.70)) + VEIN_WARP * marbleWarp(p * 0.2)), width, wpp);
    float fine = veinLine(sin(dot(p, vec3(-0.55, 0.95, 0.80)) + VEIN_WARP * marbleWarp(p * 0.35 + 11.7)), width * 0.45, wpp);
    return max(main, 0.55 * fine);
  }
`;

const SURFACE_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  ${SKY_GLSL}
  ${MARBLE_GLSL}
  uniform vec3 uKeyDir;        // direction the light travels, normalised
  uniform float uCeiling, uDim;
  varying vec3 vN, vNV, vV, vFields, vP;
  varying float vH, vKind;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(vFields);
    // Double-sided: a floor or ramp seen from below is lit as its underside.
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vN) * facing;
    float h = vH;
    // Bounded kind tests, so a later kind cannot be mistaken for a pool.
    float isStatue = step(0.5, vKind) * step(vKind, 1.5), isPool = step(1.5, vKind) * step(vKind, 2.5);
    // Veins calm between 10 and 15 m of the flattened distance the fog uses (horizontal plus a third
    // of the vertical, turned to world orientation by the view rotation), so vaults overhead keep
    // theirs; fainter on statues.
    vec3 off = (vec4(vV, 0.0) * viewMatrix).xyz;
    float near = 1.0 - smoothstep(10.0, 15.0, length(off.xz) + abs(off.y) / 3.0);
    float vein = marbleVeins(vP) * uVeinStrength * near * mix(1.0, 0.35, isStatue);
    vec3 stone = m.stone * mix(mix(vec3(1.0), uMarbleBase, ${MARBLE_WEIGHT}), mix(vec3(1.0), uMarbleVein, ${VEIN_WEIGHT}), vein);
    stone *= 1.0 + 0.12 * isStatue;   // statues a touch lighter
    stone *= 1.0 - 0.25 * isPool;     // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    float sheen = pow(1.0 - max(dot(normalize(vNV) * facing, -normalize(vV)), 0.0), 3.0) * uWaterSheen * vFields.y * isPool;
    color += m.sky * sheen;
    color *= uDim;
    // Fog toward the haze level, toward the sky above the horizon (skyFogTarget, skydome.js).
    float fog = fogAmount(m, vV, h);
    color = mix(color, skyFogTarget(m.haze, (vec4(vV, 0.0) * viewMatrix).xyz, fog), fog);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// marble: a MARBLES entry.
export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], ceiling = 8, side = THREE.DoubleSide, dim = 1, marble = MARBLES.carrara } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    // SKY_UNIFORMS spread, never cloned, as for the portals: the dome's update moves the fog target.
    uniforms: { ...stopUniforms(), ...SKY_UNIFORMS, uKeyDir: { value: v3(keyDir).normalize() }, uCeiling: { value: ceiling }, uDim: { value: dim },
      uMarbleBase: { value: v3(marble.base) }, uMarbleVein: { value: v3(marble.vein) }, uVeinStrength: { value: marble.strength } },
    side, clipping: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// Window glows and light shafts: additive, no depth write, fogged by the hall-centre mood. Like the
// surface shader it works in view space: vertices are hall-local, the group sits at (cx, floorY,
// cz), so position.y is the height above the floor and nothing touches world coordinates.
const EFFECTS_VERT = /* glsl */`
  attribute float alpha;
  attribute vec3 tint;
  attribute float fogK;
  varying vec3 vV, vTint;
  varying vec2 vUv;
  varying float vAlpha, vH, vFogK;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y; vUv = uv; vAlpha = alpha; vTint = tint; vFogK = fogK;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const EFFECTS_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform vec3 uFields;
  varying vec3 vV, vTint;
  varying vec2 vUv;
  varying float vAlpha, vH, vFogK;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(uFields);
    // Soft edges across the quad; uv.x runs across a shaft or glow, uv.y along it.
    float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(0.0, 0.35, 1.0 - vUv.x);
    // vFogK: 1 for shafts and patches, 1/3 for window glows (see effects.js). Additive, so fog fades
    // them to nothing: they already dissolve into whatever is behind, sky included (S2 I1).
    float a = vAlpha * edge * (1.0 - fogAmount(m, vV, vH) * vFogK);
    // Premultiplied: the material sets premultipliedAlpha, so additive blending is ONE, ONE.
    gl_FragColor = vec4(vTint * a, a);
  }
`;
export function effectsMaterial({ fields = [0.5, 0, 0] } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: EFFECTS_VERT, fragmentShader: EFFECTS_FRAG,
    uniforms: { ...stopUniforms(), uFields: { value: v3(fields) } },
    transparent: true, premultipliedAlpha: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, clipping: true, forceSinglePass: true,
  });
}

// Window panes as openings: each pixel takes the sky dome's colour along the view ray, fogged like
// the wall it sits in. View space as everywhere else: the ray's world direction is the view-space
// position turned back by the view rotation (a row-vector product is the transpose), so no world
// position is ever formed. SKY_UNIFORMS are spread, never cloned: the dome's per-frame update moves
// every portal with it.
const PORTAL_VERT = /* glsl */`
  varying vec3 vV, vDir;
  varying float vH;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vH = position.y;
    vDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const PORTAL_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  ${SKY_GLSL}
  uniform vec3 uFields;
  varying vec3 vV, vDir;
  varying float vH;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    Mood m = moodFor(uFields);
    // A third of the wall's fog: windows sit 16-26 m from the eye, past a dark hall's fog, and as
    // the hall's light source they must still read through the haze.
    gl_FragColor = vec4(mix(skyColour(vDir), m.haze, fogAmount(m, vV, vH) / 3.0), 1.0);
  }
`;
export function portalMaterial({ fields = [0.5, 0, 0] } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
    uniforms: { ...stopUniforms(), ...SKY_UNIFORMS, uFields: { value: v3(fields) } },
    side: THREE.DoubleSide, clipping: true,
  });
}
