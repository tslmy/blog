import { $, sv } from '../core/dom.js';

// 11c. What one group stores with one shared codebook and with a fresh codebook per group, drawn in proportion
export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout'), SIZES = [8, 16, 32, 64, 128, 256], CS = [8, 16, 32];
  const BLUE = 'var(--sx-blue)', GOLD = 'var(--sx-gold)', RED = 'var(--sx-red)';
  const fmt = (v) => v.toLocaleString('en-US');
  const draw = () => {
    const G = SIZES[+$(fig, '[data-k=g]').value], B = +$(fig, '[data-k=b]').value, C = CS[+$(fig, '[data-k=c]').value], L = 2 ** B;
    $(fig, '[data-o=g]').textContent = G; $(fig, '[data-o=b]').textContent = `${B} (${L} levels)`; $(fig, '[data-o=c]').textContent = C + ' bits';
    const idx = G * B, book = L * C, k = 600 / (idx + C + book + 14 / 1), kids = [];   // the longest row is the shared one, with its dashed codebook
    const txt = (x, y, t, c, st) => { const e = sv('text', { x, y, class: c || 'lbl' }, st); e.textContent = t; return e; };
    const legend = (y, items) => { let x = 10; items.forEach(([color, t, dashed]) => { const w = 15 + t.length * 6.1 + 22; if (x > 10 && x + w > 640) { x = 10; y += 17; } kids.push(sv('rect', { x, y: y - 9, width: 10, height: 10 }, dashed ? `fill:none;stroke:${color};stroke-width:1.6;stroke-dasharray:3 2` : `fill:${color}`), txt(x + 15, y, t)); x += w; }); return y; };
    const bar = (y, parts, dashedBook) => {
      let x = 10; parts.forEach(([bits, color]) => { kids.push(sv('rect', { x, y, width: Math.max(1.5, bits * k), height: 34 }, `fill:${color}`)); x += bits * k; });
      if (dashedBook) kids.push(sv('rect', { x: x + 14, y, width: Math.max(1.5, book * k), height: 34 }, `fill:none;stroke:${RED};stroke-width:2;stroke-dasharray:5 4`));
    };
    kids.push(txt(10, 16, `Shared codebook: ${fmt(idx + C)} bits per group, ${(B + C / G).toFixed(2)} bits per weight`, 'lbl rowname'));
    bar(24, [[idx, BLUE], [C, GOLD]], true);
    let y = legend(78, [[BLUE, `indices: ${G} × ${B} = ${fmt(idx)} bits`], [GOLD, `scale: ${C} bits`], [RED, `codebook: ${L} × ${C} = ${fmt(book)} bits, stored once for the whole model`, true]]) + 34;
    kids.push(txt(10, y, `Fresh codebook per group: ${fmt(idx + book)} bits per group, ${(B + book / G).toFixed(2)} bits per weight`, 'lbl rowname'));
    bar(y + 8, [[idx, BLUE], [book, RED]], false);
    y = legend(y + 62, [[BLUE, `indices: ${G} × ${B} = ${fmt(idx)} bits`], [RED, `its own codebook: ${L} × ${C} = ${fmt(book)} bits (it replaces the scale)`]]);
    svg.setAttribute('viewBox', `0 0 640 ${y + 10}`);
    svg.replaceChildren(...kids);
    note.textContent = `A fresh codebook makes a group ${((idx + book) / (idx + C)).toFixed(1)} times as large as the shared scheme does. Both bars are drawn to the same scale. A number in the codebook, and the scale, take ${C} bits each.`;
  };
  fig.querySelectorAll('input').forEach((i) => i.addEventListener('input', draw)); draw();
};
