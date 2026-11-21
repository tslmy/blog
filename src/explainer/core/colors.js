// Colour scales for heatmaps (blue negative, red positive; red = error; gold = scale).
export const divColor = (v, clip) => `color-mix(in srgb, var(${v >= 0 ? '--sx-red' : '--sx-blue'}) ${Math.min(100, Math.abs(v) / clip * 100)}%, var(--bg))`;   // blue negative, red positive
export const redColor = (e, clip) => `color-mix(in srgb, var(--sx-red) ${Math.min(100, e / clip * 100)}%, var(--bg))`;                                        // the redder, the larger
export const goldColor = (v, max) => `color-mix(in srgb, var(--sx-gold) ${Math.max(10, v / max * 100)}%, var(--bg))`;                                        // the more gold, the larger
