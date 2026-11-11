import { cp, mkdir, rm } from 'node:fs/promises';

const files = [
  'index.html',
  'style.css',
  'app.js',
  'logic.js',
  'fx.js',
  'manifest.json',
  'sw.js',
  'icon.svg'
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const file of files) {
  await cp(file, 'dist/' + file);
}
