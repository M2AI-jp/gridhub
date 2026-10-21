// S2: メモを取得・更新・削除する
import { runChecks, assert, need, withTmp, rejectsCode } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('src/store/memo-store.mjs');
  assert.equal(typeof m.createStore, 'function', 'createStore が export されていません');
  return m;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await runChecks([
  ['get は memo か null', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const m = await s.create({ title: 't', body: 'b' });
    assert.deepEqual(await s.get(m.id), m);
    assert.equal(await s.get('no-such-id'), null);
  }), 'store'],
  ['update は指定した項目だけ変え、順序を変えない', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ title: 'A', body: 'a' });
    const b = await s.create({ title: 'B', body: 'b' });
    await wait(15);
    const u = await s.update(a.id, { title: 'A2' });
    assert.equal(u.id, a.id);
    assert.equal(u.title, 'A2');
    assert.equal(u.body, 'a', '指定しなかった body が変わった');
    assert.equal(u.createdAt, a.createdAt);
    assert.ok(new Date(u.updatedAt) > new Date(a.updatedAt), 'updatedAt が更新されていません');
    assert.deepEqual((await s.list()).map((m) => m.id), [b.id, a.id], '更新で一覧の順序が変わった');
    assert.deepEqual(await s.get(a.id), u);
  }), 'store'],
  ['update は保存される', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ title: 'A', body: 'a' });
    await s.update(a.id, { body: 'changed' });
    assert.equal((await (await createStore(dir)).get(a.id)).body, 'changed');
  }), 'store'],
  ['無い id の update / remove は E_NOT_FOUND', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    await rejectsCode(s.update('nope', { title: 'x' }), 'E_NOT_FOUND');
    await rejectsCode(s.remove('nope'), 'E_NOT_FOUND');
  }), 'store'],
  ['remove で消え、保存される', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ body: 'a' });
    const b = await s.create({ body: 'b' });
    assert.equal(await s.remove(a.id), undefined);
    assert.equal(await s.get(a.id), null);
    assert.deepEqual((await s.list()).map((m) => m.id), [b.id]);
    assert.deepEqual((await (await createStore(dir)).list()).map((m) => m.id), [b.id]);
    const c = await s.create({ body: 'c' });
    assert.notEqual(c.id, a.id, '消した id を再利用しています');
  }), 'store'],
]);
