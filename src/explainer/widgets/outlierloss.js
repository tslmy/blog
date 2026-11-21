import { channel } from '../core/channel.js';
import { $, press, sv } from '../core/dom.js';

// 9a. The groups of the grouping figure, split into those that contain an outlier and the rest: how much each loses to rounding
export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const txt = (x, y, str, anchor, cls) => { const t = sv('text', { x, y, 'text-anchor': anchor, class: cls || 'lbl' }); t.textContent = str; return t; };
  const render = (d) => {
    const withO = d.groups.filter((g) => g.outlier), without = d.groups.filter((g) => !g.outlier), all = d.groups.map((g) => g.loss);
    const top = Math.max(...all) * 1.08, x0 = 170, x1 = 620, X = (v) => x0 + (x1 - x0) * v / top, kids = [];
    const rows = [['With an outlier', withO, 'var(--sx-gold)', 52], ['Without', without, 'var(--sx-blue)', 118]];
    kids.push(sv('line', { x1: x0, x2: x1, y1: 156, y2: 156, class: 'ax' }));
    const step = top > 1 ? .5 : top > .5 ? .25 : .1;
    for (let v = 0; v <= top; v += step) { kids.push(sv('line', { x1: X(v), x2: X(v), y1: 156, y2: 161, class: 'ax' })); kids.push(txt(X(v), 174, v.toFixed(2).replace(/0$/, ''), 'middle')); }
    kids.push(txt((x0 + x1) / 2, 192, "average rounding error of the group's weights", 'middle'));
    rows.forEach(([name, list, color, y]) => {
      kids.push(txt(10, y - 4, name, 'start', 'lbl rowname'), txt(10, y + 12, `${list.length} group${list.length === 1 ? '' : 's'}`, 'start'));
      list.forEach((g, i) => kids.push(sv('circle', { cx: X(g.loss), cy: y + (((i * 37) % 17) - 8) * 2, r: 3.6, class: 'odot' }, `fill:${color}`)));
      if (list.length) { const m = mean(list.map((g) => g.loss)); kids.push(sv('line', { x1: X(m), x2: X(m), y1: y - 38, y2: y + 38, class: 'mean' })); kids.push(txt(X(m), y - 42, 'mean ' + m.toFixed(2), 'middle', 'lbl meant')); }
    });
    svg.replaceChildren(...kids);
    note.textContent = !d.outliersOn || !withO.length
      ? 'No group has an outlier right now. Raise "Groups with outliers" in the figure above (or press "New matrix") to see them.'
      : `Groups of ${d.gs}: the ${withO.length} with an outlier lose ${mean(withO.map((g) => g.loss)).toFixed(2)} on average, the other ${without.length} lose ${mean(without.map((g) => g.loss)).toFixed(2)}. That is ${(mean(withO.map((g) => g.loss)) / mean(without.map((g) => g.loss))).toFixed(1)} times as much, for weights that are almost all ordinary.`;
  };
  channel('grouping').subscribe(render);
};
