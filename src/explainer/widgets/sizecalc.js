import { SERIES, barRow, legend } from '../core/bars.js';
import { ranges } from '../core/controls.js';
import { $, svgLine, svgText } from '../core/dom.js';

// What a model costs to store: bits per weight and group size against the iPod's RAM.
const M = 134.5e6, GROUPS = [16, 32, 64, 128, 256], RAM = 256;

export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout');
  const ctl = ranges(fig, () => draw(), { g: (i) => GROUPS[i] });
  const draw = () => {
    const bits = ctl.bits, g = GROUPS[ctl.g], bpw = bits + 32 / g, mb = M * bpw / 8 / 1e6, f32 = M * 4 / 1e6;
    const wMB = M * bits / 8 / 1e6, sMB = M * 32 / g / 8 / 1e6, scale = 430 / 600, X = (v) => 190 + v * scale;
    svg.replaceChildren(
      ...barRow({ label: '32-bit floats', y: 30, scale, parts: [[f32, SERIES.muted]], value: Math.round(f32) + ' MB' }),
      ...barRow({ label: 'this setting', y: 80, scale, parts: [[wMB, SERIES.blue], [sMB, SERIES.gold]], value: Math.round(mb) + ' MB' }),
      ...legend({ x: 190, y: 137, items: [[SERIES.blue, `weights: ${bits} bits each, ${Math.round(wMB)} MB`], [SERIES.gold, `group scales: 32 bits each, ${Math.round(sMB)} MB`]] }).nodes,
      svgLine(X(RAM), 14, X(RAM), 118, 'ramline'), svgText(X(RAM), 10, "iPod's RAM: 256 MB", 'middle', 'lbl meant'),
    );
    note.textContent = `${bits} + 32/${g} = ${bpw.toFixed(2)} bits per weight, so ${Math.round(mb)} MB: ${(mb / f32 * 100).toFixed(0)}% of the floats, and ${mb > RAM ? 'more than the iPod has' : (mb / RAM * 100).toFixed(0) + '% of the iPod\'s RAM'}. Of that, the weights take ${Math.round(wMB)} MB and the group scales ${Math.round(sMB)} MB (${(32 / g).toFixed(2)} bits per weight).`;
  };
  draw();
};
