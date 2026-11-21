import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkWikiLinks from './src/plugins/remark-wikilinks.mjs';
import { unified } from '@astrojs/markdown-remark';
import remarkTimeline from './src/plugins/remark-timeline.mjs';
import rehypeSidenotes from './src/plugins/rehype-sidenotes.mjs';
import rehypeWideTables from './src/plugins/rehype-wide-tables.mjs';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://myli.page',
  integrations: [mdx()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkWikiLinks, remarkTimeline, remarkMath],
      rehypePlugins: [rehypeKatex, rehypeWideTables, rehypeSidenotes],
    }),
  },
});
