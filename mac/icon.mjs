// アプリのアイコン（mac/AppIcon.png、1024×1024）を、今の絵から作る（CONTRACTS §72.4）。大工の縄張り。
// 方眼ノートの紙に、蛍光ペンの黄色いマスと、勇者（web/assets/sprites/hero.svg）と旗（web/assets/icons/flag.svg）。
// 作り直すときだけ使う: MASUME_CHROME=/path/to/chrome node mac/icon.mjs
// 外部パッケージは使わない（ヘッドレスの Chrome に DevTools Protocol で描かせて、写しを撮る）。
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.MASUME_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'mac', 'AppIcon.png');
const svg = (file) => readFileSync(join(ROOT, file), 'utf8').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '');

const hero = svg('web/assets/sprites/hero.svg');
const flag = svg('web/assets/icons/flag.svg');

// macOS のアイコンの形: 1024 の中に 824 の角丸（Big Sur 以降の型）。外は透明
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1024px; height: 1024px; background: transparent; overflow: hidden; }
  .icon { position: absolute; left: 100px; top: 100px; width: 824px; height: 824px; border-radius: 185px; overflow: hidden;
    background-color: #fdfaf0;
    background-image: linear-gradient(#a6d2e4 2px, transparent 2px), linear-gradient(90deg, #a6d2e4 2px, transparent 2px);
    background-size: 51.5px 51.5px; background-position: -1px -1px; }
  .edge { position: absolute; inset: 0; border-radius: 185px; box-shadow: inset 0 0 0 10px rgba(29, 43, 92, .9); }
  .margin { position: absolute; left: 154px; top: 0; bottom: 0; width: 5px; background: #d94a3a; opacity: .55; }
  .cell { position: absolute; left: 240px; top: 380px; width: 400px; height: 360px; background: #ffe45c; opacity: .8;
    border-radius: 30px 18px 36px 14px; transform: rotate(-3deg); }
  .hero { position: absolute; left: 170px; top: 190px; width: 560px; height: 560px; --pawn: #ffe45c; }
  .flag { position: absolute; left: 560px; top: 120px; width: 230px; height: 230px; --pawn: #ff8fc7; transform: rotate(8deg); }
  svg { width: 100%; height: 100%; }
  .ring { position: absolute; left: 100px; top: 100px; width: 824px; height: 824px; border-radius: 185px; box-shadow: 0 18px 40px rgba(60, 38, 14, .35); }
</style></head><body>
  <div class="ring"></div>
  <div class="icon"><div class="margin"></div><div class="cell"></div>
    <div class="flag">${flag}</div><div class="hero">${hero}</div><div class="edge"></div></div>
</body></html>`;

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'gridhub-icon-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1024,1024', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const ws = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`Chrome が起動しない（MASUME_CHROME で場所を指定）:\n${text}`)), 20000);
      chrome.stderr.on('data', (d) => {
        text += d;
        const m = text.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      });
      chrome.on('exit', (code) => reject(new Error(`Chrome が終わった（${code}）:\n${text}`)));
    });
    const port = new URL(ws).port;
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let id = 0;
    const waiting = new Map();
    const events = [];
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg);
        waiting.delete(msg.id);
      } else if (msg.method) events.push(msg.method);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      socket.send(JSON.stringify({ id: n, method, params }));
    });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1024, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1024, height: 1024, scale: 1 } });
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    socket.close();
    console.log(`できました: ${OUT}`);
  } finally {
    const exited = new Promise((resolve) => (chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve)));
    chrome.kill('SIGKILL');
    await exited;
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome の子が書き終えていなくても、アイコンはできている
    }
  }
}

await main();
