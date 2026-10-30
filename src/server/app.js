// アプリの起動役（CONTRACTS §68）: はじめの画面・フォルダを開く・最近のフォルダ・チュートリアル。伝令の縄張り。
// Mac のアプリ（mac/GridHub.swift）はこれを `gridhub app --port 0 --lifeline` で起こし、出てきた URL を窓に映す。
// フォルダを開くと、そのフォルダの盤面のサーバー（startServer。§15）を同じプロセスの中に起こす。開き直すと前のものは止める。
import { createHash } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { accessSync, constants, cpSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appHome } from '../engine/home.js';
import {
  MAX_POST_BYTES, SECURITY_HEADERS, allowedHost, allowedOrigin, apiError, isObject, rejectLargeBody,
  sendError, sendJson, sendText, serveStatic, startServer,
} from './index.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECENT_MAX = 10;
const TUTORIAL_NAME = 'チュートリアル';

/** 最近のフォルダを置く場所（§68.1）: --home → GRIDHUB_APP_HOME → macOS は ~/Library/Application Support/GridHub、ほかは XDG */
export function defaultHome(env = process.env) {
  return appHome(env);
}

/**
 * フォルダごとに決まった盤面のポート（§79.29）。41000〜48999 のうち、フォルダの場所のハッシュで決める。
 * 開くたびに同じ住所（origin）になるので、盤面がブラウザに覚えたこと（音・見たエンディング）がアプリを開き直しても残る
 */
export function stablePort(dir) {
  return 41000 + (createHash('sha256').update(resolve(dir)).digest().readUInt32BE(0) % 8000);
}

/** チュートリアルのフォルダを作る場所（§68.1）: --play → GRIDHUB_PLAY_DIR → ~/GridHub */
export function defaultPlay(env = process.env) {
  return env.GRIDHUB_PLAY_DIR ? resolve(env.GRIDHUB_PLAY_DIR) : join(homedir(), 'GridHub');
}

/** PATH の中の実行できる claude（§68.4） */
function findClaude(env = process.env) {
  for (const dir of String(env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, 'claude');
    try {
      accessSync(file, constants.X_OK);
      if (statSync(file).isFile()) return file;
    } catch {
      // 無い・実行できない
    }
  }
  return null;
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

const hasGame = (dir) => existsSync(join(dir, '.masume', 'log.jsonl'));

/** 最近のフォルダ（recent.json）。壊れていたら空から */
function readRecent(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, 'recent.json'), 'utf8'));
    const list = Array.isArray(value?.recent) ? value.recent : [];
    return list.filter((item) => typeof item?.dir === 'string' && isAbsolute(item.dir)).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(home, list) {
  mkdirSync(home, { recursive: true });
  const file = join(home, 'recent.json');
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ recent: list }, null, 2)}\n`);
  renameSync(temp, file);
}

/** 盤面の題（冒険の書があれば）。読めなければ null */
async function titleOf(dir) {
  if (!hasGame(dir)) return null;
  try {
    const engine = await import('../engine/index.js');
    return engine.buildView(dir).quest?.title ?? null;
  } catch {
    return null;
  }
}

function readJsonBody(request, response) {
  return new Promise((resolveBody) => {
    const chunks = [];
    let size = 0;
    let done = false;
    request.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_POST_BYTES) {
        done = true;
        rejectLargeBody(request, response);
        resolveBody(undefined);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (done) return;
      done = true;
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolveBody(text.trim() ? JSON.parse(text) : {});
      } catch {
        sendError(response, 400, apiError('E_USAGE', 'JSON が不正です'));
        resolveBody(undefined);
      }
    });
    request.on('error', () => {
      done = true;
      resolveBody(undefined);
    });
  });
}

function parseDir(body) {
  if (!isObject(body) || typeof body.dir !== 'string' || !body.dir.trim()) {
    throw apiError('E_USAGE', 'dir にフォルダの場所（絶対パス）を書いてください', 400);
  }
  const dir = body.dir.trim();
  if (!isAbsolute(dir) || dir.includes('\0')) throw apiError('E_USAGE', `dir は絶対パスで書いてください: ${dir}`, 400);
  return resolve(dir);
}

/**
 * 起動役を起こす。{ server, url, port, stop }。
 * home: 最近のフォルダを置く場所、play: チュートリアルを作る場所、webRoot: はじめの画面と静的ファイル（既定は web/）
 */
export async function startApp({
  port = 0, host = '127.0.0.1', home = defaultHome(), play = defaultPlay(), webRoot, env = process.env,
} = {}) {
  const web = resolve(webRoot ?? join(PACKAGE_ROOT, 'web'));
  let current = null; // { dir, running }
  let launcherUrl = '';
  let queue = Promise.resolve();
  let stopped = false;

  /** 開く・チュートリアル・止めるは、同時に走らせない */
  const serial = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  function remember(dir) {
    const list = readRecent(home).filter((item) => resolve(item.dir) !== dir);
    list.unshift({ dir, at: new Date().toISOString() });
    writeRecent(home, list.slice(0, RECENT_MAX));
  }

  async function recentList() {
    return Promise.all(readRecent(home).map(async ({ dir }) => {
      const missing = !existsSync(dir);
      return { dir, name: basename(dir) || dir, has_game: !missing && hasGame(dir), title: missing ? null : await titleOf(dir), missing };
    }));
  }

  async function closeCurrent() {
    if (current === null) return;
    const { running } = current;
    current = null;
    await running.stop();
  }

  async function openDir(dir) {
    let info;
    try {
      info = statSync(dir);
    } catch {
      throw apiError('E_NO_DIR', `フォルダがありません: ${dir}`, 404);
    }
    if (!info.isDirectory()) throw apiError('E_NO_DIR', `フォルダではありません: ${dir}`, 404);
    if (stopped) throw apiError('E_BUSY', '起動役を閉じています', 409);
    await closeCurrent();
    let running;
    try {
      running = await startServer({ root: dir, port: stablePort(dir), host, home });
    } catch (error) {
      // 決まったポートが使われていれば、空いているポートで（その回だけ、覚えたことは引き継がれない）
      if (!['EADDRINUSE', 'EACCES'].includes(error?.code)) throw error;
      running = await startServer({ root: dir, port: 0, host, home });
    }
    current = { dir, running };
    remember(dir);
    const url = new URL(running.url);
    url.searchParams.set('home', launcherUrl);
    return { ok: true, dir, url: url.href, has_game: hasGame(dir) };
  }

  async function makeTutorial() {
    const engine = await import('../engine/index.js');
    mkdirSync(play, { recursive: true });
    let dir = join(play, TUTORIAL_NAME);
    for (let n = 2; existsSync(dir); n++) dir = join(play, `${TUTORIAL_NAME} ${n}`);
    cpSync(join(PACKAGE_ROOT, 'quests', 'tutorial'), dir, { recursive: true });
    engine.newGame(dir, join(dir, 'tutorial.map.json'));
    return openDir(dir);
  }

  const postRoutes = {
    '/api/app/open': (body) => serial(() => openDir(parseDir(body))),
    '/api/app/tutorial': () => serial(() => makeTutorial()),
    '/api/app/forget': async (body) => {
      const dir = parseDir(body);
      writeRecent(home, readRecent(home).filter((item) => resolve(item.dir) !== dir));
      return { ok: true, recent: await recentList() };
    },
  };

  async function handle(request, response) {
    if (!allowedHost(request)) {
      sendError(response, 403, apiError('E_FORBIDDEN', 'このホスト名ではアクセスできません'));
      return;
    }
    let pathname;
    try {
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
      if (request.headers['x-masume'] !== '1' || !allowedOrigin(request)) {
        sendError(response, 403, apiError('E_FORBIDDEN', 'このリクエストは許可されていません'));
        return;
      }
      const route = Object.hasOwn(postRoutes, pathname) ? postRoutes[pathname] : undefined;
      if (!route) {
        sendText(response, 404, '窓口が見つかりません');
        return;
      }
      const body = await readJsonBody(request, response);
      if (body === undefined) return;
      try {
        sendJson(response, 200, await route(body));
      } catch (error) {
        if (typeof error?.code !== 'string') throw error;
        sendError(response, error.status ?? 409, error);
      }
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'このメソッドには対応していません', { Allow: Object.hasOwn(postRoutes, pathname) ? 'POST' : 'GET' });
      return;
    }
    if (pathname === '/api/app') {
      response.setHeader('Cache-Control', 'no-store');
      const claude = findClaude(env);
      sendJson(response, 200, {
        ok: true,
        version: packageVersion(),
        node: process.versions.node,
        in_app: env.GRIDHUB_APP === '1',
        claude: { found: claude !== null, path: claude },
        home,
        play,
        recent: await recentList(),
        current: current === null ? null : { dir: current.dir, url: (() => {
          const url = new URL(current.running.url);
          url.searchParams.set('home', launcherUrl);
          return url.href;
        })() },
      });
      return;
    }
    // 勇者の手帳（§79.7）: はじめの画面の勇者のカード。冒険をまたいだまとめ（読むだけ）
    if (pathname === '/api/hero') {
      response.setHeader('Cache-Control', 'no-store');
      const hero = await import('../engine/hero.js');
      sendJson(response, 200, hero.heroJournal(home));
      return;
    }
    if (pathname === '/api/health') {
      sendJson(response, 200, { ok: true, gridhub: 'app' });
      return;
    }
    await serveStatic(response, web, pathname === '/' ? '/start.html' : pathname);
  }

  const server = createHttpServer((request, response) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
    if (request.method === 'POST' && Number(request.headers['content-length']) > MAX_POST_BYTES) {
      rejectLargeBody(request, response);
      return;
    }
    handle(request, response).catch((error) => sendError(response, 500, error));
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const actualPort = server.address().port;
  const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
  launcherUrl = `http://${urlHost}:${actualPort}/`;

  let stopping;
  const stop = () => {
    stopping ??= (async () => {
      stopped = true;
      await queue.catch(() => {});
      await closeCurrent();
      await new Promise((done) => {
        server.close(() => done());
        server.closeAllConnections();
      });
    })();
    return stopping;
  };

  return { server, url: launcherUrl, port: actualPort, stop };
}
