import { $, el } from '../core/dom.js';
import { mel, setMath } from '../core/math.js';

// 8. The fast Walsh–Hadamard transform, round by round
export default (fig) => {
  const x0 = [3, 1, -2, 4, 0, 2, 1, -1], N = x0.length, ROUNDS = Math.log2(N);
  const stages = [x0.slice()];
  for (let r = 0, h = 1; r < ROUNDS; r++, h *= 2) {
    const p = stages[r], v = p.slice();
    for (let i = 0; i < N; i += 2 * h) for (let j = i; j < i + h; j++) { v[j] = p[j] + p[j + h]; v[j + h] = p[j] - p[j + h]; }
    stages.push(v);
  }
  const box = $(fig, '.sx-fwht'), note = $(fig, '.sx-note');
  let k = 0;
  const draw = () => {
    const t = el('table');
    const hr = el('tr'); hr.append(el('th', null, 'input'));
    for (let r = 1; r <= ROUNDS; r++) hr.append(el('th', null, `round ${r}`));
    hr.append(mel('th', null, `\\(\\div\\sqrt{${N}}\\)`)); t.append(hr);
    const h = k ? 1 << (k - 1) : 0;
    for (let i = 0; i < N; i++) {
      const tr = el('tr'); tr.append(el('td', 'num', String(x0[i])));
      for (let r = 1; r <= ROUNDS; r++) {
        const td = el('td', 'num', r <= k ? String(stages[r][i]) : '');
        if (r === k) td.classList.add(Math.floor(i / h) % 2 ? 'b' : 'a');
        tr.append(td);
      }
      tr.append(el('td', 'num', k === ROUNDS ? (stages[ROUNDS][i] / Math.sqrt(N)).toFixed(2) : ''));
      t.append(tr);
    }
    box.replaceChildren(t);
    setMath(note, k === 0
      ? `${N} activations. Multiplying by the 8×8 matrix directly would take \\(8\\times 8 = 64\\) multiply-adds.`
      : k < ROUNDS
        ? `Round ${k}: pairs ${h} apart are combined. Blue rows got a + b, gold rows a − b.`
        : `Done after ${ROUNDS} rounds of ${N} additions or subtractions (\\(${ROUNDS}\\times ${N} = ${ROUNDS * N}\\) in all, no multiplications), then one scaling. For a group of 64 it's \\(6\\times 64 = 384\\) operations instead of \\(64^2 = 4{,}096\\).`);
  };
  fig.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'next') k = k >= ROUNDS ? 0 : k + 1;
    if (b.dataset.act === 'reset') k = 0;
    draw();
  }));
  draw();
};
