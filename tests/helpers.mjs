// 判定（E2E）の共通道具。GM の縄張り・封印対象。キャラクターは編集しないこと。
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = join(ROOT, 'bin', 'masume.js');

export function tmp(prefix = 'masume-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** masume CLI を同期で実行する */
export function masume(args, { cwd = ROOT, env = {}, timeout = 120000 } = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env },
    encoding: 'utf8',
    timeout,
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

/** masume CLI を非同期で実行する（並行実行の判定用） */
export function masumeAsync(args, { cwd = ROOT, env = {} } = {}) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => res({ code, out, err, all: out + err }));
  });
}

/** --json 付きで実行して stdout をパースする */
export function masumeJson(args, opts) {
  const r = masume([...args, '--json'], opts);
  try {
    r.data = JSON.parse(r.out);
  } catch {
    r.data = undefined;
  }
  return r;
}

export function view(dir) {
  const r = masumeJson(['status', '--dir', dir]);
  if (r.code !== 0 || !r.data) throw new Error(`status --json に失敗: code=${r.code}\n${r.all}`);
  return r.data;
}

export function char(v, id) {
  return v.characters.find((c) => c.id === id);
}

export function readLog(dir) {
  return readFileSync(join(dir, '.masume', 'log.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ---- 正規化JSON・ハッシュ・じゅもん（SAVE_FORMAT.md を独立に実装） ----

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function eventHash(e) {
  return sha256(canonical({ seq: e.seq, ts: e.ts, type: e.type, actor: e.actor, data: e.data, prev: e.prev }));
}

export const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ';

export function jumonOf(hex) {
  const n = BigInt('0x' + hex.slice(0, 18));
  const chars = [];
  for (let i = 0; i < 12; i++) chars.push(KANA[Number((n >> BigInt(66 - 6 * i)) & 63n)]);
  const s = chars.join('');
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9, 12)}`;
}

// ---- おもちゃの冒険（エンジンの判定用） ----

const cmd = (id) => ({ kind: 'cmd', run: `node checks/flag.mjs ${id}`, seal: ['checks/flag.mjs'] });
const task = (id, title) => ({ type: 'task', title, detail: `${title}こと。`, check: cmd(id) });

export function toyMap() {
  return {
    masume: 1,
    quest: { id: 'TOY', title: 'おもちゃの冒険', pitch: '判定用の小さな地図', goal: 'FIN' },
    characters: [
      { id: 'a', name: '戦士アリス', kind: 'agent', agent: 'test', job: 'warrior', color: 'yellow', territory: ['a/**'], path: ['A1', 'A2', 'AC', 'A3', 'G1', 'A4', 'FIN'] },
      { id: 'b', name: '魔法使いボブ', kind: 'agent', agent: 'test', job: 'mage', color: 'blue', territory: ['b/**'], path: ['B1', 'B2', 'G1', 'B3', 'FIN'] },
      { id: 'h', name: '勇者ひとみ', kind: 'human', agent: 'human', job: 'hero', color: 'pink', path: ['H1', 'FIN'] },
    ],
    nodes: {
      A1: task('A1', '剣をとぐ'),
      A2: task('A2', '盾をみがく'),
      AC: { type: 'camp', title: '村の宿屋' },
      A3: { ...task('A3', '洞窟をしらべる'), rollback_to: '@here' },
      A4: task('A4', '宝箱をあける'),
      B1: task('B1', '呪文をおぼえる'),
      B2: task('B2', '杖をつくる'),
      B3: { type: 'task', title: '封印された書を読む', check: { kind: 'cmd', run: 'node checks/b3.mjs', seal: ['checks/b3.mjs'] } },
      G1: { type: 'gate', title: '洞窟の番人', check: cmd('G1') },
      H1: { type: 'task', title: '王様にあいさつ', check: { kind: 'stamp', by: 'h' } },
      FIN: { type: 'gate', title: 'あがり', check: cmd('FIN') },
    },
  };
}

const FLAG_SCRIPT = `import { readFileSync } from 'node:fs';
const id = process.argv[2];
let v = '';
try { v = readFileSync('flags/' + id, 'utf8').trim(); } catch {}
if (v === 'ok') { console.log('PASS ' + id); process.exit(0); }
console.log('FAIL ' + id);
if (v.startsWith('blame:')) console.log('MASUME_BLAME: ' + v.slice(6));
process.exit(1);
`;

/** おもちゃの冒険の材料を dir に置く（new はしない） */
export function setupToy(dir, { withB3 = false, map = toyMap() } = {}) {
  mkdirSync(join(dir, 'checks'), { recursive: true });
  mkdirSync(join(dir, 'flags'), { recursive: true });
  writeFileSync(join(dir, 'checks', 'flag.mjs'), FLAG_SCRIPT);
  if (withB3) writeB3(dir);
  writeFileSync(join(dir, 'toy.map.json'), JSON.stringify(map, null, 2));
  return join(dir, 'toy.map.json');
}

export function writeB3(dir) {
  writeFileSync(join(dir, 'checks', 'b3.mjs'), "console.log('PASS B3');\n");
}

/** 新しいおもちゃの冒険を始めた dir を返す */
export function newToy({ withB3 = false } = {}) {
  const dir = tmp('masume-toy-');
  setupToy(dir, { withB3 });
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  if (r.code !== 0) throw new Error(`new に失敗: ${r.all}`);
  return dir;
}

export function flag(dir, id, value = 'ok') {
  writeFileSync(join(dir, 'flags', id), value);
}

export function unflag(dir, id) {
  rmSync(join(dir, 'flags', id), { force: true });
}

/** a,b を FIN で待機させ、h だけが H1 に残った状態にする（B3 は封印済み前提: newToy({withB3:true})） */
export function playToyToFinale(dir) {
  for (const id of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'G1', 'FIN']) flag(dir, id);
  const steps = [['a'], ['a'], ['a'], ['b'], ['b'], ['a'], ['b']];
  for (const [who] of steps) {
    const r = masume(['check', who, '--dir', dir, '--as', who]);
    if (r.code !== 0) throw new Error(`check ${who} に失敗: ${r.all}`);
  }
}

// ---- HTTP / SSE ----

export function listen(server, port = 0) {
  return new Promise((res, rej) => {
    server.once('error', rej);
    server.listen(port, '127.0.0.1', () => res(`http://127.0.0.1:${server.address().port}`));
  });
}

/** SSE を読む小さなクライアント */
export function sseClient(url) {
  const ctrl = new AbortController();
  const events = [];
  const waiters = new Set();
  const client = { events, status: null, type: null };
  const notify = () => {
    for (const w of [...waiters]) w();
  };
  client.ready = (async () => {
    const res = await fetch(url, { signal: ctrl.signal });
    client.status = res.status;
    client.type = res.headers.get('content-type');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const lines = block.split('\n').filter(Boolean);
          if (lines.length === 0 || lines.every((l) => l.startsWith(':'))) continue;
          const ev = { event: 'message', data: '' };
          for (const line of lines) {
            if (line.startsWith('event:')) ev.event = line.slice(6).trim();
            else if (line.startsWith('data:')) ev.data += line.slice(5).trim();
          }
          events.push(ev);
          notify();
        }
      }
    })().catch(() => {});
  })().catch(() => {});
  client.waitFor = (name, { timeout = 5000, since = 0 } = {}) =>
    new Promise((res, rej) => {
      const check = () => {
        const ev = events.slice(since).find((e) => e.event === name);
        if (ev) {
          waiters.delete(check);
          clearTimeout(t);
          res(ev);
        }
      };
      const t = setTimeout(() => {
        waiters.delete(check);
        rej(new Error(`SSE "${name}" が ${timeout}ms 以内に来ない（届いたもの: ${events.map((e) => e.event).join(',')}）`));
      }, timeout);
      waiters.add(check);
      check();
    });
  client.close = () => ctrl.abort();
  return client;
}

/** masume serve を起動して URL を返す */
export function startServe(dir, extra = []) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [BIN, 'serve', '--port', '0', '--dir', dir, ...extra], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' },
    });
    let out = '';
    const t = setTimeout(() => rej(new Error(`serve が起動しない:\n${out}`)), 15000);
    const onData = (d) => {
      out += d;
      const m = out.match(/http:\/\/[^\s]+/);
      if (m) {
        clearTimeout(t);
        const url = m[0].replace(/\/$/, '');
        res({
          url,
          proc: p,
          output: () => out,
          stop: () =>
            new Promise((done) => {
              if (p.exitCode !== null) return done();
              p.once('exit', () => done());
              p.kill('SIGTERM');
              setTimeout(() => p.kill('SIGKILL'), 3000);
            }),
        });
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => rej(new Error(`serve が終了した (code ${code}):\n${out}`)));
  });
}

export async function getJson(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: r.status, headers: r.headers, text, body };
}

export async function waitUntil(fn, { timeout = 10000, interval = 100, message = '条件' } = {}) {
  const start = Date.now();
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() - start > timeout) throw new Error(`${message} が ${timeout}ms 以内に満たされない（最後: ${last}）`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

// ---- ヘッドレス Chrome（DevTools Protocol） ----

export const CHROME = process.env.MASUME_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * ヘッドレス Chrome を起動して { proc, profile, port } を返す。
 * 起動が固まったり、すぐ終わったりしたら、殺して片付け、1回だけ起動し直す
 * （macOS では、起動の途中の fork が固まることがある。判定の中身ではなく道具の不調なので）
 */
export async function startChrome({ width = 1440, height = 900 } = {}) {
  if (!existsSync(CHROME)) throw new Error(`Chrome が見つからない: ${CHROME}（MASUME_CHROME で指定）`);
  for (let attempt = 1; ; attempt++) {
    const profile = tmp('masume-chrome-');
    const proc = spawn(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--remote-allow-origins=*',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        `--window-size=${width},${height}`,
        // 外のホストは引けなくする（盤面が読む Google Fonts などを待たない。判定は手元だけで決まる）
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost',
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    try {
      const wsUrl = await new Promise((res, rej) => {
        let buf = '';
        const t = setTimeout(() => rej(new Error(`Chrome が起動しない:\n${buf}`)), 20000);
        proc.stderr.on('data', (d) => {
          buf += d;
          const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
          if (m) {
            clearTimeout(t);
            res(m[1]);
          }
        });
        proc.on('exit', (c) => {
          clearTimeout(t);
          rej(new Error(`Chrome が終了した (${c}):\n${buf}`));
        });
      });
      return { proc, profile, port: new URL(wsUrl).port };
    } catch (e) {
      // 固まった子が stderr を握ったままだと、判定のプロセスが終わらない。殺して、こちらの管も閉じる
      proc.kill('SIGKILL');
      proc.stderr.destroy();
      rmSync(profile, { recursive: true, force: true });
      if (attempt >= 2) throw e;
    }
  }
}

/** ヘッドレス Chrome を開き、goto / eval / waitFor / screenshot / close を返す */
export async function openBrowser({ width = 1440, height = 900 } = {}) {
  const { proc, profile, port } = await startChrome({ width, height });
  const targets = await waitUntil(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.find((t) => t.type === 'page');
  }, { message: 'Chrome のページ' });
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
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
  const page = {
    console: consoleLines,
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

/** web/ をそのまま配る小さな静的サーバー（盤面の判定用。伝令に依存しない） */
export async function serveStatic(root = join(ROOT, 'web'), routes = {}) {
  const http = await import('node:http');
  const { extname, normalize } = await import('node:path');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const route = routes[`${req.method} ${u.pathname}`];
    if (route) return route(req, res);
    let p = decodeURIComponent(u.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  const url = await listen(server);
  server.unref(); // 判定が途中で落ちて閉じ忘れても、このサーバーが判定のプロセスを生かし続けない
  return { url, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))) };
}

// ---- 絵（CONTRACTS §10） ----

const ALLOWED_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'title', 'desc']);
const DRAW_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
export const SPRITE_COLORS = new Set(['none', '#1d2b5c', '#ffffff', '#d94a3a', 'var(--pawn, #ffe45c)']);

/** SVG が絵の制約を守っているか確かめ、中身を返す */
export function inspectSvg(file, { colors = SPRITE_COLORS, requirePawn = true, name } = {}) {
  const svg = readFileSync(file, 'utf8');
  const label = file.split('/').slice(-2).join('/');
  assert.ok(statSync(file).size <= 6000, `${label} は6000バイト以下`);
  assert.match(svg.trim(), /^(<\?xml[^>]*\?>\s*)?<svg\b/, `${label} は <svg で始まる`);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `${label} xmlns`);
  assert.match(svg, /viewBox="0 0 64 64"/, `${label} viewBox`);
  for (const bad of [/<script/i, /<style/i, /\sstyle=/i, /<text/i, /<image/i, /<foreignObject/i, /href=/i, /url\(/i])
    assert.doesNotMatch(svg, bad, `${label} に ${bad} を使わない`);
  const tags = [...svg.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]);
  for (const t of tags) assert.ok(ALLOWED_TAGS.has(t), `${label} の要素 <${t}> は使えない`);
  assert.ok(tags.filter((t) => DRAW_TAGS.has(t)).length >= 4, `${label} は描画要素が4つ以上`);
  for (const m of svg.matchAll(/\s(fill|stroke)="([^"]*)"/g)) assert.ok(colors.has(m[2]), `${label} の ${m[1]}="${m[2]}" は使えない色`);
  for (const m of svg.matchAll(/stroke-width="([^"]*)"/g)) assert.ok(Number(m[1]) <= 3, `${label} の stroke-width=${m[1]} は3以下`);
  if (requirePawn) assert.match(svg, /fill="var\(--pawn, #ffe45c\)"/, `${label} は担当色で塗れる場所がある`);
  const title = svg.match(/<title>([^<]*)<\/title>/);
  assert.ok(title, `${label} に <title>`);
  if (name) assert.equal(title[1].trim(), name, `${label} の <title> は「${name}」`);
  return svg;
}

