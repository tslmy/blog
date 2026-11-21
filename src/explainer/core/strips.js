// "How much does each group lose?": one horizontal strip per kind of group, a mark for every group at its loss, the
// strip's mean as a line, and a shared axis below. Used by the three figures that compare groups with and without a spike.
import { hAxis } from './axis.js';
import { sv, svgLine, svgText } from './dom.js';
import { mean } from './stats.js';

export const countLabel = (list) => `${list.length} group${list.length === 1 ? '' : 's'}`;

// rows: [{ lines: [name, ...more text], y, items: [{ loss, ... }], mark?: (item, cx, cy, k) => nodes }]; x0..x1 is the width of the strips.
export const lossStrips = ({ rows, top, x0 = 170, x1 = 620, axisY = 156, format, caption, step }) => {
  const X = (v) => x0 + (x1 - x0) * v / top, ticks = [];
  for (let v = 0; v <= top; v += step ?? (top > 1 ? .5 : top > .5 ? .25 : .1)) ticks.push([X(v), format(v)]);
  const nodes = [...hAxis({ x0, x1, y: axisY, ticks, tick: 5, labelDy: 18 }), svgText((x0 + x1) / 2, axisY + 36, caption, 'middle')];
  rows.forEach(({ lines, y, items, mark }) => {
    lines.forEach((text, i) => nodes.push(svgText(10, y - 8 + i * 15, text, 'start', i ? 'lbl' : 'lbl rowname')));
    items.forEach((item, k) => {
      const cx = X(item.loss), cy = y + (mark ? ((k % 3) - 1) * 20 : (((k * 37) % 17) - 8) * 2);
      nodes.push(...(mark ? mark(item, cx, cy, k) : [svgCircle(cx, cy, item.color)]));
    });
    if (items.length) { const mu = mean(items.map((g) => g.loss)); nodes.push(svgLine(X(mu), y - 38, X(mu), y + 38, 'mean'), svgText(X(mu), y - 42, 'mean ' + format(mu), 'middle', 'lbl meant')); }
  });
  return nodes;
};

const svgCircle = (cx, cy, color) => sv('circle', { cx, cy, r: 3.6, class: 'odot' }, `fill:${color}`);

// The sentence under a strips figure: what the spiky and flat groups lose on average, and how the two compare.
export const spikyVsFlat = ({ first, second, spiky, flat, format }) => `${first} lose ${format(spiky)} of their length on average, ${second} ${format(flat)}.`
  + (flat < .005 ? ' The flat groups lose almost nothing.' : spiky >= flat * 1.05 ? ` The spiky ones lose ${(spiky / flat).toFixed(1)} times as much.` : flat >= spiky * 1.05 ? ` Now the flat ones lose more: ${(flat / spiky).toFixed(1)} times as much.` : ' About the same.');
