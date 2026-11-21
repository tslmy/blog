// Small linear-algebra helpers: the Walsh–Hadamard matrix and transform, and Jacobi eigenvectors.
// The Walsh–Hadamard matrix of size n (a power of two), built by doubling: entries are ±1, unnormalized.
export const hadamard = (n) => {
  let h = [[1]];
  while (h.length < n) h = [...h.map((r) => [...r, ...r]), ...h.map((r) => [...r, ...r.map((v) => -v)])];
  return h;
};
// The fast Walsh–Hadamard transform, normalized by √n so that it keeps lengths and is its own inverse:
// log2(n) rounds of adding and subtracting pairs, no multiplications.
export const fwht = (x) => {
  const y = x.slice(), n = y.length;
  for (let h = 1; h < n; h *= 2) for (let i = 0; i < n; i += 2 * h) for (let j = i; j < i + h; j++) { const a = y[j], b = y[j + h]; y[j] = a + b; y[j + h] = a - b; }
  return y.map((v) => v / Math.sqrt(n));
};
// Jacobi rotations for a small symmetric matrix: eigenvectors (biggest eigenvalue first) and eigenvalues
export const jacobi = (C) => {
  const D = C.length, A = C.map((r) => r.slice()), V = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep++) for (let p = 0; p < D; p++) for (let q = p + 1; q < D; q++) {
    if (Math.abs(A[p][q]) < 1e-14) continue;
    const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
    for (let k = 0; k < D; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - sn * b; A[k][q] = sn * a + c * b; }
    for (let k = 0; k < D; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - sn * b; A[q][k] = sn * a + c * b; }
    for (let k = 0; k < D; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - sn * b; V[k][q] = sn * a + c * b; }
  }
  const order = A.map((r, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { vecs: order.map((i) => V.map((row) => row[i])), vals: order.map((i) => A[i][i]) };
};
