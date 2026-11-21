import { $ } from '../core/dom.js';
import { jacobi } from '../core/linalg.js';

// 6b. PCA versus the Hadamard rotation on the same groups of 8 weights
export default (fig) => {
  const M = 24, D = 8, CLIP = 4, state = { ds: 'spiky' }; let seed = 3;
  const rng = (sd) => () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note'), NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const data = () => {
    const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    if (state.ds === 'spiky') return Array.from({ length: M }, () => { const row = Array.from({ length: D }, () => .35 * g()); row[Math.floor(r() * D)] += (r() < .5 ? -1 : 1) * (3.5 + .6 * g()); return row; });
    const u = Array.from({ length: D }, g), l = Math.hypot(...u), uu = u.map((x) => x / l);
    return Array.from({ length: M }, () => { const a = g(); return uu.map((x) => 3.2 * a * x + .45 * g()); });
  };
  const eig = (C) => jacobi(C).vecs;                  // eigenvectors, biggest first, as arrays
  const pca = (X) => {
    const C = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => X.reduce((a, r) => a + r[i] * r[j], 0) / M));
    const cols = eig(C);                               // cols[k][i] = component i of eigenvector k
    return X.map((r) => cols.map((v) => r.reduce((a, x, i) => a + x * v[i], 0)));
  };
  const fwht = (x) => { const y = x.slice(); for (let h = 1; h < D; h *= 2) for (let i = 0; i < D; i += 2 * h) for (let j = i; j < i + h; j++) { const a = y[j], b = y[j + h]; y[j] = a + b; y[j + h] = a - b; } return y.map((v) => v / Math.sqrt(D)); };
  const stats = (Y) => {
    const tot = Y.reduce((a, r) => a + r.reduce((b, x) => b + x * x, 0), 0), cols = Array.from({ length: D }, (_, c) => Y.reduce((a, r) => a + r[c] * r[c], 0) / tot);
    let spike = 0, err = 0;
    Y.forEach((r) => { const len = Math.hypot(...r), m = Math.max(...r.map(Math.abs)), st = 2 * m / 3; spike += m / len / M; err += Math.hypot(...r.map((x) => x - (-m + Math.round((x + m) / st) * st))) / len / M; });
    return { cols, spike, err };
  };
  const draw = () => {
    const X = data(), views = [['As given', X], ['After PCA', pca(X)], ['After a flattening rotation', X.map(fwht)]], kids = [], W = 260, CW = W / D, RH = 5, res = [];
    views.forEach(([title, Y], v) => {
      const x0 = 20 + v * 295, st = stats(Y); res.push(st);
      const t = mk('text', { x: x0, y: 14, class: 'lbl' }); t.textContent = title; kids.push(t);
      Y.forEach((r, i) => r.forEach((val, c) => { const k = Math.max(-1, Math.min(1, val / CLIP)); kids.push(mk('rect', { x: x0 + c * CW, y: 22 + i * RH, width: CW - 1, height: RH, style: `fill:color-mix(in srgb, var(${k >= 0 ? '--sx-red' : '--sx-blue'}) ${Math.abs(k) * 100}%, var(--bg))` })); }));
      st.cols.forEach((e, c) => { const h = Math.max(1, e * 56); kids.push(mk('rect', { x: x0 + c * CW, y: 22 + M * RH + 10 + 56 - h, width: CW - 1, height: h, class: 'pcb' })); });
      const by = 22 + M * RH + 10 + 56 + 14;
      [`busiest coordinate: ${(Math.max(...st.cols) * 100).toFixed(0)}% of the energy`, `largest weight: ${(st.spike * 100).toFixed(0)}% of its group's length`, `2-bit rounding error: ${(st.err * 100).toFixed(0)}%`].forEach((txt, i) => { const tx = mk('text', { x: x0, y: by + i * 14, class: 'lbl' }); tx.textContent = txt; kids.push(tx); });
    });
    svg.replaceChildren(...kids);
    note.textContent = state.ds === 'spiky'
      ? `Every group has one big weight in a random place, so no single direction stands out and PCA has little to find: the error only moves from ${(res[0].err * 100).toFixed(0)}% to ${(res[1].err * 100).toFixed(0)}%. A flattening rotation spreads each spike over all 8 coordinates (largest weight ${(res[0].spike * 100).toFixed(0)}% → ${(res[2].spike * 100).toFixed(0)}% of the length) and the error falls to ${(res[2].err * 100).toFixed(0)}%.`
      : `The weights share one direction. PCA finds it and moves nearly all the energy into the first coordinate (${(Math.max(...res[1].cols) * 100).toFixed(0)}%), which is ideal for dropping the other seven, but each group becomes one big weight plus noise: the error rises from ${(res[0].err * 100).toFixed(0)}% to ${(res[1].err * 100).toFixed(0)}%. A flattening rotation does not need to know the direction and spreads everything out.`;
  };
  fig.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', () => { state.ds = b.dataset.ds; fig.querySelectorAll('[data-ds]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = (seed * 48271) % 2147483647; draw(); });
  draw();
};
