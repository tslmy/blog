// Small floating-point formats: every value a float with e exponent bits and m mantissa bits can hold.
// As in IEEE floats there is a sign bit, the stored exponent is offset by a bias, and the smallest exponent code means tiny
// numbers without a leading 1. (The codes reserved for infinity and NaN are counted as ordinary numbers.)
// sorted
export const minifloatLevels = (e, m) => {
  const bias = 2 ** (e - 1) - 1, mags = new Set();
  for (let E = 0; E < 2 ** e; E++) for (let M = 0; M < 2 ** m; M++) mags.add(E === 0 ? (M / 2 ** m) * 2 ** (1 - bias) : (1 + M / 2 ** m) * 2 ** (E - bias));
  return [...mags].flatMap((v) => (v ? [-v, v] : [0])).sort((a, b) => a - b);
};

