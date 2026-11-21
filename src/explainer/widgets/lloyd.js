import { ranges } from '../core/controls.js';
import { $, sv } from '../core/dom.js';
import { gauss, rng } from '../core/random.js';

// 10. Lloyd's algorithm, step by step: the levels start evenly spaced and move to where the values are
export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout'), N = 4000, st = { step: 0 }, ctl = ranges(fig, () => { init(); draw(); });
  const r = rng(11), gs = () => gauss(r);
  const xs = Array.from({ length: N }, gs), BINS = 61, LO = -4, HI = 4, hist = new Array(BINS).fill(0);
  xs.forEach((x) => { const b = Math.floor((x - LO) / (HI - LO) * BINS); if (b >= 0 && b < BINS) hist[b]++; });
  let levels = [], errs = [], timer = 0;
  const mse = (lv) => xs.reduce((a, x) => { let m = 1e9; for (const l of lv) m = Math.min(m, (x - l) ** 2); return a + m; }, 0) / N;
  const init = () => { clearInterval(timer); const L = 2 ** ctl.bits; levels = Array.from({ length: L }, (_, k) => -3 + k * 6 / (L - 1)); errs = [mse(levels)]; st.step = 0; };
  const step = () => {
    const L = levels.length, sum = new Array(L).fill(0), cnt = new Array(L).fill(0);
    xs.forEach((x) => { let bi = 0, bd = 1e9; levels.forEach((l, k) => { const d = (x - l) ** 2; if (d < bd) { bd = d; bi = k; } }); sum[bi] += x; cnt[bi]++; });
    const next = levels.map((l, k) => (cnt[k] ? sum[k] / cnt[k] : l)), moved = Math.max(...next.map((l, k) => Math.abs(l - levels[k])));
    levels = next; errs.push(mse(levels)); st.step++; return moved;
  };
  const X = (v) => 20 + (v - LO) / (HI - LO) * 600, top = Math.max(...hist), word = (x, y, t, a, c) => { const e = sv('text', { x, y, 'text-anchor': a, class: c || 'lbl' }); e.textContent = t; return e; };
  const draw = () => {
    const kids = [], bw = 600 / BINS;
    hist.forEach((c, i) => { const h = c / top * 110; kids.push(sv('rect', { x: 20 + i * bw + 1, y: 150 - h, width: bw - 2, height: h, class: 'bar' })); });
    kids.push(sv('line', { x1: 20, x2: 620, y1: 150, y2: 150, class: 'ax' }));
    for (let v = -3; v <= 3; v++) { kids.push(sv('line', { x1: X(v), x2: X(v), y1: 150, y2: 155, class: 'ax' }), word(X(v), 170, v, 'middle')); }
    kids.push(word(320, 190, 'value (in units of the typical size of a weight)', 'middle'));
    for (let k = 0; k < levels.length - 1; k++) { const cut = (levels[k] + levels[k + 1]) / 2; kids.push(sv('line', { x1: X(cut), x2: X(cut), y1: 30, y2: 150, class: 'cut' })); }
    levels.forEach((l) => kids.push(sv('line', { x1: X(l), x2: X(l), y1: 22, y2: 150, class: 'lv' })));
    if (levels.length <= 4) levels.forEach((l) => kids.push(word(X(l), 16, l.toFixed(2), 'middle', 'lbl lvt')));
    svg.replaceChildren(...kids);
    const e0 = errs[0], e1 = errs[errs.length - 1], pc = (v) => (v * 100).toFixed(1) + '%';
    note.textContent = st.step === 0
      ? `${levels.length} levels, evenly spaced. Average squared error: ${pc(e0)} of the values' variance. Press "next step".`
      : `Step ${st.step}: error ${pc(e1)}, down from ${pc(e0)} with evenly spaced levels (${((1 - e1 / e0) * 100).toFixed(0)}% less). The levels have crowded toward the middle, where most values are.`;
  };
  $(fig, '[data-act=next]').addEventListener('click', () => { step(); draw(); });
  $(fig, '[data-act=reset]').addEventListener('click', () => { init(); draw(); });
  $(fig, '[data-act=run]').addEventListener('click', () => { clearInterval(timer); timer = setInterval(() => { const moved = step(); draw(); if (moved < 1e-3 || st.step >= 60) clearInterval(timer); }, 350); });
  init(); draw();
};
