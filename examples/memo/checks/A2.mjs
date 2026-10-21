// A2: メモの CRUD API（にせストアで）
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runChecks, assert, tmp, startServer, get, send, ROOT } from './lib/helpers.mjs';

const fakeStore = join(ROOT, 'checks/fixtures/fake-store.mjs');

{
  const T = tmp();
  const dir = T.dir;
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'index.html'), 'x');
  let srv;
  let a;
  let b;
  const steps = [
    ['起動', async () => {
      srv = await startServer({ dataDir: join(dir, 'data'), webDir: web, storeModule: fakeStore });
    }, 'api'],
    ['最初は GET /api/memos が {memos:[]}', async () => {
      const r = await get(srv.base, '/api/memos');
      assert.equal(r.status, 200);
      assert.match(r.ct, /application\/json/);
      assert.deepEqual(r.json, { memos: [] });
    }, 'api'],
    ['POST /api/memos → 201 + memo', async () => {
      const r = await send(srv.base, 'POST', '/api/memos', { title: '買い物', body: '牛乳' });
      assert.equal(r.status, 201);
      a = r.json;
      assert.equal(a.title, '買い物');
      assert.equal(a.body, '牛乳');
      assert.equal(typeof a.id, 'string');
      assert.ok(a.createdAt && a.updatedAt);
      b = (await send(srv.base, 'POST', '/api/memos', { body: '二つ目' })).json;
    }, 'api'],
    ['GET /api/memos は新しい順', async () => {
      const r = await get(srv.base, '/api/memos');
      assert.deepEqual(r.json.memos.map((m) => m.id), [b.id, a.id]);
    }, 'api'],
    ['GET /api/memos/:id', async () => {
      const r = await get(srv.base, `/api/memos/${a.id}`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.json, a);
    }, 'api'],
    ['PUT /api/memos/:id は部分更新', async () => {
      const r = await send(srv.base, 'PUT', `/api/memos/${a.id}`, { title: '買い物リスト' });
      assert.equal(r.status, 200);
      assert.equal(r.json.title, '買い物リスト');
      assert.equal(r.json.body, '牛乳');
      assert.equal(r.json.id, a.id);
      assert.deepEqual((await get(srv.base, `/api/memos/${a.id}`)).json, r.json);
    }, 'api'],
    ['DELETE → 204（本文なし）、その後 404', async () => {
      const r = await send(srv.base, 'DELETE', `/api/memos/${a.id}`);
      assert.equal(r.status, 204);
      assert.equal(r.text, '');
      assert.equal((await get(srv.base, `/api/memos/${a.id}`)).status, 404);
      assert.deepEqual((await get(srv.base, '/api/memos')).json.memos.map((m) => m.id), [b.id]);
    }, 'api'],
    ['id に記号を含んでも壊れない（URL エンコード）', async () => {
      const r = await get(srv.base, `/api/memos/${encodeURIComponent('a/b c')}`);
      assert.equal(r.status, 404);
      assert.equal(r.json.error, 'E_NOT_FOUND');
    }, 'api'],
  ];
  await runChecks(steps, async () => {
    if (srv) await srv.stop();
    T.cleanup();
  });
}
