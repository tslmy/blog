// Text with \( inline TeX \) for generated readouts: the maths is typeset by KaTeX, the rest is escaped.
import { el } from './dom.js';

let katex = null;
export const setKatex = (k) => { katex = k; };
export const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const tex = (m, display = false) => (katex ? katex.renderToString(m, { throwOnError: false, displayMode: display }) : esc(m));
export const mathText = (str) => str.split(/(\\\(.*?\\\))/).map((part) => (part.startsWith('\\(') && part.endsWith('\\)') ? tex(part.slice(2, -2)) : esc(part))).join('');
export const setMath = (e, str) => { e.innerHTML = mathText(str); return e; };
export const mel = (tag, cls, str) => setMath(el(tag, cls), str);
// a formula on its own line, centred
export const setDisplayMath = (e, str) => { e.innerHTML = tex(str, true); return e; };
