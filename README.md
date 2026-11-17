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
- **Home page**: edit the intro in `src/components/Intro.md`.
- **Charts**: `<Chart data={[...]} />` (Observable Plot) in `.mdx` posts; see `src/components/Chart.astro`.
- **RSS**: `/rss.xml`.
- **Hosting**: Cloudflare Pages (project `blog`, builds `pnpm build` → `dist`, `NODE_VERSION=22`) deploys every push to `main` and serves https://myli.page. GitHub Actions (`.github/workflows/ci.yml`) only checks that the build passes.
- Site URL is set to `https://myli.page` in `astro.config.mjs`.

## Publishing from Obsidian

Tag a note `#astro-post` (inline, or `tags: [astro-post]` in frontmatter), then:

```bash
BLOG_VAULT="/path/to/your/obsidian/vault" pnpm sync
```

This copies tagged notes into `src/content/posts/`. A Zettelkasten-style timestamp prefix in the filename (`YYYYMMDDHHmm`) becomes the post date and is dropped from the title; the URL keeps it. Without one, the date comes from `date`/`created`, else file creation time. Inline tags are stripped, copies embedded images to `public/vault-assets/` with all metadata (EXIF/GPS, XMP, ICC, comments) removed (needs ImageMagick's `magick`; the sync aborts rather than publish an image it can't sanitize; run `pnpm sanitize` to re-strip images already in `public/vault-assets/`), and turns wikilinks to unpublished notes into plain text. Untagging a note removes it on the next sync. Commit the result and deploy.
