// S2「早馬を走らせる」— CONTRACTS §8 の GET /api/stream（SSE）と watchFile の監視。
// （startServer と serve コマンドは結合ゲート G1 で判定される）
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp, listen, sseClient } from '../helpers.mjs';

const { createServer } = await import(pathToFileURL(join(ROOT, 'src', 'server', 'index.js')).href);

function setup() {
  const web = tmp('masume-web-');
  writeFileSync(join(web, 'index.html'), '<!doctype html><p>x</p>');
  const watchFile = join(tmp('masume-watch-'), 'log.jsonl');
  writeFileSync(watchFile, '');
  return { web, watchFile };
}

test('接続すると hello、ログが伸びると change が全員に届く', async () => {
  const { web, watchFile } = setup();
  const server = createServer({ webRoot: web, getView: () => ({ masume: 1 }), watchFile });
  const base = await listen(server);
  const c1 = sseClient(`${base}/api/stream`);
  const c2 = sseClient(`${base}/api/stream`);
  try {
    const hello = await c1.waitFor('hello', { timeout: 3000 });
    await c2.waitFor('hello', { timeout: 3000 });
    assert.equal(c1.status, 200);
    assert.match(c1.type, /^text\/event-stream/);
    assert.doesNotThrow(() => JSON.parse(hello.data), 'hello の data は JSON');

    const since1 = c1.events.length;
    const since2 = c2.events.length;
    appendFileSync(watchFile, '{"seq":1}\n');
    const ch = await c1.waitFor('change', { timeout: 4000, since: since1 });
    await c2.waitFor('change', { timeout: 4000, since: since2 });
    assert.doesNotThrow(() => JSON.parse(ch.data), 'change の data は JSON');

    // 2回目の変化も届く
    await new Promise((r) => setTimeout(r, 300));
    const again = c1.events.length;
    appendFileSync(watchFile, '{"seq":2}\n');
    await c1.waitFor('change', { timeout: 4000, since: again });
  } finally {
    c1.close();
    c2.close();
    await server.stop();
  }
});

test('監視ファイルが置き換えられても（rename で書き直されても）change が届く', async () => {
  const { web, watchFile } = setup();
  const server = createServer({ webRoot: web, getView: () => ({ masume: 1 }), watchFile });
  const base = await listen(server);
  const c = sseClient(`${base}/api/stream`);
  try {
    await c.waitFor('hello', { timeout: 3000 });
    const { renameSync } = await import('node:fs');
    const since = c.events.length;
    const tmpFile = watchFile + '.tmp';
    writeFileSync(tmpFile, '{"seq":0}\n'); // repair はこうやって書き直す
    renameSync(tmpFile, watchFile);
    await c.waitFor('change', { timeout: 5000, since });
    const since2 = c.events.length;
    await new Promise((r) => setTimeout(r, 300));
    appendFileSync(watchFile, '{"seq":1}\n');
    await c.waitFor('change', { timeout: 5000, since: since2 });
  } finally {
    c.close();
    await server.stop();
  }
});

test('stop() は開いている SSE 接続も閉じる', async () => {
  const { web, watchFile } = setup();
  const server = createServer({ webRoot: web, getView: () => ({ masume: 1 }), watchFile });
  const base = await listen(server);
  const c = sseClient(`${base}/api/stream`);
  await c.waitFor('hello', { timeout: 3000 });
  const t0 = Date.now();
  await server.stop();
  assert.ok(Date.now() - t0 < 3000, 'すぐに閉じる');
  c.close();
});

test('watchFile が無くても SSE は hello を返す', async () => {
  const { web } = setup();
  const server = createServer({ webRoot: web, getView: () => ({ masume: 1 }) });
  const base = await listen(server);
  const c = sseClient(`${base}/api/stream`);
  try {
    await c.waitFor('hello', { timeout: 3000 });
  } finally {
    c.close();
    await server.stop();
  }
});
