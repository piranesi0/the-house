// The House material: one ShaderMaterial that fakes sky, a window key light, a height gradient,
// contact darkening, distance fog and height fog. Per-vertex `fields` (light, water, decay) are
// turned into a mood with the same arithmetic as mood.js; keep them in step.
import * as THREE from 'three';
import { STOPS, WATER, DECAY } from './mood.js';
import { SKY_GLSL, SKY_UNIFORMS } from './skydome.js';
import { MARBLES, PATTERNS, MAX_FOOTPRINT } from './marble.js';

// mirrored: added to a part's own kind when it hangs in a pool's mirror (build.js).
export const KIND = { arch: 0, statue: 1, pool: 2, floor: 3, mirrored: 10 };
// A mirrored part is this bright against its original.
export const MIRROR_DIM = 0.6;

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
// value noise (skyNoise and skyHash, SKY_GLSL, reused rather than duplicated); a vein is where the
// sine crosses zero. Its width is a world width (thicker and thinner along the vein) measured in
// pixels through the sine's screen-space gradient, so a vein stays a thin line where the turbulence
// flattens the sine, rather than swelling into a blotch, and fades out, not aliases, once thinner
// than a pixel.
//
// Floors (KIND.floor) are inlaid with the hall's pattern: chequer (1.2 m squares set diagonally),
// medallion (rings and an eight-point star at the hall centre) or bands (a 1 m band 0.5 m in from
// the hall's own outline, round a 0.6 m chequer). Every edge is box-filtered over the pixel.
//
// Veins and inlay sit behind distance early-outs, so they cost nothing where they cannot show. No
// derivative is taken inside those branches (derivatives are undefined in non-uniform control
// flow): main() takes dFdx/dFdy of the hall-relative position once, up front, into mDx/mDy, and
// every filter width below goes through them by the chain rule: exactly for the inlay's linear
// coordinates and distances, and through the noise's analytic gradient for the veins.
// Floors tint at INLAY_WEIGHT so the inlay can read (at 0.6 contrast is capped at 2.5:1); walls, ceilings
// and statues keep MARBLE_WEIGHT.
const MARBLE_WEIGHT = '0.6', INLAY_WEIGHT = '0.85', VEIN_WEIGHT = '0.85';
const MARBLE_GLSL = /* glsl */`
  uniform vec3 uMarbleBase, uMarbleVein, uInlayA, uInlayB;
  uniform float uVeinStrength, uPattern;      // pattern: 0 chequer, 1 medallion, 2 bands
  uniform vec2 uFoot[${MAX_FOOTPRINT}];       // the hall's footprint, hall-relative (x, z)
  uniform int uFootN;
  uniform float uMedR;                        // the footprint's inscribed radius about the hall centre
  #define VEIN_WARP 1.6
  vec3 mDx, mDy;                              // vP's screen derivatives, set by main()
  // skyNoise with its gradient: the same trilinear blend of skyHash, written as a polynomial in the
  // smoothstepped fraction so it differentiates in closed form. xyz: gradient, w: value.
  vec4 marbleNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
    float h0 = skyHash(i), h1 = skyHash(i + vec3(1.0, 0.0, 0.0)), h2 = skyHash(i + vec3(0.0, 1.0, 0.0)), h3 = skyHash(i + vec3(1.0, 1.0, 0.0));
    float h4 = skyHash(i + vec3(0.0, 0.0, 1.0)), h5 = skyHash(i + vec3(1.0, 0.0, 1.0)), h6 = skyHash(i + vec3(0.0, 1.0, 1.0)), h7 = skyHash(i + vec3(1.0, 1.0, 1.0));
    float kx = h1 - h0, ky = h2 - h0, kz = h4 - h0;
    float kxy = h0 - h1 - h2 + h3, kyz = h0 - h2 - h4 + h6, kzx = h0 - h1 - h4 + h5, kxyz = -h0 + h1 + h2 - h3 + h4 - h5 - h6 + h7;
    return vec4(du * vec3(kx + kxy * u.y + kzx * u.z + kxyz * u.y * u.z,
                          ky + kyz * u.z + kxy * u.x + kxyz * u.z * u.x,
                          kz + kzx * u.x + kyz * u.y + kxyz * u.x * u.y),
                h0 + kx * u.x + ky * u.y + kz * u.z + kxy * u.x * u.y + kyz * u.y * u.z + kzx * u.z * u.x + kxyz * u.x * u.y * u.z);
  }
  // Smooth signed fbm, about -1..1: bends a vein without creasing it (abs-turbulence makes kinks).
  // xyz: gradient with respect to q, w: value.
  vec4 marbleWarp(vec3 q) {
    vec4 t = vec4(0.0);
    float a = 0.5, s = 1.0;
    for (int i = 0; i < 4; i++) { vec4 n = marbleNoise(q); t += a * vec4(n.xyz * 2.0 * s, n.w * 2.0 - 1.0); q *= 2.03; s *= 2.03; a *= 0.4; }
    return t * 2.2;
  }
  // The pixel footprint of a quantity whose gradient (per metre of vP) is g: what fwidth would give.
  float mWidth(vec3 g) { return abs(dot(g, mDx)) + abs(dot(g, mDy)); }
  float mWidth2(vec2 g) { return mWidth(vec3(g.x, 0.0, g.y)); }
  // Coverage, 0..1, of a vein of half-width w metres along the zero set of sin(u); gu: u's gradient.
  // wpp: metres per pixel.
  float veinLine(float u, vec3 gu, float w, float wpp) {
    float px = abs(sin(u)) / max(abs(cos(u)) * mWidth(gu), 1e-4);   // distance to the zero crossing, in pixels
    float hw = w / wpp;                                              // half-width in pixels
    float hwc = max(hw, 0.5);
    return (1.0 - smoothstep(hwc - 0.5, hwc + 0.5, px)) * clamp(hw * 2.0, 0.0, 1.0);
  }
  // 1 on a vein, 0 in the field.
  float marbleVeins(vec3 p) {
    float wpp = max(length(abs(mDx) + abs(mDy)), 1e-5);
    float width = mix(0.006, 0.03, skyNoise(p * 0.7 + 3.1));   // varies along the vein
    // The drift term sets the veins' run and spacing (a zero crossing about every 3 m); the warp
    // meanders them. Warp much stronger than drift turns the veins into closed contour loops.
    vec3 d1 = vec3(0.62, 0.36, 0.70), d2 = vec3(-0.55, 0.95, 0.80);
    vec4 w1 = marbleWarp(p * 0.2), w2 = marbleWarp(p * 0.35 + 11.7);
    float broad = veinLine(dot(p, d1) + VEIN_WARP * w1.w, d1 + (VEIN_WARP * 0.2) * w1.xyz, width, wpp);
    float fine = veinLine(dot(p, d2) + VEIN_WARP * w2.w, d2 + (VEIN_WARP * 0.35) * w2.xyz, width * 0.45, wpp);
    return max(broad, 0.55 * fine);
  }
  // A step from 0 to 1 where v crosses edge; w: v's pixel footprint.
  float aaStep(float edge, float v, float w) { return clamp((v - edge) / max(w, 1e-4) + 0.5, 0.0, 1.0); }
  // 1 on [0, duty) of every unit period of x, box-filtered over w (the pulse train's integral).
  float stripe(float x, float duty, float w) {
    w = max(w, 1e-4);
    float a = x - 0.5 * w, b = x + 0.5 * w;
    return ((floor(b) * duty + min(fract(b), duty)) - (floor(a) * duty + min(fract(a), duty))) / w;
  }
  // 0 and 1 unit squares, box-filtered over w.
  float checker(vec2 p, vec2 w) {
    w = max(w, vec2(1e-4));
    vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
    return 0.5 - 0.5 * i.x * i.y;
  }
  // Distance from p to the footprint's outline, positive inside and negative in doorways and
  // corridors (x), and the direction of its gradient (yz).
  vec3 footDist(vec2 p) {
    float d = 1e9, s = 1.0;
    vec2 nb = vec2(1.0, 0.0);
    for (int i = 0; i < ${MAX_FOOTPRINT}; i++) {
      if (i >= uFootN) break;
      vec2 vi = uFoot[i], vj = uFoot[i == 0 ? uFootN - 1 : i - 1];
      vec2 e = vj - vi, w = p - vi, b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      float bb = dot(b, b);
      if (bb < d) { d = bb; nb = b; }
      bvec3 c = bvec3(p.y >= vi.y, p.y < vj.y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s = -s;
    }
    return vec3(-s * sqrt(d), nb / max(length(nb), 1e-6));
  }
  // The floor's marble at hall-relative (x, z): the base inlaid with the two inlay colours.
  vec3 inlay(vec2 p) {
    if (uPattern < 0.5) {
      // Chequer: 1.2 m squares set diagonally.
      const float k = 0.70710678 / 1.2;
      return mix(uMarbleBase, uInlayA, checker(vec2(p.x + p.y, p.x - p.y) * k, vec2(mWidth2(vec2(k, k)), mWidth2(vec2(k, -k)))));
    }
    if (uPattern < 1.5) {
      // Medallion: rings and an eight-point star, centred on the hall. Guarded at the centre, where
      // atan(0, 0) is undefined and the radial direction has no length.
      float r = length(p), R = 0.8 * uMedR, rc = max(r, 1e-3);
      vec2 dir = r > 1e-3 ? p / r : vec2(1.0, 0.0);
      float wr = mWidth2(dir);
      float t = fract(atan(p.y, r > 1e-3 ? p.x : 1.0) * 8.0 / 6.2831853);
      float point = abs(t - 0.5) * 2.0;   // 1 at a star point
      float starR = R * mix(0.28, 0.55, point);
      // The star's edge, starR - r, turns with the angle, so its gradient has a tangential term.
      vec2 gStar = (R * 0.27 * sign(t - 0.5) * 16.0 / 6.2831853) * vec2(-p.y, p.x) / (rc * rc) - dir;
      vec3 c = mix(uMarbleBase, uInlayB, aaStep(0.0, R - r, wr) * aaStep(0.0, r - 0.6 * R, wr) * stripe(r / 0.9, 0.33, wr / 0.9));
      c = mix(c, uInlayA, aaStep(0.0, starR - r, mWidth2(gStar)));
      return mix(c, uInlayB, aaStep(0.0, 0.1 * R - r, wr));
    }
    // Bands: a 1 m band 0.5 m in from the hall's own outline, round a field of small chequer;
    // outside the outline (thresholds, corridors) plain base.
    vec3 f = footDist(p);
    float wd = mWidth2(f.yz);
    vec3 c = mix(uMarbleBase, uInlayA, checker(p / 0.6, vec2(mWidth2(vec2(1.0, 0.0)), mWidth2(vec2(0.0, 1.0))) / 0.6));
    c = mix(c, uInlayB, aaStep(0.5, f.x, wd) * (1.0 - aaStep(1.5, f.x, wd)));
    return mix(uMarbleBase, c, aaStep(0.0, f.x, wd));
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
    // A pool's mirror (KIND.mirrored + the part's own kind, build.js) hangs below the hall floor:
    // its vertices are the originals turned over about it (y = 0, reflect.js). It is shaded as the
    // original part (the height above the floor, the marble's coordinates and the normal turned back
    // for the light, so a statue's underside stays dark and the reflected vault takes the bounce),
    // dimmer, and cut at the floor, so nothing mirrored overlaps what stands in the water.
    float mirrored = step(${KIND.mirrored - 0.5}, vKind), kd = vKind - ${KIND.mirrored}.0 * mirrored;
    // Double-sided: a floor or ramp seen from below is lit as its underside.
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vN) * facing;
    n.y *= 1.0 - 2.0 * mirrored;
    float h = mix(vH, -vH, mirrored);
    vec3 p = vec3(vP.x, mix(vP.y, -vP.y, mirrored), vP.z);
    // Bounded kind tests, so a later kind cannot be mistaken for a pool.
    float isStatue = step(0.5, kd) * step(kd, 1.5), isPool = step(1.5, kd) * step(kd, 2.5);
    float isFloor = step(2.5, kd) * step(kd, 3.5);
    // Taken here, in uniform control flow, for the filters behind the early-outs below; for a mirrored
    // part the derivatives of p, which runs y the other way.
    mDx = dFdx(vP); mDy = dFdy(vP);
    mDx.y *= 1.0 - 2.0 * mirrored; mDy.y *= 1.0 - 2.0 * mirrored;
    if (mirrored > 0.5 && vH > 0.0) discard;
    // Veins calm between 10 and 15 m of the flattened distance the fog uses (horizontal plus a third
    // of the vertical, turned to world orientation by the view rotation), so vaults overhead keep
    // theirs; fainter on statues. Past 15 m they are skipped.
    vec3 off = (vec4(vV, 0.0) * viewMatrix).xyz;
    float flatDist = length(off.xz) + abs(off.y) / 3.0;
    float near = 1.0 - smoothstep(10.0, 15.0, flatDist);
    float vein = 0.0;
    if (near > 0.0) vein = marbleVeins(p) * uVeinStrength * near * mix(1.0, 0.35, isStatue);
    // Floors are inlaid, out to fogFar, where the distance fog is total and hides them.
    vec3 marble = uMarbleBase;
    if (isFloor > 0.5 && flatDist < m.fogFar) marble = inlay(p.xz);
    vec3 stone = m.stone * mix(mix(vec3(1.0), marble, mix(${MARBLE_WEIGHT}, ${INLAY_WEIGHT}, isFloor)), mix(vec3(1.0), uMarbleVein, ${VEIN_WEIGHT}), vein);
    stone *= 1.0 + 0.12 * isStatue;   // statues a touch lighter
    stone *= 1.0 - 0.25 * isPool;     // pool floors darker
    vec3 hemi = mix(m.bounce, m.sky, n.y * 0.5 + 0.5);
    vec3 key = m.key * max(dot(n, -uKeyDir), 0.0);
    float grad = mix(1.0 - m.gradient, 1.0, clamp(h / max(uCeiling, 1.0), 0.0, 1.0));
    float contact = 1.0 - m.contact * (1.0 - smoothstep(0.0, 0.6, h));
    vec3 color = stone * (hemi + key) * grad * contact;
    float sheen = pow(1.0 - max(dot(normalize(vNV) * facing, -normalize(vV)), 0.0), 3.0) * uWaterSheen * vFields.y * isPool;
    color += m.sky * sheen;
    color *= uDim * mix(1.0, ${MIRROR_DIM.toFixed(2)}, mirrored);
    // Fog toward the haze level, toward the sky above the horizon (skyFogTarget, skydome.js).
    float fog = fogAmount(m, vV, h);
    color = mix(color, skyFogTarget(m.haze, (vec4(vV, 0.0) * viewMatrix).xyz, fog), fog);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// marble: a MARBLES entry; pattern: one of PATTERNS; footprint: footprintLocal(hall), flat x, z.
export function surfaceMaterial({ keyDir = [-0.5, -0.8, -0.3], ceiling = 8, side = THREE.DoubleSide, dim = 1, marble = MARBLES.carrara, pattern = 'chequer', footprint = [] } = {}) {
  const n = footprint.length / 2;
  const foot = Array.from({ length: MAX_FOOTPRINT }, (_, i) => new THREE.Vector2(footprint[2 * i] ?? 0, footprint[2 * i + 1] ?? 0));
  // Inscribed radius: the least distance from the hall centre to any footprint edge, so the medallion
  // stays clear of a cross hall's inner corners.
  let medR = n ? Infinity : 0;
  for (let i = 0; i < n; i++) {
    const a = foot[i], b = foot[(i + 1) % n], ex = b.x - a.x, ez = b.y - a.y, l2 = ex * ex + ez * ez;
    const t = l2 > 0 ? Math.min(1, Math.max(0, -(a.x * ex + a.y * ez) / l2)) : 0;
    medR = Math.min(medR, Math.hypot(a.x + t * ex, a.y + t * ez));
  }
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT, fragmentShader: SURFACE_FRAG,
    // SKY_UNIFORMS spread, never cloned, as for the portals: the dome's update moves the fog target.
    uniforms: { ...stopUniforms(), ...SKY_UNIFORMS, uKeyDir: { value: v3(keyDir).normalize() }, uCeiling: { value: ceiling }, uDim: { value: dim },
      uMarbleBase: { value: v3(marble.base) }, uMarbleVein: { value: v3(marble.vein) }, uVeinStrength: { value: marble.strength },
      uInlayA: { value: v3(marble.inlay[0]) }, uInlayB: { value: v3(marble.inlay[1]) }, uPattern: { value: PATTERNS.indexOf(pattern) },
      uFoot: { value: foot }, uFootN: { value: n }, uMedR: { value: medR } },
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

// The pools' water: one mesh holds every loaded pool's sheet (water.js), each a translucent sheet
// over the opening in its floor (shaded look), tinted from haze and sky, brighter and milkier at
// grazing angles (a fake Fresnel term), its opacity capped at WATER_ALPHA so the mirror below always
// shows (look spec §6). It also draws v0's 1 m grid in the pool's line colour, rippling with uTime
// (v0 moved the grid's lines up and down; seen from above a ripple across them reads the same), so
// all the pools in view cost one draw call. Per vertex: fields (the pool hall's centre [light,
// water, decay]), h (the sheet's height above its hall floor, for the height fog) and grid (the
// line colour, raw sRGB). Positions are relative to the mesh's own origin, a hall centre on the
// 24 m grid, so the whole metres of the grid fall where v0's did. View space like the surfaces. The
// eye is always above the water, so the fog target is the haze (skyFogTarget below the horizon).
export const WATER_ALPHA = 0.6;
const WATER_VERT = /* glsl */`
  attribute vec3 fields, grid;
  attribute float h;
  varying vec3 vV, vNV, vFields, vGrid;
  varying vec2 vXZ;
  varying float vH;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = mvPosition.xyz; vNV = normalize(normalMatrix * normal); vXZ = position.xz;
    vFields = fields; vGrid = grid; vH = h;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const WATER_FRAG = /* glsl */`
  precision highp float;
  ${MOOD_GLSL}
  uniform float uTime;
  varying vec3 vV, vNV, vFields, vGrid;
  varying vec2 vXZ;
  varying float vH;
  void main() {
    Mood m = moodFor(vFields);
    float fresnel = pow(1.0 - max(dot(normalize(vNV), normalize(-vV)), 0.0), 3.0);
    vec3 tint = mix(m.haze * 0.8, m.sky, 0.35 + 0.5 * fresnel);
    float a = min(${WATER_ALPHA.toFixed(2)}, 0.18 + 0.6 * fresnel);
    // One-pixel lines on the whole metres, faded out where a cell is under about four pixels.
    vec2 q = vXZ + vec2(0.03 * sin(0.7 * uTime + 0.5 * vXZ.y), 0.02 * sin(0.5 * uTime + 0.7 * vXZ.x));
    vec2 w = fwidth(q), d = abs(fract(q - 0.5) - 0.5) / max(w, vec2(1e-4));
    float line = (1.0 - min(min(d.x, d.y), 1.0)) * (1.0 - smoothstep(0.15, 0.4, max(w.x, w.y)));
    vec3 colour = mix(tint, vGrid, line);
    gl_FragColor = vec4(mix(colour, m.haze, fogAmount(m, vV, vH)), max(a, line));
  }
`;
export function waterMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
    uniforms: { ...stopUniforms(), uTime: { value: 0 } },
    transparent: true, depthWrite: false,
  });
}
