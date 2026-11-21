// Wraps every table in <div class="wide"> so the stylesheet can let it spill into the sidenote margin, like wide figures.
import { visit } from 'unist-util-visit';

export default function rehypeWideTables() {
  return (tree) => {
    visit(tree, 'element', (node, i, parent) => {
      if (node.tagName !== 'table' || !parent || parent.properties?.className?.includes?.('wide')) return;
      parent.children[i] = { type: 'element', tagName: 'div', properties: { className: ['wide'] }, children: [node] };
      return 'skip';
    });
  };
}
