const STOPS = [
  { t: 0,   line: 0x4a5566, ground: 0x05060a },
  { t: 0.5, line: 0xd8d4cc, ground: 0x3a3a40 },
  { t: 1,   line: 0x6b6660, ground: 0xf4f1ea },
];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function lerpHex(a, b, t) {
  const ch = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function colorsFor(light) {
  const l = clamp01(light);
  const [a, b] = l < 0.5 ? [STOPS[0], STOPS[1]] : [STOPS[1], STOPS[2]];
  const t = (l - a.t) / (b.t - a.t);
  return { line: lerpHex(a.line, b.line, t), ground: lerpHex(a.ground, b.ground, t) };
}

export function fogFar(light) { return 18 + (55 - 18) * clamp01(light); }
