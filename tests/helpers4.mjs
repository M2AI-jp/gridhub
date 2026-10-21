// 第9章の判定の共通道具（ヘッドレス Chrome に、読み込み前のスクリプトと「動きを減らす」設定を渡せるもの）。GM の縄張り・封印対象。
import { writeFileSync, rmSync } from 'node:fs';
import { startChrome, waitUntil } from './helpers.mjs';

export * from './helpers3.mjs';

/**
 * ヘッドレス Chrome を開く。helpers.mjs の openBrowser と同じ page に、次を足したもの:
 *  media … 読み込みの前に真似するメディアの特徴（例 [{ name: 'prefers-reduced-motion', value: 'reduce' }]）
 *  preload … どのページでも、ページのスクリプトより先に走らせる JavaScript（文字列）
 */
export async function openBrowserWith({ width = 1440, height = 900, media = [], preload = '' } = {}) {
  const { proc, profile, port } = await startChrome({ width, height });
  const target = await waitUntil(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.find((t) => t.type === 'page');
  }, { message: 'Chrome のページ' });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleLines.push('[exception] ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  };
  let closed = null;
  ws.onclose = () => {
    // Chrome が途中で死んだら、待っている呼び出しを失敗させる（返事の来ない呼び出しで判定が止まらない）
    closed = new Error('Chrome との接続が切れた');
    for (const { rej } of pending.values()) rej(closed);
    pending.clear();
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      if (closed) return rej(closed);
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  if (media.length) await send('Emulation.setEmulatedMedia', { features: media });
  if (preload) await send('Page.addScriptToEvaluateOnNewDocument', { source: preload });
  const page = {
    console: consoleLines,
    send,
    async goto(url) {
      await send('Page.navigate', { url });
      await waitUntil(() => page.eval('document.readyState === "complete" && location.href !== "about:blank"'), { message: `ページ読込 ${url}` });
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`eval 失敗: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(expression, { timeout = 10000, message } = {}) {
      return waitUntil(() => page.eval(expression), { timeout, message: message || expression });
    },
    async screenshot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(r.data, 'base64'));
    },
    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 200));
      rmSync(profile, { recursive: true, force: true });
    },
  };
  return page;
}

/** 読み込みの前に仕込む: 始まった CSS アニメーションを window.__anims に記録する（どの要素の、どの名前のアニメーションか） */
export const RECORD_ANIMATIONS = `
  window.__anims = [];
  document.addEventListener('animationstart', (e) => {
    const t = e.target;
    window.__anims.push({
      name: e.animationName,
      cls: (t.getAttribute && t.getAttribute('class')) || '',
      tool: (t.getAttribute && t.getAttribute('data-tool')) || '',
      node: (t.closest && t.closest('[data-node]') && t.closest('[data-node]').getAttribute('data-node')) || '',
      fresh: !!(t.closest && t.closest('.fresh-clear')),
      road: !!(t.closest && t.closest('.road')),
      inBoard: !!(t.closest && t.closest('#board')),
    });
  }, true);
`;
