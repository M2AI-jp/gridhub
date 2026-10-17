import { createServer as createHttpServer } from 'node:http';
import { existsSync, mkdirSync, watchFile as watchPath, unwatchFile } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChildJob, tailLines } from './jobs.js';

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

const MAX_POST_BYTES = 64 * 1024;
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
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

function apiError(code, message, status) {
  return Object.assign(new Error(message), status === undefined ? { code } : { code, status });
}

const badRequest = (message) => apiError('E_USAGE', message, 400);

function rejectLargeBody(request, response) {
  // 本文の残りを待たずに応答し、413 を送ってから接続を閉じる。
  request.pause();
  response.setHeader('Connection', 'close');
  response.once('finish', () => request.destroy());
  sendError(response, 413, apiError('E_TOO_LARGE', 'POST の本文は 64KB までです'));
}

const GMS = ['claude', 'codex']; // HTTP から cmd: は受け付けない（任意のコマンド実行になるため）
const MODEL_PATTERN = /^[A-Za-z0-9][\w.:@/+[\]-]{0,99}$/u;
const CHARACTER_PATTERN = /^[a-z][a-z0-9-]{0,23}$/u;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseModel(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !MODEL_PATTERN.test(value)) throw badRequest('model が不正です');
  return value;
}

function parseAllowListen(value) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw badRequest('allow_listen は真偽値で指定してください');
  }
  return value;
}

function parseQuestBody(body) {
  if (typeof body.wish !== 'string') throw badRequest('wish を文字列で指定してください');
  const wish = body.wish.trim();
  const length = [...wish].length;
  if (length < 1 || length > 2000) throw badRequest('wish は 1〜2000 文字で書いてください');
  if (wish.includes('\0')) throw badRequest('wish に使えない文字が含まれています');
  if (!GMS.includes(body.gm)) throw badRequest('gm は claude か codex を指定してください');
  return { wish, gm: body.gm, model: parseModel(body.model), allow_listen: parseAllowListen(body.allow_listen) };
}

function parseSortieBody(body) {
  if (!GMS.includes(body.agent)) throw badRequest('agent は claude か codex を指定してください');
  let parallel;
  if (body.parallel !== undefined && body.parallel !== null) {
    if (!Number.isInteger(body.parallel) || body.parallel < 1 || body.parallel > 8) {
      throw badRequest('parallel は 1〜8 の整数で指定してください');
    }
    parallel = body.parallel;
  }
  let only;
  if (body.only !== undefined && body.only !== null) {
    if (!Array.isArray(body.only) || body.only.length > 64
      || body.only.some((id) => typeof id !== 'string' || !CHARACTER_PATTERN.test(id))) {
      throw badRequest('only はキャラクターIDの配列で指定してください');
    }
    only = [...new Set(body.only)];
  }
  return {
    agent: body.agent, model: parseModel(body.model), parallel, only: only?.length ? only : undefined,
    allow_listen: parseAllowListen(body.allow_listen ?? undefined),
  };
}

async function readPartyDefaults(root) {
  let config;
  try {
    config = JSON.parse(await readFile(join(root, '.masume', 'party.json'), 'utf8'));
  } catch {
    // 設定が無い・読めない・壊れている場合も、出撃の窓には既定値を返す。
  }
  if (!isObject(config)) config = {};
  return {
    allow_listen: config.allow_listen === true,
    agent: GMS.includes(config.agent) ? config.agent : null,
    parallel: Number.isInteger(config.parallel) && config.parallel >= 1 && config.parallel <= 8
      ? config.parallel : null,
  };
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

const LOOPBACK_ADDRESS = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/u;
const LOOPBACK_HOST = /^(localhost|[^.]+\.localhost|127\.\d+\.\d+\.\d+|\[::1\])$/iu;

/**
 * ループバックで待ち受けているときは、Host もループバックの名前だけ受ける（DNS rebinding 対策）。
 * 外のページが自分のドメインをこの端末の 127.0.0.1 に向けても、Host がそのドメインなので弾ける。
 * LAN に公開した（--host 0.0.0.0 など）ときは、公開した本人の選択なので確認しない。
 */
function allowedHost(request) {
  const local = request.socket.localAddress;
  if (typeof local !== 'string' || !LOOPBACK_ADDRESS.test(local)) return true;
  const host = request.headers.host;
  if (host === undefined) return true;
  try {
    return LOOPBACK_HOST.test(new URL(`http://${host}`).hostname);
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
export function createServer({
  webRoot, getView, watchFile, onStamp, onBattle, outputFor,
  onQuest, getQuest, onSortie, getParty, onPartyStop,
}) {
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

  // 窓口ごとの「中身の検査」と「呼ぶ先」。入口・出撃の窓口（§15）は、呼ぶ先を渡されたときだけ開く。
  const postRoutes = {
    '/api/stamp': {
      parse(body) {
        if (['node', 'as'].some((field) => typeof body[field] !== 'string' || !body[field].trim())) {
          throw badRequest('node・as を文字列で指定してください');
        }
        return { node: body.node, as: body.as };
      },
      call: (value) => onStamp(value),
      status: 200,
    },
    '/api/battle': {
      parse(body) {
        if (typeof body.gate !== 'string' || !body.gate.trim()) throw badRequest('gate を文字列で指定してください');
        return { gate: body.gate };
      },
      call: (value) => onBattle(value),
      status: 200,
    },
  };
  if (typeof onQuest === 'function') {
    postRoutes['/api/quest'] = { parse: parseQuestBody, call: (value) => onQuest(value), status: 202 };
  }
  if (typeof onSortie === 'function') {
    postRoutes['/api/sortie'] = { parse: parseSortieBody, call: (value) => onSortie(value), status: 202 };
  }
  if (typeof onPartyStop === 'function') {
    postRoutes['/api/party/stop'] = { parse: () => ({}), call: () => onPartyStop(), status: 200, optionalBody: true };
  }
  const getRoutes = {};
  if (typeof getQuest === 'function') getRoutes['/api/quest'] = getQuest;
  if (typeof getParty === 'function') getRoutes['/api/party'] = getParty;

  async function handlePost(request, response, pathname) {
    if (request.headers['x-masume'] !== '1' || !allowedOrigin(request)) {
      sendError(response, 403, apiError('E_FORBIDDEN', 'このリクエストは許可されていません'));
      return;
    }
    const route = Object.hasOwn(postRoutes, pathname) ? postRoutes[pathname] : undefined;
    if (route === undefined) {
      sendText(response, 404, '窓口が見つかりません');
      return;
    }

    let body;
    let value;
    try {
      const chunks = [];
      let size = 0;
      // 上限で抜けても、413 を送り終わる前にソケットを壊さない。
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_POST_BYTES) {
          rejectLargeBody(request, response);
          return;
        }
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      body = route.optionalBody && !text.trim() ? {} : JSON.parse(text);
    } catch {
      sendError(response, 400, apiError('E_USAGE', 'JSON が不正です'));
      return;
    }
    try {
      if (!isObject(body)) throw badRequest('JSON はオブジェクトで送ってください');
      value = route.parse(body);
    } catch (error) {
      if (error?.status !== 400) throw error;
      sendError(response, 400, error);
      return;
    }

    let result;
    try {
      result = await route.call(value);
    } catch (error) {
      if (typeof error?.code !== 'string') throw error;
      sendError(response, error.status ?? 409, error);
      return;
    }
    sendJson(response, route.status, result);
  }

  async function handleRequest(request, response) {
    if (!allowedHost(request)) {
      sendError(response, 403, apiError('E_FORBIDDEN', 'このホスト名ではアクセスできません'));
      return;
    }
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
      const methods = [];
      if (Object.hasOwn(getRoutes, pathname) || !Object.hasOwn(postRoutes, pathname)) methods.push('GET');
      if (Object.hasOwn(postRoutes, pathname)) methods.push('POST');
      const allow = methods.join(', ');
      sendText(response, 405, 'このメソッドには対応していません', { Allow: allow });
      return;
    }

    if (pathname === '/api/state') {
      response.setHeader('Cache-Control', 'no-store');
      let view;
      try {
        view = await getView();
      } catch (error) {
        // 冒険の書がまだ無い（ロビー）。サーバーの不具合ではない
        if (error?.code !== 'E_NO_GAME') throw error;
        sendError(response, 404, error);
        return;
      }
      sendJson(response, 200, view);
      return;
    }
    if (Object.hasOwn(getRoutes, pathname)) {
      response.setHeader('Cache-Control', 'no-store');
      sendJson(response, 200, await getRoutes[pathname]());
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
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
    if (request.method === 'POST' && Number(request.headers['content-length']) > MAX_POST_BYTES) {
      rejectLargeBody(request, response);
      return;
    }
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

/**
 * engine の公開 API を使って、指定した冒険の盤面を公開する。
 * 冒険の書がまだ無い場所でも開く（ロビー）。願いを受けて語り部（masume quest）を、出撃の合図を受けて軍師（masume party）を、
 * 別プロセスで起こす。stop() で HTTP と子プロセスをまとめて片付ける。
 */
export async function startServer({ root, port = 5005, host = '127.0.0.1', webRoot }) {
  // createServer 単体は engine の存在や実装状況に依存させない。
  const engine = await import('../engine/index.js');
  const gameRoot = resolve(root);
  const bin = fileURLToPath(new URL('../../bin/masume.js', import.meta.url));
  const questLog = join(gameRoot, 'quest.log');
  const partyLog = join(gameRoot, '.masume', 'party.log');
  const quest = new ChildJob();
  const party = new ChildJob();
  const battles = new Map();
  let shuttingDown = false;

  const requireOpen = () => {
    if (shuttingDown) throw apiError('E_BUSY', '窓口を閉じています');
  };
  const hasGame = () => existsSync(engine.logFile(gameRoot));
  const requireGame = () => {
    if (!hasGame()) throw apiError('E_NO_GAME', '冒険の書がまだありません。入口で願いを書いて冒険をはじめてください');
  };

  function startBattle(gate) {
    requireOpen();
    if (battles.has(gate)) throw apiError('E_BUSY', 'この結合ゲートはボス戦の最中です');
    const battle = new ChildJob();
    // 起動を待つ前に予約し、ハンコと /api/battle からの同時起動も防ぐ。
    battles.set(gate, battle);
    // 判定の終了は待たない。子プロセスが冒険の書に結果を記録し、SSE が通知する。
    try {
      const started = battle.start([bin, 'check', '--dir', gameRoot, '--as', 'gm', '--', gate], { cwd: gameRoot });
      battle.exited.then(() => {
        if (battles.get(gate) === battle) battles.delete(gate);
      });
      return started.catch((error) => {
        if (battles.get(gate) === battle) battles.delete(gate);
        throw error;
      });
    } catch (error) {
      battles.delete(gate);
      throw error;
    }
  }

  const job = (running, code, file) => async () => ({
    ok: true,
    running: running(),
    code: code(),
    log: await tailLines(file),
  });
  const partyStatus = job(() => party.running, () => party.code, partyLog);

  const server = createServer({
    webRoot: webRoot ?? fileURLToPath(new URL('../../web/', import.meta.url)),
    getView: () => {
      requireGame();
      return engine.buildView(gameRoot);
    },
    watchFile: engine.logFile(gameRoot),
    outputFor: async (seq) => {
      if (!hasGame()) return null;
      const file = await engine.outputFile(gameRoot, seq);
      return file == null ? null : readFile(file, 'utf8');
    },
    onStamp: async ({ node, as }) => {
      requireOpen();
      requireGame();
      const result = await engine.stamp(gameRoot, node, { actor: as, as, boss: false });
      const ready = result.ready ?? null;
      if (ready !== null) await startBattle(ready);
      return { ok: true, ready };
    },
    onBattle: async ({ gate }) => {
      requireOpen();
      requireGame();
      if (battles.has(gate)) throw apiError('E_BUSY', 'この結合ゲートはボス戦の最中です');
      const view = await engine.buildView(gameRoot);
      if (!view.integrity.ok) throw apiError('E_CURSED', '冒険の書が呪われています');
      if (view.nodes[gate]?.type !== 'gate') throw apiError('E_UNKNOWN', 'その結合ゲートはありません');
      if (view.nodes[gate].state !== 'ready') {
        throw apiError('E_PARTY_INCOMPLETE', 'まだ仲間が揃っていません');
      }
      await startBattle(gate);
      return { ok: true, ready: gate };
    },

    // ---- 入口（語り部）----
    onQuest: async ({ wish, gm, model, allow_listen }) => {
      // 確認から起動までに await を挟まない（同時に2つ起こさないため）
      requireOpen();
      if (hasGame() || existsSync(join(gameRoot, '.masume'))) {
        throw apiError('E_EXISTS', 'ここにはもう冒険の書があります');
      }
      if (quest.running) throw apiError('E_BUSY', 'いま冒険をつくっています');
      mkdirSync(gameRoot, { recursive: true });
      // 願いは「--」のあとに置く（先頭が - の願いがオプションに化けないように）
      const args = [
        bin, 'quest', '--dir', gameRoot, '--gm', gm,
        ...(model ? ['--model', model] : []),
        ...(allow_listen === true ? ['--allow-listen'] : []),
        '--', wish,
      ];
      try {
        await quest.start(args, { cwd: gameRoot, logFile: questLog });
      } catch (error) {
        throw apiError('E_SPAWN', `語り部を起こせませんでした: ${error.message}`, 500);
      }
      return { ok: true };
    },
    getQuest: job(() => quest.running, () => quest.code, questLog),

    // ---- 出撃（軍師）----
    onSortie: async ({ agent, model, parallel, only, allow_listen }) => {
      requireOpen();
      requireGame();
      if (party.running) throw apiError('E_BUSY', 'もう出撃しています');
      if (only !== undefined) {
        const view = await engine.buildView(gameRoot);
        const unknown = only.filter((id) => !view.characters.some((c) => c.id === id));
        if (unknown.length > 0) throw apiError('E_UNKNOWN', `そんなキャラクターはいません: ${unknown.join('、')}`, 400);
        // view を待つあいだに、別の出撃が始まっていないか確かめ直す
        if (party.running) throw apiError('E_BUSY', 'もう出撃しています');
      }
      requireOpen();
      const args = [
        bin, 'party', '--dir', gameRoot, '--agent', agent,
        ...(model ? ['--model', model] : []),
        ...(parallel === undefined ? [] : ['--parallel', String(parallel)]),
        ...(only === undefined ? [] : ['--only', only.join(',')]),
        ...(allow_listen === undefined ? [] : [allow_listen ? '--allow-listen' : '--no-allow-listen']),
      ];
      const heading = `\n===== 出撃 ${new Date().toISOString()} =====\n$ masume ${args.slice(1).join(' ')}\n`;
      try {
        await party.start(args, { cwd: gameRoot, logFile: partyLog, heading });
      } catch (error) {
        throw apiError('E_SPAWN', `軍師を起こせませんでした: ${error.message}`, 500);
      }
      return { ok: true };
    },
    getParty: async () => {
      const [status, defaults] = await Promise.all([partyStatus(), readPartyDefaults(gameRoot)]);
      return { ...status, ...defaults };
    },
    onPartyStop: () => ({ ok: true, stopped: party.interrupt() }),
  });

  // 伝令が突然終わるときも、子を置き去りにしない（最後の手段。待てないので SIGINT を送るだけ）
  const onExit = () => {
    quest.interruptNow();
    party.interruptNow();
    for (const battle of battles.values()) battle.interruptNow();
  };
  process.once('exit', onExit);

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
    process.off('exit', onExit);
    await server.stop();
    throw error;
  }

  // HTTP を閉じ、動いている子には SIGINT を伝えて（軍師は帰還を記録する）終わりを待つ
  const stopHttp = server.stop;
  let stopping;
  const stop = () => {
    shuttingDown = true;
    stopping ??= Promise.all([stopHttp(), quest.terminate(), party.terminate(),
      ...[...battles.values()].map((battle) => battle.terminate())])
      .then(() => {})
      .finally(() => process.off('exit', onExit));
    return stopping;
  };
  server.stop = stop;

  const actualPort = server.address().port;
  const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  return {
    server,
    url: `http://${urlHost}:${actualPort}/`,
    port: actualPort,
    stop,
  };
}
