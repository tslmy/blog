// How the 2D and 3D group figures draw a group: a triangle if it is spiky, a circle if it is flat, in the group's colour.
import { sv, svgText } from './dom.js';

export const groupColor = (i) => `var(--pc${i % 8})`;
export const marker = (spiky, cx, cy, r, cls, style, extra) => (spiky
  ? sv('polygon', { points: `${cx},${cy - r * 1.3} ${cx - r * 1.2},${cy + r * .85} ${cx + r * 1.2},${cy + r * .85}`, class: cls, ...extra }, style)
  : sv('circle', { cx, cy, r, class: cls, ...extra }, style));
export const markerDy = (spiky) => (spiky ? 3 : .5);   // where a number sits inside the marker
// a filled marker with the group's number in it
export const numberedMarker = ({ spiky, cx, cy, n, color, r = 8, cls = 'lossdot' }) => [
  marker(spiky, cx, cy, r, cls, `fill:${color}`),
  svgText(cx, cy + markerDy(spiky), n, 'middle', 'lbl gnum', 'fill:var(--bg);dominant-baseline:central'),
];
