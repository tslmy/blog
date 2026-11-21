import { divColor, goldColor, redColor } from '../core/colors.js';
import { $, el, sv, svgLine, svgText } from '../core/dom.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';
import { groupColor, marker, markerDy, numberedMarker } from '../core/groupstyle.js';
import { mean, pct0 } from '../core/stats.js';
import { countLabel, lossStrips, spikyVsFlat } from '../core/strips.js';
import { choice, toggleRow } from '../core/controls.js';

// 6-. Groups of two weights, in stages. Figures with the same data-scene share their mock groups (and the levels option); data-layers says what each one draws:
// strips (three lines of cells), points, quant (squares, grids, arrows and rings), bits (binary labels), ghost (where the groups started), curve (spikiness against angle), loss (how much each group loses).
// A group has a direction and a length; its two weights are length times (cos, sin). With "one fixed grid" the length is divided out, so the dots sit on a circle of length 1.
const turn2 = (p, d) => { const c = Math.cos(d * Math.PI / 180), s = Math.sin(d * Math.PI / 180); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const scenes = {};
// The groups run from one extreme to the other: the first is short and lies on an axis, the last is long and lies on a diagonal, and the groups in between are spread evenly
// in length (0.35 to 1.35) and in direction (0 to 45 degrees). The first half are closer to an axis ("spiky", triangles), the second half closer to a diagonal ("flat", circles).
// With data-groups="clusters" (the Hadamard-angle figure) the two halves are instead two clusters, each spread evenly on both sides of its direction (an axis, and a diagonal), so that the troughs of the curves sit exactly at 45 degrees.
const groupsOf = (sc) => {
  const n = sc.st.n, half = n / 2;
  if (sc.groups === 'clusters') { const off = (j) => (half > 1 ? (j / (half - 1) - .5) * 8 : 0); return Array.from({ length: n }, (_, i) => { const spiky = i < half, a = ((spiky ? 0 : 45) + off(spiky ? i : i - half)) * Math.PI / 180; return { dir: [Math.cos(a), Math.sin(a)], len: .35 + (n > 1 ? i / (n - 1) : 0), spiky }; }); }
  return Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0, a = 45 * t * Math.PI / 180; return { dir: [Math.cos(a), Math.sin(a)], len: .35 + t, spiky: i < half }; });
};
export default (fig) => {
  let v = () => true;         // is this element of the plot switched on? set once the row of toggles exists
  const had = fig.hasAttribute('data-had'), layers = (fig.dataset.layers || 'points').split(/\s+/), has = (l) => layers.includes(l);
  const sc = scenes[fig.dataset.scene || 'main'] || (scenes[fig.dataset.scene || 'main'] = { st: { n: 4, mode: 'plain' }, subs: [], groups: fig.dataset.groups || 'ramp' });
  if (fig.dataset.levels) sc.st.mode = fig.dataset.levels;      // a figure can fix the levels option: "fixed" is step 3's one shared grid
  const rot = { deg: 0, sel: 0, follow: false };      // per figure: only the rotation figures turn the groups
  const anim = { a: 1, raf: 0 }, ease = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);     // how far a trail figure's groups have moved, 0 to 1
  const play = () => {                                // slide the groups from their real weights to where they are stored
    cancelAnimationFrame(anim.raf);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { anim.a = 1; draw(); return; }
    const t0 = performance.now(), step = (t) => { anim.a = Math.min(1, (t - t0) / 1400); draw(); if (anim.a < 1) anim.raf = requestAnimationFrame(step); };
    anim.a = 0; anim.raf = requestAnimationFrame(step);
  };
  const CX = 165, CY = 150, S = 100, FLAT = Math.SQRT1_2;   // the fixed grid is sized for a perfectly flat group: both coordinates 0.71
  const GOLD = 'var(--sx-gold)', BLUE = 'var(--sx-blue)';    // the spiky groups / the flat groups
  const cl = sc.groups === 'clusters', NA = cl ? 'spiky groups' : 'first half (spiky)', NB = cl ? 'flat groups' : 'second half (flat)';
  const svg = $(fig, 'svg.sx-r2'), note = $(fig, '.sx-readout');
  const on = (sel, ev, fn) => { const e = $(fig, sel); if (e) e.addEventListener(ev, fn); };
  const everyone = () => sc.subs.forEach((f) => f());
  const mode = () => (has('quant') ? sc.st.mode : 'plain');      // before quantization has been introduced, show the weights as they are
  const vecs = (grp, md, d) => grp.map((g) => turn2(g.dir, d).map((x) => x * (md === 'plain' ? g.len : 1)));
  const quant = (p, md) => { const m = md === 'plain' ? Math.max(...p.map(Math.abs)) : FLAT, st = 2 * m / 3, ix = p.map((x) => Math.max(0, Math.min(3, Math.round((x + m) / st)))), q = ix.map((k) => -m + k * st); return { m, q, ix, err: Math.hypot(p[0] - q[0], p[1] - q[1]) / Math.hypot(...p) }; };
  const draw = () => {
    const grp = groupsOf(sc), md = mode(), N = grp.length, col = groupColor; rot.sel = Math.min(rot.sel, N - 1);
    const P = vecs(grp, md, rot.deg), P0 = vecs(grp, md, 0), Q = P.map((p) => quant(p, md));
    const tw = $(fig, '[data-v=tw]');
    if (tw) {                                          // three lines of cells at the cell size of the grouping figure, growing to the right: weights with their scales, the scales, the rounding errors
      const CW2 = 10, RH2 = 11, BAND = 15, scl = Q.map((o, i) => (md === 'plain' ? o.m : grp[i].len)), smax = Math.max(...scl), line1 = { R: 1, C: 2 * N, CW: CW2, RH: RH2, gs: 2, rows: false };
      const w = (c) => P[c >> 1][c & 1], q = (c) => Q[c >> 1].q[c & 1];
      const chips = P.flatMap((p, i) => { const g = marker(grp[i].spiky, (i + .5) * 2 * CW2, 7, 5.5, '', `fill:${col(i)}`), t = sv('text', { x: (i + .5) * 2 * CW2, y: 7.3 + (grp[i].spiky ? 1.5 : 0), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'gnum2' }); t.textContent = i + 1; return [g, t]; });
      const put = (svgEl, h, kids) => { svgEl.setAttribute('viewBox', `0 0 640 ${h}`); svgEl.replaceChildren(...kids); };
      const shifted = sv('g', { transform: `translate(0,${BAND})` }); shifted.append(...matrixCells({ ...line1, color: (r, c) => divColor(w(c), md === 'plain' ? 1.5 : 1), label: (r, g) => scl[g].toFixed(2) }));
      put(tw, BAND + RH2, [...chips, shifted]);
      put($(fig, '[data-v=ts]'), RH2, matrixGroups({ ...line1, color: (r, g) => goldColor(scl[g], smax) }));
      put($(fig, '[data-v=te]'), RH2, matrixCells({ ...line1, color: (r, c) => redColor(Math.abs(w(c) - q(c)), .5) }));
    }
    const lossSvg = $(fig, '[data-v=loss]');
    if (lossSvg) {                                     // how much each group loses: spiky against flat
      const top = has('curve') ? .6 : Math.max(...Q.map((o) => o.err)) * 1.2;
      const names = cl ? [['Spiky groups', 'near an axis'], ['Flat groups', 'near a diagonal']] : [['First half', 'closer to an axis (spiky)'], ['Second half', 'closer to a diagonal (flat)']];
      const losses = (spiky) => Q.map((o, i) => ({ i, loss: o.err })).filter((g) => grp[g.i].spiky === spiky);
      const strip = (spiky, y) => ({ lines: [...names[spiky ? 0 : 1], countLabel(losses(spiky))], y, items: losses(spiky), mark: (g, cx, cy) => numberedMarker({ spiky, cx, cy, n: g.i + 1, color: col(g.i) }) });
      lossSvg.replaceChildren(...lossStrips({ rows: [strip(true, 52), strip(false, 118)], top, x0: 200, axisY: 158, step: top > .5 ? .2 : top > .25 ? .1 : .05, format: pct0, caption: 'rounding error of the group, as a share of its length' }));
      const ln = $(fig, '[data-v=lossnote]');
      if (ln) ln.textContent = spikyVsFlat({ first: cl ? 'The spiky groups (triangles)' : 'The first half (spiky, triangles)', second: cl ? 'the flat groups (circles)' : 'the second half (flat, circles)', spiky: mean(losses(true).map((g) => g.loss)), flat: mean(losses(false).map((g) => g.loss)), format: pct0 });
    }
    if (!svg) return;
    const kids = [], sel = P[rot.sel], { m, err } = Q[rot.sel];
    // Camera off: it stays with the axes and the points move. On: it stays with the points, and everything else turns the other way.
    const pt = (x, y) => { const [a, b] = rot.follow ? turn2([x, y], -rot.deg) : [x, y]; return [CX + S * a, CY - S * b]; };
    const seg = (a, b, cls, style) => { const [x1, y1] = pt(...a), [x2, y2] = pt(...b); return svgLine(x1, y1, x2, y2, cls, style); };
    if (has('quant') && md === 'fixed') kids.push(sv('circle', { cx: CX, cy: CY, r: S, class: 'sph' }));
    kids.push(seg([-1.45, 0], [1.45, 0], 'ax'), seg([0, -1.45], [0, 1.45], 'ax'));
    { const [ax, ay] = pt(1.45, 0), [bx, by] = pt(0, 1.45); kids.push(svgText(ax + 4, ay + 4, 'w₁', 'start', 'lbl axl'), svgText(bx + 8, by + 12, 'w₂', 'start', 'lbl axl')); }
    if (has('quant')) {
      const square = (mm, style) => sv('polygon', { points: [[-mm, -mm], [mm, -mm], [mm, mm], [-mm, mm]].map(([x, y]) => pt(x, y).join(',')).join(' '), class: 'sq' }, style);
      const grid = (mm, style, r) => { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const [cx, cy] = pt(-mm + a * 2 * mm / 3, -mm + b * 2 * mm / 3); kids.push(sv('circle', { cx, cy, r, class: 'gd' }, style)); } };
      if (md === 'plain') Q.forEach((o, i) => {          // every group has its own square, in its own colour
        if (v('squares')) kids.push(square(o.m, `stroke:${col(i)};stroke-width:${i === rot.sel ? 2 : 1};opacity:${i === rot.sel ? 1 : .55}`));   // thin and faint: the dots sit on their squares' edges, so the arrows must stand out from them
        if (v('grid')) grid(o.m, `fill:${col(i)}`, 1.8);
      });
      else { if (v('squares')) kids.push(square(FLAT, 'stroke:var(--sx-gold);stroke-width:1.6')); if (v('grid')) grid(FLAT, 'fill:var(--muted)', 2); }
      if (!has('trail') && v('trail')) P.forEach((p, i) => {   // a curved arrow from each group to the grid point it is stored as: it bows toward the middle, off the square's edge that the dot sits on
        const [x1, y1] = pt(p[0], p[1]), [x2, y2] = pt(Q[i].q[0], Q[i].q[1]), d = Math.hypot(x2 - x1, y2 - y1); if (d < 22) return;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; let nx = -(y2 - y1) / d, ny = (x2 - x1) / d; if (nx * (CX - mx) + ny * (CY - my) < 0) { nx = -nx; ny = -ny; }
        const bow = Math.min(.45 * d, 22), cx = mx + nx * bow * 2, cy = my + ny * bow * 2;      // the control point of a quadratic curve sits twice as far out as the curve's middle
        const n0 = Math.hypot(cx - x1, cy - y1), u0x = (cx - x1) / n0, u0y = (cy - y1) / n0, n1 = Math.hypot(x2 - cx, y2 - cy), u1x = (x2 - cx) / n1, u1y = (y2 - cy) / n1;
        const sx = x1 + u0x * 9, sy = y1 + u0y * 9, tx = x2 - u1x * 9, ty = y2 - u1y * 9, hl = Math.min(11, d * .35), bx = tx - u1x * hl, by = ty - u1y * hl, wd = i === rot.sel ? 3 : 2.2, hw = hl * .45;
        const tri = `${tx},${ty} ${bx - u1y * hw},${by + u1x * hw} ${bx + u1y * hw},${by - u1x * hw}`, path = `M${sx},${sy} Q${cx},${cy} ${bx},${by}`;
        kids.push(sv('path', { d: path, class: 'arc' }, `stroke:var(--bg);stroke-width:${wd + 3.5}`), sv('polygon', { points: tri, class: 'arrh' }, 'fill:var(--bg);stroke:var(--bg);stroke-width:3.5;stroke-linejoin:round'));   // a background-coloured casing, so the arrow reads as lying on top of anything under it
        kids.push(sv('path', { d: path, class: 'arc' }, `stroke:${col(i)};stroke-width:${wd}`), sv('polygon', { points: tri, class: 'arrh' }, `fill:${col(i)}`));
      });
    }
    const bin = (k) => k.toString(2).padStart(2, '0'), obstacles = [];     // boxes that labels must keep clear of: markers and level numbers
    if (has('bits') && v('bits')) {                    // each grid point is a possible stored value: its level numbers, in binary, are what is saved
      const o = Q[rot.sel], st = 2 * o.m / 3;
      for (let k = 0; k < 4; k++) { const lv = -o.m + k * st, [bx, by] = pt(lv, -o.m), [lx, ly] = pt(-o.m, lv); kids.push(svgText(bx, by + 14, bin(k), 'middle', 'lbl bitk', `fill:${col(rot.sel)}`), svgText(lx - 6, ly + 3.5, bin(k), 'end', 'lbl bitk', `fill:${col(rot.sel)}`)); obstacles.push({ x: bx - 9, y: by + 4, w: 18, h: 12 }, { x: lx - 24, y: ly - 6, w: 20, h: 12 }); }
    }
    if (has('quant') && !has('trail') && v('end')) Q.forEach((o, i) => {   // a hollow marker where each group is stored: the dot moved there
      const [x, y] = pt(o.q[0], o.q[1]), [px, py] = pt(P[i][0], P[i][1]);
      kids.push(marker(grp[i].spiky, x, y, 8, 'dest', `stroke:${col(i)};stroke-width:${i === rot.sel ? 3 : 2}`));
      if (Math.hypot(x - px, y - py) >= 22) kids.push(svgText(x, y + markerDy(grp[i].spiky), i + 1, 'middle', 'lbl gnum', `fill:${col(i)};dominant-baseline:central`));
    });
    if (has('ghost') && v('pre')) P0.forEach((p, i) => { const [cx, cy] = pt(p[0], p[1]); kids.push(marker(grp[i].spiky, cx, cy, 7, 'ghost', `stroke:${col(i)}`)); });   // where the groups started, relative to the axes
    const trail = has('trail'), e = trail ? ease(anim.a) : 1;   // with a trail, each group is drawn once, at its place on the way from its real weights to where it is stored, with fading shadows behind it
    if (trail) P.forEach((p, i) => {
      const [x1, y1] = pt(p[0], p[1]), [x2, y2] = pt(Q[i].q[0], Q[i].q[1]), d = Math.hypot(x2 - x1, y2 - y1) * e; if (d < 4) return;
      const n = Math.max(3, Math.min(7, Math.round(d / 8)));
      for (let k = 0; k < n; k++) { if (!(k === 0 ? v('start') : v('trail'))) continue; const t = k / n; kids.push(marker(grp[i].spiky, x1 + (x2 - x1) * e * t, y1 + (y2 - y1) * e * t, 8, 'shadow', `fill:${col(i)};opacity:${(.12 + .5 * t).toFixed(2)}`)); }   // the faintest one is where the group really is
    });
    const at = (p, i) => (trail ? [p[0] + (Q[i].q[0] - p[0]) * e, p[1] + (Q[i].q[1] - p[1]) * e] : p);
    const showMarker = trail ? v('end') : v('start');   // the solid marker is where a group is stored (trail figure) or where it is after the rotation (the others)
    if (showMarker) P.forEach((p, i) => { const [cx, cy] = pt(...at(p, i)); kids.push(marker(grp[i].spiky, cx, cy, 8, 'pt' + (i === rot.sel ? ' sel' : ''), `fill:${col(i)}`, { 'data-i': i })); });
    if (showMarker) P.forEach((p, i) => { const [cx, cy] = pt(...at(p, i)); kids.push(svgText(cx, cy + markerDy(grp[i].spiky), i + 1, 'middle', 'lbl gnum', 'fill:var(--bg);dominant-baseline:central')); });   // the group's number, inside its marker
    if (has('bits') && v('bits')) {                    // the stored value of each group, kept clear of every marker, of the level numbers and of the other labels
      Q.forEach((o, i) => { const [x, y] = pt(o.q[0], o.q[1]); obstacles.push({ x: x - 11, y: y - 11, w: 22, h: 22 }); });
      const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const VX0 = 0, VX1 = 330, VY0 = -8, VY1 = 314, placed = [];
      Q.forEach((o, i) => {
        const [x, y] = pt(o.q[0], o.q[1]), text = `(${o.ix.map(bin).join(',')})`, w = text.length * 6.2 + 2, h = 12;
        let best = null;
        for (const dist of [13, 21, 31]) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', tx = x + dx * dist * (dy ? .8 : 1), ty = y + dy * dist * (dx ? .8 : 1) + (dy > 0 ? 6 : dy < 0 ? -2 : 4);   // the text's baseline
          const bx = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2, box = { x: bx, y: ty - 9.5, w, h };
          const out = Math.max(0, VX0 - box.x) + Math.max(0, box.x + w - VX1) + Math.max(0, VY0 - box.y) + Math.max(0, box.y + h - VY1);
          const score = [...obstacles, ...placed].reduce((a, ob) => a + overlap(box, ob), 0) + out * 40 + dist * .3;
          if (!best || score < best.score) best = { score, tx, ty, anchor, box };
        }
        placed.push(best.box);
        kids.push(svgText(best.tx, best.ty, text, best.anchor, 'lbl bitl', `fill:${col(i)};opacity:${(e ** 3).toFixed(2)}`));
      });
    }
    let curves = null;
    if (has('curve')) {                                // the largest weight as a share of the group's length, at every angle: one curve for each kind of group
      const spike = (flag) => (d) => { const g2 = grp.filter((g) => g.spiky === flag); return mean(g2.map((g) => { const q = turn2(g.dir, d); return Math.max(Math.abs(q[0]), Math.abs(q[1])); })); };
      const cW = Array.from({ length: 91 }, (_, d) => spike(true)(d)), cO = Array.from({ length: 91 }, (_, d) => spike(false)(d)); curves = { cW, cO };
      const x0 = 410, x1 = 620, y0 = 250, y1 = 50, lo = .65, top = 1.02, CXa = (d) => x0 + (x1 - x0) * d / 90, CYa = (e) => y0 - (y0 - y1) * (e - lo) / (top - lo);
      kids.push(svgLine(x0, y0, x1, y0, 'ax'), svgLine(x0, y0, x0, y1, 'ax'));
      if (had) kids.push(svgLine(CXa(45), y0, CXa(45), y1, 'hadl'));
      [[cW, GOLD], [cO, BLUE]].forEach(([c, color]) => { kids.push(sv('polyline', { points: c.map((e, d) => `${CXa(d)},${CYa(e)}`).join(' '), class: 'crv' }, `stroke:${color}`), sv('circle', { cx: CXa(rot.deg), cy: CYa(c[rot.deg]), r: 4.5, class: 'cdot' }, `fill:${color}`)); });
      kids.push(svgLine(CXa(rot.deg), y0, CXa(rot.deg), y1, 'cur'));
      (had ? [0, 45, 90] : [0, 90]).forEach((d) => kids.push(svgText(CXa(d), y0 + 15, d + '°', 'middle')));
      [.7, .85, 1].forEach((v) => kids.push(svgLine(x0 - 4, CYa(v), x0, CYa(v), 'ax'), svgText(x0 - 8, CYa(v) + 4, (v * 100).toFixed(0) + '%', 'end')));
      if (had) kids.push(svgText(CXa(45), y0 + 28, 'Hadamard', 'middle', 'lbl hadt'));
      kids.push(marker(true, x0 - 32, 32, 6, 'ghost', `stroke:${GOLD};stroke-dasharray:none`), svgText(x0 - 22, 36, NA, 'start'), marker(false, x0 + 96, 32, 6, 'ghost', `stroke:${BLUE};stroke-dasharray:none`), svgText(x0 + 106, 36, NB, 'start'));   // the legend sits above the plot, clear of the curves
      kids.push(svgText(x0 - 40, y1 - 38, 'largest weight ÷ length (average)', 'start'), svgText((x0 + x1) / 2, y0 + (had ? 44 : 30), 'rotation angle', 'middle'));
    }
    svg.replaceChildren(...kids);
    if (!note || !curves) return;
    const avgErr = (flag) => (d) => mean(grp.filter((g) => g.spiky === flag).map((g) => quant(turn2(g.dir, d).map((x) => x * (md === 'plain' ? g.len : 1)), md).err));
    const set = (flag, name, c) => `${name}: largest weight ${pct0(c[rot.deg])} of the length (${pct0(c[0])} before${had ? `, ${pct0(c[45])} at 45°` : ''}), rounding error ${pct0(avgErr(flag)(rot.deg))} (${pct0(avgErr(flag)(0))} before${had ? `, ${pct0(avgErr(flag)(45))} at 45°` : ''})`;
    note.textContent = `Rotated ${rot.deg}°. Group ${rot.sel + 1} (${grp[rot.sel].spiky ? 'spiky' : 'flat'}): (${sel[0].toFixed(2)}, ${sel[1].toFixed(2)}), largest weight ${pct0(Math.max(...sel.map(Math.abs)) / Math.hypot(...sel))} of its length, rounding error ${pct0(err)}. On average, ${set(true, cl ? 'spiky groups (triangles)' : 'first half (spiky, triangles)', curves.cW)}; ${set(false, cl ? 'flat groups (circles)' : 'second half (flat, circles)', curves.cO)}. ${md === 'plain' ? 'Each group has its own square, reaching its largest weight.' : 'Every group shares the one fixed grid.'}`;
    const box = $(fig, '.sx-mat');
    if (box) {
      const c = Math.cos(rot.deg * Math.PI / 180), sn = Math.sin(rot.deg * Math.PI / 180), h = Math.SQRT1_2;
      const tbl = (M) => { const t = el('table'); M.forEach((row) => { const tr = el('tr'); row.forEach((v) => { const td = el('td', 'num', (v < 0 ? '−' : '') + Math.abs(v).toFixed(2)); td.style.background = `color-mix(in srgb, var(--sx-gold) ${Math.abs(v) * 70}%, transparent)`; tr.append(td); }); t.append(tr); }); return t; };
      const lab = (t) => el('span', 'sx-note', t);
      box.replaceChildren(lab('rotation by this angle'), tbl([[c, -sn], [sn, c]]), lab('Hadamard matrix'), tbl([[h, h], [h, -h]]), lab(rot.deg === 45 ? 'At 45° the rotation has the same entries as the Hadamard matrix, with its two rows swapped.' : ''));
    }
  };
  v = toggleRow(fig, svg, () => draw());
  sc.subs.push(draw);
  // mock groups and levels: shared by every figure of the scene
  on('[data-k=n]', 'input', (e) => { sc.st.n = +e.target.value; $(fig, '[data-o=n]').textContent = sc.st.n; everyone(); });
  choice(fig, 'mode', (mode) => { sc.st.mode = mode; everyone(); });
  // rotation: per figure
  const set = (d) => { rot.deg = d; $(fig, '[data-k=deg]').value = d; $(fig, '[data-o=deg]').textContent = d + '°'; draw(); };
  on('[data-k=deg]', 'input', (e) => set(+e.target.value));
  on('[data-act=had]', 'click', () => set(45));
  on('[data-act=reset]', 'click', () => set(0));
  on('[data-act=replay]', 'click', play);
  on('[data-act=follow]', 'click', (e) => { rot.follow = !rot.follow; e.currentTarget.setAttribute('aria-pressed', String(rot.follow)); draw(); });
  if (svg) svg.addEventListener('click', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i != null) { rot.sel = +i; draw(); } });
  { const n = $(fig, '[data-o=n]'); if (n) n.textContent = sc.st.n; }
  if ($(fig, '[data-k=deg]')) set(0); else draw();
  if (has('trail') && svg && 'IntersectionObserver' in window) new IntersectionObserver((es, ob) => { if (es[0].isIntersecting) { ob.disconnect(); play(); } }, { threshold: .6 }).observe(svg);   // play once when the figure is first in view
};
