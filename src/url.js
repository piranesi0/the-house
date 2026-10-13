export const WORDS = ['alder', 'ash', 'bell', 'cloud', 'crane', 'dusk', 'ember', 'fern', 'gull', 'hare', 'heron', 'iron', 'ivy', 'kelp', 'lamp', 'lark', 'marble', 'mist', 'moth', 'oak', 'owl', 'pearl', 'quill', 'rain', 'reed', 'salt', 'sand', 'slate', 'snow', 'star', 'stone', 'tide', 'urn', 'vale', 'wave', 'wick', 'wren', 'yarrow', 'yew', 'zinc'];

export function randomSeed(rand = Math.random) {
  const w = () => WORDS[Math.floor(rand() * WORDS.length)];
  return `${w()}-${w()}`;
}

export function readFragment(hash) {
  const p = new URLSearchParams((hash || '').replace(/^#/, ''));
  const seed = p.get('s');
  const x = Number(p.get('x')), z = Number(p.get('z'));
  return { seed: seed && seed.length ? seed : null, x: Number.isInteger(x) ? x : 0, z: Number.isInteger(z) ? z : 0 };
}

export function writeFragment({ seed, x, z }) {
  const p = new URLSearchParams();
  p.set('s', seed); p.set('x', String(x)); p.set('z', String(z));
  return '#' + p.toString();
}
