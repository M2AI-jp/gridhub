// U3: API クライアント（web/api-client.mjs）。にせの HTTP サーバーに向けて確かめる。
import http from 'node:http';
import { runChecks, assert, need } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('web/api-client.mjs');
  assert.equal(typeof m.createClient, 'function', 'createClient が export されていません');
  return m;
};

function fakeApi() {
  const log = [];
  const memo = { id: 'm1', title: 't', body: 'b', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      log.push({ method: req.method, url: req.url, type: req.headers['content-type'] || '', body });
      const json = (s, o) => {
        res.writeHead(s, { 'content-type': 'application/json' });
        res.end(JSON.stringify(o));
      };
      if (req.url.startsWith('/api/memos/boom')) return json(400, { error: 'E_EMPTY', message: '空です' });
      if (req.url.startsWith('/api/memos/gone')) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('not found');
      }
      if (req.method === 'GET') return json(200, { memos: [memo] });
      if (req.method === 'POST') return json(201, { ...memo, ...JSON.parse(body) });
      if (req.method === 'PUT') return json(200, { ...memo, ...JSON.parse(body) });
      if (req.method === 'DELETE') {
        res.writeHead(204);
        return res.end();
      }
      json(500, {});
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, log, base: `http://127.0.0.1:${server.address().port}` })));
}

let api;
await runChecks([
  ['準備: にせ API を立てる', async () => {
    api = await fakeApi();
  }],
  ['list() は memos の配列を返し、q が空なら付けない', async () => {
    const { createClient } = await load();
    const c = createClient(api.base);
    const r = await c.list();
    assert.ok(Array.isArray(r) && r[0].id === 'm1');
    assert.equal(api.log.at(-1).method, 'GET');
    assert.equal(api.log.at(-1).url, '/api/memos');
    await c.list('');
    assert.equal(api.log.at(-1).url, '/api/memos');
  }, 'ui'],
  ['list(q) は q を URL エンコードして付ける', async () => {
    const { createClient } = await load();
    await createClient(api.base).list('牛乳 & パン');
    assert.equal(api.log.at(-1).url, `/api/memos?q=${encodeURIComponent('牛乳 & パン')}`);
  }, 'ui'],
  ['create は JSON を POST して memo を返す', async () => {
    const { createClient } = await load();
    const m = await createClient(api.base).create({ title: 'T', body: 'B' });
    const l = api.log.at(-1);
    assert.equal(l.method, 'POST');
    assert.equal(l.url, '/api/memos');
    assert.match(l.type, /application\/json/);
    assert.deepEqual(JSON.parse(l.body), { title: 'T', body: 'B' });
    assert.equal(m.title, 'T');
  }, 'ui'],
  ['update は PUT /api/memos/:id、remove は DELETE（戻りなし）', async () => {
    const { createClient } = await load();
    const c = createClient(api.base);
    const m = await c.update('a b', { title: 'N' });
    assert.equal(api.log.at(-1).method, 'PUT');
    assert.equal(api.log.at(-1).url, `/api/memos/${encodeURIComponent('a b')}`);
    assert.deepEqual(JSON.parse(api.log.at(-1).body), { title: 'N' });
    assert.equal(m.title, 'N');
    assert.equal(await c.remove('m1'), undefined);
    assert.equal(api.log.at(-1).method, 'DELETE');
    assert.equal(api.log.at(-1).url, '/api/memos/m1');
  }, 'ui'],
  ['エラー応答は status と code 付きで reject する', async () => {
    const { createClient } = await load();
    const c = createClient(api.base);
    let e;
    try {
      await c.update('boom', { title: '' });
    } catch (x) {
      e = x;
    }
    assert.ok(e instanceof Error, 'Error で reject されない');
    assert.equal(e.status, 400);
    assert.equal(e.code, 'E_EMPTY');
    assert.equal(e.message, '空です');
    let e2;
    try {
      await c.remove('gone');
    } catch (x) {
      e2 = x;
    }
    assert.equal(e2?.status, 404, 'JSON でない 404 でも status を持つ Error');
  }, 'ui'],
  ['つながらないときも reject する', async () => {
    const { createClient } = await load();
    let e;
    try {
      await createClient('http://127.0.0.1:1').list();
    } catch (x) {
      e = x;
    }
    assert.ok(e instanceof Error);
  }, 'ui'],
  ['fetch を差し替えられる（base が空なら相対パス）', async () => {
    const { createClient } = await load();
    const calls = [];
    const fake = async (url, init) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ memos: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    assert.deepEqual(await createClient('', fake).list(), []);
    assert.equal(calls[0][0], '/api/memos');
  }, 'ui'],
], async () => {
  if (api) await new Promise((r) => { api.server.closeAllConnections?.(); api.server.close(r); });
});
