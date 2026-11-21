import { $, el, sv } from '../core/dom.js';

// 11b. Two weights of a group as a point, with the grid built from that group's own (unevenly spaced) levels; more groups make the table grow
export default (fig) => {
  const svg = $(fig, 'svg'), tab = $(fig, '.sx-stat'), note = $(fig, '.sx-readout');
  const Q = { 2: [.7979], 3: [0, 1.224], 4: [.4528, 1.510], 5: [0, .7646, 1.724], 6: [.3177, 1.000, 1.894], 7: [0, .5606, 1.188, 2.033], 8: [.2451, .7560, 1.344, 2.152] };   // Lloyd-Max levels of a bell curve, positive half
  const SIGMA = [.9, .5, 1.25, .7], P = [[.70, -.38], [-.52, .29], [1.55, .90], [-.85, -1.10]], S = 300 / 6.4, cx = 175, cy = 170;
  const X = (v) => cx + v * S, Y = (v) => cy - v * S, f2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const levelsOf = (g, L) => { const pos = Q[L], neg = (L % 2 ? pos.slice(1) : pos).slice().reverse().map((q) => -q); return [...neg, ...pos].map((q, k) => SIGMA[g] * q * (1 + .09 * Math.sin(7 * g + 3 * k + 1))); };
  const draw = () => {
    const L = +$(fig, '[data-k=l]').value, n = +$(fig, '[data-k=n]').value; $(fig, '[data-o=l]').textContent = L; $(fig, '[data-o=n]').textContent = n;
    const kids = [], wire = (x1, y1, x2, y2, col, w, o) => sv('line', { x1, y1, x2, y2 }, `stroke:${col};stroke-width:${w};opacity:${o || 1}`), txt = (x, y, t) => { const e = sv('text', { x, y, class: 'lbl' }); e.textContent = t; return e; };
    kids.push(wire(X(-3.2), cy, X(3.2), cy, 'var(--muted)', 1), wire(cx, Y(-3.2), cx, Y(3.2), 'var(--muted)', 1), txt(X(3.2) + 6, cy + 4, 'w₅₈'), txt(cx + 6, Y(3.2) - 4, 'w₂₁'));
    const lv = [...Array(n).keys()].map((g) => levelsOf(g, L));
    lv.forEach((ls, g) => {
      const col = `var(--pc${g})`, lo = ls[0], hi = ls[ls.length - 1];
      ls.forEach((u) => kids.push(wire(X(u), Y(lo), X(u), Y(hi), col, 1, .45), wire(X(lo), Y(u), X(hi), Y(u), col, 1, .45)));
      ls.forEach((u) => ls.forEach((v) => kids.push(sv('circle', { cx: X(u), cy: Y(v), r: L > 6 ? 1.8 : 2.3 }, `fill:${col}`))));
    });
    P.slice(0, n).forEach(([u, v], g) => { const col = `var(--pc${g})`; kids.push(sv('circle', { cx: X(u), cy: Y(v), r: 9 }, `fill:var(--bg);stroke:${col};stroke-width:2.4`)); const t = sv('text', { x: X(u), y: Y(v) + 3.5, 'text-anchor': 'middle' }, 'fill:var(--text);font:bold 10px var(--sx-sans)'); t.textContent = g + 1; kids.push(t); });
    svg.replaceChildren(...kids);
    const head = el('tr'); ['Group', '(w₂₁, w₅₈)'].forEach((t, j) => head.append(el('th', j ? 'num' : null, t)));
    const lh = el('th', 'num', `Levels (${L})`); lh.colSpan = L; head.append(lh);
    tab.replaceChildren(head, ...lv.map((ls, g) => {
      const tr = el('tr'), sw = el('td'); sw.append(el('span', 'sx-sw', ''), document.createTextNode(` ${g + 1}`)); sw.firstChild.style.cssText = `display:inline-block;width:.7rem;height:.7rem;border:2px solid var(--pc${g});vertical-align:-1px`;
      tr.append(sw, el('td', 'num', `(${f2(P[g][0])}, ${f2(P[g][1])})`)); ls.forEach((q) => tr.append(el('td', 'num', f2(q)))); return tr;
    }));
    const bits = Math.ceil(Math.log2(L)), lvBits = L * 32, ixBits = 64 * bits;
    note.textContent = `One group of 64 weights: ${L} levels × 32 bits = ${lvBits} bits for the levels, plus 64 indices × ${bits} bits = ${ixBits} bits, ${lvBits + ixBits} bits in all (${(lvBits / (lvBits + ixBits) * 100).toFixed(0)}% of it the levels). Every group in the model adds another row to this table.`;
  };
  fig.querySelectorAll('input').forEach((i) => i.addEventListener('input', draw)); draw();
};
