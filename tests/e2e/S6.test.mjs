// S6「窓口の守り」— CONTRACTS §25（第4章・総点検の修理）。
// 応答の守りの頭文字・本文の上限・ボス戦の二重起動と後始末・SIGHUP・MCP の願いの数え方・表示 URL。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  tmp, masume, newToy, setupToy, toyMap, flag, view, readLog, getJson, sseClient, waitUntil,
  startServeEnv, spawnMasume, mcpClient, fakeGm, playToyToFinale,
} from '../helpers3.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 時間切れつきで待つ（タイマーを残さない）
function within(promise, ms, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((res) => { timer = setTimeout(() => res(onTimeout()), ms); })]).finally(() => clearTimeout(timer));
}
const post = (url, body, headers = { 'x-masume': '1' }) =>
  getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

// ---- 小道具（このファイルの中だけ） ----

// 判定・エージェント・GM のかわりになる「待つ人」。release ファイルができるまで待ち、できたら end を残して終わる。
// 殺されたら end は残らない（= 生き残りはマーカーで分かる）。
const WAITER = `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
try { readFileSync(0); } catch {}
const name = (process.argv[2] || 'proc').replace('%C', process.env.MASUME_CHARACTER || '');
mkdirSync('marks', { recursive: true });
const mark = (t) => appendFileSync('marks/' + name + '.log', t + '\\n');
mark('start pid=' + process.pid + ' ctx=' + (process.env.NODE_TEST_CONTEXT || '-'));
const deadline = Date.now() + 40000;
while (!existsSync('release') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
mark('end');
process.exit(Number(process.argv[3] || 0));
`;
const FAKES = tmp('masume-s6-fakes-');
const WAITER_FILE = join(FAKES, 'waiter.mjs');
writeFileSync(WAITER_FILE, WAITER);
const waiterCmd = (name, code = 0) => `cmd:node ${JSON.stringify(WAITER_FILE)} ${name} ${code}`;

const marks = (dir, name) => {
  try {
    return readFileSync(join(dir, 'marks', `${name}.log`), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const starts = (dir, name) => marks(dir, name).filter((l) => l.startsWith('start')).length;
const ends = (dir, name) => marks(dir, name).filter((l) => l === 'end').length;
const release = (dir) => writeFileSync(join(dir, 'release'), 'go');
// serve が自分で終わっていたら（シグナルで死んだら exitCode は null のまま）、stop() は待ち続けてしまう
const stopServe = (srv) => (srv.proc.exitCode === null && srv.proc.signalCode === null ? srv.stop() : Promise.resolve());

/** gate の判定が「release を待つ」おもちゃの冒険（新しく始めたところ） */
function slowGateToy(gate) {
  const dir = tmp('masume-s6-');
  const map = toyMap();
  map.nodes[gate].check = { kind: 'cmd', run: `node checks/waiter.mjs ${gate}`, seal: ['checks/waiter.mjs'] };
  setupToy(dir, { withB3: true, map });
  writeFileSync(join(dir, 'checks', 'waiter.mjs'), WAITER);
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return dir;
}

/** G1 の仲間（a と b）をそろえる（ボス戦はしない） */
function gateReady(dir) {
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2']) flag(dir, id);
  for (const who of ['a', 'a', 'a', 'b', 'b']) {
    const r = masume(['check', who, '--dir', dir, '--as', who, '--no-boss']);
    assert.equal(r.code, 0, r.all);
  }
  assert.equal(view(dir).nodes.G1.state, 'ready');
}

/** 生の HTTP で POST する（Content-Length を偽ったり、本文を流し続けたりできる） */
function rawPost(baseUrl, { path = '/api/stamp', headers = {}, chunks = [], gapMs = 0, end = true, timeout = 8000 }) {
  return new Promise((resolve) => {
    const u = new URL(baseUrl);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
      req.destroy();
    };
    const timer = setTimeout(() => finish({ status: null, timedOut: true }), timeout);
    const req = http.request({
      host: u.hostname, port: u.port, method: 'POST', path,
      headers: { 'X-Masume': '1', 'Content-Type': 'application/json', ...headers },
    });
    req.on('response', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => finish({ status: res.statusCode, body }));
      res.on('error', () => finish({ status: res.statusCode, body }));
    });
    req.on('error', (error) => finish({ status: null, error }));
    (async () => {
      for (const chunk of chunks) {
        if (settled) return;
        if (!req.write(chunk)) await new Promise((r) => req.once('drain', r).once('error', r).once('close', r));
        if (gapMs > 0) await sleep(gapMs); // 返事（413）を読む暇を作る
      }
      if (end && !settled) req.end();
    })().catch(() => {});
  });
}

// ---- §25.1 ----

test('§25.1 すべての応答に X-Frame-Options・CSP frame-ancestors・nosniff', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir);
  try {
    const cases = [
      ['GET', '/'],
      ['GET', '/index.html'],
      ['GET', '/api/health'],
      ['GET', '/api/state'],
      ['GET', '/api/party'],
      ['GET', '/api/quest'],
      ['GET', '/api/output/0'],
      ['GET', '/api/output/abc'], // 400
      ['GET', '/no-such-file.txt'], // 404
      ['PUT', '/api/state'], // 405
      ['POST', '/api/stamp', null, {}], // X-Masume が無い → 403
      ['POST', '/api/stamp', '{こわれたJSON', { 'x-masume': '1' }], // 400
      ['POST', '/api/stamp', { node: 'H1', as: 'nobody' }, { 'x-masume': '1' }], // 409
      ['POST', '/api/party/stop', {}, { 'x-masume': '1' }], // 200
    ];
    const bad = [];
    for (const [method, path, body, headers] of cases) {
      const init = { method };
      if (method === 'POST') {
        init.headers = { 'content-type': 'application/json', ...headers };
        init.body = typeof body === 'string' ? body : JSON.stringify(body ?? {});
      }
      const r = await fetch(`${srv.url}${path}`, init);
      await r.arrayBuffer();
      const h = (name) => r.headers.get(name);
      const problems = [];
      if (h('x-frame-options') !== 'DENY') problems.push(`X-Frame-Options=${h('x-frame-options')}`);
      if (!/frame-ancestors\s+'none'/.test(h('content-security-policy') || '')) problems.push(`CSP=${h('content-security-policy')}`);
      if (h('x-content-type-options') !== 'nosniff') problems.push(`X-Content-Type-Options=${h('x-content-type-options')}`);
      if (problems.length) bad.push(`${method} ${path} (${r.status}): ${problems.join(', ')}`);
    }
    // 配りっぱなしの SSE も
    const ctrl = new AbortController();
    const sse = await fetch(`${srv.url}/api/stream`, { signal: ctrl.signal });
    const sseBad = [];
    if (sse.headers.get('x-frame-options') !== 'DENY') sseBad.push('X-Frame-Options');
    if (!/frame-ancestors\s+'none'/.test(sse.headers.get('content-security-policy') || '')) sseBad.push('CSP');
    if (sse.headers.get('x-content-type-options') !== 'nosniff') sseBad.push('nosniff');
    ctrl.abort();
    if (sseBad.length) bad.push(`GET /api/stream: ${sseBad.join(', ')}`);
    assert.deepEqual(bad, [], `守りの頭文字が足りない応答:\n${bad.join('\n')}`);
  } finally {
    await stopServe(srv);
  }
});

// ---- §25.2 ----

test('§25.2 POST の本文は 64KB まで: 超えたら 413（全部を読み切らず、Content-Length が大きければ読む前に断る）', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir);
  try {
    const pad = (bytes) => JSON.stringify({ node: 'H1', as: 'nobody', pad: 'x'.repeat(bytes) });
    const small = pad(60000 - 40);
    assert.ok(small.length > 59000 && small.length <= 60000);
    const ok = await rawPost(srv.url, { headers: { 'Content-Length': String(Buffer.byteLength(small)) }, chunks: [small] });
    assert.equal(ok.status, 409, `上限より小さい本文は普通に処理される（${JSON.stringify(ok).slice(0, 200)}）`);

    // 上限を超えた本文（Content-Length あり）は、窓口ごとに 413
    const big = pad(70000);
    for (const path of ['/api/stamp', '/api/battle', '/api/quest', '/api/sortie']) {
      const r = await rawPost(srv.url, { path, headers: { 'Content-Length': String(Buffer.byteLength(big)) }, chunks: [big] });
      assert.equal(r.status, 413, `${path} は 70KB の本文を 413 で断る（${JSON.stringify(r).slice(0, 200)}）`);
    }

    // Content-Length だけ大きく、本文はほとんど送らない: 読む前に断る（待ち続けない）
    const lie = await rawPost(srv.url, {
      headers: { 'Content-Length': String(100 * 1024 * 1024) }, chunks: ['{"node":'], end: false, timeout: 6000,
    });
    assert.equal(lie.status, 413, `Content-Length が 100MB なら本文を待たずに 413（${JSON.stringify(lie).slice(0, 200)}）`);

    // Content-Length の無い（chunked）本文を流し続けても、上限で断る
    const chunk = 'x'.repeat(16 * 1024);
    const flood = await rawPost(srv.url, {
      headers: { 'Transfer-Encoding': 'chunked' }, chunks: ['{"node":"H1","pad":"', ...Array.from({ length: 64 }, () => chunk)], gapMs: 5, end: true, timeout: 10000,
    });
    assert.equal(flood.status, 413, `chunked で 1MB 流しても 413（${JSON.stringify(flood).slice(0, 200)}）`);

    assert.equal((await getJson(`${srv.url}/api/health`)).status, 200, '断ったあとも窓口は元気');
  } finally {
    await stopServe(srv);
  }
});

// ---- §25.3 ----

test('§25.3 /api/battle の同時実行: 動いている間は 409 E_BUSY。ボス戦は1本だけ', { timeout: 120000 }, async () => {
  const dir = slowGateToy('G1');
  gateReady(dir);
  const srv = await startServeEnv(dir, { NODE_TEST_CONTEXT: 'child-v8' });
  try {
    const rs = await Promise.all([1, 2, 3].map(() => post(`${srv.url}/api/battle`, { gate: 'G1' })));
    const summary = rs.map((r) => `${r.status} ${r.text.slice(0, 80)}`).join(' | ');
    const accepted = rs.filter((r) => r.status >= 200 && r.status < 300);
    const busy = rs.filter((r) => r.status === 409);
    assert.equal(accepted.length, 1, `3並列で通るのは1本だけ: ${summary}`);
    assert.equal(busy.length, 2, `残りの2本は 409: ${summary}`);
    for (const r of busy) assert.equal(r.body.code, 'E_BUSY', r.text);
    assert.equal(accepted[0].body.ok, true);

    await waitUntil(() => starts(dir, 'G1') >= 1, { timeout: 20000, message: '判定が始まる' });
    await sleep(1500);
    assert.equal(starts(dir, 'G1'), 1, `判定は1回しか起動しない（${marks(dir, 'G1').join(' / ')}）`);
    // 動いている間は、あとからの依頼も断る
    const again = await post(`${srv.url}/api/battle`, { gate: 'G1' });
    assert.equal(again.status, 409, again.text);
    assert.equal(again.body.code, 'E_BUSY');
    await sleep(500);
    assert.equal(starts(dir, 'G1'), 1);

    // 判定のコマンドに NODE_TEST_CONTEXT は届かない（入れ子の node --test が何も走らせずに通るのを防ぐ）
    assert.match(marks(dir, 'G1')[0], /ctx=-$/, `判定の環境に NODE_TEST_CONTEXT が混ざっている: ${marks(dir, 'G1')[0]}`);

    release(dir);
    await waitUntil(() => readLog(dir).some((e) => e.type === 'gate_cleared' && e.data.gate === 'G1'), { timeout: 30000, message: 'G1 突破' });
    assert.equal(readLog(dir).filter((e) => e.type === 'gate_cleared').length, 1);
    assert.equal(ends(dir, 'G1'), 1);
  } finally {
    release(dir);
    await stopServe(srv);
  }
});

test('§25.3 ハンコからのボス戦も同じ扱い: 動いている間は /api/battle が 409 E_BUSY', { timeout: 120000 }, async () => {
  const dir = slowGateToy('FIN');
  playToyToFinale(dir); // a と b は FIN で待機、h が H1 に残る
  const srv = await startServeEnv(dir);
  try {
    assert.equal(view(dir).nodes.FIN.state, 'waiting');
    const st = await post(`${srv.url}/api/stamp`, { node: 'H1', as: 'h' });
    assert.equal(st.status, 200, st.text);
    assert.deepEqual(st.body, { ok: true, ready: 'FIN' });
    await waitUntil(() => starts(dir, 'FIN') >= 1, { timeout: 20000, message: 'ハンコからのボス戦が始まる' });
    const dup = await post(`${srv.url}/api/battle`, { gate: 'FIN' });
    assert.equal(dup.status, 409, `ハンコのボス戦が動いているのに /api/battle が通った: ${dup.text}`);
    assert.equal(dup.body.code, 'E_BUSY');
    await sleep(1200);
    assert.equal(starts(dir, 'FIN'), 1, '判定は1回だけ');
  } finally {
    release(dir);
    await stopServe(srv);
  }
});

test('§25.3 stop() で、動いているボス戦（とその判定）も止まる', { timeout: 120000 }, async () => {
  const dir = slowGateToy('G1');
  gateReady(dir);
  const srv = await startServeEnv(dir);
  try {
    const r = await post(`${srv.url}/api/battle`, { gate: 'G1' });
    assert.equal(r.status, 200, r.text);
    await waitUntil(() => starts(dir, 'G1') >= 1, { timeout: 20000, message: '判定が始まる' });
    await srv.stop(); // SIGTERM → 伝令が片づけて終わる
    release(dir);
    await sleep(2000);
    assert.equal(ends(dir, 'G1'), 0, `serve が終わったあとも判定が生きていた（${marks(dir, 'G1').join(' / ')}）`);
    const types = readLog(dir).map((e) => e.type);
    assert.ok(!types.includes('gate_cleared'), '止めた判定の結果は記録されない（gate_cleared）');
    assert.ok(!types.includes('gate_failed'), '止めた判定の結果は記録されない（gate_failed）');
    assert.equal(masume(['verify', '--dir', dir]).code, 0);
  } finally {
    release(dir);
    await stopServe(srv);
  }
});

// ---- §25.4 ----

test('§25.4 serve は SIGHUP でも、出撃中の子（軍師とエージェント）を片づけて終わる', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: waiterCmd('agent-%C') });
  const exited = new Promise((res) => srv.proc.once('exit', (code, signal) => res({ code, signal })));
  try {
    const r = await post(`${srv.url}/api/sortie`, { agent: 'claude', parallel: 2 });
    assert.equal(r.status, 202, r.text);
    await waitUntil(() => starts(dir, 'agent-a') >= 1 && starts(dir, 'agent-b') >= 1, { timeout: 30000, message: 'a と b が出撃' });
    srv.proc.kill('SIGHUP');
    const res = await within(exited, 20000, () => 'timeout');
    assert.notEqual(res, 'timeout', 'SIGHUP で serve が終わる');
    // 軍師は SIGINT を受けて、出撃中の帰還を記録して終わっているはず
    await waitUntil(() => {
      const log = readLog(dir);
      const sorties = log.filter((e) => e.type === 'sortie');
      return sorties.length >= 2 && sorties.every((s) => log.some((e) => e.type === 'returned' && e.data.sortie === s.seq));
    }, { timeout: 8000, message: 'SIGHUP のあと、出撃中の帰還が記録される（子が置き去りにされている）' });
    release(dir);
    await sleep(1500);
    assert.equal(ends(dir, 'agent-a') + ends(dir, 'agent-b'), 0, 'エージェントが生き残っていた');
  } finally {
    release(dir);
    await stopServe(srv);
  }
});

test('§25.4 mcp も SIGHUP で、仕事中の子（語り部と GM）を片づけて終わる', { timeout: 120000 }, async () => {
  const root = tmp('masume-s6-mcp-');
  const c = mcpClient(['--dir', root], { cwd: root, env: { MASUME_GM_OVERRIDE: waiterCmd('gm') } });
  const exited = new Promise((res) => c.proc.once('exit', (code, signal) => res({ code, signal })));
  try {
    await c.start();
    c.call('masume_quest', { wish: 'メモアプリのようなアプリを作りたい', gm: 'claude' }, { timeout: 60000 }).catch(() => {});
    await waitUntil(() => starts(root, 'gm') >= 1, { timeout: 30000, message: 'GM が起動する' });
    c.proc.kill('SIGHUP');
    const res = await within(exited, 15000, () => 'timeout');
    assert.notEqual(res, 'timeout', 'SIGHUP で mcp が終わる');
    await sleep(1000);
    release(root);
    await sleep(1500);
    assert.equal(ends(root, 'gm'), 0, `mcp が終わったあとも GM が生きていた（${marks(root, 'gm').join(' / ')}）`);
  } finally {
    release(root);
    if (c.proc.exitCode === null) c.proc.kill('SIGKILL');
  }
});

// ---- §25.5 ----

test('§25.5 MCP の願いの長さは、HTTP と同じく trim 後のコードポイント数で 1〜2000', { timeout: 120000 }, async () => {
  const root = tmp('masume-s6-wish-');
  const c = mcpClient(['--dir', root], { cwd: root, env: { MASUME_GM_OVERRIDE: fakeGm('good') } });
  try {
    await c.start();
    const rejected = [
      ['2001 文字（絵文字まじり）', '😀'.repeat(2000) + 'x'],
      ['2001 文字（ASCII）', 'x'.repeat(2001)],
      ['空白だけ', '   \n  '],
    ];
    for (const [label, wish] of rejected) {
      const r = await c.call('masume_quest', { wish, gm: 'claude' });
      assert.equal(r.isError, true, `${label} は断る: ${r.text.slice(0, 120)}`);
    }
    assert.ok(!existsSync(join(root, '.masume')) && !existsSync(join(root, 'WISH.md')), '断ったときは何も始めない');

    // ぴったり 2000 コードポイント（UTF-16 では 4000 以上）。前後の空白は数えない
    const wish = '😀'.repeat(1999) + 'x';
    assert.equal([...wish].length, 2000);
    assert.ok(wish.length > 2000);
    const q = await c.call('masume_quest', { wish: `  ${wish}  \n`, gm: 'claude' }, { timeout: 60000 });
    assert.equal(q.isError, false, `絵文字 1999 個 + x（2000 コードポイント）は受け付ける: ${q.text.slice(0, 200)}`);
    assert.equal(view(root).quest.id, 'MEMO');
    assert.ok(readFileSync(join(root, 'WISH.md'), 'utf8').includes(wish));
  } finally {
    await c.close();
  }
});

// ---- §25.6 ----

test('§25.6 --host 0.0.0.0 / :: のとき、表示する URL は http://127.0.0.1:<port>/ で、開ける', { timeout: 120000 }, async (t) => {
  for (const host of ['0.0.0.0', '::']) {
    const dir = newToy();
    const run = spawnMasume(['serve', '--host', host, '--port', '0', '--dir', dir], { cwd: dir });
    try {
      const early = await Promise.race([
        waitUntil(() => /http:\/\/\S+/.test(run.output()), { timeout: 15000, message: 'URL が表示される' }).then(() => null),
        run.done,
      ]);
      if (early && host === '::') {
        t.diagnostic(`:: で待ち受けられない環境のようなので飛ばす: ${early.all.slice(0, 200)}`);
        continue;
      }
      assert.equal(early, null, `--host ${host} で serve が起動しない:\n${early?.all}`);
      const shown = run.output().match(/http:\/\/\S+/)[0];
      assert.match(shown, /^http:\/\/127\.0\.0\.1:\d+\/$/, `--host ${host} のとき表示する URL: ${shown}`);
      const health = await getJson(`${shown}api/health`);
      assert.equal(health.status, 200, `表示された URL が 403 になる: ${health.text}`);
      assert.deepEqual(health.body, { ok: true, masume: 1 });
      assert.equal((await getJson(shown)).status, 200, '表示された URL で盤面が開ける');
    } finally {
      run.proc.kill('SIGTERM');
      await run.done;
    }
  }
});
