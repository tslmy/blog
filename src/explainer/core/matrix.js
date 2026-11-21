// Heatmaps of weight matrices drawn as SVG cells, shared by the grouping figures.
import { sv } from './dom.js';
// White lines: between the groups of each row, and (rows) between the rows. R rows of C columns, groups of gs columns, cells CW by RH, shifted right by x0.
export const gridLines = ({ R, C, CW, RH, gs, x0 = 0, rows }) => {
  const kids = [], ng = C / gs;
  if (rows) for (let r = 1; r < R; r++) kids.push(sv('line', { x1: x0, x2: x0 + C * CW, y1: r * RH, y2: r * RH, class: 'gl' }));
  for (let r = 0; r < R; r++) for (let g = 1; g < ng; g++) kids.push(sv('line', { x1: x0 + g * gs * CW, x2: x0 + g * gs * CW, y1: r * RH, y2: (r + 1) * RH, class: 'gl' }));
  return kids;
};
// One rectangle per weight. color(r, c) fills it; label(r, g), if given, prints a number on each group; outline(r, c), if given, marks a cell.
export const matrixCells = ({ R, C, CW, RH, gs, x0 = 0, rows, color, label, outline }) => {
  const kids = [], ng = C / gs;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) kids.push(sv('rect', { x: x0 + c * CW, y: r * RH, width: CW + .4, height: RH + .4 }, `fill:${color(r, c)}`));
  kids.push(...gridLines({ R, C, CW, RH, gs, x0, rows: rows === undefined ? ng > 1 : rows }));
  if (outline) for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (outline(r, c)) kids.push(sv('rect', { x: x0 + c * CW + .75, y: r * RH + .75, width: CW - 1.5, height: RH - 1.5, class: 'olc' }));
  if (label) for (let r = 0; r < R; r++) for (let g = 0; g < ng; g++) { const t = sv('text', { x: x0 + (g + .5) * gs * CW, y: r * RH + RH * .5, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'gv' }); t.textContent = label(r, g); kids.push(t); }
  return kids;
};
// One block per group, as wide as the group: for the heatmap of the scales. color(r, g) fills it.
export const matrixGroups = ({ R, C, CW, RH, gs, x0 = 0, rows, color, outline }) => {
  const kids = [], ng = C / gs;
  for (let r = 0; r < R; r++) for (let g = 0; g < ng; g++) kids.push(sv('rect', { x: x0 + g * gs * CW, y: r * RH, width: gs * CW + .4, height: RH + .4 }, `fill:${color(r, g)}`));
  kids.push(...gridLines({ R, C, CW, RH, gs, x0, rows: rows === undefined ? ng > 1 : rows }));
  if (outline) for (let r = 0; r < R; r++) for (let g = 0; g < ng; g++) if (outline(r, g)) kids.push(sv('rect', { x: x0 + g * gs * CW + 1, y: r * RH + 1, width: gs * CW - 2, height: RH - 2, class: 'olg' }));   // marks a group, e.g. one that contains an outlier
  return kids;
};
