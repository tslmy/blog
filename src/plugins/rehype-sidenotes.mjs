// Converts standard GFM footnotes ([^1]) into Tufte-style sidenotes.
// Desktop: note floats in the right margin. Mobile: tap the number to reveal inline.
import { visit, SKIP } from 'unist-util-visit';

const hasClass = (n, c) => {
  const cn = n.properties?.className;
  return Array.isArray(cn) ? cn.includes(c) : cn === c;
};

export default function rehypeSidenotes() {
  return (tree) => {
    const notes = new Map(); // footnote id -> children of the note
    let section = null;

    visit(tree, 'element', (node, i, parent) => {
      if (node.tagName === 'section' && node.properties?.dataFootnotes !== undefined) {
        section = { node, parent, i };
        visit(node, 'element', (li) => {
          if (li.tagName !== 'li' || !String(li.properties?.id ?? '').startsWith('user-content-fn-')) return;
          const id = li.properties.id.replace('user-content-fn-', '');
          const children = structuredClone(li.children);
          // drop back-reference links and unwrap the paragraph
          const strip = (nodes) =>
            nodes
              .filter((c) => !(c.type === 'element' && c.tagName === 'a' && c.properties?.dataFootnoteBackref !== undefined))
              .map((c) => (c.children ? { ...c, children: strip(c.children) } : c));
          const cleaned = strip(children).flatMap((c) => (c.type === 'element' && c.tagName === 'p' ? c.children : [c]));
          notes.set(id, cleaned.filter((c) => !(c.type === 'text' && !c.value.trim())));
        });
        return SKIP;
      }
    });
    if (!notes.size) return;

    let n = 0;
    visit(tree, 'element', (node, i, parent) => {
      if (node.tagName !== 'sup' || !parent) return;
      const a = node.children.find((c) => c.type === 'element' && c.tagName === 'a' && c.properties?.dataFootnoteRef !== undefined);
      if (!a) return;
      const id = String(a.properties.href).replace('#user-content-fn-', '');
      const body = notes.get(id);
      if (!body) return;
      n += 1;
      const uid = `sn-${n}`;
      parent.children[i] = {
        type: 'element',
        tagName: 'span',
        properties: { className: ['sidenote-wrap'] },
        children: [
          { type: 'element', tagName: 'label', properties: { htmlFor: uid, className: ['sidenote-number'] }, children: [] },
          { type: 'element', tagName: 'input', properties: { type: 'checkbox', id: uid, className: ['sidenote-toggle'] }, children: [] },
          { type: 'element', tagName: 'span', properties: { className: ['sidenote'] }, children: body },
        ],
      };
    });

    if (section) section.parent.children.splice(section.i, 1);
  };
}
