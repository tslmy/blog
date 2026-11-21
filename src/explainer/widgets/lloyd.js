import { hAxis } from '../core/axis.js';
import { SERIES, barRow } from '../core/bars.js';
import { choice, ranges } from '../core/controls.js';
import { $, sv, svgLine, svgText } from '../core/dom.js';
import { sample } from '../core/distributions.js';
import { minifloatLevels } from '../core/floats.js';
import { evenLevels, lloydStep } from '../core/quantizer.js';

// Lloyd's algorithm, step by step: the levels start evenly spaced and move to where the values are.
// The values are either a lumpy cloud (three clusters) or a bell curve.
const N = 4000, BINS = 61, LO = -4, HI = 4;

export default (fig) => {
  const svg = $(fig, 'svg.sx-ll'), cmp = $(fig, '[data-v=cmp]'), note = $(fig, '.sx-readout'), st = { step: 0 };
  const ctl = ranges(fig, () => init()), dist = choice(fig, 'dist', () => init());
  let xs = [], hist = [], top = 1, levels = [], errs = [], timer = 0, power = 1, tiny = { err: 1, name: '' };
  const mse = (lv) => xs.reduce((a, x) => { let m = 1e9; for (const l of lv) m = Math.min(m, (x - l) ** 2); return a + m; }, 0) / N;
  // the best tiny float with ctl.bits bits in all (sign, exponent, mantissa), after scaling it by the best power of two
  const bestFloat = () => {
    let best = { err: Infinity, name: '' };
    for (let e = 1; e <= ctl.bits - 1; e++) {
      const m = ctl.bits - 1 - e, base = minifloatLevels(e, m);
      for (let k = -8; k <= 8; k++) { const err = mse(base.map((l) => l * 2 ** k)); if (err < best.err) best = { err, name: `${e} exponent and ${m} mantissa bit${m === 1 ? '' : 's'}` }; }
    }
    return { err: best.err / power, name: best.name };
  };
  const init = () => {
    clearInterval(timer);
    xs = sample(dist.value, N); hist = new Array(BINS).fill(0); top = 1;
    xs.forEach((x) => { const b = Math.floor((x - LO) / (HI - LO) * BINS); if (b >= 0 && b < BINS) hist[b]++; });
    top = Math.max(...hist);
    power = xs.reduce((a, x) => a + x * x, 0) / N;
    tiny = bestFloat(); levels = evenLevels(-3, 3, 2 ** ctl.bits); errs = [mse(levels)]; st.step = 0; draw();
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
    const vals = [['tiny float', tiny.err, SERIES.muted], ['evenly spaced', e0 / power, SERIES.blue], ['fitted (now)', e1 / power, SERIES.gold]], hi = Math.max(...vals.map((v) => v[1])) * 1.1;
    const X0 = 430, X1 = 620, Y0 = 100, Y1 = 14, hiH = errs[0] / power, SX = (k) => X0 + (X1 - X0) * k / Math.max(8, errs.length - 1), SY = (e) => Y0 - (Y0 - Y1) * e / hiH;
    cmp.replaceChildren(...vals.flatMap(([label, v, color], i) => barRow({ label, labelX: 105, x: 115, y: 12 + i * 34, height: 22, scale: 200 / hi, parts: [[v, color]], value: pc(v) })),
      svgText(X0, 8, 'error after each step', 'start'), svgLine(X0, Y0, X1, Y0, 'ax'), svgLine(X0, Y0, X0, Y1, 'ax'),
      sv('polyline', { points: errs.map((e, k) => `${SX(k)},${SY(e / power)}`).join(' '), fill: 'none', stroke: SERIES.gold, 'stroke-width': 2 }), svgText(X0 - 4, Y0 + 4, '0', 'end'), svgText(X0 - 4, Y1 + 4, pc(hiH), 'end'), svgText((X0 + X1) / 2, Y0 + 18, 'steps', 'middle'));
    note.textContent = (st.step === 0
      ? `${levels.length} levels, evenly spaced. Average squared error: ${pc(e0 / power)} of the values' average squared size. Press "next step".`
      : `Step ${st.step}: error ${pc(e1 / power)}, down from ${pc(e0 / power)} with evenly spaced levels (${((1 - e1 / e0) * 100).toFixed(0)}% less). The levels have moved to where the values are crowded.`)
      + ` For comparison, with the same ${ctl.bits} bits a float splits them as ${tiny.name} (the best split, with the best power-of-two scale) and gets ${pc(tiny.err)}.`;
  };
  $(fig, '[data-act=next]').addEventListener('click', () => { step(); draw(); });
  $(fig, '[data-act=reset]').addEventListener('click', () => init());
  $(fig, '[data-act=run]').addEventListener('click', () => { clearInterval(timer); timer = setInterval(() => { const moved = step(); draw(); if (moved < 1e-3 || st.step >= 60) clearInterval(timer); }, 350); });
  init();
};
