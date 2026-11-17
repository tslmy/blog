// Copies Obsidian notes tagged #astro-post (frontmatter `tags` or inline) into src/content/posts/.
// Usage: BLOG_VAULT="/path/to/vault" pnpm sync   (or pass the path as the first argument)
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const VAULT = process.argv[2] ?? process.env.BLOG_VAULT;
const TAG = process.env.BLOG_TAG ?? 'astro-post';
if (!VAULT || !fs.existsSync(VAULT)) {
  console.error('Set BLOG_VAULT (or pass the vault path as an argument).');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const postsDir = path.join(root, 'src/content/posts');
const assetsDir = path.join(root, 'public/vault-assets');
const manifestPath = path.join(root, '.vault-synced.json');

const slugify = (s) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

// Walk vault (skip hidden dirs like .obsidian/.trash; iCloud placeholders end in .icloud and are skipped).
const mdFiles = [];
const attachments = new Map(); // basename -> full path
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) mdFiles.push(p);
    else attachments.set(e.name, p);
  }
})(VAULT);

// Mask code so tags/links inside it are ignored.
const maskCode = (s) => s.replace(/```[\s\S]*?```|`[^`\n]*`/g, (m) => ' '.repeat(m.length));
const tagRe = new RegExp(`(^|\\s)#${TAG}(?![\\w/-])`, 'g');
const hasTag = (data, body) => {
  const fm = [].concat(data.tags ?? data.tag ?? []).flatMap((t) => String(t).split(/[,\s]+/));
  return fm.some((t) => t.replace(/^#/, '') === TAG) || new RegExp(tagRe.source).test(maskCode(body));
};

const notes = [];
for (const file of mdFiles) {
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  if (!hasTag(data, content)) continue;
  notes.push({ file, data, content, name: path.basename(file, '.md') });
}
const published = new Set(notes.map((n) => slugify(n.name)));

// Remove previously synced files.
if (fs.existsSync(manifestPath)) {
  for (const f of JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) fs.rmSync(path.join(root, f), { force: true });
}
const written = [];
fs.mkdirSync(postsDir, { recursive: true });

for (const n of notes) {
  let body = n.content;
  const masked = maskCode(body);
  // Strip inline tag (only outside code).
  body = body.replace(tagRe, (m, pre, off) => (masked.slice(off, off + m.length) === m ? pre : m));

  // Embeds ![[file.ext|alt]] -> markdown images (copied to public/vault-assets).
  body = body.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (m, target, alt) => {
    const name = path.basename(target.trim());
    const src = attachments.get(name);
    if (!src) return m;
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.copyFileSync(src, path.join(assetsDir, name));
    written.push(path.join('public/vault-assets', name));
    return `![${alt && !/^\d+(x\d+)?$/.test(alt) ? alt : ''}](/vault-assets/${encodeURIComponent(name)})`;
  });

  // Wikilinks to unpublished notes -> plain text.
  body = body.replace(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (m, target, label) =>
    published.has(slugify(target)) ? m : (label ?? target).trim(),
  );

  const stat = fs.statSync(n.file);
  const date = n.data.date ?? n.data.created ?? stat.birthtime;
  const fm = {
    title: n.data.title ?? n.name,
    date: date instanceof Date ? date.toISOString().slice(0, 10) : String(date),
    ...(n.data.description ? { description: n.data.description } : {}),
    ...(n.data.draft ? { draft: true } : {}),
  };
  const out = path.join('src/content/posts', `${slugify(n.name)}.md`);
  fs.writeFileSync(path.join(root, out), matter.stringify(body.trimStart(), fm));
  written.push(out);
}

fs.writeFileSync(manifestPath, JSON.stringify(written, null, 2) + '\n');
console.log(`Synced ${notes.length} note(s) tagged #${TAG}.`);
