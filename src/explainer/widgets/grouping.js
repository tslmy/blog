import { channel } from '../core/channel.js';
import { divColor, goldColor, redColor } from '../core/colors.js';
import { ranges } from '../core/controls.js';
import { $ } from '../core/dom.js';
import { setMath } from '../core/math.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';
import { fillTable } from '../core/table.js';
import { quantizeGroups, relativeError, toyMatrix } from '../core/toymatrix.js';

// Why weights are grouped: a toy matrix, per-group scales, rounding error and storage per row.
// The current groups (each one's rounding error, and whether it holds an outlier) go to the figures that show the same data.
const grouping = channel('grouping');
const SIZES = [64, 32, 16, 8, 4], CW = 10, RH = 11;

export default (fig) => {
  const toy = toyMatrix(), { R, C } = toy;
  const wsvg = $(fig, '[data-v=w]'), ssvg = $(fig, '[data-v=s]'), esvg = $(fig, '[data-v=e]'), info = $(fig, '[data-v=info]'), store = $(fig, '[data-v=store]'), tab = $(fig, '.sx-gtab');
  const MAXBITS = C * 4 + 16 * 32;
  const rowBits = (gs) => C * 4 + (C / gs) * 32;
  const ctl = ranges(fig, () => draw(), { g: (i) => `${C / SIZES[i]} of ${SIZES[i]}`, osize: (v) => v + '×' });
  let cur = null;
  const draw = () => {
    const gs = SIZES[ctl.g], ng = C / gs, m = toy.values(ctl.nout, ctl.osize), q = quantizeGroups(m, gs);
    const cells = toy.outlierCells(ctl.nout), og = toy.outlierGroups(ctl.nout, gs);
    cur = { gs, m, q };
    const gm = Math.max(...m.flat().map(Math.abs));
    const common = { R, C, CW, RH, gs };
    const vb = `0 0 ${C * CW} ${R * RH}`;
    wsvg.setAttribute('viewBox', vb); wsvg.replaceChildren(...matrixCells({ ...common, color: (r, c) => divColor(m[r][c], 3), outline: (r, c) => cells.has(r * C + c), label: (r, g) => q.top[r][g].toFixed(1) }));
    ssvg.setAttribute('viewBox', vb); ssvg.replaceChildren(...matrixGroups({ ...common, color: (r, g) => goldColor(q.top[r][g], gm), outline: (r, g) => og[r][g] }));
    esvg.setAttribute('viewBox', vb); esvg.replaceChildren(...matrixCells({ ...common, color: (r, c) => redColor(q.err[r][c], .5), outline: (r, c) => cells.has(r * C + c) }));
    const groups = []; for (let r = 0; r < R; r++) for (let g = 0; g < ng; g++) groups.push({ outlier: og[r][g], loss: q.err[r].slice(g * gs, (g + 1) * gs).reduce((a, x) => a + x, 0) / gs });
    grouping.publish({ gs, ng, outliersOn: ctl.nout > 0, groups, values: m });
    const idx = C * 4, scl = ng * 32;
    $(fig, '.sx-gbar .idx').style.width = `${idx / MAXBITS * 100}%`; $(fig, '.sx-gbar .scl').style.width = `${scl / MAXBITS * 100}%`;
    setMath(store, `Storage per row: \\(${C}\\times 4 = ${idx}\\) bits for the indices, plus \\(${ng}\\times 32 = ${scl}\\) bits for the scale${ng > 1 ? 's' : ''}, \\(${rowBits(gs)}\\) bits in all (${rowBits(gs) / 8} bytes). Relative error: ${(relativeError(m, q.err, gs) * 100).toFixed(1)}%.`);
    const rows = [['groups per row', 'error', 'bits per row']];
    SIZES.forEach((sz) => { const rq = quantizeGroups(m, sz); rows.push([`${C / sz} of ${sz}`, `${(relativeError(m, rq.err, sz) * 100).toFixed(1)}%`, String(rowBits(sz))]); });
    fillTable(tab, rows, { rowHeaders: false });
    [...tab.rows].slice(1).forEach((tr, i) => { tr.dataset.i = i; tr.classList.toggle('on', i === ctl.g); });
  };
  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect(), scale = C * CW / box.width;
    return { c: Math.floor((e.clientX - box.left) * scale / CW), r: Math.floor((e.clientY - box.top) * scale / RH) };
  };
  [wsvg, ssvg, esvg].forEach((svg) => svg.addEventListener('mousemove', (e) => {
    const p = pick(e); if (p.r < 0 || p.r >= R || p.c < 0 || p.c >= C) return;
    const g = Math.floor(p.c / cur.gs);
    info.textContent = `Row ${p.r + 1}, group ${g + 1} of ${C / cur.gs}: weight ${cur.m[p.r][p.c].toFixed(2)}, largest in group ${cur.q.top[p.r][g].toFixed(2)}, gap between levels ${cur.q.step[p.r][g].toFixed(2)}, error ${cur.q.err[p.r][p.c].toFixed(2)}.`;
  }));
  tab.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { const input = $(fig, '[data-k=g]'); input.value = tr.dataset.i; input.dispatchEvent(new Event('input')); } });
  $(fig, '[data-act=new]').addEventListener('click', () => { toy.reroll(); draw(); });
  info.textContent = 'Hover a cell to see its group.';
  draw();
};
