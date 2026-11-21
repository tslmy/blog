// A "spin the view" switch for the 3D figures.
import { $ } from './dom.js';
// A "spin the view" switch for the 3D figures: turns the camera about the vertical axis while it is on and on screen
export const spin = (fig, state, draw, busy) => {
  const b = $(fig, '[data-act=spin]'); let raf = 0, last = 0, seen = true;
  const on = () => b.getAttribute('aria-pressed') === 'true';
  const tick = (t) => {
    if (!on() || !seen || document.hidden) { raf = 0; return; }
    const dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
    if (!busy()) { state.yaw += dt * .7; draw(); }
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { seen = es[0].isIntersecting; if (seen && on()) start(); }).observe(fig);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on()) start(); });
  b.addEventListener('click', () => { const v = !on(); b.setAttribute('aria-pressed', String(v)); if (v) start(); });
};
