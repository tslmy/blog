import { ranges, switches } from '../core/controls.js';
import { $, el } from '../core/dom.js';
import { mel, setDisplayMath } from '../core/math.js';
import { fillTable } from '../core/table.js';

// How a float works, at any size: a sign bit, `eb` exponent bits and `mb` mantissa bits (a 32-bit float has 8 and 23),
// value = ±(1 + mantissa) × 2^(exponent − bias). Pick a decimal number to see its bits, set the stored exponent and mantissa,
// or change how many bits each gets. The all-ones exponent is reserved (infinity and NaN), as in real floats.
const fmt = (v) => v.toLocaleString('en-US');
// a JavaScript number as TeX: 8.8e-39 becomes 8.8 \times 10^{-39}
const texNumber = (v) => String(v).replace(/e([+-]?\d+)/, (_, p) => ` \\times 10^{${+p}}`);
const boxes = (str, cls) => { const row = el('div', 'sx-bitrow'); [...str].forEach((c) => row.append(el('span', 'b ' + cls, c))); return row; };

// the sign, stored exponent and stored mantissa of the float with eb and mb bits nearest to x (overflow clamps to the largest)
const encode = (x, eb, mb) => {
  const bias = 2 ** (eb - 1) - 1, top = 2 ** eb - 2, s = x < 0 || Object.is(x, -0) ? 1 : 0, a = Math.abs(x);
  if (a === 0) return { s, e: 0, m: 0 };
  let p = Math.floor(Math.log2(a));
  if (2 ** p > a) p--;
  if (p + bias < 1) {                                          // too small for a leading 1: a tiny (subnormal) number
    const m = Math.round(a / 2 ** (1 - bias) * 2 ** mb);
    return m >= 2 ** mb ? { s, e: 1, m: 0 } : { s, e: 0, m };
  }
  let m = Math.round((a / 2 ** p - 1) * 2 ** mb);
  if (m === 2 ** mb) { m = 0; p++; }
  return p + bias > top ? { s, e: top, m: 2 ** mb - 1 } : { s, e: p + bias, m };
};

export default (fig) => {
  const tab = $(fig, '.sx-stat'), formula = $(fig, '.sx-formula'), note = $(fig, '.sx-note'), sign = $(fig, '[data-k=sign]');
  let typed = null;                                           // the decimal the reader picked, until a slider for the stored values moves
  const on = switches(fig, () => { typed = null; draw(); });
  const ctl = ranges(fig, (k) => { if (k === 'eb' || k === 'mb') resize(); else typed = null; draw(); }, { m: fmt });
  const input = (k) => $(fig, `[data-k=${k}]`);
  const put = (k, v) => { input(k).value = v; input(k).dispatchEvent(new Event('input')); };
  const resize = () => {                                      // the stored values must fit the bits they now have
    input('e').max = 2 ** ctl.eb - 2; input('m').max = 2 ** ctl.mb - 1;
    if (typed !== null) set(typed); else { put('e', Math.min(ctl.e, 2 ** ctl.eb - 2)); put('m', Math.min(ctl.m, 2 ** ctl.mb - 1)); }
  };
  const set = (x) => {
    const { s, e, m } = encode(x, ctl.eb, ctl.mb);
    on.sign = !!s; sign.setAttribute('aria-pressed', String(!!s));
    input('e').max = 2 ** ctl.eb - 2; input('m').max = 2 ** ctl.mb - 1;
    put('e', e); put('m', m); typed = x; draw();
  };
  const draw = () => {
    const { eb, mb } = ctl, s = on.sign ? 1 : 0, E = Math.min(ctl.e, 2 ** eb - 2), M = Math.min(ctl.m, 2 ** mb - 1);
    const bias = 2 ** (eb - 1) - 1, sub = E === 0, power = sub ? 1 - bias : E - bias, lead = sub ? 0 : 1, frac = M / 2 ** mb, digits = Math.max(1, Math.min(mb, 10));
    const value = (s ? -1 : 1) * (lead + frac) * 2 ** power, mant = lead + frac;
    fillTable(tab, [
      ['', 'Bits', 'Stored as a number', 'What it means'],
      ['Sign', boxes(String(s), 's'), String(s), mel('span', null, s ? '\\(-1\\): negative' : '\\(+1\\): positive')],
      ['Exponent', boxes(E.toString(2).padStart(eb, '0'), 'e'), fmt(E), mel('span', null, sub ? `\\(0\\) is the special code for tiny numbers: no leading 1, and the power is fixed at \\(2^{${1 - bias}}\\)` : `\\(${E} - ${bias} = ${power}\\), so the power of two is \\(2^{${power}} = ${Number((2 ** power).toPrecision(6))}\\)`)],
      ['Mantissa', mb ? boxes(M.toString(2).padStart(mb, '0'), 'm') : 'no bits', fmt(M), mel('span', null, mb ? `\\(${fmt(M)} / 2^{${mb}} = ${frac.toFixed(digits)}\\), so the number before the power of two is \\(${lead} + ${frac.toFixed(digits)} = ${mant.toFixed(digits)}\\)` : `With no mantissa bits the number before the power of two is always \\(${lead}\\)`)],
    ]);
    setDisplayMath(formula, `${s ? '-' : ''}${mant.toFixed(digits)} \\times 2^{${power}} = ${texNumber(value)}`);
    note.textContent = `${1 + eb + mb} bits in all: 1 sign + ${eb} exponent + ${mb} mantissa.` + (typed !== null && value !== typed ? ` The decimal number ${typed} has no exact form with these bits, so the float holds the nearest one it can.` : '');
  };
  fig.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => set(+b.dataset.preset)));
  resize(); set(0.137);
};
