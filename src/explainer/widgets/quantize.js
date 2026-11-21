import { $, el, sv, svgText } from '../core/dom.js';
import { mel, setMath } from '../core/math.js';
import { gauss, nextSeed, rng } from '../core/random.js';

// 0. Plain quantization: fewer bits, coarser rounding, what an outlier does to it, and the bits themselves
export default (fig) => {
  const N = 40, SIGMA = 0.05, RANGE = 0.5, state = { bits: 3, outlier: false, sel: 3 }; let seed = 5;
  const svg = $(fig, 'svg'), note = $(fig, '.sx-note'), panel = $(fig, '.sx-bits');
  const f32 = (x) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x); return d.getUint32(0).toString(2).padStart(32, '0'); };
  const boxes = (str, cls) => { const w = el('div', 'sx-bitrow'); [...str].forEach((c, i) => { const b = el('span', 'b ' + (cls instanceof Function ? cls(i) : cls), c); w.append(b); }); return w; };
  const draw = () => {
    const r = rng(seed), g = () => gauss(r);
    const w = Array.from({ length: N }, () => g() * SIGMA); if (state.outlier) w[Math.floor(r() * N)] = 9 * SIGMA * (r() < .5 ? -1 : 1);
    const m = Math.max(...w.map(Math.abs)), n = 2 ** state.bits, step = 2 * m / (n - 1);
    const idxOf = (x) => Math.round((x + m) / step), levels = Array.from({ length: n }, (_, k) => -m + k * step), nearest = (x) => -m + idxOf(x) * step;
    const X = (x) => 20 + ((x + RANGE) / (2 * RANGE)) * 600, big = w.findIndex((x) => Math.abs(x) === m);
    const kids = [sv('line', { x1: 20, x2: 620, y1: 128, y2: 128, class: 'axis' })];
    levels.forEach((l) => kids.push(sv('line', { x1: X(l), x2: X(l), y1: 120, y2: 136, class: 'level' })));
    w.forEach((x, i) => {
      const y = 34 + (i % 6) * 13;
      kids.push(sv('line', { x1: X(x), x2: X(nearest(x)), y1: y, y2: 120, class: 'snap' }));
      kids.push(sv('circle', { cx: X(x), cy: y, r: 4, class: (state.outlier && i === big ? 'dot out' : 'dot') + (i === state.sel ? ' sel' : ''), 'data-i': i }));
    });
    // level numbers under the ticks: decimal, and binary when it fits (staggered over two rows)
    const gap = X(step) - X(0), selK = idxOf(w[state.sel]);
    let stride = 1; while (gap * stride < 15 && stride < n) stride *= 2;
    const showBin = gap * stride * 2 >= state.bits * 6.2 + 4;
    levels.forEach((l, k) => {
      if (k !== selK && (k % stride || Math.abs(X(l) - X(levels[selK])) < state.bits * 6.2 + 4)) return;
      const cls = k === selK ? ' selk' : '';
      kids.push(svgText(X(l), 150, String(k), 'middle', 'lv' + cls));
      if (showBin || k === selK) kids.push(svgText(X(l), 162 + (showBin && (k / stride) % 2 ? 11 : 0), k.toString(2).padStart(state.bits, '0'), 'middle', 'bn' + cls));
    });
    // value ruler above the dots: the actual weights
    kids.push(sv('line', { x1: 20, x2: 620, y1: 18, y2: 18, class: 'axis' }));
    for (let t = -10; t <= 10; t++) {
      const v = t * 0.05, major = t % 5 === 0;
      kids.push(sv('line', { x1: X(v), x2: X(v), y1: 18, y2: major ? 25 : 22, class: 'axis' }));
      if (major) kids.push(svgText(X(v), 11, String(Number(v.toFixed(2))), 'middle', 'lbl'));
    }
    svg.replaceChildren(...kids);
    const e2 = w.reduce((a, x) => a + (x - nearest(x)) ** 2, 0), p2 = w.reduce((a, x) => a + x * x, 0);
    setMath(note, `${state.bits} bit${state.bits > 1 ? 's' : ''} give \\(2^{${state.bits}} = ${n}\\) levels, ${Number((32 / state.bits).toFixed(1))}× smaller than 32-bit floats. Rounding error: ${(Math.sqrt(e2 / p2) * 100).toFixed(0)}% of the weights' own size. Gap between neighbouring levels: ${step.toFixed(3)}.`);
    const x = w[state.sel], k = idxOf(x), bits = f32(x);
    panel.replaceChildren(
      el('p', null, `Selected weight: ${x.toFixed(4)}. As a 32-bit float it is these bits (sign, exponent, mantissa):`),
      boxes(bits, (i) => (i === 0 ? 's' : i < 9 ? 'e' : 'm')),
      el('p', null, `Quantized, it is only the number of its nearest level, counting from the left (0 to ${n - 1}). That is ${k}, written in ${state.bits} bit${state.bits > 1 ? 's' : ''}:`),
      boxes(k.toString(2).padStart(state.bits, '0'), 'i'),
      mel('p', null, `To read it back: \\(\\mathrm{level} = -m + \\mathrm{index}\\times\\mathrm{gap} = -${m.toFixed(4)} + ${k}\\times ${step.toFixed(4)} = ${nearest(x).toFixed(4)}\\). The weight was ${x.toFixed(4)}, so the error is ${Math.abs(x - nearest(x)).toFixed(4)}.`),
      mel('p', null, `All ${N} weights as 32-bit floats: \\(${N}\\times 32 = ${N * 32}\\) bits. Quantized: \\(${N}\\times ${state.bits} = ${N * state.bits}\\) bits for the indices, plus \\(m = ${m.toFixed(4)}\\) stored once as a 32-bit float, so \\(${N * state.bits} + 32 = ${N * state.bits + 32}\\) bits in all.`));
  };
  svg.addEventListener('click', (e) => { const i = e.target.dataset && e.target.dataset.i; if (i != null) { state.sel = +i; draw(); } });
  $(fig, '[data-k=bits]').addEventListener('input', (e) => { state.bits = +e.target.value; $(fig, '[data-o=bits]').textContent = state.bits; draw(); });
  $(fig, '[data-k=outlier]').addEventListener('click', (e) => { state.outlier = !state.outlier; e.currentTarget.setAttribute('aria-pressed', String(state.outlier)); draw(); });
  $(fig, '[data-act=new]').addEventListener('click', () => { seed = nextSeed(seed); draw(); });
  $(fig, '[data-o=bits]').textContent = state.bits; draw();
};
