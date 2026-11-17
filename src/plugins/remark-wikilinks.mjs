// Turns Obsidian-style [[Page]] / [[Page|label]] into links to /posts/<slug>/.
// Obsidian embeds (![[...]]) are left untouched.
import { visit } from 'unist-util-visit';

const slugify = (s) =>
  s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

export default function remarkWikiLinks() {
  const re = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || !re.test(node.value)) return;
      re.lastIndex = 0;
      const out = [];
      let last = 0;
      for (const m of node.value.matchAll(re)) {
        if (m.index > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
        out.push({
          type: 'link',
          url: `/posts/${slugify(m[1])}/`,
          children: [{ type: 'text', value: (m[2] ?? m[1].replace(/^\d{12,14}[\s_-]*/, '')).trim() }],
        });
        last = m.index + m[0].length;
      }
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...out);
      return index + out.length;
    });
  };
}
