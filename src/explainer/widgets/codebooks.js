import { SERIES, legend, stackedBar } from '../core/bars.js';
import { ranges } from '../core/controls.js';
import { $, svgText } from '../core/dom.js';

// What one group stores with one shared codebook and with a fresh codebook per group, drawn in proportion.
const SIZES = [8, 16, 32, 64, 128, 256], NUMBER_BITS = [8, 16, 32];
const fmt = (v) => v.toLocaleString('en-US');

export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout');
  const ctl = ranges(fig, () => draw(), { g: (i) => SIZES[i], b: (b) => `${b} (${2 ** b} levels)`, c: (i) => NUMBER_BITS[i] + ' bits' });
  const draw = () => {
    const G = SIZES[ctl.g], B = ctl.b, C = NUMBER_BITS[ctl.c], L = 2 ** B, idx = G * B, book = L * C;
    const scale = 600 / (idx + C + book + 14), { blue, gold, red } = SERIES;          // the longest row is the shared one, with its dashed codebook
    const indices = [blue, `indices: ${G} × ${B} = ${fmt(idx)} bits`];
    const shared = legend({ y: 78, items: [indices, [gold, `scale: ${C} bits`], [red, `codebook: ${L} × ${C} = ${fmt(book)} bits, stored once for the whole model`, true]] });
    const y = shared.y + 34;
    const fresh = legend({ y: y + 62, items: [indices, [red, `its own codebook: ${L} × ${C} = ${fmt(book)} bits (it replaces the scale)`]] });
    svg.setAttribute('viewBox', `0 0 640 ${fresh.y + 10}`);
    svg.replaceChildren(
      svgText(10, 16, `Shared codebook: ${fmt(idx + C)} bits per group, ${(B + C / G).toFixed(2)} bits per weight`, 'start', 'lbl rowname'),
      ...stackedBar({ y: 24, height: 34, scale, parts: [[idx, blue], [C, gold], [book, red, true]] }).nodes, ...shared.nodes,
      svgText(10, y, `Fresh codebook per group: ${fmt(idx + book)} bits per group, ${(B + book / G).toFixed(2)} bits per weight`, 'start', 'lbl rowname'),
      ...stackedBar({ y: y + 8, height: 34, scale, parts: [[idx, blue], [book, red]] }).nodes, ...fresh.nodes,
    );
    note.textContent = `A fresh codebook makes a group ${((idx + book) / (idx + C)).toFixed(1)} times as large as the shared scheme does. Both bars are drawn to the same scale. A number in the codebook, and the scale, take ${C} bits each.`;
  };
  draw();
};
