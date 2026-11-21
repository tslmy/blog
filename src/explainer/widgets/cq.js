import { $, sv } from '../core/dom.js';
import { gauss, rng } from '../core/random.js';
import { gaussianLevels } from '../core/gaussian.js';
import { fwht } from '../core/linalg.js';
import { reseedable, switches } from '../core/controls.js';

// 7. Quantizing one group: evenly spaced levels vs rotation + Gaussian codebook
export default (fig) => {
  const G = 32, SIGMA = 0.02;   // group size shown; weight scale
  // heavy tails: Student's t with 3 degrees of freedom, a common model for weights with outliers
  const sample = (r) => state.heavy ? gauss(r) / Math.sqrt((gauss(r) ** 2 + gauss(r) ** 2 + gauss(r) ** 2) / 3) : gauss(r);
  const group = (r) => Array.from({ length: G }, () => sample(r) * SIGMA);
  const norm = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  const nearest = (levels, x) => levels.reduce((b, l) => (Math.abs(l - x) < Math.abs(b - x) ? l : b), levels[0]);
  // Quantize one group with the current settings. Returns display values (in level units), the levels,
  // and the error after decoding, relative to the group's own size (rms).
  const quant = (w) => {
    const bits = state.bits4 ? 4 : 2, n = 1 << bits, v = state.rotate ? fwht(w) : w;
    let s, levels;
    if (state.codebook) { s = norm(v) / Math.sqrt(G); levels = gaussianLevels(n); }          // length-scaled Gaussian codebook
    else {                                                                          // evenly spaced up to the largest value
      const m = Math.max(...v.map(Math.abs)); s = m / 3;
      levels = Array.from({ length: n }, (_, k) => (-m + (2 * m / n) * (k + 0.5)) / s);
    }
    const shown = v.map((x) => x / s), q = shown.map((x) => nearest(levels, x) * s);
    const back = state.rotate ? fwht(q) : q;                                      // the rotation is its own inverse
    const err = norm(w.map((x, i) => x - back[i])) / norm(w);
    return { shown, levels, err, n };
  };
  const state = switches(fig, () => draw()), seed = reseedable(fig, 11, () => draw());
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note');
  const draw = () => {
    const w = group(rng(seed())), { shown, levels, err, n } = quant(w);
    const r = rng(4242); let avg = 0; for (let i = 0; i < 500; i++) avg += quant(group(r)).err / 500;
    const big = w.reduce((b, x, i) => (Math.abs(x) > Math.abs(w[b]) ? i : b), 0);
    const R = Math.max(1.6, ...shown.map(Math.abs), ...levels.map(Math.abs)) * 1.08, X = (x) => 20 + ((x + R) / (2 * R)) * 600;
    const kids = [sv('line', { x1: 20, x2: 620, y1: 112, y2: 112, class: 'ax' })];
    levels.forEach((l) => kids.push(sv('line', { x1: X(l), x2: X(l), y1: 104, y2: 120, class: 'level' })));
    shown.forEach((x, i) => {
      const y = 18 + (i % 6) * 13;
      kids.push(sv('line', { x1: X(x), x2: X(nearest(levels, x)), y1: y, y2: 104, class: 'snap' }));
      kids.push(sv('circle', { cx: X(x), cy: y, r: 4, class: !state.rotate && i === big ? 'dot out' : 'dot' }));
    });
    const t = sv('text', { x: 20, y: 142, class: 'lbl' }); t.textContent = `${n} levels`; kids.push(t);
    svg.replaceChildren(...kids);
    const used = new Set(shown.map((x) => nearest(levels, x))).size;
    note.textContent = `${state.rotate ? 'Rotated' : 'Raw'} weights, ${state.codebook ? 'Gaussian codebook' : 'evenly spaced levels'}, ${state.bits4 ? 4 : 2} bits: these ${G} values use ${used} of ${n} levels. `
      + `Error after decoding: ${(err * 100).toFixed(0)}% of the group's size here, ${(avg * 100).toFixed(0)}% on average over 500 random groups.`
      + (!state.rotate && !state.codebook ? ' The largest weight (red) sets the spacing, so the ordinary weights share very few levels.' : '')
      + (state.rotate && state.codebook ? ' This is the combination the iPod runs.' : '');
  };
  draw();
};
