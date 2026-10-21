// あがり: メモを書いて、一覧で見て、探して、直して、消せる。サーバーを再起動しても残っている。
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { runChecks, assert, tmp, need, startServer, get, fetchAssetGraph } from './lib/helpers.mjs';

const T = tmp();
const data = join(T.dir, 'data');
let srv;
let client;
let createController;
let renderMemoList;
let view; // 画面の状態（onChange で更新される）
let ctrl;
const titlesInHtml = () => [...renderMemoList(view.memos).matchAll(/class="[^"]*\bmemo-title\b[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);

const boot = async () => {
  srv = await startServer({ dataDir: data });
  client = (await need('web/api-client.mjs')).createClient(srv.base);
  ({ createController } = await need('web/controller.mjs'));
  ({ renderMemoList } = await need('web/memo-view.mjs'));
  ctrl = createController({ client, onChange: (s) => (view = s) });
  await ctrl.init();
};

await runChecks([
  ['ブラウザを開く: サーバーを起動して画面と部品が全部届く', async () => {
    srv = await startServer({ dataDir: data });
    const g = await fetchAssetGraph(srv.base);
    assert.ok(g.get('/')?.status === 200, 'GET / が 200 ではありません');
    for (const [p, r] of g) assert.equal(r.status, 200, `${p} が ${r.status}`);
    assert.ok(g.has('/app.mjs'), '画面が /app.mjs を読んでいません');
    await srv.stop();
    srv = null;
  }, ['api', 'ui']],
  ['最初は何もない', async () => {
    await boot();
    assert.deepEqual(view.memos, []);
    assert.equal(renderMemoList(view.memos).trim(), '');
  }, ['ui', 'api']],
  ['3つのメモを書くと、新しい順に一覧に並ぶ', async () => {
    await ctrl.save({ title: '買い物', body: '牛乳\nパン' });
    await ctrl.save({ title: '会議', body: '来週の予算の話' });
    await ctrl.save({ title: '日記', body: '<script>alert("x")</script> & 今日は晴れ' });
    assert.deepEqual(titlesInHtml(), ['日記', '会議', '買い物']);
    const html = renderMemoList(view.memos);
    assert.ok(!/<script/i.test(html), 'メモの中の <script が生で出ている');
    assert.ok(html.includes('&amp; 今日は晴れ'));
  }, ['ui', 'api', 'store']],
  ['言葉で探すと絞り込まれ、空にすると戻る', async () => {
    await ctrl.search('牛乳');
    assert.deepEqual(titlesInHtml(), ['買い物']);
    await ctrl.search('予算');
    assert.deepEqual(titlesInHtml(), ['会議']);
    await ctrl.search('存在しない言葉');
    assert.deepEqual(titlesInHtml(), []);
    await ctrl.search('');
    assert.equal(view.memos.length, 3);
  }, ['ui', 'api', 'store']],
  ['メモを直すと、順序はそのままで中身が変わる', async () => {
    const target = view.memos.find((m) => m.title === '会議');
    await ctrl.startEdit(target.id);
    await ctrl.save({ title: '会議（延期）', body: target.body });
    assert.deepEqual(titlesInHtml(), ['日記', '会議（延期）', '買い物']);
    assert.equal(view.editingId, null);
  }, ['ui', 'api', 'store']],
  ['メモを消すと一覧から消える', async () => {
    const target = view.memos.find((m) => m.title === '買い物');
    await ctrl.remove(target.id);
    assert.deepEqual(titlesInHtml(), ['日記', '会議（延期）']);
  }, ['ui', 'api', 'store']],
  ['空のメモは保存できず、画面にエラーが出る（一覧は変わらない）', async () => {
    await ctrl.save({ title: '', body: '   ' });
    assert.ok(view.error, 'エラーが出ていません');
    assert.equal(view.memos.length, 2);
  }, ['ui', 'api', 'store']],
  ['データがファイルとして残る', async () => {
    assert.ok(existsSync(join(data, 'memos.json')), `${data}/memos.json がありません`);
  }, 'store'],
  ['サーバーを止めて起動し直しても、同じ一覧が出る', async () => {
    const before = view.memos;
    assert.equal(await srv.stop(), 0, 'SIGTERM で終了コード 0 になりません');
    srv = null;
    await boot();
    assert.deepEqual(view.memos, before, '再起動後の一覧が違います');
    assert.deepEqual(titlesInHtml(), ['日記', '会議（延期）']);
  }, ['store', 'api']],
  ['全部消すと空の一覧に戻る', async () => {
    for (const m of [...view.memos]) await ctrl.remove(m.id);
    assert.deepEqual(view.memos, []);
    assert.equal((await get(srv.base, '/api/memos')).json.memos.length, 0);
  }, ['ui', 'api', 'store']],
], async () => {
  if (srv) await srv.stop();
  T.cleanup();
});
