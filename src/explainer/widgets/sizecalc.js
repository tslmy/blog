import { $, sv } from '../core/dom.js';

// 11. What a model costs to store: bits per weight and group size against the iPod's RAM
export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-readout'), M = 134.5e6, G = [16, 32, 64, 128, 256], RAM = 256;
  const draw = () => {
    const bits = +$(fig, '[data-k=bits]').value, g = G[+$(fig, '[data-k=g]').value], bpw = bits + 32 / g, mb = M * bpw / 8 / 1e6, f32 = M * 4 / 1e6;
    $(fig, '[data-o=bits]').textContent = bits; $(fig, '[data-o=g]').textContent = g;
    const X = (v) => 190 + v / 600 * 430, kids = [], word = (x, y, t, a, c) => { const e = sv('text', { x, y, 'text-anchor': a, class: c || 'lbl' }); t && (e.textContent = t); return e; };
    const wMB = M * bits / 8 / 1e6, sMB = M * 32 / g / 8 / 1e6, GOLD = 'var(--sx-gold)', BLUE = 'var(--sx-blue)';
    [['32-bit floats', [[f32, 'var(--muted)']], 30], ['this setting', [[wMB, BLUE], [sMB, GOLD]], 80]].forEach(([name, parts, y]) => {
      let acc = 0; const total = parts.reduce((t, p) => t + p[0], 0);
      kids.push(word(180, y + 15, name, 'end', 'lbl rowname'));
      parts.forEach(([v, color]) => { const x0 = X(acc), x1 = X(acc + v); kids.push(sv('rect', { x: x0, y, width: Math.max(2, x1 - x0), height: 24 }, `fill:${color}`)); acc += v; });
      kids.push(word(X(total) + 8, y + 16, Math.round(total) + ' MB', 'start', 'lbl val'));
    });
    [[BLUE, `weights: ${bits} bits each, ${Math.round(wMB)} MB`, 190], [GOLD, `group scales: 32 bits each, ${Math.round(sMB)} MB`, 400]].forEach(([color, label, x]) => kids.push(sv('rect', { x, y: 128, width: 10, height: 10 }, `fill:${color}`), word(x + 15, 137, label, 'start')));
    kids.push(sv('line', { x1: X(RAM), x2: X(RAM), y1: 14, y2: 118, class: 'ramline' }), word(X(RAM), 10, "iPod's RAM: 256 MB", 'middle', 'lbl meant'));
    svg.replaceChildren(...kids);
    note.textContent = `${bits} + 32/${g} = ${bpw.toFixed(2)} bits per weight, so ${Math.round(mb)} MB: ${(mb / f32 * 100).toFixed(0)}% of the floats, and ${mb > RAM ? 'more than the iPod has' : (mb / RAM * 100).toFixed(0) + '% of the iPod\'s RAM'}. Of that, the weights take ${Math.round(wMB)} MB and the group scales ${Math.round(sMB)} MB (${(32 / g).toFixed(2)} bits per weight).`;
  };
  fig.querySelectorAll('input').forEach((i) => i.addEventListener('input', draw)); draw();
};
