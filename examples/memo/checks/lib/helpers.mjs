// 判定の共通部品（GM の縄張り・封印される）。外部パッケージなし。
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export { assert };

export const ROOT = process.env.MASUME_ROOT
  ? resolve(process.env.MASUME_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function tmp(prefix = 'memo-check-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function withTmp(fn) {
  const t = tmp();
  try {
    return await fn(t.dir);
  } finally {
    t.cleanup();
  }
}

// 実装ファイルを読み込む。無ければ「未実装」と1行で言う。
export async function need(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`未実装: ${rel} がまだありません`);
  try {
    return await import(pathToFileURL(p).href);
  } catch (e) {
    throw new Error(`${rel} を読み込めません: ${e.message}`);
  }
}

export async function rejectsCode(promise, code) {
  let caught = null;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  if (!caught) assert.fail(`${code} で reject されるはずが成功した`);
  assert.equal(caught.code, code, `error.code が ${code} のはずが ${caught.code} (${caught.message})`);
}

// steps: [名前, 関数, 責任キャラID（文字列か配列。省略可）]
export async function runChecks(steps, cleanup) {
  const blamed = new Set();
  let failed = 0;
  for (const [name, fn, who] of steps) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}: ${String(e && e.message).split('\n')[0]}`);
      for (const w of [].concat(who || [])) blamed.add(w);
    }
  }
  try {
    if (cleanup) await cleanup();
  } catch {}
  for (const w of blamed) console.log(`MASUME_BLAME: ${w}`);
  if (failed) {
    console.log(`${failed} 件が通っていません`);
    process.exit(1);
  }
  console.log('すべて通りました');
  process.exit(0);
}

// ---------- HTTP ----------
export async function get(base, path, init) {
  const r = await fetch(base + path, init);
  const text = await r.text();
  return {
    status: r.status,
    headers: r.headers,
    ct: r.headers.get('content-type') || '',
    text,
    get json() {
      return JSON.parse(text);
    },
  };
}

export function send(base, method, path, body) {
  const hasBody = body !== undefined;
  return get(base, path, {
    method,
    headers: hasBody ? { 'content-type': 'application/json' } : {},
    body: hasBody ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

// ---------- サーバー起動 ----------
// opts: { dataDir, webDir, storeModule }
export async function startServer(opts = {}) {
  const entry = join(ROOT, 'src/server/main.mjs');
  if (!existsSync(entry)) throw new Error('未実装: src/server/main.mjs がまだありません');
  const env = { ...process.env, PORT: '0' };
  delete env.NODE_TEST_CONTEXT;
  if (opts.dataDir) env.MEMO_DATA_DIR = opts.dataDir;
  if (opts.webDir) env.MEMO_WEB_DIR = opts.webDir;
  else delete env.MEMO_WEB_DIR;
  if (opts.storeModule) env.MEMO_STORE_MODULE = opts.storeModule;
  else delete env.MEMO_STORE_MODULE;
  const child = spawn(process.execPath, [entry], { env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  let exited = false;
  let exitCode;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  const stop = () =>
    new Promise((res) => {
      if (exited) return res(exitCode);
      const kill = setTimeout(() => child.kill('SIGKILL'), 4000);
      child.once('exit', (code) => {
        clearTimeout(kill);
        res(code);
      });
      child.kill('SIGTERM');
    });
  const base = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('サーバーが 8 秒たっても "LISTENING http://127.0.0.1:<port>" を出力しません')), 8000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/LISTENING (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`サーバーが起動前に終了しました (code ${code}): ${err.trim().split('\n').pop()}`));
    });
  }).catch(async (e) => {
    await stop();
    throw e;
  });
  return { base, stop };
}

// index.html から辿れる自分のファイル（/ で始まる src/href と ./ の import）を全部取りに行く。
export async function fetchAssetGraph(base) {
  const seen = new Map();
  const queue = ['/'];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    const r = await get(base, p);
    seen.set(p, r);
    if (r.status !== 200) continue;
    if (p === '/' || p.endsWith('.html')) {
      for (const m of r.text.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) queue.push(m[1]);
    } else if (/\.m?js$/.test(p)) {
      for (const m of r.text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
        queue.push(new URL(m[1], base + p).pathname);
      }
    }
  }
  return seen;
}
