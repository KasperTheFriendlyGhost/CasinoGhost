import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The single-file build has no sibling files: inline the favicon and drop the PWA links.
function singleFileHead(): Plugin {
  const icon = `data:image/svg+xml;base64,${readFileSync('public/icon.svg').toString('base64')}`;
  return {
    name: 'single-file-head',
    transformIndexHtml: (html) => html
      .replace(/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, '')
      .replace('href="./icon.svg"', `href="${icon}"`),
  };
}

// `--mode single` emits one self-contained index.html (double-click to run, or share).
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss(), ...(mode === 'single' ? [viteSingleFile(), singleFileHead()] : [])],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  publicDir: mode === 'single' ? false : 'public',
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
}));
