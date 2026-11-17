import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLinks from './src/plugins/remark-wikilinks.mjs';
import { unified } from '@astrojs/markdown-remark';
import rehypeSidenotes from './src/plugins/rehype-sidenotes.mjs';

export default defineConfig({
  site: 'https://myli.page',
  integrations: [mdx()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkWikiLinks],
      rehypePlugins: [rehypeSidenotes],
    }),
  },
});
