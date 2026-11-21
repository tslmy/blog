import { ranges, switches } from '../core/controls.js';
import { $, el } from '../core/dom.js';
import { mel, setMath } from '../core/math.js';
import { fillTable } from '../core/table.js';

// How a 32-bit float works: a sign bit, 8 exponent bits and 23 mantissa bits, value = ±(1 + mantissa) × 2^(exponent − 127).
// Pick a decimal number to see its bits, or set the stored exponent and mantissa with the sliders.
const BIAS = 127, MANT = 2 ** 23;
const fmt = (v) => v.toLocaleString('en-US');

const encode = (x) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x); const b = d.getUint32(0); return { s: b >>> 31, e: (b >>> 23) & 255, m: b & 0x7fffff }; };
const decode = (s, e, m) => { const d = new DataView(new ArrayBuffer(4)); d.setUint32(0, ((s << 31) | (e << 23) | m) >>> 0); return d.getFloat32(0); };
const boxes = (str, cls) => { const row = el('div', 'sx-bitrow'); [...str].forEach((c) => row.append(el('span', 'b ' + cls, c))); return row; };

export default (fig) => {
  const tab = $(fig, '.sx-stat'), note = $(fig, '.sx-readout'), sign = $(fig, '[data-k=sign]');
  let typed = null;                                           // the decimal the reader picked, until a slider moves
  const on = switches(fig, () => { typed = null; draw(); });
  const ctl = ranges(fig, () => { typed = null; draw(); }, { m: fmt });
  const set = (x) => {
    const { s, e, m } = encode(x); typed = x;
    on.sign = !!s; sign.setAttribute('aria-pressed', String(!!s));
    [['e', e], ['m', m]].forEach(([k, v]) => { const input = $(fig, `[data-k=${k}]`); input.value = v; input.dispatchEvent(new Event('input')); });
    typed = x; draw();
  };
  const draw = () => {
    const s = on.sign ? 1 : 0, E = ctl.e, M = ctl.m, value = decode(s, E, M), frac = M / MANT, sub = E === 0, power = sub ? 1 - BIAS : E - BIAS, lead = sub ? 0 : 1;
    fillTable(tab, [
      ['', 'Bits', 'Stored as a number', 'What it means'],
      ['Sign', boxes(String(s), 's'), String(s), mel('span', null, s ? '\\(-1\\): negative' : '\\(+1\\): positive')],
      ['Exponent', boxes(E.toString(2).padStart(8, '0'), 'e'), fmt(E), mel('span', null, sub ? `\\(0\\) is the special code for tiny numbers: no leading 1, and the power is fixed at \\(2^{-126}\\)` : `\\(${E} - ${BIAS} = ${power}\\), so the power of two is \\(2^{${power}} = ${Number((2 ** power).toPrecision(6))}\\)`)],
      ['Mantissa', boxes(M.toString(2).padStart(23, '0'), 'm'), fmt(M), mel('span', null, `\\(${fmt(M)} / 2^{23} = ${frac.toFixed(7)}\\), so the number before the power of two is \\(${lead} + ${frac.toFixed(7)} = ${(lead + frac).toFixed(7)}\\)`)],
    ], { rowHeaders: true });
    setMath(note, `\\(${s ? '-' : ''}${(lead + frac).toFixed(7)} \\times 2^{${power}} = ${value}\\)`
      + (typed !== null && value !== typed ? `. The decimal number ${typed} has no exact binary form, so the float holds the nearest one it can: ${value}.` : '.'));
  };
  fig.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => set(+b.dataset.preset)));
  set(0.137);
};
