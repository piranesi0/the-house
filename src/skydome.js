// The sky: one dome around the camera, drawn before everything else, and the GLSL function that
// colours it, shared with the window portals (material.js) so a window shows the dome's own sky.
// Colours are raw sRGB like the mood colours: the shaders write them unconverted.
import * as THREE from 'three';

// Shared uniform objects. The dome and every portal material spread these same objects into their
// uniforms, so one update per frame moves the dome and every window together.
export const SKY_UNIFORMS = {
  uSkyFields: { value: new THREE.Vector3(0.5, 0, 0) },                 // eased light, water, decay
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },    // toward the sun or moon
};

export const SKY_GLSL = /* glsl */`
  uniform vec3 uSkyFields, uSunDir;
  float skyHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float skyNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(skyHash(i), skyHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 0.0)), skyHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(skyHash(i + vec3(0.0, 0.0, 1.0)), skyHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(skyHash(i + vec3(0.0, 1.0, 1.0)), skyHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }
  // The three light stops, as moodFor: chiaroscuro (night), dusk, luminous (day).
  vec3 skyStops(vec3 a, vec3 b, vec3 c, float l) { return l < 0.5 ? mix(a, b, l * 2.0) : mix(b, c, (l - 0.5) * 2.0); }
  // Sky colour along a world direction (any length).
  vec3 skyColour(vec3 dir) {
    vec3 d = normalize(dir);
    float l = clamp(uSkyFields.x, 0.0, 1.0), w = clamp(uSkyFields.y, 0.0, 1.0), dc = clamp(uSkyFields.z, 0.0, 1.0);
    float up = d.y;
    vec3 zenith = skyStops(vec3(0.010, 0.012, 0.025), vec3(0.08, 0.13, 0.32), vec3(0.60, 0.72, 0.86), l);
    vec3 horizon = skyStops(vec3(0.030, 0.035, 0.060), vec3(0.88, 0.56, 0.28), vec3(0.97, 0.94, 0.86), l);
    vec3 col = mix(zenith, horizon, pow(1.0 - smoothstep(0.0, 0.3, max(up, 0.0)), 1.5));
    col = mix(col, horizon * 0.6, smoothstep(0.0, 0.25, -up));          // below the horizon
    // Sun by day and dusk, moon by night: a small disc and a broad glow toward uSunDir.
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    vec3 sunCol = skyStops(vec3(0.55, 0.60, 0.75), vec3(1.0, 0.70, 0.40), vec3(1.0, 0.96, 0.86), l);
    col += sunCol * (smoothstep(0.9990, 0.9996, s) * 0.9 + pow(s, 8.0) * mix(0.08, 0.35, l));
    // Faint cloud bands: noise stretched along the horizon, gone overhead and at night.
    vec3 q = d / max(up + 0.25, 0.05);
    float cloud = smoothstep(0.55, 0.85, skyNoise(vec3(q.x * 1.5, 0.0, q.z * 6.0)) * 0.65 + skyNoise(q * 4.0) * 0.35);
    col = mix(col, mix(horizon, vec3(1.0), 0.4), cloud * 0.35 * smoothstep(0.0, 0.15, up) * smoothstep(0.2, 0.5, l));
    // Stars in the dark: one hashed point per cell of direction, fading in as the light goes.
    vec3 sc = d * 160.0;
    float star = step(0.996, skyHash(floor(sc))) * (1.0 - smoothstep(0.0, 0.35, length(fract(sc) - 0.5)));
    col += vec3(star) * (1.0 - smoothstep(0.1, 0.35, l)) * smoothstep(0.0, 0.1, up);
    // Water pales and greys the sky; decay dulls it.
    return mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.35 * w + 0.25 * dc);
  }  // What fog fades toward along a world-oriented view ray (final review S2 I1): the hall's haze at
  // and below the horizon, the dome's own sky by 0.12 up, the dome's horizon rule. Fully fogged
  // geometry seen above the horizon then dissolves into the sky behind it instead of standing as a
  // haze-coloured slab. f: the fog amount; the sky is only computed where it can show.
  vec3 skyFogTarget(vec3 haze, vec3 dir, float f) {
    float k = smoothstep(0.0, 0.12, normalize(dir).y);
    return f > 0.0 && k > 0.0 ? mix(haze, skyColour(dir), k) : haze;
  }
`;

const DOME_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    // The dome sits on the camera, unturned, so its local position is the world direction.
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// Near and below the horizon (about 7 degrees up, and everything down) the dome turns to the
// current hall's haze, so a long view down a run of doorways ends in haze, not in a bright horizon
// slot. Dome only: windows and roofless halls never look that low, so SKY_GLSL leaves it out.
const DOME_FRAG = /* glsl */`
  precision highp float;
  ${SKY_GLSL}
  uniform vec3 uSkyHaze;
  varying vec3 vDir;
  void main() {
    gl_FragColor = vec4(mix(skyColour(vDir), uSkyHaze, 1.0 - smoothstep(0.0, 0.12, normalize(vDir).y)), 1.0);
  }
`;

export class SkyDome {
  constructor(scene) {
    const material = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, // uSkyHaze is the dome's own: portals never fade to the horizon haze, so it stays out of SKY_UNIFORMS.
      uniforms: { ...SKY_UNIFORMS, uSkyHaze: { value: new THREE.Vector3(0.23, 0.23, 0.26) } },
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), material);
    this.mesh.name = 'sky'; this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.target = new THREE.Vector3();
  }
  // eased: { light, water, decay }; keyDir: the current hall's key light (the way the light
  // travels) or null to hold the sun where it is; k: this frame's easing factor, 1 to snap;
  // haze: the eased mood's haze, raw sRGB [r, g, b], for the horizon.
  update(camera, eased, keyDir, k, haze) {
    this.mesh.position.copy(camera.position);
    SKY_UNIFORMS.uSkyFields.value.set(eased.light, eased.water, eased.decay);
    if (haze) this.mesh.material.uniforms.uSkyHaze.value.set(haze[0], haze[1], haze[2]);
    if (keyDir) {
      this.target.set(-keyDir[0], -keyDir[1], -keyDir[2]);
      // Easing between nearly opposite directions can pass through zero; snap rather than normalize it.
      const sun = SKY_UNIFORMS.uSunDir.value.lerp(this.target, k);
      if (sun.lengthSq() < 1e-6) sun.copy(this.target); else sun.normalize();
    }
  }
}
