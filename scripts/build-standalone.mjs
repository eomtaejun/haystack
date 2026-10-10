import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const htmlPath = resolve(root, 'dist/index.html');
let html = readFileSync(htmlPath, 'utf8');
const script = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const style = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
if (!script || !style) throw new Error('Vite output assets were not found. Run the build first.');
const asset = (path) => readFileSync(resolve(root, 'dist', path.replace(/^\//, '')), 'utf8');
html = html.replace(script[0], () => `<script type="module">${asset(script[1])}</script>`);
html = html.replace(style[0], () => `<style>${asset(style[1])}</style>`);
writeFileSync(resolve(root, 'HAYSTACK-play.html'), html);
