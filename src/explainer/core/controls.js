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
