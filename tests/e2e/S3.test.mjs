// S3「ハンコ窓口とボス戦の号令」— POST /api/stamp・/api/battle・GET /api/output/:seq と、あがりのボス戦。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp, listen, getJson, newToy, playToyToFinale, view, char, startServe, sseClient, waitUntil, readLog } from '../helpers.mjs';

const { createServer } = await import(pathToFileURL(join(ROOT, 'src', 'server', 'index.js')).href);

const post = (url, body, headers = { 'x-masume': '1' }) =>
  getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('窓口の作法: X-Masume・Origin・壊れたJSON・失敗の返し方・判定出力', async () => {
  const web = tmp('masume-web-');
  writeFileSync(join(web, 'index.html'), '<p>x</p>');
  const calls = [];
  const server = createServer({
    webRoot: web,
    getView: () => ({ masume: 1 }),
    onStamp: async ({ node, as }) => {
      calls.push(['stamp', node, as]);
      if (node === 'NG') throw Object.assign(new Error('ハンコを押せるマスではありません'), { code: 'E_STAMP' });
      return { ok: true, node, as, ready: null };
    },
    onBattle: async ({ gate }) => {
      calls.push(['battle', gate]);
      if (gate === 'NG') throw Object.assign(new Error('まだ仲間が揃っていません'), { code: 'E_PARTY_INCOMPLETE' });
      return { ok: true, gate };
    },
    outputFor: (seq) => (seq === 7 ? 'PASS X\n' : null),
  });
  const base = await listen(server);
  try {
    let r = await post(`${base}/api/stamp`, { node: 'H1', as: 'h' }, {});
    assert.equal(r.status, 403, 'X-Masume が無ければ断る');
    r = await post(`${base}/api/stamp`, { node: 'H1', as: 'h' }, { 'x-masume': '1', origin: 'http://evil.example' });
    assert.equal(r.status, 403, 'よその Origin は断る');
    r = await post(`${base}/api/stamp`, '{こわれた', { 'x-masume': '1' });
    assert.equal(r.status, 400);
    assert.equal(calls.length, 0, '断ったときは呼ばない');

    r = await post(`${base}/api/stamp`, { node: 'H1', as: 'h' });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body, { ok: true, node: 'H1', as: 'h', ready: null });
    r = await post(`${base}/api/stamp`, { node: 'NG', as: 'h' });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, { ok: false, code: 'E_STAMP', error: 'ハンコを押せるマスではありません' });

    r = await post(`${base}/api/battle`, { gate: 'G1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.gate, 'G1');
    r = await post(`${base}/api/battle`, { gate: 'NG' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'E_PARTY_INCOMPLETE');

    r = await getJson(`${base}/api/output/7`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/plain/);
    assert.equal(r.text, 'PASS X\n');
    assert.equal((await getJson(`${base}/api/output/8`)).status, 404);
    assert.equal((await getJson(`${base}/api/output/abc`)).status, 400);
    assert.deepEqual(calls, [['stamp', 'H1', 'h'], ['stamp', 'NG', 'h'], ['battle', 'G1'], ['battle', 'NG']]);
  } finally {
    await server.stop();
  }
});

test('あがりの演出: 最後のハンコでボス戦が別プロセスで始まり、盤面がライブで更新される', async () => {
  const dir = newToy({ withB3: true });
  playToyToFinale(dir);
  const v0 = view(dir);
  assert.equal(v0.nodes.FIN.state, 'waiting');
  assert.equal(char(v0, 'h').at, 'H1');
  const srv = await startServe(dir);
  const stream = sseClient(`${srv.url}/api/stream`);
  try {
    await stream.waitFor('hello');
    // 本物の engine につながった判定出力
    const passed = readLog(dir).find((e) => e.type === 'check_passed');
    const out = await getJson(`${srv.url}/api/output/${passed.seq}`);
    assert.equal(out.status, 200);
    assert.match(out.text, /PASS/);
    // ハンコを押せない人
    const ng = await post(`${srv.url}/api/stamp`, { node: 'H1', as: 'a' });
    assert.equal(ng.status, 409);
    assert.equal(ng.body.code, 'E_STAMP');
    // 揃っていないゲートのボス戦
    const early = await post(`${srv.url}/api/battle`, { gate: 'FIN' });
    assert.equal(early.status, 409);

    const since = stream.events.length;
    const r = await post(`${srv.url}/api/stamp`, { node: 'H1', as: 'h' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.ready, 'FIN', 'ハンコで全員そろったゲートを返す');
    await stream.waitFor('change', { since, timeout: 5000 });
    const done = await waitUntil(async () => {
      const s = await getJson(`${srv.url}/api/state`);
      return s.body.finished ? s.body : null;
    }, { timeout: 30000, message: 'あがり' });
    assert.equal(done.nodes.FIN.state, 'cleared');
    assert.ok(done.characters.every((c) => c.status === 'done'));
    const last = readLog(dir).pop();
    assert.equal(last.type, 'gate_cleared');
    assert.equal(last.data.gate, 'FIN');
  } finally {
    stream.close();
    await srv.stop();
  }
});
