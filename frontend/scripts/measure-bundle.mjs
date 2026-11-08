import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';

// Count the unique scripts, preloads and styles requested by the initial HTML.
const dist = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', dist), 'utf8');
const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g)]
  .map((match) => match[1]))];
const totals = {files: 0, javascriptBytes: 0, cssBytes: 0, gzipBytes: 0};
for (const path of paths) {
  if (!/\.(js|css)$/.test(path)) continue;
  const content = await readFile(new URL(path.slice(1), dist));
  totals.files += 1;
  totals[path.endsWith('.js') ? 'javascriptBytes' : 'cssBytes'] += content.length;
  totals.gzipBytes += gzipSync(content).length;
}
console.log(JSON.stringify(totals, null, 2));
