// A horizontal axis in SVG: a line from x0 to x1 at height y, with a tick and a caption for each [x, label].
import { svgLine, svgText } from './dom.js';

export const hAxis = ({ x0, x1, y, ticks, tick = 4, labelDy = 16 }) => [
  svgLine(x0, y, x1, y, 'ax'),
  ...ticks.flatMap(([x, label]) => [svgLine(x, y, x, y + tick, 'ax'), svgText(x, y + labelDy, label, 'middle')]),
];
