import { SERIES } from '../core/bars.js';
import { channel } from '../core/channel.js';
import { $ } from '../core/dom.js';
import { mean } from '../core/stats.js';
import { countLabel, lossStrips } from '../core/strips.js';

// The groups of the grouping figure, split into those that contain an outlier and the rest: how much each loses to rounding.
export default (fig) => {
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note');
  channel('grouping').subscribe((d) => {
    const withO = d.groups.filter((g) => g.outlier), without = d.groups.filter((g) => !g.outlier);
    const strip = (name, list, color, y) => ({ lines: [name, countLabel(list)], y, items: list.map((g) => ({ loss: g.loss, color })) });
    svg.replaceChildren(...lossStrips({
      rows: [strip('With an outlier', withO, SERIES.gold, 52), strip('Without', without, SERIES.blue, 118)],
      top: Math.max(...d.groups.map((g) => g.loss)) * 1.08, format: (v) => v.toFixed(2).replace(/0$/, ''), caption: "average rounding error of the group's weights",
    }));
    const [lossWith, lossWithout] = [mean(withO.map((g) => g.loss)), mean(without.map((g) => g.loss))];
    note.textContent = !d.outliersOn || !withO.length
      ? 'No group has an outlier right now. Raise "Groups with outliers" in the figure above (or press "New matrix") to see them.'
      : `Groups of ${d.gs}: the ${withO.length} with an outlier lose ${lossWith.toFixed(2)} on average, the other ${without.length} lose ${lossWithout.toFixed(2)}. That is ${(lossWith / lossWithout).toFixed(1)} times as much, for weights that are almost all ordinary.`;
  });
};
