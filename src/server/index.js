import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { watchFile as watchPath, unwatchFile } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function send(response, status, body, contentType, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': contentType, ...headers });
  response.end(body);
}

function sendText(response, status, text, headers) {
  send(response, status, text, 'text/plain; charset=utf-8', headers);
}

function sendJson(response, status, value, headers) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8', headers);
}

function sendError(response, status, error) {
  sendJson(response, status, {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'E_INTERNAL',
    error: typeof error?.message === 'string' ? error.message : 'サーバー内部でエラーが発生しました',
  });
}

function apiError(code, message) {
  return Object.assign(new Error(message), { code });
}

function allowedOrigin(request) {
  if (request.headers.origin === undefined) return true;
  try {
    const origin = new URL(request.headers.origin);
    const host = new URL(`http://${request.headers.host}`);
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === host.host;
  } catch {
    return false;
  }
}

function isWithin(root, file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function serveStatic(response, root, pathname) {
  const name = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = resolve(root, `.${name}`);
  if (!isWithin(root, file)) {
    sendText(response, 403, '公開ディレクトリの外にはアクセスできません');
    return;
  }

  try {
    const realRoot = await realpath(root);
    const realFile = await realpath(file);
    // シンボリックリンクの参照先も公開ディレクトリ内に限定する。
    if (!isWithin(realRoot, realFile)) {
      sendText(response, 403, '公開ディレクトリの外にはアクセスできません');
      return;
    }
    if (!(await stat(realFile)).isFile()) {
      sendText(response, 404, 'ファイルが見つかりません');
      return;
    }
    const content = await readFile(realFile);
    send(response, 200, content, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) {
      sendText(response, 404, 'ファイルが見つかりません');
    } else if (['EACCES', 'EPERM'].includes(error.code)) {
      sendText(response, 403, 'ファイルにアクセスできません');
    } else {
      throw error;
    }
  }
}

/** 盤面・更新通知・ハンコとボス戦の窓口を提供する、未 listen の HTTP サーバー。 */
export function createServer({ webRoot, getView, watchFile, onStamp, onBattle, outputFor }) {
  const root = resolve(webRoot);
  const watchedPath = watchFile == null ? null : resolve(watchFile);
  const streams = new Map();
  let watching = false;

  function notifyChange(current, previous) {
    if (current.ino === previous.ino
      && current.dev === previous.dev
      && current.size === previous.size
      && current.mtimeMs === previous.mtimeMs
      && current.ctimeMs === previous.ctimeMs) return;

    for (const response of streams.keys()) {
      if (!response.destroyed && !response.writableEnded) {
        response.write(`event: change\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      }
    }
  }

  function openStream(response) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const heartbeat = setInterval(() => {
      if (!response.destroyed && !response.writableEnded) response.write(': ping\n\n');
    }, 15_000);
    heartbeat.unref();
    streams.set(response, heartbeat);
    response.once('close', () => {
      clearInterval(heartbeat);
      streams.delete(response);
    });
    response.once('error', () => response.destroy());
  }

  function closeStreams() {
    if (watching) {
      unwatchFile(watchedPath, notifyChange);
      watching = false;
    }
    for (const [response, heartbeat] of streams) {
      clearInterval(heartbeat);
      response.end();
    }
    streams.clear();
  }

  async function handlePost(request, response, pathname) {
    if (request.headers['x-masume'] !== '1' || !allowedOrigin(request)) {
      sendError(response, 403, apiError('E_FORBIDDEN', 'このリクエストは許可されていません'));
      return;
    }
    if (pathname !== '/api/stamp' && pathname !== '/api/battle') {
      sendText(response, 404, '窓口が見つかりません');
      return;
    }

    let body;
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      sendError(response, 400, apiError('E_USAGE', 'JSON が不正です'));
      return;
    }
    const fields = pathname === '/api/stamp' ? ['node', 'as'] : ['gate'];
    if (body === null || typeof body !== 'object' || Array.isArray(body)
      || fields.some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
      sendError(response, 400, apiError('E_USAGE', `${fields.join('・')} を文字列で指定してください`));
      return;
    }

    let result;
    try {
      result = pathname === '/api/stamp'
        ? await onStamp({ node: body.node, as: body.as })
        : await onBattle({ gate: body.gate });
    } catch (error) {
      if (typeof error?.code !== 'string') throw error;
      sendError(response, 409, error);
      return;
    }
    sendJson(response, 200, result);
  }

  async function handleRequest(request, response) {
    let pathname;
    try {
      // URL の正規化で「..」が消える前に、実際の要求パスを検証する。
      pathname = decodeURIComponent(request.url.split('?', 1)[0]);
    } catch {
      sendText(response, 400, 'URL が不正です');
      return;
    }
    if (!pathname.startsWith('/') || /[\\\0]/.test(pathname)) {
      sendText(response, 400, 'URL が不正です');
      return;
    }

    if (request.method === 'POST') {
      await handlePost(request, response, pathname);
      return;
    }
    if (request.method !== 'GET') {
      const allow = ['/api/stamp', '/api/battle'].includes(pathname) ? 'POST' : 'GET';
      sendText(response, 405, 'このメソッドには対応していません', { Allow: allow });
      return;
    }

    if (pathname === '/api/state') {
      response.setHeader('Cache-Control', 'no-store');
      sendJson(response, 200, await getView());
      return;
    }
    if (pathname === '/api/health') {
      sendJson(response, 200, { ok: true, masume: 1 });
      return;
    }
    if (pathname === '/api/stream') {
      openStream(response);
      return;
    }
    if (pathname.startsWith('/api/output/')) {
      const value = pathname.slice('/api/output/'.length);
      const seq = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(seq)) {
        sendError(response, 400, apiError('E_USAGE', '判定出力の番号は非負の整数で指定してください'));
        return;
      }
      const output = await outputFor(seq);
      if (output == null) sendText(response, 404, '判定出力が見つかりません');
      else sendText(response, 200, output);
      return;
    }
    await serveStatic(response, root, pathname);
  }

  const server = createHttpServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendError(response, 500, error);
    });
  });

  server.on('listening', () => {
    if (watchedPath !== null) {
      // inode ではなくパスを監視し、rename による置換後も監視を続ける。
      // 100ms 内の連続変更は1回の通知にまとまる。
      watchPath(watchedPath, { interval: 100, persistent: false }, notifyChange);
      watching = true;
    }
  });
  server.on('close', closeStreams);

  let stopping;
  server.stop = () => {
    stopping ??= new Promise((resolveStop, rejectStop) => {
      closeStreams();
      server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') rejectStop(error);
        else resolveStop();
      });
      // 新規接続を止めてから、処理中・待機中の HTTP 接続を閉じる。
      server.closeAllConnections();
    }).finally(() => {
      stopping = undefined;
    });
    return stopping;
  };

  return server;
}

/** engine の公開 API を使って、指定した冒険の盤面を公開する。 */
export async function startServer({ root, port = 5005, host = '127.0.0.1', webRoot }) {
  // createServer 単体は engine の存在や実装状況に依存させない。
  const engine = await import('../engine/index.js');
  const gameRoot = resolve(root);
  const bin = fileURLToPath(new URL('../../bin/masume.js', import.meta.url));

  function startBattle(gate) {
    // 判定の終了は待たない。子プロセスが冒険の書に結果を記録し、SSE が通知する。
    return new Promise((resolveSpawn, rejectSpawn) => {
      const child = spawn(process.execPath, [bin, 'check', gate, '--dir', gameRoot, '--as', 'gm'], {
        cwd: gameRoot,
        stdio: 'ignore',
        detached: true,
      });
      child.once('error', rejectSpawn);
      child.once('spawn', () => {
        child.unref();
        resolveSpawn();
      });
    });
  }

  const server = createServer({
    webRoot: webRoot ?? fileURLToPath(new URL('../../web/', import.meta.url)),
    getView: () => engine.buildView(gameRoot),
    watchFile: engine.logFile(gameRoot),
    outputFor: async (seq) => {
      const file = await engine.outputFile(gameRoot, seq);
      return file == null ? null : readFile(file, 'utf8');
    },
    onStamp: async ({ node, as }) => {
      const result = await engine.stamp(gameRoot, node, { actor: as, as, boss: false });
      const ready = result.ready ?? null;
      if (ready !== null) await startBattle(ready);
      return { ok: true, ready };
    },
    onBattle: async ({ gate }) => {
      const view = await engine.buildView(gameRoot);
      if (!view.integrity.ok) throw apiError('E_CURSED', '冒険の書が呪われています');
      if (view.nodes[gate]?.type !== 'gate') throw apiError('E_UNKNOWN', 'その結合ゲートはありません');
      if (view.nodes[gate].state !== 'ready') {
        throw apiError('E_PARTY_INCOMPLETE', 'まだ仲間が揃っていません');
      }
      await startBattle(gate);
      return { ok: true, ready: gate };
    },
  });

  try {
    await new Promise((resolveListen, rejectListen) => {
      const onError = (error) => {
        server.off('listening', onListening);
        rejectListen(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolveListen();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
  } catch (error) {
    await server.stop();
    throw error;
  }

  const actualPort = server.address().port;
  const urlHost = host.includes(':') ? `[${host}]` : host;
  return {
    server,
    url: `http://${urlHost}:${actualPort}/`,
    port: actualPort,
    stop: () => server.stop(),
  };
}
