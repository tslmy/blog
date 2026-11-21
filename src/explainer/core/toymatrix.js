// The toy weight matrix of the grouping figures: 12 rows of 64 weights, each row with its own scale, and up to one outlier
// per row (in random rows, so every outlier sits in a group of its own at any group size).
import { gauss, nextSeed, rng } from './random.js';

export const toyMatrix = ({ R = 12, C = 64, seed = 7 } = {}) => {
  let base = [], outs = [];
  const regenerate = () => {
    const rand = rng(seed);
    base = Array.from({ length: R }, () => { const scale = Math.exp(.35 * gauss(rand)); return Array.from({ length: C }, () => gauss(rand) * scale); });
    const rows = Array.from({ length: R }, (_, i) => i);
    for (let i = R - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    outs = rows.map((r) => ({ r, c: Math.floor(rand() * C), sign: rand() < .5 ? -1 : 1, u: rand() }));
  };
  regenerate();
  return {
    R, C,
    reroll() { seed = nextSeed(seed); regenerate(); },
    // the matrix with its first `count` outliers, each `size` times the typical weight
    values(count, size) { const m = base.map((row) => row.slice()); outs.slice(0, count).forEach(({ r, c, sign, u }) => { m[r][c] = sign * size * (.75 + .5 * u); }); return m; },
    outlierCells(count) { return new Set(outs.slice(0, count).map(({ r, c }) => r * C + c)); },
    // for groups of gs columns: which groups hold an outlier
    outlierGroups(count, gs) { const f = Array.from({ length: R }, () => new Array(C / gs).fill(false)); outs.slice(0, count).forEach(({ r, c }) => { f[r][Math.floor(c / gs)] = true; }); return f; },
  };
};

// Rounds every group of gs columns to 16 evenly spaced levels reaching its largest weight (the plain scheme). Returns the
// rounding error of each weight, and each group's largest weight and gap between levels.
export const quantizeGroups = (m, gs) => {
  const err = [], top = [], step = [];
  m.forEach((row) => {
    const er = [], tp = [], st = [];
    for (let g = 0; g < row.length / gs; g++) {
      const group = row.slice(g * gs, (g + 1) * gs), mx = Math.max(...group.map(Math.abs)), gap = 2 * mx / 15;
      tp.push(mx); st.push(gap);
      group.forEach((x) => er.push(Math.abs(x - (gap ? Math.round((x + mx) / gap) * gap - mx : 0))));
    }
    err.push(er); top.push(tp); step.push(st);
  });
  return { err, top, step };
};

// Relative rounding error (size of the errors over size of the weights) of the groups for which keep(row, group) holds; null if none.
export const relativeError = (m, err, gs, keep = () => true) => {
  let e2 = 0, w2 = 0, n = 0;
  m.forEach((row, r) => { for (let g = 0; g < row.length / gs; g++) { if (!keep(r, g)) continue; n++; for (let c = g * gs; c < (g + 1) * gs; c++) { e2 += err[r][c] ** 2; w2 += row[c] ** 2; } } });
  return n ? Math.sqrt(e2 / w2) : null;
};
