// Cross-references: a link with class "xref" scrolls to its target and raises a floating button that carries the reader back to the link.
import { el } from './dom.js';

export const mountXref = (root = document) => {
  const links = [...root.querySelectorAll('a.xref[href^="#"]')];
  if (!links.length) return;
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const btn = el('button', 'xref-back', '↩ Back to where you were'); btn.type = 'button'; btn.hidden = true; document.body.append(btn);
  let from = null, target = null, away = false, ticking = false;
  const seen = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  const hide = () => { btn.hidden = true; from = target = null; away = false; };
  links.forEach((a) => a.addEventListener('click', (e) => {
    const t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); if (!t) return;
    if (t.tagName === 'DETAILS') t.open = true;     // a target that is a folded detour opens
    e.preventDefault(); from = a; target = t; away = false; btn.hidden = false;
    t.scrollIntoView({ behavior, block: 'start' });
  }));
  btn.addEventListener('click', () => { const a = from; hide(); if (a) { a.scrollIntoView({ behavior, block: 'center' }); a.focus({ preventScroll: true }); } });
  // once the reader has reached the target and later sees the link again on their own, the button has done its job
  addEventListener('scroll', () => {
    if (!from || ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false; if (!from) return; if (seen(target)) away = true; else if (away && seen(from)) hide(); });
  }, { passive: true });
};
