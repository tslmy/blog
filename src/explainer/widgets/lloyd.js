import { hAxis } from '../core/axis.js';
import { choice, ranges } from '../core/controls.js';
import { $, sv, svgText } from '../core/dom.js';
import { sample } from '../core/distributions.js';
import { evenLevels, lloydStep } from '../core/quantizer.js';

// Lloyd's algorithm, step by step: the levels start evenly spaced and move to where the values are.
// The values are either a lumpy cloud (three clusters) or a bell curve.
const N = 4000, BINS = 61, LO = -4, HI = 4;

export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout'), st = { step: 0 };
  const ctl = ranges(fig, () => init()), dist = choice(fig, 'dist', () => init());
  let xs = [], hist = [], top = 1, levels = [], errs = [], timer = 0;
  const mse = (lv) => xs.reduce((a, x) => { let m = 1e9; for (const l of lv) m = Math.min(m, (x - l) ** 2); return a + m; }, 0) / N;
  const init = () => {
    clearInterval(timer);
    xs = sample(dist.value, N); hist = new Array(BINS).fill(0); top = 1;
    xs.forEach((x) => { const b = Math.floor((x - LO) / (HI - LO) * BINS); if (b >= 0 && b < BINS) hist[b]++; });
    top = Math.max(...hist);
    levels = evenLevels(-3, 3, 2 ** ctl.bits); errs = [mse(levels)]; st.step = 0; draw();
  };
  const step = () => { const next = lloydStep(xs, levels), moved = Math.max(...next.map((l, k) => Math.abs(l - levels[k]))); levels = next; errs.push(mse(levels)); st.step++; return moved; };
  const X = (v) => 20 + (v - LO) / (HI - LO) * 600;
  const draw = () => {
    const bw = 600 / BINS, kids = hist.map((c, i) => { const h = c / top * 110; return sv('rect', { x: 20 + i * bw + 1, y: 150 - h, width: bw - 2, height: h, class: 'bar' }); });
    kids.push(...hAxis({ x0: 20, x1: 620, y: 150, ticks: [-3, -2, -1, 0, 1, 2, 3].map((v) => [X(v), v]), tick: 5, labelDy: 20 }), svgText(320, 190, 'value (in units of the typical size of a weight)', 'middle'));
    for (let k = 0; k < levels.length - 1; k++) { const cut = (levels[k] + levels[k + 1]) / 2; kids.push(sv('line', { x1: X(cut), x2: X(cut), y1: 30, y2: 150, class: 'cut' })); }
    levels.forEach((l) => kids.push(sv('line', { x1: X(l), x2: X(l), y1: 22, y2: 150, class: 'lv' })));
    if (levels.length <= 4) levels.forEach((l) => kids.push(svgText(X(l), 16, l.toFixed(2), 'middle', 'lbl lvt')));
    svg.replaceChildren(...kids);
    const e0 = errs[0], e1 = errs[errs.length - 1], pc = (v) => (v * 100).toFixed(1) + '%';
    note.textContent = st.step === 0
      ? `${levels.length} levels, evenly spaced. Average squared error: ${pc(e0)} of the values' variance. Press "next step".`
      : `Step ${st.step}: error ${pc(e1)}, down from ${pc(e0)} with evenly spaced levels (${((1 - e1 / e0) * 100).toFixed(0)}% less). The levels have moved to where the values are crowded.`;
  };
  $(fig, '[data-act=next]').addEventListener('click', () => { step(); draw(); });
  $(fig, '[data-act=reset]').addEventListener('click', () => init());
  $(fig, '[data-act=run]').addEventListener('click', () => { clearInterval(timer); timer = setInterval(() => { const moved = step(); draw(); if (moved < 1e-3 || st.step >= 60) clearInterval(timer); }, 350); });
  init();
};
