// U4: 画面の動き（web/controller.mjs）と、DOM とのつなぎ（web/app.mjs）
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { runChecks, assert, need, ROOT } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('web/controller.mjs');
  assert.equal(typeof m.createController, 'function', 'createController が export されていません');
  return m;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// にせクライアント。delays: { q: ms } で list の返りを遅らせられる
function fakeClient({ delays = {}, failNext = null } = {}) {
  const calls = [];
  let n = 0;
  let store = [];
  const c = {
    calls,
    failNext,
    async list(q = '') {
      calls.push(['list', q]);
      const snapshot = store.filter((m) => !q || m.title.includes(q) || m.body.includes(q));
      if (delays[q]) await wait(delays[q]);
      return snapshot;
    },
    async create(input) {
      calls.push(['create', input]);
      if (c.failNext) throw Object.assign(new Error(c.failNext), { status: 500 });
      const m = { id: `m${++n}`, title: input.title ?? '', body: input.body ?? '', createdAt: 'x', updatedAt: 'x' };
      store = [m, ...store];
      return m;
    },
    async update(id, patch) {
      calls.push(['update', id, patch]);
      if (c.failNext) throw Object.assign(new Error(c.failNext), { status: 500 });
      store = store.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return store.find((m) => m.id === id);
    },
    async remove(id) {
      calls.push(['remove', id]);
      store = store.filter((m) => m.id !== id);
    },
  };
  return c;
}
const kinds = (c) => c.calls.map((x) => x[0]);

await runChecks([
  ['init: 最初の状態と一覧の読み込み', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const seen = [];
    const ctrl = createController({ client, onChange: (s) => seen.push(s) });
    assert.deepEqual(
      { memos: ctrl.state.memos, query: ctrl.state.query, editingId: ctrl.state.editingId, error: ctrl.state.error },
      { memos: [], query: '', editingId: null, error: null },
    );
    await client.create({ title: 'pre', body: '' });
    client.calls.length = 0;
    await ctrl.init();
    assert.deepEqual(client.calls, [['list', '']]);
    assert.equal(ctrl.state.memos.length, 1);
    assert.ok(seen.length >= 1, 'onChange が呼ばれていません');
    assert.equal(seen.at(-1).memos.length, 1);
  }, 'ui'],
  ['save: 新規は create → 一覧を読み直す', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: '買い物', body: '牛乳' });
    assert.deepEqual(client.calls.slice(1).map((x) => x[0]), ['create', 'list']);
    assert.deepEqual(client.calls[1][1], { title: '買い物', body: '牛乳' });
    assert.deepEqual(ctrl.state.memos.map((m) => m.title), ['買い物']);
    assert.equal(ctrl.state.error, null);
  }, 'ui'],
  ['save: 空入力は client を呼ばず error を出す', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    client.calls.length = 0;
    await ctrl.save({ title: '  ', body: '' });
    assert.ok(!kinds(client).includes('create'), 'create が呼ばれた');
    assert.equal(typeof ctrl.state.error, 'string');
    assert.ok(ctrl.state.error.length > 0);
  }, 'ui'],
  ['編集: startEdit → save は update、終わると editingId が null', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: 'A', body: 'a' });
    const id = ctrl.state.memos[0].id;
    await ctrl.startEdit('unknown-id');
    assert.equal(ctrl.state.editingId, null, '無い id を編集中にした');
    await ctrl.startEdit(id);
    assert.equal(ctrl.state.editingId, id);
    client.calls.length = 0;
    await ctrl.save({ title: 'A2', body: 'a' });
    assert.deepEqual(client.calls[0], ['update', id, { title: 'A2', body: 'a' }]);
    assert.ok(!kinds(client).includes('create'));
    assert.equal(ctrl.state.editingId, null);
    assert.equal(ctrl.state.memos[0].title, 'A2');
    await ctrl.startEdit(id);
    await ctrl.cancelEdit();
    assert.equal(ctrl.state.editingId, null);
  }, 'ui'],
  ['remove: 消して読み直す。編集中のものを消すと編集をやめる', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: 'A', body: '' });
    await ctrl.save({ title: 'B', body: '' });
    const [b, a] = ctrl.state.memos;
    await ctrl.startEdit(a.id);
    await ctrl.remove(a.id);
    assert.ok(client.calls.some((x) => x[0] === 'remove' && x[1] === a.id));
    assert.deepEqual(ctrl.state.memos.map((m) => m.id), [b.id]);
    assert.equal(ctrl.state.editingId, null);
  }, 'ui'],
  ['search: query を覚え、以降の読み直しにも使う', async () => {
    const { createController } = await load();
    const client = fakeClient();
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: 'milk', body: '' });
    await ctrl.save({ title: 'bread', body: '' });
    client.calls.length = 0;
    await ctrl.search('milk');
    assert.deepEqual(client.calls, [['list', 'milk']]);
    assert.equal(ctrl.state.query, 'milk');
    assert.deepEqual(ctrl.state.memos.map((m) => m.title), ['milk']);
    client.calls.length = 0;
    await ctrl.save({ title: 'milk tea', body: '' });
    assert.deepEqual(client.calls.at(-1), ['list', 'milk'], '保存後の読み直しで検索語が失われた');
  }, 'ui'],
  ['失敗しても throw せず error に出し、成功で消える', async () => {
    const { createController } = await load();
    const client = fakeClient({ failNext: 'サーバーが落ちた' });
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: 'A', body: 'a' });
    assert.equal(typeof ctrl.state.error, 'string');
    assert.ok(ctrl.state.error.length > 0);
    assert.deepEqual(ctrl.state.memos, []);
    client.failNext = null;
    await ctrl.save({ title: 'A', body: 'a' });
    assert.equal(ctrl.state.error, null);
    assert.equal(ctrl.state.memos.length, 1);
    const id = ctrl.state.memos[0].id;
    await ctrl.startEdit(id);
    client.failNext = 'again';
    await ctrl.save({ title: 'A!', body: 'a' });
    assert.equal(ctrl.state.editingId, id, '更新に失敗したら編集中のまま');
  }, 'ui'],
  ['search: 遅れて返った古い結果で上書きしない', async () => {
    const { createController } = await load();
    const client = fakeClient({ delays: { a: 80 } });
    const ctrl = createController({ client, onChange() {} });
    await ctrl.init();
    await ctrl.save({ title: 'a', body: '' });
    await ctrl.save({ title: 'ab', body: '' });
    const slow = ctrl.search('a');
    await wait(5);
    await ctrl.search('ab');
    await slow;
    assert.equal(ctrl.state.query, 'ab');
    assert.deepEqual(ctrl.state.memos.map((m) => m.title), ['ab'], '古い検索結果で上書きされた');
  }, 'ui'],
  ['app.mjs: 3つの部品と index.html の id をつなぐ', () => {
    const p = join(ROOT, 'web/app.mjs');
    if (!existsSync(p)) throw new Error('未実装: web/app.mjs がまだありません');
    const js = readFileSync(p, 'utf8');
    for (const f of ['api-client.mjs', 'controller.mjs', 'memo-view.mjs']) {
      assert.match(js, new RegExp(`from\\s+['"]\\./${f.replace('.', '\\.')}['"]`), `${f} を import していません`);
    }
    const html = readFileSync(join(ROOT, 'web/index.html'), 'utf8');
    for (const id of ['memo-form', 'memo-title', 'memo-body', 'memo-search', 'memo-list', 'memo-empty', 'memo-error']) {
      assert.ok(js.includes(id), `app.mjs が #${id} を使っていません`);
      assert.ok(html.includes(`id="${id}"`), `index.html に #${id} がありません`);
    }
    assert.match(js, /addEventListener/);
    assert.match(js, /data-action|dataset\.action/, '編集・削除ボタンを data-action で拾っていません');
  }, 'ui'],
]);
