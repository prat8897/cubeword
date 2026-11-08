// Builds a single self-contained dist/index.html (JS, CSS, word list and three.js all inlined).
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  loader: { '.json': 'json' },
});

let js = result.outputFiles[0].text;
js = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
html = html.replace('/*__CSS__*/', () => css).replace('/*__BUNDLE__*/', () => js);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
// PWA files: copied into dist/ with a cache version derived from the page contents
import crypto from 'crypto';
const ver = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  let data = fs.readFileSync(path.join(root, 'public', f));
  if (f === 'sw.js') data = data.toString().replace('__VERSION__', ver);
  fs.writeFileSync(path.join(out, f), data);
}
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
