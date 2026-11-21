import { divColor, goldColor, redColor } from '../core/colors.js';
import { $, el, sv } from '../core/dom.js';
import { matrixCells, matrixGroups } from '../core/matrix.js';
import { spin } from '../core/spin.js';

// 6a. Groups of three weights: the two-weight figures in 3D. Figures with the same data-scene share their groups; data-layers says what each draws:
// strips, points, quant (cubes, grids, rings and arrows), ghost (where the groups started), curve (spikiness against angle), loss (how much each group loses).
// The groups run from a short one dominated by one weight (on an axis) to a long one with three equal weights (on the diagonal (1, 1, 1)), spread evenly in length and direction;
// the first half are spiky (triangles), the second half flat (circles). The rotation is a turn about that diagonal: 60 degrees is the flattest 3x3 rotation.
const scenes3 = {};
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const rodr = (v, ax, ang) => { const c = Math.cos(ang), s = Math.sin(ang), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], cr = cross3(ax, v); return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + ax[i] * d * (1 - c)); };
const DIAG3 = norm3([1, 1, 1]), TILT = Math.acos(1 / Math.sqrt(3)), TILT_AX = norm3(cross3([1, 0, 0], DIAG3));
const groups3 = (n) => Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0; return { dir: rodr([1, 0, 0], TILT_AX, TILT * t), len: .35 + t, spiky: i < n / 2 }; });
const turn3 = (v, deg) => rodr(v, DIAG3, deg * Math.PI / 180);
const quant3 = (p) => { const m = Math.max(...p.map(Math.abs)), st = 2 * m / 3, ix = p.map((x) => Math.max(0, Math.min(3, Math.round((x + m) / st)))), q = ix.map((k) => -m + k * st); return { m, q, ix, err: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) / Math.hypot(...p) }; };
const marker3 = (spiky, cx, cy, r, cls, style, extra) => (spiky
  ? sv('polygon', { points: `${cx},${cy - r * 1.3} ${cx - r * 1.2},${cy + r * .85} ${cx + r * 1.2},${cy + r * .85}`, class: cls, ...extra }, style)
  : sv('circle', { cx, cy, r, class: cls, ...extra }, style));
export default (fig) => {
  const layers = (fig.dataset.layers || 'points').split(/\s+/), has = (l) => layers.includes(l);
  const sc = scenes3[fig.dataset.scene || 'three'] || (scenes3[fig.dataset.scene || 'three'] = { st: { n: 4 }, subs: [] });
  const rot = { deg: 0, sel: 0, follow: false }, view = { yaw: -.6, pitch: .4 }, vis = {}, v = (k) => vis[k] !== false;
  const CX = 190, CY = 170, S = 100, GOLD = 'var(--sx-gold)', BLUE = 'var(--sx-blue)';
  const svg = $(fig, 'svg.sx-r3g'), note = $(fig, '.sx-readout');
  const on = (sel, ev, fn) => { const e = $(fig, sel); if (e) e.addEventListener(ev, fn); };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1), pc = (x) => (x * 100).toFixed(0) + '%';
  const word = (x, y, str, anchor, cls, style) => { const t = sv('text', { x, y, 'text-anchor': anchor, class: cls || 'lbl' }, style); t.textContent = str; return t; };
  let drag = null;
  const draw = () => {
    const grp = groups3(sc.st.n), N = grp.length, col = (i) => `var(--pc${i % 8})`; rot.sel = Math.min(rot.sel, N - 1);
    const P0 = grp.map((g) => g.dir.map((x) => x * g.len)), P = P0.map((p) => turn3(p, rot.deg)), Q = P.map(quant3), inside = (sp) => (sp ? 3 : .5);
    const tw = $(fig, '[data-v=tw]');
    if (tw) {                                          // a row of weights cut into groups of three, with the scales and the rounding errors, at the cell size of the other figures
      const CW = 10, RH = 11, BAND = 15, scl = Q.map((o) => o.m), smax = Math.max(...scl), line1 = { R: 1, C: 3 * N, CW, RH, gs: 3, rows: false };
      const w = (c) => P[(c / 3) | 0][c % 3], q = (c) => Q[(c / 3) | 0].q[c % 3];
      const chips = P.flatMap((p, i) => { const g = marker3(grp[i].spiky, (i + .5) * 3 * CW, 7, 5.5, '', `fill:${col(i)}`), t = sv('text', { x: (i + .5) * 3 * CW, y: 7.3 + (grp[i].spiky ? 1.5 : 0), 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'gnum2' }); t.textContent = i + 1; return [g, t]; });
      const put = (e, h, kids) => { e.setAttribute('viewBox', `0 0 640 ${h}`); e.replaceChildren(...kids); };
      const shifted = sv('g', { transform: `translate(0,${BAND})` }); shifted.append(...matrixCells({ ...line1, color: (r, c) => divColor(w(c), 1.5), label: (r, g) => scl[g].toFixed(2) }));
      put(tw, BAND + RH, [...chips, shifted]);
      put($(fig, '[data-v=ts]'), RH, matrixGroups({ ...line1, color: (r, g) => goldColor(scl[g], smax) }));
      put($(fig, '[data-v=te]'), RH, matrixCells({ ...line1, color: (r, c) => redColor(Math.abs(w(c) - q(c)), .5) }));
    }
    const lossSvg = $(fig, '[data-v=loss]');
    if (lossSvg) {                                     // how much each group loses, first half against second half
      const kids = [], rows = [['First half', 'closer to an axis (spiky)', true, 52], ['Second half', 'closer to the diagonal (flat)', false, 118]], top = has('curve') ? .6 : Math.max(...Q.map((o) => o.err)) * 1.2, x0 = 200, x1 = 620, X = (x) => x0 + (x1 - x0) * x / top;
      kids.push(sv('line', { x1: x0, x2: x1, y1: 158, y2: 158, class: 'ax' }));
      const step = top > .5 ? .2 : top > .25 ? .1 : .05;
      for (let x = 0; x <= top; x += step) { kids.push(sv('line', { x1: X(x), x2: X(x), y1: 158, y2: 163, class: 'ax' })); kids.push(word(X(x), 176, pc(x), 'middle')); }
      kids.push(word((x0 + x1) / 2, 194, 'rounding error of the group, as a share of its length', 'middle'));
      rows.forEach(([name, sub, flag, y]) => {
        const list = Q.map((o, i) => ({ i, loss: o.err })).filter((g) => grp[g.i].spiky === flag);
        kids.push(word(10, y - 8, name, 'start', 'lbl rowname'), word(10, y + 7, sub, 'start'), word(10, y + 22, `${list.length} group${list.length === 1 ? '' : 's'}`, 'start'));
        list.forEach((g, k) => { const cx = X(g.loss), cy = y + ((k % 3) - 1) * 20; kids.push(marker3(flag, cx, cy, 8, 'lossdot', `fill:${col(g.i)}`), word(cx, cy + inside(flag), g.i + 1, 'middle', 'lbl gnum', 'fill:var(--bg);dominant-baseline:central')); });
        const mu = mean(list.map((g) => g.loss)); kids.push(sv('line', { x1: X(mu), x2: X(mu), y1: y - 38, y2: y + 38, class: 'mean' }), word(X(mu), y - 42, 'mean ' + pc(mu), 'middle', 'lbl meant'));
      });
      lossSvg.replaceChildren(...kids);
      const ln = $(fig, '[data-v=lossnote]'), mw = mean(Q.filter((o, i) => grp[i].spiky).map((o) => o.err)), mo = mean(Q.filter((o, i) => !grp[i].spiky).map((o) => o.err));
      if (ln) ln.textContent = `The first half (spiky, triangles) lose ${pc(mw)} of their length on average, the second half (flat, circles) ${pc(mo)}.${mo < .005 ? ' The flat groups lose almost nothing.' : mw >= mo * 1.05 ? ` The spiky ones lose ${(mw / mo).toFixed(1)} times as much.` : mo >= mw * 1.05 ? ` Now the flat ones lose more: ${(mo / mw).toFixed(1)} times as much.` : ' About the same.'}`;
    }
    if (!svg) return;
    const kids = [], sel = P[rot.sel], { m, err } = Q[rot.sel];
    // Camera off: it stays with the axes and the points move. On: it stays with the points, and everything else turns the other way.
    const proj = (p0) => { const p = rot.follow ? turn3(p0, -rot.deg) : p0, cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch), x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy; return [CX + S * x1, CY - S * (p[2] * cp + y1 * sp), y1 * cp - p[2] * sp]; };
    const seg = (a, b, cls, style) => { const [x1, y1] = proj(a), [x2, y2] = proj(b); return sv('line', { x1, y1, x2, y2, class: cls }, style); };
    [[1.5, 0, 0, 'w₁'], [0, 1.5, 0, 'w₂'], [0, 0, 1.5, 'w₃']].forEach(([x, y, z, t]) => { kids.push(seg([-x, -y, -z], [x, y, z], 'ax')); const [px, py] = proj([x * 1.09, y * 1.09, z * 1.09]); kids.push(word(px, py + 4, t, 'middle', 'lbl axl')); });
    if (has('quant')) {
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      Q.forEach((o, i) => {                            // every group has its own cube of levels, in its own colour
        const mm = o.m, C8 = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]].map((c) => c.map((x) => x * mm));
        if (v('cubes')) edges.forEach(([a, b]) => kids.push(seg(C8[a], C8[b], 'cube3', `stroke:${col(i)};stroke-width:${i === rot.sel ? 1.8 : 1};opacity:${i === rot.sel ? 1 : .45}`)));
        if (v('grid')) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) { const [x, y] = proj([-mm + a * 2 * mm / 3, -mm + b * 2 * mm / 3, -mm + c * 2 * mm / 3]); kids.push(sv('circle', { cx: x, cy: y, r: 1.3, class: 'gd' }, `fill:${col(i)};opacity:.45`)); }
      });
      if (v('end')) Q.forEach((o, i) => {              // a hollow marker where each group is stored
        const [x, y] = proj(o.q), [px, py] = proj(P[i]);
        kids.push(marker3(grp[i].spiky, x, y, 8, 'dest', `stroke:${col(i)};stroke-width:${i === rot.sel ? 3 : 2}`));
        if (Math.hypot(x - px, y - py) >= 22) kids.push(word(x, y + inside(grp[i].spiky), i + 1, 'middle', 'lbl gnum', `fill:${col(i)};dominant-baseline:central`));
      });
      if (v('trail')) P.forEach((p, i) => {            // an arrow from each group to the grid point it is stored as
        const [x1, y1] = proj(p), [x2, y2] = proj(Q[i].q), d = Math.hypot(x2 - x1, y2 - y1); if (d < 22) return;
        const ux = (x2 - x1) / d, uy = (y2 - y1) / d, sx = x1 + ux * 9, sy = y1 + uy * 9, tx = x2 - ux * 9, ty = y2 - uy * 9, hl = Math.min(11, (d - 18) * .7), bx = tx - ux * hl, by = ty - uy * hl, wd = i === rot.sel ? 3 : 2.2, hw = hl * .45;
        const tri = `${tx},${ty} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`;
        kids.push(sv('line', { x1: sx, y1: sy, x2: bx, y2: by, class: 'snap3' }, `stroke:var(--bg);stroke-width:${wd + 3.5}`), sv('polygon', { points: tri, class: 'arrh' }, 'fill:var(--bg);stroke:var(--bg);stroke-width:3.5;stroke-linejoin:round'));
        kids.push(sv('line', { x1: sx, y1: sy, x2: bx, y2: by, class: 'snap3' }, `stroke:${col(i)};stroke-width:${wd}`), sv('polygon', { points: tri, class: 'arrh' }, `fill:${col(i)}`));
      });
    }
    if (has('ghost') && v('pre')) P0.forEach((p, i) => { const [cx, cy] = proj(p); kids.push(marker3(grp[i].spiky, cx, cy, 7, 'ghost', `stroke:${col(i)}`)); });   // where the groups started, relative to the axes
    if (v('start')) P.map((p, i) => ({ i, pr: proj(p) })).sort((a, b) => b.pr[2] - a.pr[2]).forEach(({ i, pr }) => {   // far ones first
      kids.push(marker3(grp[i].spiky, pr[0], pr[1], 8, 'pt' + (i === rot.sel ? ' sel' : ''), `fill:${col(i)}`, { 'data-i': i }), word(pr[0], pr[1] + inside(grp[i].spiky), i + 1, 'middle', 'lbl gnum', 'fill:var(--bg);dominant-baseline:central'));
    });
    let curves = null;
    if (has('curve')) {                                // the largest weight as a share of the group's length, at every angle, for each half
      const spike = (flag) => (d) => mean(grp.filter((g) => g.spiky === flag).map((g) => Math.max(...turn3(g.dir, d).map(Math.abs))));
      const cW = Array.from({ length: 121 }, (_, d) => spike(true)(d)), cO = Array.from({ length: 121 }, (_, d) => spike(false)(d)); curves = { cW, cO };
      const x0 = 410, x1 = 620, y0 = 250, y1 = 50, lo = .5, top = 1.02, CXa = (d) => x0 + (x1 - x0) * d / 120, CYa = (e) => y0 - (y0 - y1) * (e - lo) / (top - lo);
      kids.push(sv('line', { x1: x0, x2: x1, y1: y0, y2: y0, class: 'ax' }), sv('line', { x1: x0, x2: x0, y1: y0, y2: y1, class: 'ax' }), sv('line', { x1: CXa(60), x2: CXa(60), y1: y0, y2: y1, class: 'hadl' }));
      [[cW, GOLD], [cO, BLUE]].forEach(([c, color]) => kids.push(sv('polyline', { points: c.map((e, d) => `${CXa(d)},${CYa(e)}`).join(' '), class: 'crv' }, `stroke:${color}`), sv('circle', { cx: CXa(rot.deg), cy: CYa(c[rot.deg]), r: 4.5, class: 'cdot' }, `fill:${color}`)));
      kids.push(sv('line', { x1: CXa(rot.deg), x2: CXa(rot.deg), y1: y0, y2: y1, class: 'cur' }));
      [0, 60, 120].forEach((d) => kids.push(word(CXa(d), y0 + 15, d + '°', 'middle')));
      [.6, .8, 1].forEach((x) => kids.push(sv('line', { x1: x0 - 4, x2: x0, y1: CYa(x), y2: CYa(x), class: 'ax' }), word(x0 - 8, CYa(x) + 4, pc(x), 'end')));
      kids.push(marker3(true, x0 - 32, 32, 6, 'ghost', `stroke:${GOLD};stroke-dasharray:none`), word(x0 - 22, 36, 'first half (spiky)', 'start'), marker3(false, x0 + 96, 32, 6, 'ghost', `stroke:${BLUE};stroke-dasharray:none`), word(x0 + 106, 36, 'second half (flat)', 'start'));
      kids.push(word(x0 - 40, y1 - 38, 'largest weight ÷ length (average)', 'start'), word((x0 + x1) / 2, y0 + 30, 'rotation angle', 'middle'));
    }
    svg.replaceChildren(...kids);
    if (note && curves) {
      const avgErr = (flag) => (d) => mean(grp.filter((g) => g.spiky === flag).map((g) => quant3(turn3(g.dir.map((x) => x * g.len), d)).err));
      const set = (flag, name, c) => `${name}: largest weight ${pc(c[rot.deg])} of the length (${pc(c[0])} before), rounding error ${pc(avgErr(flag)(rot.deg))} (${pc(avgErr(flag)(0))} before)`;
      note.textContent = `Rotated ${rot.deg}°. Group ${rot.sel + 1} (${grp[rot.sel].spiky ? 'spiky' : 'flat'}): largest weight ${pc(Math.max(...sel.map(Math.abs)) / Math.hypot(...sel))} of its length, rounding error ${pc(err)}. On average, ${set(true, 'first half (spiky, triangles)', curves.cW)}; ${set(false, 'second half (flat, circles)', curves.cO)}.`;
    }
    const box = $(fig, '.sx-mat');
    if (box) {                                         // the rotation matrix at this angle: its columns are where the three axes go
      const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => turn3(e, rot.deg)), M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => cols[j][i])), t = el('table');
      M.forEach((row) => { const tr = el('tr'); row.forEach((x) => { const td = el('td', 'num', (x < 0 ? '−' : '') + Math.abs(x).toFixed(2)); td.style.background = `color-mix(in srgb, var(--sx-gold) ${Math.abs(x) * 70}%, transparent)`; tr.append(td); }); t.append(tr); });
      const big = Math.max(...M.flat().map(Math.abs)); box.replaceChildren(t, el('p', 'sx-note', `Rotation matrix now: largest entry ${big.toFixed(2)}${rot.deg === 60 ? ', the smallest any 3×3 rotation can reach' : ''}.`));
    }
  };
  const everyone = () => sc.subs.forEach((f) => f());
  if (fig.dataset.toggles && svg) {                  // a row of switches for the elements of the plot
    const row = el('div', 'sx-controls'); row.append(el('span', 'sx-rowlabel', 'Show'));
    fig.dataset.toggles.split(';').forEach((tok) => { const [k, label] = tok.split(':'), b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', 'true'); b.addEventListener('click', () => { vis[k] = !v(k); b.setAttribute('aria-pressed', String(v(k))); draw(); }); row.append(b); });
    svg.before(row);
  }
  sc.subs.push(draw);
  on('[data-k=n]', 'input', (e) => { sc.st.n = +e.target.value; $(fig, '[data-o=n]').textContent = sc.st.n; everyone(); });
  const set = (d) => { rot.deg = d; $(fig, '[data-k=deg]').value = d; $(fig, '[data-o=deg]').textContent = d + '°'; draw(); };
  on('[data-k=deg]', 'input', (e) => set(+e.target.value));
  on('[data-act=flat]', 'click', () => set(60));
  on('[data-act=reset]', 'click', () => set(0));
  on('[data-act=follow]', 'click', (e) => { rot.follow = !rot.follow; e.currentTarget.setAttribute('aria-pressed', String(rot.follow)); draw(); });
  if (svg) {
    svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, moved: false }; });
    window.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved) { view.yaw = drag.yaw + dx * .01; view.pitch = Math.max(.05, Math.min(1.4, drag.pitch + dy * .01)); draw(); } });
    window.addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
    svg.addEventListener('click', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i != null && !(drag && drag.moved)) { rot.sel = +i; draw(); } });
    if ($(fig, '[data-act=spin]')) spin(fig, view, draw, () => !!drag);
  }
  { const n = $(fig, '[data-o=n]'); if (n) n.textContent = sc.st.n; }
  if ($(fig, '[data-k=deg]')) set(0); else draw();
};
