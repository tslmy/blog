// Entry point for posts with live figures: typesets generated TeX with KaTeX, fills every
// <figure class="widget" data-widget="..."> with its figure (loaded on demand), and adds the contents column.
import katex from 'katex';
import { setKatex } from './core/math.js';
import { mountToc } from './core/toc.js';
import { mountXref } from './core/xref.js';

setKatex(katex);

const widgets = {
  codebooks: () => import('./widgets/codebooks.js'),
  cq: () => import('./widgets/cq.js'),
  fwht: () => import('./widgets/fwht.js'),
  grids: () => import('./widgets/grids.js'),
  grouping: () => import('./widgets/grouping.js'),
  groupingrot: () => import('./widgets/groupingrot.js'),
  hadamard: () => import('./widgets/hadamard.js'),
  hist: () => import('./widgets/hist.js'),
  lloyd: () => import('./widgets/lloyd.js'),
  outlierloss: () => import('./widgets/outlierloss.js'),
  pca: () => import('./widgets/pca.js'),
  pca3d: () => import('./widgets/pca3d.js'),
  quantize: () => import('./widgets/quantize.js'),
  reuse: () => import('./widgets/reuse.js'),
  rot2d: () => import('./widgets/rot2d.js'),
  rot3dg: () => import('./widgets/rot3dg.js'),
  sizecalc: () => import('./widgets/sizecalc.js'),
  spread: () => import('./widgets/spread.js'),
};

document.querySelectorAll('figure.widget[data-widget]').forEach((fig) => {
  const load = widgets[fig.dataset.widget];
  if (load) load().then((m) => m.default(fig));
});
mountXref();
mountToc('.explainer h2[id], .explainer h3[id]');
