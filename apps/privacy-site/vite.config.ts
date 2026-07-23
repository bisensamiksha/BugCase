import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

import { renderLegalPage } from './src/render-legal';

const srcDir = new URL('./src/', import.meta.url);

/** Read one or more markdown files from src/ and join them with a blank line. */
function readMarkdown(...files: string[]): string {
  return files.map((f) => readFileSync(new URL(f, srcDir), 'utf8')).join('\n\n');
}

/** Map each HTML entry (by request path) to its title + markdown sources. */
const PAGES: Record<string, { title: string; sources: string[] }> = {
  '/index.html': { title: 'BugCase — Legal', sources: ['index-content.md'] },
  '/privacy-policy.html': {
    title: 'BugCase — Privacy Policy',
    sources: ['privacy-policy-v2.md', 'legal-definitions.md'],
  },
  '/terms.html': {
    title: 'BugCase — Terms of Use',
    sources: ['terms.md', 'legal-definitions.md'],
  },
};

/** Render each entry's HTML from its markdown source(s) at build time. */
function legalPages(): Plugin {
  return {
    name: 'bugcase-legal-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(original, ctx) {
        const page = PAGES[ctx.path];
        if (!page) return original;
        return renderLegalPage({ title: page.title, markdown: readMarkdown(...page.sources) });
      },
    },
  };
}

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [legalPages()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', srcDir)),
        'privacy-policy': fileURLToPath(new URL('privacy-policy.html', srcDir)),
        terms: fileURLToPath(new URL('terms.html', srcDir)),
      },
    },
  },
});
