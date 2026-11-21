import { divColor, goldColor, redColor } from '../core/colors.js';
import { $, el, sv } from '../core/dom.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';

// 9. The toy matrix of the grouping figure with every group rotated: unrotated on the left, rotated on the right
export default (fig) => {
  const R = 12, C = 64, CW = 4.8, RH = 11, SIZES = [64, 32, 16, 8, 4], GAP = 25.6, TOP = 16;
  const state = { g: 3, nout: 6, size: 8 }; let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
  const fwht = (x) => { const y = x.slice(), n = y.length; for (let h = 1; h < n; h *= 2) for (let i = 0; i < n; i += 2 * h) for (let j = i; j < i + h; j++) { const a = y[j], b = y[j + h]; y[j] = a + b; y[j + h] = a - b; } return y.map((v) => v / Math.sqrt(n)); };
  let base = [], outList = [];
  const gen = () => {
    base = Array.from({ length: R }, () => { const sc = Math.exp(.35 * gauss()); return Array.from({ length: C }, () => gauss() * sc); });
    const rows = Array.from({ length: R }, (_, i) => i);
    for (let i = R - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    outList = rows.map((r0) => ({ r: r0, c: Math.floor(rng() * C), sign: rng() < .5 ? -1 : 1, u: rng() }));
  };
  const matrix = () => { const m = base.map((r) => r.slice()); outList.slice(0, state.nout).forEach(({ r, c, sign, u }) => { m[r][c] = sign * state.size * (.75 + .5 * u); }); return m; };
  const hasOut = (gs) => { const f = Array.from({ length: R }, () => new Array(C / gs).fill(false)); outList.slice(0, state.nout).forEach(({ r, c }) => { f[r][Math.floor(c / gs)] = true; }); return f; };
  const rotate = (m, gs) => m.map((row) => { const o = []; for (let g = 0; g < C; g += gs) o.push(...fwht(row.slice(g, g + gs))); return o; });
  const quant = (m, gs) => {                                   // 16 evenly spaced levels per group, up to its largest weight
    const err = [], mx = [];
    for (let r = 0; r < R; r++) {
      const er = [], mr = [];
      for (let g = 0; g < C / gs; g++) {
        let top = 0; for (let c = g * gs; c < (g + 1) * gs; c++) top = Math.max(top, Math.abs(m[r][c]));
        const step = 2 * top / 15; mr.push(top);
        for (let c = g * gs; c < (g + 1) * gs; c++) { const x = m[r][c], q = step ? Math.round((x + top) / step) * step - top : 0; er.push(Math.abs(x - q)); }
      }
      err.push(er); mx.push(mr);
    }
    return { err, mx };
  };
  const rel = (m, q, gs, keep) => { let e2 = 0, w2 = 0, n = 0; for (let r = 0; r < R; r++) for (let g = 0; g < C / gs; g++) { if (!keep(r, g)) continue; n++; for (let c = g * gs; c < (g + 1) * gs; c++) { e2 += q.err[r][c] ** 2; w2 += m[r][c] ** 2; } } return n ? Math.sqrt(e2 / w2) : null; };
  const wsvg = $(fig, '[data-v=w]'), ssvg = $(fig, '[data-v=s]'), esvg = $(fig, '[data-v=e]'), tab = $(fig, '.sx-stat');
  const X0 = [0, C * CW + GAP], VB = `0 0 ${2 * C * CW + GAP} ${TOP + R * RH}`;
  const title = (x, t) => { const e = sv('text', { x, y: 11, class: 'lbl' }); e.textContent = t; return e; };
  const draw = () => {
    const gs = SIZES[state.g], ng = C / gs, a = matrix(), b = rotate(a, gs), qa = quant(a, gs), qb = quant(b, gs), out = hasOut(gs), cellOut = new Set(outList.slice(0, state.nout).map(({ r, c }) => r * C + c));
    $(fig, '[data-o=g]').textContent = `${ng} of ${gs}`;
    let gm = 0; a.forEach((r) => r.forEach((v) => { gm = Math.max(gm, Math.abs(v)); }));
    const panel = (svg, build) => { svg.setAttribute('viewBox', VB); const g = sv('g', { transform: `translate(0,${TOP})` }); [[0, 'Unrotated'], [1, 'Rotated']].forEach(([i, name]) => g.append(...build(i))); svg.replaceChildren(title(0, 'Unrotated'), title(X0[1], 'Rotated'), g); };
    const common = (i) => ({ R, C, CW, RH, gs, x0: X0[i] });
    panel(wsvg, (i) => matrixCells({ ...common(i), color: (r, c) => divColor((i ? b : a)[r][c], 3), outline: i ? null : (r, c) => cellOut.has(r * C + c) }));
    panel(ssvg, (i) => matrixGroups({ ...common(i), color: (r, g) => goldColor((i ? qb : qa).mx[r][g], gm), outline: (r, g) => out[r][g] }));
    panel(esvg, (i) => matrixCells({ ...common(i), color: (r, c) => redColor((i ? qb : qa).err[r][c], .5) }));
    const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
    const rows = [['Relative rounding error', 'Unrotated', 'Rotated'],
      ['All groups', pct(rel(a, qa, gs, () => true)), pct(rel(b, qb, gs, () => true))],
      ['Groups with an outlier', pct(rel(a, qa, gs, (r, g) => out[r][g])), pct(rel(b, qb, gs, (r, g) => out[r][g]))],
      ['The other groups', pct(rel(a, qa, gs, (r, g) => !out[r][g])), pct(rel(b, qb, gs, (r, g) => !out[r][g]))]];
    tab.replaceChildren(...rows.map((r, i) => { const tr = el('tr'); r.forEach((t, j) => tr.append(el(i ? (j ? 'td' : 'th') : 'th', j ? 'num' : null, t))); return tr; }));
  };
  $(fig, '[data-k=g]').addEventListener('input', (e) => { state.g = +e.target.value; draw(); });
  $(fig, '[data-k=nout]').addEventListener('input', (e) => { state.nout = +e.target.value; $(fig, '[data-o=nout]').textContent = state.nout; draw(); });
  $(fig, '[data-k=osize]').addEventListener('input', (e) => { state.size = +e.target.value; $(fig, '[data-o=osize]').textContent = state.size + '×'; draw(); });
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = (seed * 48271) % 2147483647; gen(); draw(); });
  $(fig, '[data-o=nout]').textContent = state.nout; $(fig, '[data-o=osize]').textContent = state.size + '×';
  gen(); draw();
};
