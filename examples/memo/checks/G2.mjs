// G2 結合: 配られた画面の部品が API とつながる（本物の web/ + 本物のサーバー）
import { join } from 'node:path';
import { runChecks, assert, tmp, need, startServer, get, send, fetchAssetGraph } from './lib/helpers.mjs';

const T = tmp();
let srv;
const lib = {};

await runChecks([
  ['本物の web/ を配るサーバーが起動する', async () => {
    srv = await startServer({ dataDir: join(T.dir, 'data') });
  }, 'api'],
  ['GET / が画面を返し、必要な部品がそろっている', async () => {
    const r = await get(srv.base, '/');
    assert.equal(r.status, 200, `GET / が ${r.status}`);
    assert.match(r.ct, /text\/html/);
    for (const id of ['memo-form', 'memo-title', 'memo-body', 'memo-search', 'memo-list', 'memo-empty', 'memo-error']) {
      assert.ok(r.text.includes(`id="${id}"`), `画面に #${id} がありません`);
    }
  }, 'ui'],
  ['画面から辿れるファイルが全部、正しい型で取れる', async () => {
    const g = await fetchAssetGraph(srv.base);
    for (const [p, r] of g) {
      if (r.status !== 200) assert.fail(`${p} が ${r.status}（参照先が無い、または配信できていない）`);
    }
    for (const [p, r] of g) {
      if (/\.m?js$/.test(p)) assert.match(r.ct, /^text\/javascript/i, `${p} の Content-Type が ${r.ct}`);
      if (p.endsWith('.css')) assert.match(r.ct, /^text\/css/i, `${p} の Content-Type が ${r.ct}`);
    }
    for (const p of ['/app.mjs', '/api-client.mjs', '/controller.mjs', '/memo-view.mjs']) {
      assert.ok(g.has(p), `${p} が画面から辿れません`);
    }
  }, ['ui', 'api']],
  ['API クライアントで 作成→一覧→更新→削除 ができる', async () => {
    lib.client = (await need('web/api-client.mjs')).createClient(srv.base);
    const c = lib.client;
    const m = await c.create({ title: '朝', body: 'コーヒー' });
    assert.deepEqual((await c.list()).map((x) => x.id), [m.id]);
    const u = await c.update(m.id, { body: '紅茶' });
    assert.equal(u.body, '紅茶');
    await c.remove(m.id);
    assert.deepEqual(await c.list(), []);
    let e;
    try {
      await c.create({ title: '', body: '' });
    } catch (x) {
      e = x;
    }
    assert.equal(e?.status, 400, '空メモの作成が 400 で reject されない');
    assert.equal(e.code, 'E_EMPTY');
  }, ['ui', 'api']],
  ['コントローラ + 描画で画面の状態が API の内容と一致する', async () => {
    const { createController } = await need('web/controller.mjs');
    const { renderMemoList } = await need('web/memo-view.mjs');
    let last;
    const ctrl = createController({ client: lib.client, onChange: (s) => (last = s) });
    await ctrl.init();
    await ctrl.save({ title: '会議メモ', body: '議題: <b>予算</b>' });
    await ctrl.save({ title: '買い物', body: '牛乳' });
    const html = renderMemoList(last.memos);
    assert.ok(html.indexOf('買い物') < html.indexOf('会議メモ'), '新しい順に並んでいません');
    assert.ok(!html.includes('<b>予算'), 'API から来た本文がエスケープされていません');
    await ctrl.search('牛乳');
    assert.deepEqual(last.memos.map((m) => m.title), ['買い物']);
    const server = (await get(srv.base, `/api/memos?q=${encodeURIComponent('牛乳')}`)).json.memos;
    assert.deepEqual(last.memos, server, '画面の状態とサーバーの内容がずれています');
  }, 'ui'],
  ['サーバー側の変更が、読み直した画面に出る', async () => {
    const { createController } = await need('web/controller.mjs');
    const r = await send(srv.base, 'POST', '/api/memos', { title: '外から追加', body: '' });
    assert.equal(r.status, 201);
    let last;
    const ctrl = createController({ client: lib.client, onChange: (s) => (last = s) });
    await ctrl.init();
    assert.equal(last.memos[0].title, '外から追加');
  }, ['ui', 'api']],
], async () => {
  if (srv) await srv.stop();
  T.cleanup();
});
