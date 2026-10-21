// S1: メモを保存して一覧する（src/store/memo-store.mjs）
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { runChecks, assert, need, withTmp } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('src/store/memo-store.mjs');
  assert.equal(typeof m.createStore, 'function', 'createStore が export されていません');
  return m;
};

await runChecks([
  ['create が memo を返す', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const m = await s.create({ title: '買い物', body: '牛乳' });
    assert.equal(typeof m.id, 'string');
    assert.ok(m.id.length > 0, 'id が空');
    assert.equal(m.title, '買い物');
    assert.equal(m.body, '牛乳');
    for (const k of ['createdAt', 'updatedAt']) {
      assert.equal(new Date(m[k]).toISOString(), m[k], `${k} が ISO 8601 (toISOString 形式) ではありません`);
    }
    const t = await s.create({ body: 'タイトルなし' });
    assert.equal(t.title, '', 'title 省略時は空文字');
  }), 'store'],
  ['list は新しい順', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ body: 'A' });
    const b = await s.create({ body: 'B' });
    const c = await s.create({ body: 'C' });
    const ids = (await s.list()).map((m) => m.id);
    assert.deepEqual(ids, [c.id, b.id, a.id]);
  }), 'store'],
  ['作業フォルダが無くても作られ、memos.json に保存される', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const d = join(dir, 'nested', 'data');
    const s = await createStore(d);
    await s.create({ body: 'x' });
    assert.ok(existsSync(join(d, 'memos.json')), 'memos.json がありません');
    JSON.parse(readFileSync(join(d, 'memos.json'), 'utf8'));
  }), 'store'],
  ['作り直したストアにも残っている', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s1 = await createStore(dir);
    await s1.create({ title: 'one', body: '1' });
    await s1.create({ title: 'two', body: '2' });
    const s2 = await createStore(dir);
    const list = await s2.list();
    assert.deepEqual(list.map((m) => m.title), ['two', 'one']);
    assert.deepEqual(list, await s1.list());
  }), 'store'],
  ['同時に10件作っても取りこぼさない', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const made = await Promise.all(Array.from({ length: 10 }, (_, i) => s.create({ body: `m${i}` })));
    assert.equal(new Set(made.map((m) => m.id)).size, 10, 'id が重複しています');
    assert.equal((await s.list()).length, 10);
    assert.equal((await (await createStore(dir)).list()).length, 10, '作り直すと件数が合いません');
  }), 'store'],
]);
