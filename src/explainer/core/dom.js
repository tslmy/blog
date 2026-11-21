// Small DOM and SVG helpers shared by every figure.
export const $ = (root, sel) => root.querySelector(sel);
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// Matrices shared by the grouping figure and the 2D figure: weights with each group's scale printed on them, a heatmap of the scales, and a heatmap of the rounding errors
export const SVGNS = 'http://www.w3.org/2000/svg';
export const sv = (tag, attrs, style) => { const e = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (style) e.style.cssText = style; return e; };
export const press = (buttons, on) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === on)));
