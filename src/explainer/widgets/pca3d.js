import { $ } from '../core/dom.js';
import { jacobi } from '../core/linalg.js';
import { spin } from '../core/spin.js';
import { gauss, nextSeed, rng } from '../core/random.js';

// 6c. PCA versus a flattening rotation on a 3D cloud
export default (fig) => {
  const N = 60, S = 92, CX = 320, CY = 168, state = { ds: 'axes', rot: 'pca', t: 0, yaw: -0.6, pitch: 0.4 }; let seed = 9;
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note'), NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rodrigues = (v, ax, ang) => { const c = Math.cos(ang), s = Math.sin(ang), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], cr = cross(ax, v); return [0, 1, 2].map((i) => v[i] * c + cr[i] * s + ax[i] * d * (1 - c)); };
  const quat = (R) => {                               // rotation matrix to quaternion, then to axis and angle (shortest way round)
    const tr = R[0][0] + R[1][1] + R[2][2]; let w, x, y, z;
    if (tr > 0) { const k = Math.sqrt(tr + 1) * 2; w = k / 4; x = (R[2][1] - R[1][2]) / k; y = (R[0][2] - R[2][0]) / k; z = (R[1][0] - R[0][1]) / k; }
    else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const k = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; w = (R[2][1] - R[1][2]) / k; x = k / 4; y = (R[0][1] + R[1][0]) / k; z = (R[0][2] + R[2][0]) / k; }
    else if (R[1][1] > R[2][2]) { const k = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; w = (R[0][2] - R[2][0]) / k; x = (R[0][1] + R[1][0]) / k; y = k / 4; z = (R[1][2] + R[2][1]) / k; }
    else { const k = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; w = (R[1][0] - R[0][1]) / k; x = (R[0][2] + R[2][0]) / k; y = (R[1][2] + R[2][1]) / k; z = k / 4; }
    if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
    const ang = 2 * Math.acos(Math.min(1, w)), sh = Math.sin(ang / 2);
    return sh < 1e-9 ? { ax: [0, 0, 1], ang: 0 } : { ax: [x / sh, y / sh, z / sh], ang };
  };
  let pts = [], pc = null;
  const gen = () => {
    const r = rng(seed), g = () => gauss(r);
    if (state.ds === 'axes') pts = Array.from({ length: N }, () => { const p = [.07 * g(), .07 * g(), .07 * g()]; p[Math.floor(r() * 3)] += (r() < .5 ? -1 : 1) * (.9 + .12 * g()); return p; });
    else { const d = [.8, .45, .35], l = Math.hypot(...d); pts = Array.from({ length: N }, () => { const a = .65 * g(); return d.map((x) => a * x / l + .12 * g()); }); }
    const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((a, p) => a + p[i] * p[j], 0) / N)), { vecs, vals } = jacobi(C);
    if (cross(vecs[0], vecs[1]).reduce((a, x, i) => a + x * vecs[2][i], 0) < 0) vecs[2] = vecs[2].map((x) => -x);   // keep a proper rotation
    pc = { vecs, vals, ...quat(vecs) };               // rows of the rotation are the principal axes
  };
  const turn = (p) => state.rot === 'pca' ? rodrigues(p, pc.ax, pc.ang * state.t / 100) : rodrigues(p, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)], (Math.PI / 3) * state.t / 100);
  const proj = (p) => {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch), x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy;
    return [CX + S * x1, CY - S * (p[2] * cp + y1 * sp), y1 * cp - p[2] * sp];
  };
  const st = (P) => { let err = 0; const en = [0, 0, 0], tot = P.reduce((a, p) => a + p[0] ** 2 + p[1] ** 2 + p[2] ** 2, 0), per = P.map((p) => { const m = Math.max(...p.map(Math.abs)), step = 2 * m / 3, e = Math.hypot(...p.map((x) => x - (-m + Math.round((x + m) / step) * step))) / Math.hypot(...p); err += e / N; return e; });
    P.forEach((p) => p.forEach((x, i) => { en[i] += x * x / tot; })); return { err, en, per }; };
  const draw = () => {
    const P = pts.map(turn), now = st(P), before = st(pts), kids = [];
    const line = (a, b, cls) => { const [x1, y1] = proj(a), [x2, y2] = proj(b); return mk('line', { x1, y1, x2, y2, class: cls }); };
    [[1.5, 0, 0, 'w₁'], [0, 1.5, 0, 'w₂'], [0, 0, 1.5, 'w₃']].forEach(([x, y, z, t]) => {
      kids.push(line([-x, -y, -z], [x, y, z], 'ax'));
      const [px, py] = proj([x * 1.07, y * 1.07, z * 1.07]), tx = mk('text', { x: px, y: py, class: 'lbl', 'text-anchor': 'middle' }); tx.textContent = t; kids.push(tx);
    });
    if (state.rot === 'pca') pc.vecs.forEach((v, k) => { const L = 1.6 * Math.sqrt(pc.vals[k]) + .25, a = turn(v.map((x) => -x * L)), b = turn(v.map((x) => x * L)); kids.push(line(a, b, 'pax')); });
    P.map((p, i) => ({ p, i, d: proj(p)[2] })).sort((a, b) => b.d - a.d).forEach(({ p, i }) => {
      const [x, y] = proj(p), t = Math.min(1, now.per[i] / .45);
      kids.push(mk('circle', { cx: x, cy: y, r: 3.6, style: `fill:color-mix(in srgb, var(--sx-red) ${t * 100}%, var(--sx-blue))` }));
    });
    svg.replaceChildren(...kids);
    const f = (a) => a.map((x) => (x * 100).toFixed(0) + '%').join(', ');
    note.textContent = `${state.t}% of the ${state.rot === 'pca' ? 'PCA rotation' : 'flattening rotation'}. Average 2-bit rounding error: ${(now.err * 100).toFixed(0)}% (${(before.err * 100).toFixed(0)}% before rotating). Energy in the three coordinates: ${f(now.en)}.`;
  };
  const rebuild = () => { gen(); draw(); };
  fig.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', () => { state.ds = b.dataset.ds; fig.querySelectorAll('[data-ds]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); rebuild(); }));
  fig.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => { state.rot = b.dataset.rot; fig.querySelectorAll('[data-rot]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  $(fig, '[data-k=t]').addEventListener('input', (e) => { state.t = +e.target.value; $(fig, '[data-o=t]').textContent = state.t + '%'; draw(); });
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = nextSeed(seed); rebuild(); });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; });
  window.addEventListener('pointermove', (e) => { if (!drag) return; state.yaw = drag.yaw + (e.clientX - drag.x) * 0.01; state.pitch = Math.max(0.05, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01)); draw(); });
  window.addEventListener('pointerup', () => { drag = null; });
  spin(fig, state, draw, () => !!drag);
  $(fig, '[data-o=t]').textContent = '0%'; rebuild();
};
