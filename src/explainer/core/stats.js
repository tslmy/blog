// Small statistics and number formatting shared by the figures.
export const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
export const pct0 = (v) => (v * 100).toFixed(0) + '%';
