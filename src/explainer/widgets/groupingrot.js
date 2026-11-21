import { divColor, goldColor, redColor } from '../core/colors.js';
import { ranges } from '../core/controls.js';
import { $, sv, svgText } from '../core/dom.js';
import { fwht } from '../core/linalg.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';
import { fillTable } from '../core/table.js';
import { quantizeGroups, relativeError, toyMatrix } from '../core/toymatrix.js';

// The toy matrix of the grouping figure with every group rotated: unrotated on the left, rotated on the right.
const SIZES = [64, 32, 16, 8, 4], CW = 4.8, RH = 11, GAP = 25.6, TOP = 16;

export default (fig) => {
  const toy = toyMatrix(), { R, C } = toy;
  const rotate = (m, gs) => m.map((row) => { const out = []; for (let g = 0; g < C; g += gs) out.push(...fwht(row.slice(g, g + gs))); return out; });
  const wsvg = $(fig, '[data-v=w]'), ssvg = $(fig, '[data-v=s]'), esvg = $(fig, '[data-v=e]'), tab = $(fig, '.sx-stat');
  const X0 = [0, C * CW + GAP], VB = `0 0 ${2 * C * CW + GAP} ${TOP + R * RH}`;
  const ctl = ranges(fig, () => draw(), { g: (i) => `${C / SIZES[i]} of ${SIZES[i]}`, osize: (v) => v + '×' });
  // two panels side by side in one svg, titled "Unrotated" and "Rotated"; build(i) draws panel i
  const panel = (svg, build) => { svg.setAttribute('viewBox', VB); const g = sv('g', { transform: `translate(0,${TOP})` }); [0, 1].forEach((i) => g.append(...build(i))); svg.replaceChildren(svgText(0, 11, 'Unrotated'), svgText(X0[1], 11, 'Rotated'), g); };
  const draw = () => {
    const gs = SIZES[ctl.g], a = toy.values(ctl.nout, ctl.osize), b = rotate(a, gs), qa = quantizeGroups(a, gs), qb = quantizeGroups(b, gs);
    const og = toy.outlierGroups(ctl.nout, gs), cells = toy.outlierCells(ctl.nout), gm = Math.max(...a.flat().map(Math.abs));
    const common = (i) => ({ R, C, CW, RH, gs, x0: X0[i] });
    panel(wsvg, (i) => matrixCells({ ...common(i), color: (r, c) => divColor((i ? b : a)[r][c], 3), outline: i ? null : (r, c) => cells.has(r * C + c) }));
    panel(ssvg, (i) => matrixGroups({ ...common(i), color: (r, g) => goldColor((i ? qb : qa).top[r][g], gm), outline: (r, g) => og[r][g] }));
    panel(esvg, (i) => matrixCells({ ...common(i), color: (r, c) => redColor((i ? qb : qa).err[r][c], .5) }));
    const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%'), both = (keep) => [pct(relativeError(a, qa.err, gs, keep)), pct(relativeError(b, qb.err, gs, keep))];
    fillTable(tab, [['Relative rounding error', 'Unrotated', 'Rotated'], ['All groups', ...both()], ['Groups with an outlier', ...both((r, g) => og[r][g])], ['The other groups', ...both((r, g) => !og[r][g])]]);
  };
  $(fig, '[data-act=new]').addEventListener('click', () => { toy.reroll(); draw(); });
  draw();
};
