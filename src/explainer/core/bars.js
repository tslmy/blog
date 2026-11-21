// Horizontal stacked bars and legends, drawn in SVG, for the figures that compare what a model costs to store.
import { sv, svgText } from './dom.js';

export const SERIES = { blue: 'var(--sx-blue)', gold: 'var(--sx-gold)', red: 'var(--sx-red)', muted: 'var(--muted)' };

const dashedStyle = (color, w, dash) => `fill:none;stroke:${color};stroke-width:${w};stroke-dasharray:${dash}`;

// One bar made of parts [value, color, dashed?], `scale` pixels per unit. A dashed part is an outline, set a little apart:
// it marks something that exists but is not part of this bar's cost. Returns the nodes and the x where the bar ends.
export const stackedBar = ({ x = 10, y, height = 24, scale, parts, rx = 0 }) => {
  let at = x; const nodes = [];
  parts.forEach(([value, color, dashed]) => {
    if (dashed) at += 14;
    const width = Math.max(1.5, value * scale);
    nodes.push(sv('rect', { x: at, y, width, height, ...(rx ? { rx } : {}) }, dashed ? dashedStyle(color, 2, '5 4') : `fill:${color}`));
    at += width;
  });
  return { nodes, end: at };
};

// A bar with its name to the left (right-aligned at labelX) and a value after it.
export const barRow = ({ label, labelX = 180, x = 190, y, height = 24, scale, parts, value, rx = 0 }) => {
  const { nodes, end } = stackedBar({ x, y, height, scale, parts, rx });
  return [svgText(labelX, y + height * .62, label, 'end', 'lbl rowname'), ...nodes, svgText(end + 8, y + height * .66, value, 'start', 'lbl val')];
};

// A row of colour swatches with captions, wrapped at maxX; items are [color, text, dashed?]. Returns the nodes and the y of the last line.
export const legend = ({ x: x0 = 10, y, items, maxX = 640 }) => {
  let x = x0; const nodes = [];
  items.forEach(([color, text, dashed]) => {
    const width = 15 + text.length * 6.1 + 22;
    if (x > x0 && x + width > maxX) { x = x0; y += 17; }
    nodes.push(sv('rect', { x, y: y - 9, width: 10, height: 10 }, dashed ? dashedStyle(color, 1.6, '3 2') : `fill:${color}`), svgText(x + 15, y, text));
    x += width;
  });
  return { nodes, y };
};
