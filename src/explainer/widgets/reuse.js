import { SERIES, barRow } from '../core/bars.js';
import { ranges } from '../core/controls.js';
import { $, el } from '../core/dom.js';
import { gauss, nextSeed, rng } from '../core/random.js';
import { fwht } from '../core/linalg.js';

// 12. Why the kernel rotates the activations: the identity with real numbers, and the operation count
export default (fig) => {
  const N = 8, box = $(fig, '.sx-reuse'), svg = $(fig, 'svg'), note = $(fig, '.sx-readout'); let seed = 5, w = [], x = [];
  const fmt = (q) => q.toLocaleString('en-US'), dot = (a, b) => a.reduce((t, q, i) => t + q * b[i], 0), sgn = (q, d) => (q < 0 ? '−' : '') + Math.abs(q).toFixed(d);
  const gen = () => { const r = rng(seed), g = () => gauss(r); w = Array.from({ length: N }, g); w[Math.floor(r() * N)] += 3; x = Array.from({ length: N }, g); };
  const ctl = ranges(fig, () => draw(), { rows: (v) => fmt(2 ** v) });
  const row = (label, v) => { const tr = el('tr'); tr.append(el('th', null, label)); v.forEach((a) => { const td = el('td', 'num', sgn(a, 2)); td.style.background = `color-mix(in srgb, ${a >= 0 ? 'var(--sx-red)' : 'var(--sx-blue)'} ${Math.min(100, Math.abs(a) / 3 * 100)}%, transparent)`; tr.append(td); }); return tr; };
  const result = (text) => { const tr = el('tr', 'res'), td = el('td', null, text); td.colSpan = N + 1; tr.append(td); return tr; };
  const draw = () => {
    const hw = fwht(w), hx = fwht(x), t = el('table');
    t.append(row('weights w', w), row('activations x', x), result(`w · x = ${sgn(dot(w, x), 4)}`), row('rotated weights Hw', hw), row('rotated activations Hx', hx), result(`(Hw) · (Hx) = ${sgn(dot(hw, hx), 4)}   the same answer`));
    box.replaceChildren(t);
    const R = 2 ** ctl.rows, rot = 64 * 6, mac = 64, A = R * (rot + mac), B = rot + R * mac, scale = 340 / A;
    svg.replaceChildren(
      ...barRow({ label: "rotate every row's weights back", labelX: 190, x: 200, y: 18, height: 26, scale, rx: 3, parts: [[A, SERIES.red]], value: fmt(A) }),
      ...barRow({ label: 'rotate the activations once', labelX: 190, x: 200, y: 66, height: 26, scale, rx: 3, parts: [[B, SERIES.blue]], value: fmt(B) }));
    note.textContent = `With ${fmt(R)} row${R > 1 ? 's' : ''}, rotating every row's weights back takes ${fmt(A)} operations, and rotating the activations once takes ${fmt(B)}: ${(A / B).toFixed(1)} times fewer. Each group of 64 needs 6 × 64 = ${rot} additions to rotate, and each row's dot product needs ${mac} multiply-adds.`;
  };
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = nextSeed(seed); gen(); draw(); });
  gen(); draw();
};
