// The two example sets of values used by the figures about levels: a bell curve, and a lumpy cloud of three clusters.
import { gauss, rng } from './random.js';

// n values, spread out by `scale`. dist is 'bell' (a standard normal) or 'lumpy'.
export const sample = (dist, n, { scale = 1, seed = 11 } = {}) => {
  const r = rng(seed);
  if (dist === 'bell') return Array.from({ length: n }, () => gauss(r) * scale);
  const clusters = [[.45, -1.6, .35], [.35, .4, .25], [.2, 1.9, .5]];       // share, centre, spread
  return Array.from({ length: n }, () => { let u = r(), c = clusters[0]; for (const k of clusters) { if (u < k[0]) { c = k; break; } u -= k[0]; } return (c[1] + c[2] * gauss(r)) * scale; });
};
