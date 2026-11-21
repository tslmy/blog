import { channel } from '../core/channel.js';
import { divColor, goldColor, redColor } from '../core/colors.js';
import { $, el } from '../core/dom.js';
import { setMath } from '../core/math.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';

// 9. Why weights are grouped: a toy matrix, per-group scales, rounding error and storage per row
// The current groups (each one's rounding error, and whether it holds an outlier) go to the figures that show the same data.
const grouping = channel('grouping');

export default (fig) => {
  const R = 12, C = 64, CW = 10, RH = 11, BARH = 46, SIZES = [64, 32, 16, 8, 4], NS = 'http://www.w3.org/2000/svg';
  const state = { g: 3, out: true, nout: 6, size: 8, sel: 0 }; let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng());
  let base = [], outl = [], outList = [];
  const gen = () => {
    base = Array.from({ length: R }, () => { const s = Math.exp(.35 * gauss()); return Array.from({ length: C }, () => gauss() * s); });
    const rows = Array.from({ length: R }, (_, i) => i);     // outliers go in different rows, so each one is in a group of its own at any group size
    for (let i = R - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    outList = rows.map((r0) => ({ r: r0, c: Math.floor(rng() * C), sign: rng() < .5 ? -1 : 1, u: rng() }));
    applyOut();
    state.sel = Math.floor(rng() * R);
  };
  const applyOut = () => { outl = Array.from({ length: R }, () => new Array(C).fill(0)); outList.slice(0, state.nout).forEach(({ r, c, sign, u }) => { outl[r][c] = sign * state.size * (.75 + .5 * u); }); state.out = state.nout > 0; };
  const val = (r, c) => (state.out && outl[r][c] ? outl[r][c] : base[r][c]);
  const mk = (tag, attrs, style) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (style) e.style.cssText = style; return e; };
  const stats = (gs) => {                              // 16 evenly spaced levels per group, sized to its largest weight
    const err = [], scales = []; let e2 = 0, w2 = 0;
    for (let r = 0; r < R; r++) {
      const er = [], sc = [];
      for (let g = 0; g < C / gs; g++) {
        let mx = 0; for (let c = g * gs; c < (g + 1) * gs; c++) mx = Math.max(mx, Math.abs(val(r, c)));
        const step = 2 * mx / 15; sc.push({ mx, step });
        for (let c = g * gs; c < (g + 1) * gs; c++) { const x = val(r, c), q = step ? Math.round((x + mx) / step) * step - mx : 0; er.push(Math.abs(x - q)); e2 += (x - q) ** 2; w2 += x * x; }
      }
      err.push(er); scales.push(sc);
    }
    return { err, scales, rel: Math.sqrt(e2 / w2), rowBits: C * 4 + (C / gs) * 32 };
  };
  const wsvg = $(fig, '[data-v=w]'), ssvg = $(fig, '[data-v=s]'), esvg = $(fig, '[data-v=e]'), info = $(fig, '[data-v=info]'), store = $(fig, '[data-v=store]'), tab = $(fig, '.sx-gtab');
  const MAXBITS = C * 4 + 16 * 32;
  let cur = null, curGs = 64;
  const draw = () => {
    const gs = SIZES[state.g], ng = C / gs, st = stats(gs); cur = st; curGs = gs;
    $(fig, '[data-o=g]').textContent = `${ng} of ${gs}`;
    let gm = 0; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) gm = Math.max(gm, Math.abs(val(r, c)));
    const common = { R, C, CW, RH, gs };
    const vb = `0 0 ${C * CW} ${R * RH}`;
    wsvg.setAttribute('viewBox', vb); wsvg.replaceChildren(...matrixCells({ ...common, color: (r, c) => divColor(val(r, c), 3), outline: (r, c) => state.out && outl[r][c], label: (r, g) => st.scales[r][g].mx.toFixed(1) }));
    ssvg.setAttribute('viewBox', vb); ssvg.replaceChildren(...matrixGroups({ ...common, color: (r, g) => goldColor(st.scales[r][g].mx, gm), outline: (r, g) => state.out && outl[r].slice(g * gs, (g + 1) * gs).some((v) => v) }));
    esvg.setAttribute('viewBox', vb); esvg.replaceChildren(...matrixCells({ ...common, color: (r, c) => redColor(st.err[r][c], .5), outline: (r, c) => state.out && outl[r][c] }));
    const groups = []; for (let r = 0; r < R; r++) for (let g = 0; g < ng; g++) { const e = st.err[r].slice(g * gs, (g + 1) * gs); groups.push({ outlier: state.out && outl[r].slice(g * gs, (g + 1) * gs).some((v) => v), loss: e.reduce((a, x) => a + x, 0) / gs }); }
    grouping.publish({ gs, ng, outliersOn: state.out, groups, values: Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => val(r, c))) });
    const idx = C * 4, scl = ng * 32;
    $(fig, '.sx-gbar .idx').style.width = `${idx / MAXBITS * 100}%`; $(fig, '.sx-gbar .scl').style.width = `${scl / MAXBITS * 100}%`;
    setMath(store, `Storage per row: \\(${C}\\times 4 = ${idx}\\) bits for the indices, plus \\(${ng}\\times 32 = ${scl}\\) bits for the scale${ng > 1 ? 's' : ''}, \\(${st.rowBits}\\) bits in all (${st.rowBits / 8} bytes). Relative error: ${(st.rel * 100).toFixed(1)}%.`);
    const rows = [['groups per row', 'error', 'bits per row']];
    SIZES.forEach((sz, i) => { const s2 = stats(sz); rows.push([`${C / sz} of ${sz}`, `${(s2.rel * 100).toFixed(1)}%`, String(s2.rowBits), i]); });
    tab.replaceChildren(...rows.map((r, i) => { const tr = el('tr'); r.slice(0, 3).forEach((t, j) => tr.append(el(i ? 'td' : 'th', j ? 'num' : null, t))); if (i) { tr.dataset.i = r[3]; if (r[3] === state.g) tr.className = 'on'; } return tr; }));
  };
  const pick = (e) => {
    const e0 = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - e0.left) / e0.width * C * CW, y = (e.clientY - e0.top) / e0.width * C * CW;
    return { c: Math.floor(x / CW), r: Math.floor(y / RH) };
  };
  [wsvg, ssvg, esvg].forEach((svg) => {
    svg.addEventListener('mousemove', (e) => {
      const p = pick(e); if (p.r < 0 || p.r >= R || p.c < 0 || p.c >= C) return;
      const g = Math.floor(p.c / curGs), s = cur.scales[p.r][g];
      info.textContent = `Row ${p.r + 1}, group ${g + 1} of ${C / curGs}: weight ${val(p.r, p.c).toFixed(2)}, largest in group ${s.mx.toFixed(2)}, gap between levels ${s.step.toFixed(2)}, error ${cur.err[p.r][p.c].toFixed(2)}.`;
    });
  });
  tab.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-i]'); if (tr) { state.g = +tr.dataset.i; $(fig, '[data-k=g]').value = state.g; draw(); } });
  $(fig, '[data-k=g]').addEventListener('input', (e) => { state.g = +e.target.value; draw(); });
  $(fig, '[data-k=nout]').addEventListener('input', (e) => { state.nout = +e.target.value; $(fig, '[data-o=nout]').textContent = state.nout; applyOut(); draw(); });
  $(fig, '[data-k=osize]').addEventListener('input', (e) => { state.size = +e.target.value; $(fig, '[data-o=osize]').textContent = state.size + '×'; applyOut(); draw(); });
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = (seed * 48271) % 2147483647; gen(); draw(); });
  info.textContent = 'Hover a cell to see its group.'; $(fig, '[data-o=nout]').textContent = state.nout; $(fig, '[data-o=osize]').textContent = state.size + '×'; gen(); draw();
};
