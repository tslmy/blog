# Blog (Astro)

Static blog with margin sidenotes, Obsidian-style wikilinks, interactive charts and RSS.

```bash
pnpm install
pnpm dev      # http://localhost:4321
pnpm build
```

- **Posts**: Markdown/MDX in `src/content/posts/`, or synced from Obsidian (see below).
- **Sidenotes**: write plain `[^1]` footnotes; `src/plugins/rehype-sidenotes.mjs` turns them into margin notes (tap-to-reveal under 900px).
- **Wikilinks**: `[[Post title]]` / `[[Post title|label]]` → `/posts/<slug>/` via `src/plugins/remark-wikilinks.mjs`. Slugs are the lowercased title, so name files accordingly. Embeds (`![[...]]`) are not handled yet.
- **Charts**: `<Chart data={[...]} />` (Observable Plot) in `.mdx` posts; see `src/components/Chart.astro`.
- **RSS**: `/rss.xml`.
- Site URL is set to `https://myli.page` in `astro.config.mjs`.

## Publishing from Obsidian

Tag a note `#astro-post` (inline, or `tags: [astro-post]` in frontmatter), then:

```bash
BLOG_VAULT="/path/to/your/obsidian/vault" pnpm sync
```

This copies tagged notes into `src/content/posts/` (title from frontmatter or filename; date from `date`/`created`, else file creation time), strips the tag, copies embedded images to `public/vault-assets/`, and turns wikilinks to unpublished notes into plain text. Untagging a note removes it on the next sync. Commit the result and deploy.
