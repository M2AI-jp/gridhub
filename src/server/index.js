import { createServer as createHttpServer } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, watchFile as watchPath, unwatchFile } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChildJob, tailLines } from './jobs.js';
import { t } from '../engine/words.js';

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

export const MAX_POST_BYTES = 64 * 1024;
const HAND_FILE_POST_BYTES = 2 * 1024 * 1024; // 手で書くファイル（§67.4 の 1MiB と、JSON の包み）
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};

function send(response, status, body, contentType, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': contentType, ...headers });
  response.end(body);
}

export function sendText(response, status, text, headers) {
  send(response, status, text, 'text/plain; charset=utf-8', headers);
}

export function sendJson(response, status, value, headers) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8', headers);
}

export function sendError(response, status, error) {
  sendJson(response, status, {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'E_INTERNAL',
    error: typeof error?.message === 'string' ? error.message : 'サーバー内部でエラーが発生しました',
  });
}

export function apiError(code, message, status) {
  return Object.assign(new Error(message), status === undefined ? { code } : { code, status });
}

const badRequest = (message) => apiError('E_USAGE', message, 400);

export function rejectLargeBody(request, response, limit = MAX_POST_BYTES) {
  // 本文の残りを待たずに応答し、413 を送ってから接続を閉じる。
  request.pause();
  response.setHeader('Connection', 'close');
  response.once('finish', () => request.destroy());
  sendError(response, 413, apiError('E_TOO_LARGE', `POST の本文は ${Math.round(limit / 1024)}KB までです`));
}

const TACTICS = ['careful', 'balanced', 'bold']; // 作戦（§45・§47）
const GMS = ['claude', 'codex']; // HTTP から cmd: は受け付けない（任意のコマンド実行になるため）
const MODEL_PATTERN = /^[A-Za-z0-9][\w.:@/+[\]-]{0,99}$/u;
const CHARACTER_PATTERN = /^[a-z][a-z0-9-]{0,23}$/u;

export function isObject(value) {
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
  // 作戦（§47.2）。省略（undefined・null）なら何も足さない
  let tactic;
  if (body.tactic !== undefined && body.tactic !== null) {
    if (!TACTICS.includes(body.tactic)) throw badRequest('tactic は careful / balanced / bold のどれかで指定してください');
    tactic = body.tactic;
  }
  return {
    agent: body.agent, model: parseModel(body.model), parallel, only: only?.length ? only : undefined,
    allow_listen: parseAllowListen(body.allow_listen ?? undefined), tactic,
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
    tactic: TACTICS.includes(config.tactic) ? config.tactic : null,
    agent: GMS.includes(config.agent) ? config.agent : null,
    parallel: Number.isInteger(config.parallel) && config.parallel >= 1 && config.parallel <= 8
      ? config.parallel : null,
  };
}

export function allowedOrigin(request) {
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
export function allowedHost(request) {
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

export async function serveStatic(response, root, pathname) {
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
    // 版を上げたあとも古い盤面（JS・CSS）を使い続けないよう、毎回確かめさせる（手元のサーバーなので軽い）
    send(response, 200, content, MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', { 'Cache-Control': 'no-cache' });
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
  getGit, onPush, onAutoPush,
  getHand, getFile, onFile, onStep, onCheck, onNote,
  getWords, onWords,
  getHero, onHeroOpen, onHeroSeen, onHeroPaste, onHeroPeel, onHeroTrade, onHeroTitle, onHeroTheme,
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
  // GitHub につなぐ導線（§56.3）: 送る
  if (typeof onPush === 'function') {
    postRoutes['/api/git/push'] = { parse: () => ({}), call: () => onPush(), status: 200, optionalBody: true };
  }
  // 町でセーブしたら GitHub に送る設定（§59.5）
  if (typeof onAutoPush === 'function') {
    postRoutes['/api/git/auto'] = {
      parse(body) {
        if (typeof body.auto_push !== 'boolean') throw badRequest('auto_push は true か false で指定してください');
        return { auto_push: body.auto_push };
      },
      call: (value) => onAutoPush(value),
      status: 200,
    };
  }
  // ことば（§76.3）: 盤面の切り替えを、この冒険の設定（.masume/words.json）に書く
  if (typeof onWords === 'function') {
    postRoutes['/api/words'] = {
      parse(body) {
        if (body.words !== 'game' && body.words !== 'dev') throw badRequest('words は game か dev で指定してください');
        return { words: body.words };
      },
      call: (value) => onWords(value),
      status: 200,
    };
  }
  // 手で演じる窓口（§69）
  const characterOf = (body) => {
    if (typeof body.character !== 'string' || !CHARACTER_PATTERN.test(body.character)) throw badRequest('character をキャラクターIDで指定してください');
    return body.character;
  };
  if (typeof onFile === 'function') {
    postRoutes['/api/file'] = {
      parse(body) {
        const character = characterOf(body);
        if (typeof body.path !== 'string') throw badRequest('path を文字列で指定してください');
        if (typeof body.content !== 'string') throw badRequest('content を文字列で指定してください');
        return { character, path: body.path, content: body.content };
      },
      call: (value) => onFile(value),
      status: 200,
      maxBytes: HAND_FILE_POST_BYTES,
    };
  }
  // 日誌（§79.31）: 盤面から書く。強敵のあとの日誌は技になる
  if (typeof onNote === 'function') {
    postRoutes['/api/note'] = {
      parse(body) {
        const character = characterOf(body);
        if (typeof body.text !== 'string') throw badRequest('text を文字列で指定してください');
        const text = body.text.trim();
        if ([...text].length < 1 || [...text].length > 2000 || text.includes('\0')) throw badRequest('text は 1〜2000 文字で書いてください');
        return { character, text };
      },
      call: (value) => onNote(value),
      status: 200,
    };
  }
  if (typeof onStep === 'function') {
    postRoutes['/api/step'] = { parse: (body) => ({ character: characterOf(body) }), call: (value) => onStep(value), status: 200 };
  }
  if (typeof onCheck === 'function') {
    postRoutes['/api/check'] = { parse: (body) => ({ character: characterOf(body) }), call: (value) => onCheck(value), status: 200 };
  }
  // 勇者の手帳（§79）: シール袋を開ける・読んだと覚える
  if (typeof onHeroOpen === 'function') {
    postRoutes['/api/hero/open'] = {
      parse(body) {
        const count = body.count ?? 1;
        if (!Number.isInteger(count) || count < 1 || count > 5000) throw badRequest('count は 1〜5000 の整数で指定してください');
        return { count };
      },
      call: (value) => onHeroOpen(value),
      status: 200,
      optionalBody: true,
    };
  }
  if (typeof onHeroSeen === 'function') {
    postRoutes['/api/hero/seen'] = {
      parse(body) {
        if (body.seq !== undefined && (!Number.isInteger(body.seq) || body.seq < 0)) throw badRequest('seq は 0 以上の整数で指定してください');
        return { seq: body.seq };
      },
      call: (value) => onHeroSeen(value),
      status: 200,
      optionalBody: true,
    };
  }
  // シールをノートに貼る・はがす（§79.11）
  if (typeof onHeroPaste === 'function') {
    postRoutes['/api/hero/paste'] = {
      parse(body) {
        if (typeof body.slot !== 'string' || !/^[a-z]+(:[a-z]+)?$/u.test(body.slot)) throw badRequest('slot をシールの枠（例 slime:kira）で指定してください');
        if (!Number.isInteger(body.page)) throw badRequest('page を整数で指定してください');
        for (const k of ['x', 'y']) if (typeof body[k] !== 'number' || !Number.isFinite(body[k])) throw badRequest(`${k} を数で指定してください`);
        const r = body.r ?? 0;
        if (typeof r !== 'number' || !Number.isFinite(r)) throw badRequest('r を数で指定してください');
        return { slot: body.slot, page: body.page, x: body.x, y: body.y, r };
      },
      call: (value) => onHeroPaste(value),
      status: 200,
    };
  }
  // 交換所・名乗る称号（§79.16・§79.18）
  if (typeof onHeroTrade === 'function') {
    postRoutes['/api/hero/trade'] = {
      parse(body) {
        if (typeof body.slot !== 'string' || !/^[a-z]+(:[a-z]+)?$/u.test(body.slot)) throw badRequest('slot をシールの枠（例 slime:normal）で指定してください');
        return { slot: body.slot };
      },
      call: (value) => onHeroTrade(value),
      status: 200,
    };
  }
  if (typeof onHeroTitle === 'function') {
    postRoutes['/api/hero/title'] = {
      parse(body) {
        if (body.id !== null && (typeof body.id !== 'string' || !/^[a-z0-9-]{1,40}$/u.test(body.id))) throw badRequest('id を称号の id（または null）で指定してください');
        return { id: body.id };
      },
      call: (value) => onHeroTitle(value),
      status: 200,
    };
  }
  if (typeof onHeroTheme === 'function') {
    postRoutes['/api/hero/theme'] = {
      parse(body) {
        if (typeof body.id !== 'string' || !/^[a-z]{1,20}$/u.test(body.id)) throw badRequest('id をノートの模様の id で指定してください');
        return { id: body.id };
      },
      call: (value) => onHeroTheme(value),
      status: 200,
    };
  }
  if (typeof onHeroPeel === 'function') {
    postRoutes['/api/hero/peel'] = {
      parse(body) {
        if (!Number.isInteger(body.index) || body.index < 0) throw badRequest('index を 0 以上の整数で指定してください');
        return { index: body.index };
      },
      call: (value) => onHeroPeel(value),
      status: 200,
    };
  }
  const postLimit = (pathname) => (Object.hasOwn(postRoutes, pathname) ? postRoutes[pathname].maxBytes : undefined) ?? MAX_POST_BYTES;

  const getRoutes = {};
  if (typeof getHand === 'function') getRoutes['/api/hand'] = getHand;
  if (typeof getFile === 'function') getRoutes['/api/file'] = getFile;
  if (typeof getQuest === 'function') getRoutes['/api/quest'] = getQuest;
  if (typeof getParty === 'function') getRoutes['/api/party'] = getParty;
  if (typeof getGit === 'function') getRoutes['/api/git'] = getGit;
  if (typeof getHero === 'function') getRoutes['/api/hero'] = getHero;
  if (typeof getWords === 'function') getRoutes['/api/words'] = getWords;

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
      const limit = postLimit(pathname);
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > limit) {
          rejectLargeBody(request, response, limit);
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
      let value;
      try {
        value = await getRoutes[pathname](new URL(request.url, 'http://localhost').searchParams);
      } catch (error) {
        if (typeof error?.code !== 'string') throw error;
        sendError(response, error.status ?? 409, error);
        return;
      }
      sendJson(response, 200, value);
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
    if (request.method === 'POST') {
      const limit = postLimit(String(request.url).split('?', 1)[0]);
      if (Number(request.headers['content-length']) > limit) {
        rejectLargeBody(request, response, limit);
        return;
      }
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

const QUEST_SETTLE_MS = 10_000; // 冒険の書が生まれてから、語り部の支度が済むのを待つ上限

/** promise が片づくか ms たつか、早いほうで解決する（拒否はしない） */
function settled(promise, ms) {
  return new Promise((resolveSettled) => {
    const timer = setTimeout(resolveSettled, ms);
    timer.unref();
    promise.then(() => {
      clearTimeout(timer);
      resolveSettled();
    }, () => {
      clearTimeout(timer);
      resolveSettled();
    });
  });
}

/**
 * engine の公開 API を使って、指定した冒険の盤面を公開する。
 * 冒険の書がまだ無い場所でも開く（ロビー）。願いを受けて語り部（masume quest）を、出撃の合図を受けて軍師（masume party）を、
 * 別プロセスで起こす。stop() で HTTP と子プロセスをまとめて片付ける。
 */
export async function startServer({ root, port = 5005, host = '127.0.0.1', webRoot, home }) {
  // createServer 単体は engine の存在や実装状況に依存させない。
  const engine = await import('../engine/index.js');
  const hero = await import('../engine/hero.js');
  // 勇者の手帳を置く場所（§79.1）。起動役から開いたときは起動役と同じ場所
  const heroHome = home ?? (await import('../engine/home.js')).appHome(process.env);
  const gameRoot = resolve(root);
  const bin = fileURLToPath(new URL('../../bin/masume.js', import.meta.url));
  const questLog = join(gameRoot, 'quest.log');
  const partyLog = join(gameRoot, '.masume', 'party.log');
  const quest = new ChildJob();
  const party = new ChildJob();
  const battles = new Map();
  let shuttingDown = false;
  let pushing = false;

  const requireOpen = () => {
    if (shuttingDown) throw apiError('E_BUSY', '窓口を閉じています');
  };
  const hasGame = () => existsSync(engine.logFile(gameRoot));
  // ことば（§76.3）: 起動時に、この冒険の設定（環境変数 GRIDHUB_WORDS が優先）で決める。盤面から変えられたら、その場で切り替える
  engine.resolveWords({ root: gameRoot, env: process.env });
  const requireGame = () => {
    if (!hasGame()) throw apiError('E_NO_GAME', t('err.server.nogame'));
  };

  function startBattle(gate) {
    requireOpen();
    if (battles.has(gate)) throw apiError('E_BUSY', t('err.server.boss'));
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

  // 勇者の手帳のエラーを HTTP の状態に（§79.11）
  const HERO_STATUS = { E_USAGE: 400, E_NO_GAME: 404, E_HERO: 409 };
  const heroCall = (fn) => {
    try {
      return fn();
    } catch (error) {
      throw typeof error?.code === 'string' ? apiError(error.code, error.message, HERO_STATUS[error.code] ?? 409) : error;
    }
  };

  // ---- 手で演じる窓口（§69）----
  const handBusy = new Set();
  // 書記のエラーのコードを、HTTP の状態に
  const HAND_STATUS = { E_USAGE: 400, E_NO_GAME: 404, E_UNKNOWN: 404, E_SEALED: 403, E_TERRITORY: 403 };
  const handError = (error) => (typeof error?.code === 'string'
    ? apiError(error.code, error.message, HAND_STATUS[error.code] ?? 409) : error);
  const handCall = (fn) => {
    try {
      return fn();
    } catch (error) {
      throw handError(error);
    }
  };
  const characterParam = (params) => {
    const character = params.get('character');
    if (!character || !CHARACTER_PATTERN.test(character)) throw apiError('E_USAGE', 'character をキャラクターIDで指定してください', 400);
    return character;
  };
  /** ルートの SOLUTIONS.json（チュートリアルの解答）の、いまのマスの分のうち書いてよいもの */
  const solutionsFor = (character, node) => {
    if (node == null) return [];
    let all;
    try {
      all = JSON.parse(readFileSync(join(gameRoot, 'SOLUTIONS.json'), 'utf8'));
    } catch {
      return [];
    }
    const list = isObject(all) && Array.isArray(all[node]) ? all[node] : [];
    return list.filter((item) => isObject(item) && typeof item.path === 'string' && typeof item.content === 'string'
      && engine.handPathProblem(gameRoot, character, item.path) === null)
      .map(({ path, content }) => ({ path, content }));
  };
  /** gridhub <args…> --json を子で走らせる。{ code, result }。JSON が出なければ [E_…] を投げる */
  const runJson = (args) => new Promise((done, fail) => {
    execFile(process.execPath, [bin, ...args], {
      cwd: gameRoot, encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
      // 子（gridhub step / check など）にも、いまのことばを伝える（§76）。NODE_TEST_CONTEXT は受け継がない
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT')), GRIDHUB_WORDS: engine.wordsMode() },
    }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0;
      let result = null;
      try {
        result = JSON.parse(stdout);
      } catch {
        result = null;
      }
      if (result && (code === 0 || code === 1)) {
        done({ code, result });
        return;
      }
      const failure = String(stderr || stdout).trim().match(/^\[(E_[A-Z_]+)\]\s*([\s\S]*)$/u);
      if (failure) fail(apiError(failure[1], failure[2], failure[1] === 'E_NO_GAME' || failure[1] === 'E_UNKNOWN' ? 404 : 409));
      else fail(apiError('E_SPAWN', `gridhub ${args[0]} が失敗しました（終了コード ${code}）`, 500));
    });
  });
  const handJob = async (character, task) => {
    requireOpen();
    requireGame();
    if (handBusy.has(character)) throw apiError('E_BUSY', t('err.server.hand.busy', character));
    handBusy.add(character);
    try {
      return await task();
    } finally {
      handBusy.delete(character);
    }
  };

  const job = (running, code, file) => async () => ({
    ok: true,
    running: running(),
    code: code(),
    log: await tailLines(file),
  });
  const partyStatus = job(() => party.running, () => party.code, partyLog);

  const server = createServer({
    webRoot: webRoot ?? fileURLToPath(new URL('../../web/', import.meta.url)),
    getView: async () => {
      requireGame();
      // 冒険の書は語り部の終わりぎわに生まれる。支度（AGENTS.md・party.json・最初のコミット）が済むまで盤面を出さない。
      // 先に出すと、生まれた冒険の出撃の窓が party.json を読めない（ふりだしの Git のセーブの分だけ間が空く）
      if (quest.running) await settled(quest.exited, QUEST_SETTLE_MS);
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
      if (battles.has(gate)) throw apiError('E_BUSY', t('err.server.boss'));
      const view = await engine.buildView(gameRoot);
      if (!view.integrity.ok) throw apiError('E_CURSED', t('err.server.cursed'));
      if (view.nodes[gate]?.type !== 'gate') throw apiError('E_UNKNOWN', t('err.server.nogate'));
      if (view.nodes[gate].state !== 'ready') {
        throw apiError('E_PARTY_INCOMPLETE', t('err.server.incomplete'));
      }
      await startBattle(gate);
      return { ok: true, ready: gate };
    },

    // ---- 手で演じる窓口（§69）----
    getHand: (params) => {
      const character = characterParam(params);
      requireGame();
      return handCall(() => {
        const brief = engine.brief(gameRoot, character);
        const { territory, files } = engine.handFiles(gameRoot, character);
        // 承認のマスで、指令書と判定に書かれた仲間のファイル（読むだけ。§74.2）
        const review = engine.handReviewFiles(gameRoot, character).files;
        return { ok: true, brief, territory, files, solutions: solutionsFor(character, brief.current?.id), review };
      });
    },
    getFile: (params) => {
      const character = characterParam(params);
      const path = params.get('path') ?? '';
      requireGame();
      return { ok: true, ...handCall(() => engine.readHandFile(gameRoot, character, path)) };
    },
    onFile: ({ character, path, content }) => {
      requireOpen();
      requireGame();
      return { ok: true, ...handCall(() => engine.writeHandFile(gameRoot, character, path, content)) };
    },
    onNote: ({ character, text }) => {
      requireOpen();
      requireGame();
      const event = handCall(() => engine.writeNote(gameRoot, character, text, { actor: character }));
      return { ok: true, seq: event.seq };
    },
    onStep: ({ character }) => handJob(character, async () => {
      const { code, result } = await runJson(['step', '--dir', gameRoot, '--as', character, '--json', '--', character]);
      const event = result.events?.[0];
      const node = event?.data?.node ?? null;
      return { ok: true, exit: code, node, cases: event?.data?.cases?.[node] ?? [], seq: event?.seq ?? null };
    }),
    onCheck: ({ character }) => handJob(character, async () => {
      const { code, result } = await runJson(['check', '--dir', gameRoot, '--as', character, '--no-boss', '--json', '--', character]);
      const passed = code === 0 && (result.events ?? []).some((event) => event.type === 'check_passed');
      // 宣言のあと、このキャラクターが待つゲートに仲間がそろったか（ビューで確かめる）
      let ready = null;
      if (passed) {
        const view = engine.buildView(gameRoot);
        const me = view.characters.find((c) => c.id === character);
        if (me?.status === 'waiting' && view.nodes[me.at]?.state === 'ready') ready = me.at;
      }
      // 仲間がそろったら、ハンコと同じくボス戦を別に始める（もう始まっていれば、それを待つ）
      if (ready !== null && !battles.has(ready)) await startBattle(ready);
      return { ok: true, passed, exit: code, ready };
    }),

    // ---- 入口（語り部）----
    onQuest: async ({ wish, gm, model, allow_listen }) => {
      // 確認から起動までに await を挟まない（同時に2つ起こさないため）
      requireOpen();
      if (hasGame() || existsSync(join(gameRoot, '.masume'))) {
        throw apiError('E_EXISTS', t('err.server.exists'));
      }
      if (quest.running) throw apiError('E_BUSY', t('err.server.questing'));
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
        throw apiError('E_SPAWN', t('err.server.quest.spawn', error.message), 500);
      }
      return { ok: true };
    },
    getQuest: job(() => quest.running, () => quest.code, questLog),

    // ---- 出撃（軍師）----
    onSortie: async ({ agent, model, parallel, only, allow_listen, tactic }) => {
      requireOpen();
      requireGame();
      if (party.running) throw apiError('E_BUSY', t('err.server.party.busy'));
      if (only !== undefined) {
        const view = await engine.buildView(gameRoot);
        const unknown = only.filter((id) => !view.characters.some((c) => c.id === id));
        if (unknown.length > 0) throw apiError('E_UNKNOWN', t('err.server.party.unknown', unknown.join('、')), 400);
        // view を待つあいだに、別の出撃が始まっていないか確かめ直す
        if (party.running) throw apiError('E_BUSY', t('err.server.party.busy'));
      }
      requireOpen();
      const args = [
        bin, 'party', '--dir', gameRoot, '--agent', agent,
        ...(model ? ['--model', model] : []),
        ...(parallel === undefined ? [] : ['--parallel', String(parallel)]),
        ...(only === undefined ? [] : ['--only', only.join(',')]),
        ...(allow_listen === undefined ? [] : [allow_listen ? '--allow-listen' : '--no-allow-listen']),
        ...(tactic === undefined ? [] : ['--tactic', tactic]),
      ];
      const heading = `\n===== 出撃 ${new Date().toISOString()} =====\n$ masume ${args.slice(1).join(' ')}\n`;
      try {
        await party.start(args, { cwd: gameRoot, logFile: partyLog, heading });
      } catch (error) {
        throw apiError('E_SPAWN', t('err.server.party.spawn', error.message), 500);
      }
      return { ok: true };
    },
    getParty: async () => {
      const [status, defaults] = await Promise.all([partyStatus(), readPartyDefaults(gameRoot)]);
      return { ...status, ...defaults };
    },
    onPartyStop: () => ({ ok: true, stopped: party.interrupt() }),

    // ---- 勇者の手帳（§79）----
    // 読むだけ（手帳のファイルには書かない）。書くのは、遊ぶ人がシール袋を開けたとき・知らせを閉じたときだけ
    getHero: () => hero.heroJournal(heroHome, { current: hasGame() ? gameRoot : null }),
    onHeroOpen: ({ count }) => {
      requireOpen();
      const { opened, journal } = hero.openBags(heroHome, { current: hasGame() ? gameRoot : null, count });
      return { ok: true, opened, journal };
    },
    onHeroSeen: ({ seq }) => {
      requireOpen();
      return { ok: true, journal: hero.markSeen(heroHome, { current: hasGame() ? gameRoot : null, seq }) };
    },
    onHeroPaste: (value) => {
      requireOpen();
      requireGame();
      return { ok: true, journal: heroCall(() => hero.pasteSticker(heroHome, { current: gameRoot, ...value })) };
    },
    onHeroTrade: ({ slot }) => {
      requireOpen();
      const { got, journal } = heroCall(() => hero.tradeSticker(heroHome, { current: hasGame() ? gameRoot : null, slot }));
      return { ok: true, got, journal };
    },
    onHeroTheme: ({ id }) => {
      requireOpen();
      return { ok: true, journal: heroCall(() => hero.setTheme(heroHome, { current: hasGame() ? gameRoot : null, id })) };
    },
    onHeroTitle: ({ id }) => {
      requireOpen();
      return { ok: true, journal: heroCall(() => hero.setTitle(heroHome, { current: hasGame() ? gameRoot : null, id })) };
    },
    onHeroPeel: ({ index }) => {
      requireOpen();
      requireGame();
      return { ok: true, journal: heroCall(() => hero.peelSticker(heroHome, { current: gameRoot, index })) };
    },

    // ---- GitHub につなぐ導線（§56.3）----
    // Git の様子と手引き（gridhub remote --json と同じ）。ビュー（冒険の書）には入れない
    getGit: () => engine.remoteInfoAsync(gameRoot),
    getWords: () => {
      const set = engine.wordsSetting(gameRoot);
      return { ok: true, words: engine.wordsMode(), set: set !== null, source: engine.WORDS.includes(process.env.GRIDHUB_WORDS) ? 'env' : set ? 'file' : 'default' };
    },
    onWords: ({ words }) => {
      requireOpen();
      if (!hasGame()) throw apiError('E_NO_GAME', t('err.server.nogame.short'), 404);
      engine.setWordsSetting(gameRoot, words);
      engine.resolveWords({ root: gameRoot, env: process.env });
      return { ok: true, words: engine.wordsMode() };
    },
    // 町でセーブしたら GitHub に送る設定を書く（§59.5）。冒険ごとなので、冒険の書が要る
    onAutoPush: ({ auto_push: on }) => {
      if (!hasGame()) throw apiError('E_NO_GAME', t('err.server.nogame.short'), 404);
      return { ok: true, ...engine.setAutoPush(gameRoot, on) };
    },
    // gridhub push --json を別プロセスで走らせる（送っているあいだも盤面のサーバーを止めない）。同時に2つは走らせない
    onPush: async () => {
      requireOpen();
      if (pushing) throw apiError('E_BUSY', t('err.server.pushing'));
      pushing = true;
      try {
        const { code, stdout, stderr } = await new Promise((done) => {
          execFile(process.execPath, [bin, 'push', '--json', '--dir', gameRoot], {
            cwd: gameRoot, encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
          }, (error, out, err) => done({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, stdout: out, stderr: err }));
        });
        let result = null;
        try {
          result = JSON.parse(stdout);
        } catch {
          result = null;
        }
        if (code === 0 && result) return result;
        if (code === 1 && result) throw apiError('E_PUSH', t('err.server.push', result.output.split('\n').slice(-20).join('\n')), 409);
        // Git の外・リモートなし・HEAD の切り離し（終了コード 2）は 400
        const failure = String(stderr || stdout).trim().match(/^\[(E_[A-Z_]+)\]\s*([\s\S]*)$/u);
        if (failure) throw apiError(failure[1], failure[2], 400);
        throw apiError('E_PUSH', `gridhub push が失敗しました（終了コード ${code}）: ${String(stderr || stdout).trim().split('\n').at(-1) ?? ''}`, 500);
      } finally {
        pushing = false;
      }
    },
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
