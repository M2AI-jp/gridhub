// A3: エラーの写し方と検索（にせストアで）
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runChecks, assert, tmp, startServer, get, send, ROOT } from './lib/helpers.mjs';

const fakeStore = join(ROOT, 'checks/fixtures/fake-store.mjs');

function errIs(r, status, code) {
  assert.equal(r.status, status, `status が ${r.status}（期待 ${status}）: ${r.text.slice(0, 80)}`);
  assert.match(r.ct, /application\/json/);
  assert.equal(r.json.error, code);
  assert.equal(typeof r.json.message, 'string', 'message がありません');
}

{
  const T = tmp();
  const dir = T.dir;
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'index.html'), 'x');
  let srv;
  const steps = [
    ['起動', async () => {
      srv = await startServer({ dataDir: join(dir, 'data'), webDir: web, storeModule: fakeStore });
    }, 'api'],
    ['空のメモは 400 E_EMPTY', async () => {
      errIs(await send(srv.base, 'POST', '/api/memos', {}), 400, 'E_EMPTY');
    }, 'api'],
    ['長すぎるは 400 E_TOO_LONG', async () => {
      errIs(await send(srv.base, 'POST', '/api/memos', { title: 'x'.repeat(101) }), 400, 'E_TOO_LONG');
    }, 'api'],
    ['型が違うは 400 E_INVALID（文字列でない title / JSON が配列）', async () => {
      errIs(await send(srv.base, 'POST', '/api/memos', { title: 5 }), 400, 'E_INVALID');
      errIs(await send(srv.base, 'POST', '/api/memos', '[1,2]'), 400, 'E_INVALID');
      errIs(await send(srv.base, 'POST', '/api/memos', '"text"'), 400, 'E_INVALID');
    }, 'api'],
    ['壊れた JSON は 400 E_BAD_JSON', async () => {
      errIs(await send(srv.base, 'POST', '/api/memos', '{oops'), 400, 'E_BAD_JSON');
      errIs(await send(srv.base, 'POST', '/api/memos', ''), 400, 'E_BAD_JSON');
    }, 'api'],
    ['id などの余計な項目は無視する', async () => {
      const r = await send(srv.base, 'POST', '/api/memos', { id: 'forced', body: 'x', extra: 1 });
      assert.equal(r.status, 201);
      assert.notEqual(r.json.id, 'forced', 'リクエストの id をそのまま通している');
      assert.equal(r.json.extra, undefined);
    }, 'api'],
    ['無い id は 404 E_NOT_FOUND（PUT / DELETE）', async () => {
      errIs(await send(srv.base, 'PUT', '/api/memos/nope', { title: 'x' }), 404, 'E_NOT_FOUND');
      errIs(await send(srv.base, 'DELETE', '/api/memos/nope'), 404, 'E_NOT_FOUND');
    }, 'api'],
    ['PUT の入力エラーも 400', async () => {
      const m = (await send(srv.base, 'POST', '/api/memos', { title: 'keep', body: 'k' })).json;
      errIs(await send(srv.base, 'PUT', `/api/memos/${m.id}`, { title: 7 }), 400, 'E_INVALID');
      errIs(await send(srv.base, 'PUT', `/api/memos/${m.id}`, '{'), 400, 'E_BAD_JSON');
      assert.equal((await get(srv.base, `/api/memos/${m.id}`)).json.title, 'keep');
    }, 'api'],
    ['GET /api/memos?q= で絞り込む', async () => {
      await send(srv.base, 'POST', '/api/memos', { title: 'Call mom', body: 'tonight' });
      await send(srv.base, 'POST', '/api/memos', { title: 'Buy MILK', body: '' });
      const q = async (s) => (await get(srv.base, `/api/memos?q=${encodeURIComponent(s)}`)).json.memos.map((m) => m.title);
      assert.deepEqual(await q('milk'), ['Buy MILK']);
      assert.deepEqual(await q('tonight'), ['Call mom']);
      assert.deepEqual(await q('zzz'), []);
      const all = (await get(srv.base, '/api/memos')).json.memos.length;
      assert.equal((await q('')).length, all);
      assert.equal((await get(srv.base, '/api/memos')).json.memos.length, all);
    }, 'api'],
    ['使えないメソッドは 405 E_METHOD', async () => {
      errIs(await send(srv.base, 'PATCH', '/api/memos', {}), 405, 'E_METHOD');
      errIs(await send(srv.base, 'DELETE', '/api/memos'), 405, 'E_METHOD');
      errIs(await send(srv.base, 'POST', '/api/memos/abc', {}), 405, 'E_METHOD');
    }, 'api'],
    ['想定外のエラーは 500 E_INTERNAL で、サーバーは生き残る', async () => {
      errIs(await send(srv.base, 'POST', '/api/memos', { title: '__boom__' }), 500, 'E_INTERNAL');
      const h = await get(srv.base, '/api/health');
      assert.equal(h.status, 200);
    }, 'api'],
  ];
  await runChecks(steps, async () => {
    if (srv) await srv.stop();
    T.cleanup();
  });
}
