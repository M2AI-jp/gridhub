// メモアプリのサーバー（CONTRACTS.md §3）。Node 標準ライブラリだけ。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, extname, join, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const DATA_DIR = process.env.MEMO_DATA_DIR || join(ROOT, 'data');
const WEB_DIR = resolve(process.env.MEMO_WEB_DIR || join(ROOT, 'web'));
const STORE_MODULE = process.env.MEMO_STORE_MODULE || join(ROOT, 'src/store/memo-store.mjs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const { createStore } = await import(pathToFileURL(STORE_MODULE).href);
const store = await createStore(DATA_DIR);

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res, status, error, message) {
  sendJson(res, status, { error, message });
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'E_METHOD', 'このパスでは GET と HEAD だけ使えます');
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendError(res, 400, 'E_BAD_PATH', 'パスが正しくありません');
  }
  if (rel.includes('\0') || rel.includes('\\')) {
    return sendError(res, 400, 'E_BAD_PATH', 'パスが正しくありません');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = resolve(WEB_DIR, '.' + rel);
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + sep)) {
    return sendError(res, 400, 'E_BAD_PATH', 'パスが正しくありません');
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    sendError(res, 404, 'E_NOT_FOUND', 'ファイルが見つかりません');
  }
}

const STORE_STATUS = { E_EMPTY: 400, E_TOO_LONG: 400, E_INVALID: 400, E_NOT_FOUND: 404 };

async function readJsonObject(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return { err: ['E_BAD_JSON', '本文が正しい JSON ではありません'] };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { err: ['E_INVALID', '本文は JSON のオブジェクトにしてください'] };
  }
  const input = {};
  if (Object.hasOwn(value, 'title')) input.title = value.title;
  if (Object.hasOwn(value, 'body')) input.body = value.body;
  return { input };
}

async function handleMemos(req, res, url, id) {
  const method = req.method;
  const allowed = id === undefined ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(method)) {
    return sendError(res, 405, 'E_METHOD', `${method} はこのパスでは使えません`);
  }
  try {
    if (id === undefined) {
      if (method === 'GET') {
        const memos = await store.list({ q: url.searchParams.get('q') ?? '' });
        return sendJson(res, 200, { memos });
      }
      const { input, err } = await readJsonObject(req);
      if (err) return sendError(res, 400, err[0], err[1]);
      return sendJson(res, 201, await store.create(input));
    }
    if (method === 'GET') {
      const memo = await store.get(id);
      if (!memo) return sendError(res, 404, 'E_NOT_FOUND', 'メモが見つかりません');
      return sendJson(res, 200, memo);
    }
    if (method === 'PUT') {
      const { input, err } = await readJsonObject(req);
      if (err) return sendError(res, 400, err[0], err[1]);
      return sendJson(res, 200, await store.update(id, input));
    }
    await store.remove(id);
    res.writeHead(204);
    res.end();
  } catch (e) {
    const status = e && STORE_STATUS[e.code];
    if (status) return sendError(res, status, e.code, e.message || e.code);
    throw e;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const { pathname } = url;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (pathname === '/api/health') {
      if (req.method !== 'GET') return sendError(res, 405, 'E_METHOD', 'GET だけ使えます');
      return sendJson(res, 200, { ok: true });
    }
    const m = /^\/api\/memos(?:\/([^/]+))?$/.exec(pathname);
    if (m) {
      let id;
      if (m[1] !== undefined) {
        try {
          id = decodeURIComponent(m[1]);
        } catch {
          return sendError(res, 400, 'E_BAD_PATH', 'パスが正しくありません');
        }
      }
      return handleMemos(req, res, url, id);
    }
    return sendError(res, 404, 'E_NO_ROUTE', `${pathname} はありません`);
  }
  return serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) sendError(res, 500, 'E_INTERNAL', 'サーバーの内部エラーです');
    else res.destroy();
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LISTENING http://127.0.0.1:${server.address().port}`);
});
