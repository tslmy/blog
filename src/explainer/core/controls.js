import { el } from './dom.js';
import { nextSeed } from './random.js';

// Reads and wires the range sliders of a figure. Every <input type=range data-k="name"> shows its value in the
// matching <output data-o="name"> (through format[name] if given), and the returned object always holds the current
// values, so a figure needs no copy of them: change them and `onChange(name)` runs.
export const ranges = (fig, onChange, format = {}) => {
  const values = {};
  fig.querySelectorAll('input[type=range][data-k]').forEach((input) => {
    const key = input.dataset.k, out = fig.querySelector(`[data-o=${key}]`), fmt = format[key] ?? String;
    const sync = () => { values[key] = +input.value; if (out) out.textContent = fmt(+input.value); };
    sync();
    input.addEventListener('input', () => { sync(); onChange(key); });
  });
  return values;
};

// The on/off switches of a figure: every <button data-k="name" aria-pressed> toggles values[name], and `onChange(name)` runs.
// The returned object starts from the page's aria-pressed values and always holds the current ones.
export const switches = (fig, onChange) => {
  const values = {};
  fig.querySelectorAll('button[data-k][aria-pressed]').forEach((button) => {
    const key = button.dataset.k;
    values[key] = button.getAttribute('aria-pressed') === 'true';
    button.addEventListener('click', () => { values[key] = !values[key]; button.setAttribute('aria-pressed', String(values[key])); onChange(key); });
  });
  return values;
};

// A figure's random example: the returned function gives the current seed, and the figure's "new" button moves to the next one.
export const reseedable = (fig, seed, onNew) => {
  fig.querySelector('[data-act=new]')?.addEventListener('click', () => { seed = nextSeed(seed); onNew(); });
  return () => seed;
};

// A pick-one group: the buttons carrying data-<attr> are the alternatives, the chosen one has aria-pressed. The returned
// object's `value` is the current choice (the page's pressed one at first), and `onChange(value)` runs when it changes.
export const choice = (fig, attr, onChange) => {
  const buttons = [...fig.querySelectorAll(`[data-${attr}]`)];
  const state = { value: buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset[attr] };
  buttons.forEach((b) => b.addEventListener('click', () => {
    state.value = b.dataset[attr];
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(state.value);
  }));
  return state;
};

// A row of switches above a plot, one for each element it can show, from data-toggles="key:Label;key:Label:off" (a trailing
// ":off" starts the switch off). Returns `shown(key)`.
export const toggleRow = (fig, before, onChange) => {
  const shown = {};
  if (fig.dataset.toggles && before) {
    const row = el('div', 'sx-controls'); row.append(el('span', 'sx-rowlabel', 'Show'));
    fig.dataset.toggles.split(';').forEach((tok) => {
      const [key, label, start] = tok.split(':'), button = el('button', null, label);
      shown[key] = start !== 'off';
      button.type = 'button'; button.setAttribute('aria-pressed', String(shown[key]));
      button.addEventListener('click', () => { shown[key] = !shown[key]; button.setAttribute('aria-pressed', String(shown[key])); onChange(); });
      row.append(button);
    });
    before.before(row);
  }
  return (key) => shown[key] !== false;
};
