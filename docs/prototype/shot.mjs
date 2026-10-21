// 試作のスクリーンショット: node shot.mjs <view.json> <out.png> [width] [height] [query]
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../tests/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SP = join(HERE, '..');
const REPO = join(HERE, '..', '..');
const [viewFile, out, width = '1440', height = '900', query = ''] = process.argv.slice(2);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file;
  if (p === '/view.json') file = viewFile;
  else if (p.startsWith('/web/')) file = normalize(join(REPO, p));
  else if (p.startsWith('/fonts/')) file = normalize(join(SP, p));
  else file = normalize(join(HERE, p === '/' ? 'index.html' : p));
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/?${query}`;
const page = await openBrowser({ width: +width, height: +height });
try {
  await page.goto(url);
  await page.waitFor('window.__ready === true', { timeout: 20000 });
  await page.eval('document.fonts.ready.then(() => true)');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot(out);
  console.log(page.console.join('\n'));
} catch (e) { console.log(page.console.join("\n")); throw e; } finally {
  await page.close();
  server.close();
}
