import { hAxis } from '../core/axis.js';
import { choice, ranges } from '../core/controls.js';
import { $, sv, svgText } from '../core/dom.js';
import { sample } from '../core/distributions.js';
import { relativeRoundingError } from '../core/quantizer.js';

// What chopping bits off a float does to the levels: a sign bit, `e` exponent bits and `m` mantissa bits, as in IEEE floats
// (without the codes reserved for infinity and NaN). The weights are either a bell curve of typical size 0.25 or a lumpy cloud.
const N = 3000, BINS = 40, SCALE = { bell: .25, lumpy: .35 }, NAME = { bell: 'a bell curve of typical size 0.25', lumpy: 'a lumpy cloud' };

// every value a float with e exponent bits and m mantissa bits can hold, sorted
export const minifloatLevels = (e, m) => {
  const bias = 2 ** (e - 1) - 1, mags = new Set();
  for (let E = 0; E < 2 ** e; E++) for (let M = 0; M < 2 ** m; M++) mags.add(E === 0 ? (M / 2 ** m) * 2 ** (1 - bias) : (1 + M / 2 ** m) * 2 ** (E - bias));
  return [...mags].flatMap((v) => (v ? [-v, v] : [0])).sort((a, b) => a - b);
};

export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout');
  const ctl = ranges(fig, () => draw()), dist = choice(fig, 'dist', () => load());
  let ws = [], hist = [], top = 1, reach = 1;
  const load = () => {                                         // new weights; `reach` is how far from zero 99% of them stay
    ws = sample(dist.value, N, { scale: SCALE[dist.value], seed: 8 }); hist = new Array(BINS).fill(0);
    ws.forEach((w) => { const b = Math.floor((w + 1) / 2 * BINS); if (b >= 0 && b < BINS) hist[b]++; });
    top = Math.max(...hist); reach = ws.map(Math.abs).sort((a, b) => a - b)[Math.floor(.99 * N)]; draw();
  };
  const X = (v) => 20 + (v + 1) / 2 * 600;
  const draw = () => {
    const levels = minifloatLevels(ctl.e, ctl.m), bits = 1 + ctl.e + ctl.m, inPlot = levels.filter((l) => Math.abs(l) <= 1), near = levels.filter((l) => Math.abs(l) <= reach).length;
    const kids = hist.map((c, i) => sv('rect', { x: 20 + i * 600 / BINS + 1, y: 90 - c / top * 70, width: 600 / BINS - 2, height: c / top * 70, class: 'bar' }));
    inPlot.forEach((l) => kids.push(sv('line', { x1: X(l), x2: X(l), y1: 96, y2: 126, class: 'lv' })));
    kids.push(...hAxis({ x0: 20, x1: 620, y: 132, ticks: [-1, -.5, 0, .5, 1].map((v) => [X(v), v]) }), svgText(320, 164, `value (the weights are ${NAME[dist.value]})`, 'middle'));
    svg.replaceChildren(...kids);
    const err = relativeRoundingError(ws, levels), big = levels[levels.length - 1];
    note.textContent = `1 sign + ${ctl.e} exponent + ${ctl.m} mantissa = ${bits} bits, so ${2 ** bits} codes and ${levels.length} different levels. Largest value: ${big < 100 ? Number(big.toPrecision(3)) : '>100'}. ${near} of the levels fall where the weights are (within ${reach.toFixed(2)} of zero, which holds 99% of them); the other ${levels.length - near} sit where almost none are. Rounding error: ${(err * 100).toFixed(1)}% of the weights' size.`;
  };
  load();
};
