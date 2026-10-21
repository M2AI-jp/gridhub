// 盤面のスクリーンショットを撮る道具（第11章）。使い方は docs/shots/README.md。
//
//   node docs/shots/shot.mjs <ビューの JSON> <出力のフォルダ> [--fonts <字のフォルダ>] [--width 1600] [--height 1000] [--name board]
//
// ビューの JSON は、見本（web/fixtures/demo-state.json）か、本物の冒険の `gridhub status --json` の出力。
// 撮るもの: <name>-spread.png（見開き）・<name>-flip.png（ページをめくっている途中）・<name>-zoom.png（拡大）・<name>-narrow.png（スマホの幅）。
// --fonts には Google Fonts の字を手元に置いたフォルダ（local.css と、それが指す字のファイル）を渡す。リポジトリには入れない。
// 判定の Chrome は外のホストを引けないので、字が無ければ手元の書体で撮る。
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from '../../tests/helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..', '..', 'web');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const fonts = opt('fonts', null);
const width = Number(opt('width', 1600));
const height = Number(opt('height', 1000));
const name = opt('name', 'board');
const [viewFile, outDir] = args;
if (!viewFile || !outDir) {
  console.error('使い方: node docs/shots/shot.mjs <view.json> <出力のフォルダ> [--fonts <dir>] [--width 1600] [--height 1000] [--name board]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const view = readFileSync(resolve(viewFile));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p === '/fixtures/shot-state.json') return res.writeHead(200, { 'content-type': MIME['.json'] }).end(view);
  if (p.startsWith('/fonts/') && fonts) {
    const file = normalize(join(resolve(fonts), p.slice('/fonts/'.length)));
    if (!existsSync(file)) return res.writeHead(404).end();
    return res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  }
  if (p === '/') p = '/index.html';
  const file = normalize(join(WEB, p));
  if (!file.startsWith(WEB) || !existsSync(file)) return res.writeHead(404).end();
  let body = readFileSync(file);
  // 外の字の <link> を、手元に置いた字に差し替える（盤面のファイルは変えない）
  if (p === '/index.html' && fonts) body = Buffer.from(String(body).replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]*/, '/fonts/local.css'));
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/?fixture=shot`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot(file, { w = width, h = height, prep = '', after = 0 } = {}) {
  const page = await openBrowser({ width: w, height: h });
  try {
    await page.goto(base);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 20000 });
    await page.eval('document.fonts.ready.then(() => true)');
    await sleep(4200); // ペンで描く動きが終わるまで
    if (prep) await page.eval(prep);
    if (after) await sleep(after);
    await page.screenshot(join(outDir, file));
    console.log(`撮った: ${join(outDir, file)}`);
    const errors = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    if (errors.length) console.log(errors.join('\n'));
  } finally {
    await page.close();
  }
}

try {
  await shoot(`${name}-spread.png`);
  // めくっている途中: 葉の回転を途中で止める
  await shoot(`${name}-flip.png`, {
    prep: `(() => { window.__masume.turnTo(window.__masume.spread + 2); return true; })()`,
    after: 380,
  });
  // 拡大: 作業中の駒のまわり
  await shoot(`${name}-zoom.png`, {
    w: 1200,
    h: 900,
    prep: `(() => { const p = [...document.querySelectorAll('.pawn[data-status="working"]')].find((g) => { const r = g.getBoundingClientRect(); return r.width && r.left > 0 && r.left < innerWidth; }) || document.querySelector('.pawn'); if (!p) return false; const b = p.getBoundingClientRect(); for (let i = 0; i < 4; i++) document.querySelector('[data-zoom="in"]').click(); const svg = document.querySelector('#board'); const r = svg.getBoundingClientRect(); const b2 = p.getBoundingClientRect(); svg.dispatchEvent(new WheelEvent('wheel', { deltaX: b2.left + b2.width / 2 - (r.left + r.width / 2), deltaY: b2.top - (r.top + r.height / 2) + 40, bubbles: true, cancelable: true })); void b; return true; })()`,
    after: 300,
  });
  await shoot(`${name}-narrow.png`, { w: 390, h: 844 });
} finally {
  server.close();
}
