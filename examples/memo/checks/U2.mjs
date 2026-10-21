// U2: メモ一覧の描画関数（web/memo-view.mjs）
import { runChecks, assert, need } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('web/memo-view.mjs');
  assert.equal(typeof m.renderMemoList, 'function', 'renderMemoList が export されていません');
  assert.equal(typeof m.escapeHtml, 'function', 'escapeHtml が export されていません');
  return m;
};
const memo = (o) => ({ id: 'id1', title: 't', body: 'b', createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-01-02T03:04:05.000Z', ...o });
const items = (html) => html.split(/(?=<li\b)/).filter((s) => s.startsWith('<li'));
const idOf = (li) => li.match(/^<li\b[^>]*\bdata-id="([^"]*)"/)?.[1];
const hasClass = (s, c) => new RegExp(`class="[^"]*\\b${c}\\b`).test(s);

await runChecks([
  ['escapeHtml は & < > " \' を置き換える', async () => {
    const { escapeHtml } = await load();
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
    assert.equal(escapeHtml('<>'), '&lt;&gt;');
    assert.equal(escapeHtml('"\''), '&quot;&#39;');
    assert.equal(escapeHtml('plain 日本語'), 'plain 日本語');
  }, 'ui'],
  ['空配列は空文字', async () => {
    const { renderMemoList } = await load();
    assert.equal(renderMemoList([]).trim(), '');
  }, 'ui'],
  ['1件ぶんの <li class="memo" data-id> と部品', async () => {
    const { renderMemoList } = await load();
    const html = renderMemoList([memo({ id: 'abc', title: '買い物', body: '牛乳\nパン' })]);
    const lis = items(html);
    assert.equal(lis.length, 1, `li が ${lis.length} 個`);
    assert.equal(idOf(lis[0]), 'abc');
    assert.ok(hasClass(lis[0].match(/^<li\b[^>]*>/)[0], 'memo'), 'li に class="memo"');
    for (const c of ['memo-title', 'memo-body', 'memo-time', 'memo-edit', 'memo-delete']) {
      assert.ok(hasClass(lis[0], c), `.${c} がありません`);
    }
    assert.match(lis[0], /<time\b[^>]*datetime="2026-01-02T03:04:05.000Z"/);
    assert.match(lis[0], /<button\b[^>]*type="button"[^>]*data-action="edit"|<button\b[^>]*data-action="edit"[^>]*type="button"/);
    assert.match(lis[0], /<button\b[^>]*type="button"[^>]*data-action="delete"|<button\b[^>]*data-action="delete"[^>]*type="button"/);
    assert.ok(lis[0].includes('買い物'));
    assert.ok(lis[0].includes('牛乳') && lis[0].includes('パン'));
  }, 'ui'],
  ['渡された順のまま並べる', async () => {
    const { renderMemoList } = await load();
    const html = renderMemoList([memo({ id: 'c' }), memo({ id: 'b' }), memo({ id: 'a' })]);
    assert.deepEqual(items(html).map(idOf), ['c', 'b', 'a']);
  }, 'ui'],
  ['title が空なら (無題) と出す', async () => {
    const { renderMemoList } = await load();
    const html = renderMemoList([memo({ title: '', body: '本文だけ' })]);
    assert.ok(html.includes('(無題)'));
  }, 'ui'],
  ['HTML を埋め込まれても無害（エスケープ）', async () => {
    const { renderMemoList } = await load();
    const html = renderMemoList([
      memo({ id: 'x" onclick="alert(1)', title: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)> Tom & Jerry' }),
    ]);
    assert.ok(!/<script/i.test(html), '<script が生で出ている');
    assert.ok(!/<img/i.test(html), '<img が生で出ている');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('Tom &amp; Jerry'));
    assert.equal(items(html).length, 1);
    assert.ok(!/data-id="x" onclick/.test(html), 'id 経由の属性注入ができてしまう');
  }, 'ui'],
]);
