import { $, el, sv } from '../core/dom.js';
import { rotate } from '../core/linalg.js';
import { rng2 } from '../core/random.js';

// 12. Why the kernel rotates the activations: the identity with real numbers, and the operation count
export default (fig) => {
  const N = 8, box = $(fig, '.sx-reuse'), svg = $(fig, 'svg'), note = $(fig, '.sx-readout'); let seed = 5, w = [], x = [];
  const fw = (v) => { const y = v.slice(); for (let h = 1; h < N; h *= 2) for (let i = 0; i < N; i += 2 * h) for (let j = i; j < i + h; j++) { const a = y[j], b = y[j + h]; y[j] = a + b; y[j + h] = a - b; } return y.map((q) => q / Math.sqrt(N)); };
  const dot = (a, b) => a.reduce((t, q, i) => t + q * b[i], 0), sgn = (q, d) => (q < 0 ? '−' : '') + Math.abs(q).toFixed(d);
  const gen = () => { const r = rng2(seed), g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); w = Array.from({ length: N }, g); w[Math.floor(r() * N)] += 3; x = Array.from({ length: N }, g); };
  const row = (label, v) => { const tr = el('tr'); tr.append(el('th', null, label)); v.forEach((a) => { const td = el('td', 'num', sgn(a, 2)); td.style.background = `color-mix(in srgb, ${a >= 0 ? 'var(--sx-red)' : 'var(--sx-blue)'} ${Math.min(100, Math.abs(a) / 3 * 100)}%, transparent)`; tr.append(td); }); return tr; };
  const result = (text) => { const tr = el('tr', 'res'), td = el('td', null, text); td.colSpan = N + 1; tr.append(td); return tr; };
  const draw = () => {
    const hw = fw(w), hx = fw(x), t = el('table');
    t.append(row('weights w', w), row('activations x', x), result(`w · x = ${sgn(dot(w, x), 4)}`), row('rotated weights Hw', hw), row('rotated activations Hx', hx), result(`(Hw) · (Hx) = ${sgn(dot(hw, hx), 4)}   the same answer`));
    box.replaceChildren(t);
    const R = 2 ** +$(fig, '[data-k=rows]').value, rot = 64 * 6, mac = 64, A = R * (rot + mac), B = rot + R * mac, fmt = (q) => q.toLocaleString('en-US');
    $(fig, '[data-o=rows]').textContent = fmt(R);
    const X = (q) => 200 + q / A * 340, kids = [], word = (px, py, tt, a, c) => { const e = sv('text', { x: px, y: py, 'text-anchor': a, class: c || 'lbl' }); e.textContent = tt; return e; };
    [['rotate every row\'s weights back', A, 'var(--sx-red)', 18], ['rotate the activations once', B, 'var(--sx-blue)', 66]].forEach(([name, q, color, y]) => kids.push(word(190, y + 17, name, 'end', 'lbl rowname'), sv('rect', { x: 200, y, width: Math.max(2, X(q) - 200), height: 26, rx: 3 }, `fill:${color}`), word(X(q) + 8, y + 17, fmt(q), 'start', 'lbl val')));
    svg.replaceChildren(...kids);
    note.textContent = `With ${fmt(R)} row${R > 1 ? 's' : ''}, rotating every row's weights back takes ${fmt(A)} operations, and rotating the activations once takes ${fmt(B)}: ${(A / B).toFixed(1)} times fewer. Each group of 64 needs 6 × 64 = ${rot} additions to rotate, and each row's dot product needs ${mac} multiply-adds.`;
  };
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = (seed * 48271) % 2147483647; gen(); draw(); });
  $(fig, '[data-k=rows]').addEventListener('input', draw);
  gen(); draw();
};
