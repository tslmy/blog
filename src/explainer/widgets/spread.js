import { $, sv } from '../core/dom.js';
import { gauss, rng } from '../core/random.js';
import { fwht } from '../core/linalg.js';
import { reseedable } from '../core/controls.js';

// 7. Rotation spreads outliers: bars and histograms before and after
export default (fig) => {
  const state = { n: 64, k: 1, s: 20, zoom: false }, seed = reseedable(fig, 7, () => draw());
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note');
  const stats = (x) => {                                   // crest factor and the error of plain 16 evenly spaced levels
    const m = Math.max(...x.map(Math.abs)), e = x.reduce((a, v) => a + v * v, 0), step = 2 * m / 15;
    const err = x.reduce((a, v) => a + (-m + Math.round((v + m) / step) * step - v) ** 2, 0);
    return { crest: m / Math.sqrt(e / x.length), err: Math.sqrt(err / e) };
  };
  const bars = (x, R, y0, cls) => {
    const kids = [sv('line', { x1: 20, x2: 620, y1: y0 + 35, y2: y0 + 35, class: 'ax' })], bw = 600 / x.length;
    x.forEach((v, i) => { const h = Math.abs(v) / R * 33; kids.push(sv('rect', { x: 20 + i * bw + (bw > 3 ? .5 : 0), y: v >= 0 ? y0 + 35 - h : y0 + 35, width: Math.max(bw - (bw > 3 ? 1 : 0), .6), height: Math.max(h, .5), class: cls })); });
    return kids;
  };
  const hist = (x, R, y0, cls) => {
    const B = 41, c = new Array(B).fill(0), base = y0 + 40; x.forEach((v) => { c[Math.max(0, Math.min(B - 1, Math.floor((v + R) / (2 * R) * B)))]++; });
    const top = Math.max(1, ...c), bw = 600 / B, kids = [sv('line', { x1: 20, x2: 620, y1: base, y2: base, class: 'ax' })];
    c.forEach((v, i) => { if (v) kids.push(sv('rect', { x: 20 + i * bw + 1, y: base - v / top * 36, width: bw - 2, height: v / top * 36, class: cls })); });
    [[20, 'start', -R], [320, 'middle', 0], [620, 'end', R]].forEach(([x0, anchor, val]) => { const t = sv('text', { x: x0, y: base + 13, 'text-anchor': anchor, class: 'lbl' }); t.textContent = (val > 0 ? '+' : '') + (Math.abs(val) < 10 ? val.toFixed(1) : Math.round(val)); kids.push(t); });
    return kids;
  };
  const draw = () => {
    const r = rng(seed()), g = () => gauss(r);
    const x = Array.from({ length: state.n }, g), k = Math.min(state.k, state.n);
    for (let j = 0; j < k; j++) x[Math.floor(r() * state.n)] = (r() < .5 ? -1 : 1) * state.s;
    const y = fwht(x), mx = Math.max(...x.map(Math.abs)), my = Math.max(...y.map(Math.abs)), R = Math.max(mx, my);
    const Rx = state.zoom ? mx : R, Ry = state.zoom ? my : R;
    const label = (txt, yy) => { const t = sv('text', { x: 20, y: yy, class: 'lbl' }); t.textContent = txt; return t; };
    svg.replaceChildren(label('before rotation', 10), ...bars(x, R, 12, 'bar before'), ...hist(x, Rx, 50, 'bar before'),
      label('after rotation', 175), ...bars(y, R, 177, 'bar after'), ...hist(y, Ry, 215, 'bar after'));
    const a = stats(x), b = stats(y);
    note.textContent = `${state.n} weights, ${k} outlier${k === 1 ? '' : 's'}. Largest value over typical value: ${a.crest.toFixed(1)}× before, ${b.crest.toFixed(1)}× after. `
      + `Rounding to 16 evenly spaced levels sized to the largest value gives an error of ${(a.err * 100).toFixed(0)}% before and ${(b.err * 100).toFixed(0)}% after.`;
  };
  fig.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => {
    state[i.dataset.k] = i.dataset.k === 'n' ? 2 ** +i.value : +i.value;
    $(fig, `[data-o=${i.dataset.k}]`).textContent = state[i.dataset.k]; draw();
  }));
  fig.querySelectorAll('button[data-k=zoom]').forEach((b) => b.addEventListener('click', () => { state.zoom = !state.zoom; b.setAttribute('aria-pressed', String(state.zoom)); draw(); }));
  draw();
};
