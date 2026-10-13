export const POSES = {
  standing: { lean: 0.03, neck: 0.0,  shL: [0.05, 0.12], elL: 0.25, shR: [-0.05, 0.12], elR: 0.2, hipL: -0.05, kneeL: 0.05, hipR: 0.08, kneeR: 0.18, prop: null,     seat: false },
  seated:   { lean: 0.08, neck: 0.1,  shL: [0.45, 0.10], elL: 1.2,  shR: [0.45, 0.10],  elR: 1.2, hipL: 1.5,   kneeL: 1.5,  hipR: 1.45, kneeR: 1.45, prop: null,     seat: true  },
  kneeling: { lean: 0.05, neck: 0.25, shL: [0.30, 0.10], elL: 0.9,  shR: [0.30, 0.10],  elR: 0.9, hipL: 0.0,   kneeL: 1.57, hipR: 0.0,  kneeR: 1.57, prop: null,     seat: false },
  reaching: { lean: -0.12, neck: -0.35, shL: [0.10, 0.15], elL: 0.2, shR: [3.0, 0.30],  elR: 0.1, hipL: -0.02, kneeL: 0.05, hipR: 0.05, kneeR: 0.1,  prop: null,     seat: false },
  carrying: { lean: -0.05, neck: 0.05, shL: [0.50, 0.20], elL: 1.07, shR: [0.50, 0.20],  elR: 1.07, hipL: 0.0,   kneeL: 0.1,  hipR: 0.0,  kneeR: 0.1,  prop: 'bundle', seat: false },
  reading:  { lean: 0.10, neck: 0.5,  shL: [0.30, 0.15], elL: 1.5,  shR: [0.30, 0.15],  elR: 1.5, hipL: -0.03, kneeL: 0.05, hipR: 0.06, kneeR: 0.15, prop: 'book',   seat: false },
};

export const RANGES = {
  lean: [-0.4, 0.6], neck: [-0.6, 0.8], shPitch: [-0.5, 3.2], shRoll: [0, 1.2],
  el: [0, 2.6], hip: [-0.6, 1.7], knee: [0, 2.0],
};
