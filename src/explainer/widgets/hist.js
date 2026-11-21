import data from '../data/weight-hist.json';
import { hAxis } from '../core/axis.js';
import { ranges } from '../core/controls.js';
import { $, sv, svgText } from '../core/dom.js';
import { fillTable } from '../core/table.js';

// 9b. Histograms of SmolLM2's real weights before and after rotating each group (data from convert/weight_hist.py)
export default (fig) => {
  const D = data, svg = $(fig, 'svg'), note = $(fig, '.sx-note');
  const SIZES = [8, 16, 32, 64], LABEL = { all: 'all layers', attention: 'attention layers', mlp: 'feed-forward layers', embedding: 'embedding' };
  const st = { cls: 'all', log: false, norm: true }, single = fig.dataset.mode === 'single', opt = (k) => fig.querySelector(`[data-k=${k}]`);
  const ctl = ranges(fig, () => draw(), { g: (i) => SIZES[i] });
  const draw = () => {
    const G = SIZES[ctl.g], e = D.data[`${st.cls}/${G}`], d = st.norm ? e : { ...e, before: e.rawbefore, after: e.rawafter, kurt: e.rawkurt, beyond3: e.rawbeyond3, max: e.rawmax }, NB = D.bins.n, bw = D.bins.width, xm = -D.bins.lo, n = d.n;
    fig.querySelectorAll('[data-cls]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cls === st.cls)));
    opt('log') && opt('log').setAttribute('aria-pressed', String(st.log)); opt('norm') && opt('norm').setAttribute('aria-pressed', String(st.norm));
    const dens = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    const top = Math.max(...d.before, ...(single ? [] : d.after), n * bw * dens(0)) * 1.08;
    const T = (k) => (st.log ? Math.log10(1 + k) / Math.log10(1 + top) : k / top);
    const kids = [], W = single ? 456 : 296, H = single ? 140 : 130, Y0 = 36, cw = (W - 16) / NB;
    (single ? [['Weights divided by their group\'s length', d.before, 'var(--sx-blue)']] : [['Before rotation', d.before, 'var(--sx-blue)'], ['After rotating each group', d.after, 'var(--sx-gold)']]).forEach(([title, c, color], p) => {
      const ox = single ? 92 : p * 324, X = (v) => ox + 8 + (W - 16) * (v + xm) / (2 * xm), Y = (k) => Y0 + H - H * T(k);
      kids.push(svgText(ox + W / 2, 16, title, 'middle', 'lbl rowname'));
      c.forEach((k, i) => { if (!k) return; const h = Math.max(1, H * T(k)); kids.push(sv('rect', { x: ox + 8 + cw * i + .2, y: Y0 + H - h, width: cw - .4, height: h }, `fill:${color};opacity:.85`)); });
      const pts = []; for (let i = 0; i <= 120; i++) { const z = -xm + 2 * xm * i / 120; pts.push(`${X(z).toFixed(1)},${Y(n * bw * dens(z)).toFixed(1)}`); }
      kids.push(sv('polyline', { points: pts.join(' '), fill: 'none', class: 'mean' }, 'stroke-dasharray:4 3;stroke-width:1.5'));
      kids.push(...hAxis({ x0: ox + 8, x1: ox + W - 8, y: Y0 + H, ticks: [-6, -4, -2, 0, 2, 4, 6].map((t) => [X(t), t ? (t > 0 ? '+' : '−') + Math.abs(t) + 'σ' : '0']) }));
    });
    svg.replaceChildren(...kids);
    const f = (v) => v.toFixed(v < 10 ? 1 : 0);
    note.textContent = `${D.model}, ${LABEL[st.cls]}, groups of ${G}: ${(n / 1e6).toFixed(0)} million weights. ` + (st.norm ? `A group of ${G} cannot hold a value beyond √${G} = ${Math.sqrt(G).toFixed(1)}σ.` : 'Only each whole matrix is scaled here, so groups keep their own sizes, and values beyond ±6σ are counted in the end bars.');
    if (single) { note.textContent += ` Kurtosis (3 for a bell curve): ${d.kurt[0].toFixed(2)}. Weights beyond 3σ (0.27% for a bell curve): ${d.beyond3[0]}%.`; return; }
    const rows = [['', 'Before rotation', 'After rotation', 'Ideal bell curve'], ['Kurtosis (a measure of how heavy the tails are)', d.kurt[0].toFixed(2), d.kurt[1].toFixed(2), '3'], ['Weights beyond 3σ', d.beyond3[0] + '%', d.beyond3[1] + '%', '0.27%'], ['Largest value', f(d.max[0]) + 'σ', f(d.max[1]) + 'σ', '']];
    fillTable($(fig, '.sx-stat'), rows);
  };
  fig.querySelectorAll('[data-cls]').forEach((b) => b.addEventListener('click', () => { st.cls = b.dataset.cls; draw(); }));
  opt('log') && opt('log').addEventListener('click', () => { st.log = !st.log; draw(); });
  opt('norm') && opt('norm').addEventListener('click', () => { st.norm = !st.norm; draw(); });
  draw();
};
