// Bundles the app into ONE self-contained HTML file (dist/index.html) that works offline,
// from file://, or on any free static host (GitHub Pages, Netlify, Vercel...).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const serve = process.argv.includes('--serve');
mkdirSync('dist', { recursive: true });

const inline = {
  name: 'inline-html',
  setup(b) {
    b.onEnd((r) => {
      if (r.errors.length) return;
      const js = r.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\/script');
      const html = readFileSync('index.html', 'utf8').replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js}</script>`);
      writeFileSync('dist/index.html', html);
      console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} KB`);
    });
  },
};
const opts = { entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, outdir: 'dist', legalComments: 'none', plugins: [inline] };
if (serve) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 5173 });
  console.log(`Serving http://localhost:${port}`);
} else {
  await esbuild.build(opts);
}
