export const POSES = {
  standing: { lean: 0.03, neck: 0.0,  shL: [0.05, 0.12], elL: 0.25, shR: [-0.05, 0.12], elR: 0.2, hipL: -0.05, kneeL: 0.05, hipR: 0.08, kneeR: 0.18, prop: null,     seat: false },
  seated:   { lean: 0.08, neck: 0.1,  shL: [0.15, 0.08], elL: 1.35, shR: [0.15, 0.08],  elR: 1.35, hipL: 1.5,   kneeL: 1.5,  hipR: 1.45, kneeR: 1.45, prop: null,     seat: true  },
  kneeling: { lean: 0.05, neck: 0.25, shL: [0.10, 0.10], elL: 0.25, shR: [0.10, 0.10],  elR: 0.25, hipL: 0.0,   kneeL: 1.57, hipR: 0.0,  kneeR: 1.57, prop: null,     seat: false },
  reaching: { lean: -0.12, neck: -0.35, shL: [0.10, 0.15], elL: 0.2, shR: [3.0, 0.30],  elR: 0.1, hipL: -0.02, kneeL: 0.05, hipR: 0.05, kneeR: 0.1,  prop: null,     seat: false },
  carrying: { lean: -0.05, neck: 0.05, shL: [0.50, 0.20], elL: 1.07, shR: [0.50, 0.20],  elR: 1.07, hipL: 0.0,   kneeL: 0.1,  hipR: 0.0,  kneeR: 0.1,  prop: 'bundle', seat: false },
  reading:  { lean: 0.10, neck: 0.5,  shL: [0.30, 0.15], elL: 1.5,  shR: [0.30, 0.15],  elR: 1.5, hipL: -0.03, kneeL: 0.05, hipR: 0.06, kneeR: 0.15, prop: 'book',   seat: false },
  listening: { lean: -0.04, neck: 0.15, shL: [0.10, 0.12], elL: 0.3, shR: [1.70, 0.60], elR: 2.5, hipL: 0.06, kneeL: 0.2,  hipR: -0.04, kneeR: 0.04, prop: null,    seat: false },
  walking:  { lean: 0.06, neck: 0.05, shL: [-0.35, 0.10], elL: 0.35, shR: [0.40, 0.10], elR: 0.45, hipL: 0.40, kneeL: 0.25, hipR: -0.30, kneeR: 0.40, prop: null,    seat: false },
  lying:    { lean: 0.0,  neck: 0.0,  shL: [0.02, 0.06], elL: 0.1,  shR: [0.02, 0.06],  elR: 0.1, hipL: 0.03,  kneeL: 0.05, hipR: 0.03, kneeR: 0.05, prop: null,     seat: false, lie: true },
  pointing: { lean: -0.04, neck: -0.05, shL: [0.05, 0.12], elL: 0.2, shR: [1.45, 0.20], elR: 0.05, hipL: 0.10, kneeL: 0.2, hipR: -0.04, kneeR: 0.04, prop: null,     seat: false },
  bowed:    { lean: 0.45, neck: 0.6,  shL: [0.35, 0.05], elL: 0.7,  shR: [0.35, 0.05],  elR: 0.7, hipL: 0.05,  kneeL: 0.1,  hipR: 0.05, kneeR: 0.1,  prop: null,     seat: false },
  holding:  { lean: -0.06, neck: 0.3, shL: [0.50, 0.20], elL: 1.07, shR: [0.50, 0.20],  elR: 1.07, hipL: 0.0,   kneeL: 0.08, hipR: 0.04, kneeR: 0.15, prop: 'child',  seat: false },
};

export const RANGES = {
  lean: [-0.4, 0.6], neck: [-0.6, 0.8], shPitch: [-0.5, 3.2], shRoll: [0, 1.2],
  el: [0, 2.6], hip: [-0.6, 1.7], knee: [0, 2.0],
};

const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

// The same pose, every joint nudged by up to `a` radians and kept inside its range.
export function perturbPose(P, rand, a = 0.08) {
  const n = (v, range) => clamp(v + (rand() * 2 - 1) * a, range);
  return {
    ...P,
    lean: n(P.lean, RANGES.lean), neck: n(P.neck, RANGES.neck),
    shL: [n(P.shL[0], RANGES.shPitch), n(P.shL[1], RANGES.shRoll)], elL: n(P.elL, RANGES.el),
    shR: [n(P.shR[0], RANGES.shPitch), n(P.shR[1], RANGES.shRoll)], elR: n(P.elR, RANGES.el),
    hipL: n(P.hipL, RANGES.hip), kneeL: n(P.kneeL, RANGES.knee),
    hipR: n(P.hipR, RANGES.hip), kneeR: n(P.kneeR, RANGES.knee),
  };
}
