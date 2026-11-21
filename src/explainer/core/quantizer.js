// Scalar quantizers on a list of numbers: the levels, which level a number rounds to, and levels fitted to the numbers.

// the index of the level nearest to x (levels sorted)
export const nearestIndex = (levels, x) => {
  let lo = 0, hi = levels.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (x - levels[mid] > levels[mid + 1] - x) lo = mid + 1; else hi = mid; }
  return lo;
};

export const evenLevels = (lo, hi, count) => Array.from({ length: count }, (_, k) => lo + (hi - lo) * k / (count - 1));

// One step of Lloyd's algorithm: every value goes to its nearest level, then each level moves to the mean of its values.
export const lloydStep = (values, levels) => {
  const sum = new Array(levels.length).fill(0), cnt = new Array(levels.length).fill(0);
  values.forEach((x) => { const k = nearestIndex(levels, x); sum[k] += x; cnt[k]++; });
  return levels.map((l, k) => (cnt[k] ? sum[k] / cnt[k] : l)).sort((a, b) => a - b);
};

// `count` levels fitted to the values: start evenly spaced over their range and repeat Lloyd's step.
export const fitLevels = (values, count, steps = 40) => {
  let levels = evenLevels(Math.min(...values), Math.max(...values), count);
  for (let i = 0; i < steps; i++) levels = lloydStep(values, levels);
  return levels;
};

// root-mean-square rounding error as a share of the values' own root-mean-square size
export const relativeRoundingError = (values, levels) => {
  let e2 = 0, w2 = 0;
  values.forEach((x) => { e2 += (x - levels[nearestIndex(levels, x)]) ** 2; w2 += x * x; });
  return Math.sqrt(e2 / w2);
};
