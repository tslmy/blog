import { ranges } from '../core/controls.js';
import { $, el, sv, svgLine, svgText } from '../core/dom.js';
import { gaussianLevels } from '../core/gaussian.js';
import { fillTable } from '../core/table.js';

// 11b. Two weights of a group as a point, with the grid built from that group's own (unevenly spaced) levels; more groups make the table grow
export default (fig) => {
  const svg = $(fig, 'svg'), tab = $(fig, '.sx-stat'), note = $(fig, '.sx-readout');
  const SIGMA = [.9, .5, 1.25, .7], P = [[.70, -.38], [-.52, .29], [1.55, .90], [-.85, -1.10]], S = 300 / 6.4, cx = 175, cy = 170;
  const X = (v) => cx + v * S, Y = (v) => cy - v * S, f2 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const swatch = (g, text) => { const span = el('span'); span.style.cssText = `display:inline-block;width:.7rem;height:.7rem;border:2px solid var(--pc${g});vertical-align:-1px;margin-right:.3rem`; const cell = el('span'); cell.append(span, String(text)); return cell; };
  const levelsOf = (g, L) => gaussianLevels(L).map((q, k) => SIGMA[g] * q * (1 + .09 * Math.sin(7 * g + 3 * k + 1)));
  const ctl = ranges(fig, () => draw());
  const draw = () => {
    const L = ctl.l, n = ctl.n, line = (x1, y1, x2, y2, col, w, o = 1) => svgLine(x1, y1, x2, y2, '', `stroke:${col};stroke-width:${w};opacity:${o}`);
    const kids = [line(X(-3.2), cy, X(3.2), cy, 'var(--muted)', 1), line(cx, Y(-3.2), cx, Y(3.2), 'var(--muted)', 1), svgText(X(3.2) + 6, cy + 4, 'w₅₈'), svgText(cx + 6, Y(3.2) - 4, 'w₂₁')];
    const lv = [...Array(n).keys()].map((g) => levelsOf(g, L));
    lv.forEach((ls, g) => {
      const col = `var(--pc${g})`, lo = ls[0], hi = ls[ls.length - 1];
      ls.forEach((u) => kids.push(line(X(u), Y(lo), X(u), Y(hi), col, 1, .45), line(X(lo), Y(u), X(hi), Y(u), col, 1, .45)));
      ls.forEach((u) => ls.forEach((v) => kids.push(sv('circle', { cx: X(u), cy: Y(v), r: L > 6 ? 1.8 : 2.3 }, `fill:${col}`))));
    });
    P.slice(0, n).forEach(([u, v], g) => kids.push(sv('circle', { cx: X(u), cy: Y(v), r: 9 }, `fill:var(--bg);stroke:var(--pc${g});stroke-width:2.4`), svgText(X(u), Y(v) + 3.5, g + 1, 'middle', '', 'fill:var(--text);font:bold 10px var(--sx-sans)')));
    svg.replaceChildren(...kids);
    fillTable(tab, [['Group', '(w₂₁, w₅₈)', { text: `Levels (${L})`, span: L }], ...lv.map((ls, g) => [swatch(g, g + 1), `(${f2(P[g][0])}, ${f2(P[g][1])})`, ...ls.map(f2)])]);
    const bits = Math.ceil(Math.log2(L)), lvBits = L * 32, ixBits = 64 * bits;
    note.textContent = `One group of 64 weights: ${L} levels × 32 bits = ${lvBits} bits for the levels, plus 64 indices × ${bits} bits = ${ixBits} bits, ${lvBits + ixBits} bits in all (${(lvBits / (lvBits + ixBits) * 100).toFixed(0)}% of it the levels). Every group in the model adds another row to this table.`;
  };
  draw();
};
