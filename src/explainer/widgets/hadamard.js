import { $, el, focusable } from '../core/dom.js';
import { choice } from '../core/controls.js';
import { hadamard } from '../core/linalg.js';
import { setMath } from '../core/math.js';

// 6. Building a Walsh–Hadamard matrix by doubling
export default (fig) => {
  const box = $(fig, '.sx-had'), note = $(fig, '.sx-note');
  const draw = (n) => {
    const h = hadamard(n), grid = el('div', 'grid');
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    grid.style.maxWidth = `${Math.min(26, n * 2.4)}rem`;
    h.forEach((row, i) => row.forEach((v, j) => {
      const c = el('div', v > 0 ? 'p' : 'm', n <= 8 ? (v > 0 ? '+' : '−') : '');
      if (n > 2 && i >= n / 2 && j >= n / 2) c.classList.add('neg');   // the negated copy
      c.dataset.row = i; c.dataset.j = j;
      c.addEventListener('click', () => {
        grid.classList.add('picked');
        grid.querySelectorAll('div').forEach((d) => d.classList.toggle('sel', d.dataset.row === String(i)));
        const terms = row.map((x, k) => `${x > 0 ? (k ? ' + ' : '') : (k ? ' - ' : '-')}x_{${k + 1}}`).join('');
        const flips = row.slice(1).reduce((a, x, k) => a + (x !== row[k] ? 1 : 0), 0);
        setMath(note, `Output ${i + 1}: \\(y_{${i + 1}} = \\frac{1}{\\sqrt{${n}}}\\left(${terms}\\right)\\). Every input counts equally, only the signs differ. The sign flips ${flips} times along this row: rows are like square waves of different frequencies, and any two rows agree in exactly half their places, which is what makes them orthogonal.`);
      });
      grid.append(c);
    }));
    box.replaceChildren(grid);
    focusable(grid, '[data-j="0"]', (e) => `Row ${+e.dataset.row + 1}`);
    setMath(note, n === 2
      ? 'The 2×2 matrix: output 1 is the sum of the two inputs, output 2 their difference (each divided by \\(\\sqrt{2}\\)).'
      : `${n}×${n}: four copies of the ${n / 2}×${n / 2} matrix, the bottom-right one (outlined) with its signs flipped. Click a row.`);
  };
  choice(fig, 'n', (n) => draw(+n));
  draw(16);
};
