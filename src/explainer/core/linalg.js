// Small linear-algebra helpers: Walsh–Hadamard matrices and Jacobi eigenvectors.
// Walsh–Hadamard helpers (unnormalized ±1 entries; divide by √n where it matters)
export const hadamard = (n) => {
  let h = [[1]];
  while (h.length < n) h = [...h.map((r) => [...r, ...r]), ...h.map((r) => [...r, ...r.map((v) => -v)])];
  return h;
};
export const rotate = (v) => { const n = v.length, h = hadamard(n), s = Math.sqrt(n); return h.map((row) => row.reduce((a, x, j) => a + x * v[j], 0) / s); };
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
