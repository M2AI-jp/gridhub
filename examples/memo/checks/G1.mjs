// G1 結合: 保存したメモが再起動後も残る（本物のストア + 本物のサーバー）
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runChecks, assert, tmp, need, startServer, get, send } from './lib/helpers.mjs';

const T = tmp();
const web = join(T.dir, 'web');
mkdirSync(web);
writeFileSync(join(web, 'index.html'), 'x');
const data = join(T.dir, 'data');
let srv;
let ids = [];

await runChecks([
  ['ストア単体で保存できる', async () => {
    const m = await need('src/store/memo-store.mjs');
    const s = await m.createStore(join(T.dir, 'solo'));
    await s.create({ body: 'x' });
    assert.equal((await s.list()).length, 1);
  }, 'store'],
  ['本物のストアで起動する（MEMO_STORE_MODULE なし）', async () => {
    srv = await startServer({ dataDir: data, webDir: web });
  }, 'api'],
  ['POST した2件が新しい順で返る', async () => {
    const a = await send(srv.base, 'POST', '/api/memos', { title: '一つ目', body: 'first' });
    assert.equal(a.status, 201, `POST が ${a.status}: ${a.text.slice(0, 80)}`);
    const b = await send(srv.base, 'POST', '/api/memos', { title: '二つ目', body: 'second' });
    ids = [b.json.id, a.json.id];
    const l = await get(srv.base, '/api/memos');
    assert.deepEqual(l.json.memos.map((m) => m.id), ids);
  }, 'api'],
  ['検査エラーが本物のストア経由でも 400', async () => {
    const r = await send(srv.base, 'POST', '/api/memos', {});
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'E_EMPTY');
    assert.equal((await send(srv.base, 'GET', '/api/memos/none')).status, 404);
  }, ['api', 'store']],
  ['検索がストア経由で効く', async () => {
    const r = await get(srv.base, `/api/memos?q=${encodeURIComponent('SECOND')}`);
    assert.deepEqual(r.json.memos.map((m) => m.title), ['二つ目']);
  }, ['api', 'store']],
  ['更新・削除ができる', async () => {
    const u = await send(srv.base, 'PUT', `/api/memos/${ids[1]}`, { body: 'first (edited)' });
    assert.equal(u.status, 200);
    assert.equal(u.json.body, 'first (edited)');
    const d = await send(srv.base, 'POST', '/api/memos', { body: 'temp' });
    assert.equal((await send(srv.base, 'DELETE', `/api/memos/${d.json.id}`)).status, 204);
  }, ['api', 'store']],
  ['サーバーを再起動しても残っている', async () => {
    assert.equal(await srv.stop(), 0);
    srv = await startServer({ dataDir: data, webDir: web });
    const l = await get(srv.base, '/api/memos');
    assert.deepEqual(l.json.memos.map((m) => m.id), ids);
    assert.equal(l.json.memos[1].body, 'first (edited)');
  }, ['api', 'store']],
], async () => {
  if (srv) await srv.stop();
  T.cleanup();
});
