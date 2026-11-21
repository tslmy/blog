// The Lloyd–Max levels of a standard normal distribution: the `count` levels that give the least mean squared rounding error
// for values drawn from a bell curve. Each level is the mean of the values nearest to it, and each cell ends halfway between
// two levels; repeating those two steps converges. The levels are symmetric around 0 and sorted.
const pdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
const cdf = (x) => {      // Abramowitz–Stegun 7.1.26 for erf, accurate to about 1.5e-7
  const t = 1 / (1 + .3275911 * Math.abs(x) / Math.SQRT2), poly = t * (.254829592 + t * (-.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x / 2);
  return .5 * (1 + (x < 0 ? -erf : erf));
};

const cache = {};
export const gaussianLevels = (count) => cache[count] ??= (() => {
  let levels = Array.from({ length: count }, (_, k) => -2 + 4 * k / (count - 1));
  for (let iter = 0; iter < 200; iter++) {
    const edges = [-Infinity, ...levels.slice(1).map((l, k) => (l + levels[k]) / 2), Infinity];
    levels = levels.map((_, k) => { const a = edges[k], b = edges[k + 1]; return (pdf(a) - pdf(b)) / (cdf(b) - cdf(a)); });
  }
  return levels;
})();
