// S3: 入力検査と検索
import { runChecks, assert, need, withTmp, rejectsCode } from './lib/helpers.mjs';

const load = async () => {
  const m = await need('src/store/memo-store.mjs');
  assert.equal(typeof m.createStore, 'function', 'createStore が export されていません');
  return m;
};

await runChecks([
  ['空のメモは E_EMPTY', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    await rejectsCode(s.create({}), 'E_EMPTY');
    await rejectsCode(s.create({ title: '  ', body: '\n\t' }), 'E_EMPTY');
    assert.deepEqual(await s.list(), [], '失敗した create が一覧に残っている');
  }), 'store'],
  ['title だけ・body だけは作れる（そのまま保存、trim しない）', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ title: ' only title ' });
    assert.equal(a.title, ' only title ');
    assert.equal(a.body, '');
    const b = await s.create({ body: 'only body' });
    assert.equal(b.title, '');
  }), 'store'],
  ['長さの上限（title 100 / body 10000）', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    await s.create({ title: 'あ'.repeat(100) });
    await s.create({ body: 'x'.repeat(10000) });
    await rejectsCode(s.create({ title: 'あ'.repeat(101) }), 'E_TOO_LONG');
    await rejectsCode(s.create({ body: 'x'.repeat(10001) }), 'E_TOO_LONG');
    assert.equal((await s.list()).length, 2);
  }), 'store'],
  ['文字列でない値・入力なしは E_INVALID', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    await rejectsCode(s.create({ title: 123 }), 'E_INVALID');
    await rejectsCode(s.create({ body: null }), 'E_INVALID');
    await rejectsCode(s.create(), 'E_INVALID');
    await rejectsCode(s.create('text'), 'E_INVALID');
  }), 'store'],
  ['update も同じ検査をし、失敗したら何も変えない', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ title: 'T', body: '' });
    await rejectsCode(s.update(a.id, { title: '' }), 'E_EMPTY');
    await rejectsCode(s.update(a.id, { title: 'あ'.repeat(101) }), 'E_TOO_LONG');
    await rejectsCode(s.update(a.id, { body: 5 }), 'E_INVALID');
    assert.deepEqual(await s.get(a.id), a);
  }), 'store'],
  ['list({q}) は title / body の部分一致（大文字小文字を区別しない）', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    const a = await s.create({ title: 'Buy Milk', body: 'at the store' });
    const b = await s.create({ title: '会議', body: '牛乳の話' });
    const c = await s.create({ title: 'other', body: 'nothing' });
    assert.deepEqual((await s.list({ q: 'milk' })).map((m) => m.id), [a.id]);
    assert.deepEqual((await s.list({ q: '牛乳' })).map((m) => m.id), [b.id]);
    assert.deepEqual((await s.list({ q: 'STORE' })).map((m) => m.id), [a.id]);
    assert.deepEqual((await s.list({ q: 'zzz' })), []);
    const all = [c.id, b.id, a.id];
    assert.deepEqual((await s.list({ q: '' })).map((m) => m.id), all);
    assert.deepEqual((await s.list({ q: '   ' })).map((m) => m.id), all);
    assert.deepEqual((await s.list({})).map((m) => m.id), all);
    // b（会議・牛乳の話）は半角の o を含まない。一致した a と c だけが、新しい順に並ぶ（GM の修正: 倉庫番の指摘による）
    assert.deepEqual((await s.list({ q: 'o' })).map((m) => m.id), [c.id, a.id], '検索結果も新しい順');
  }), 'store'],
  ['q は正規表現ではなく文字列として探す', () => withTmp(async (dir) => {
    const { createStore } = await load();
    const s = await createStore(dir);
    await s.create({ body: 'axb' });
    const lit = await s.create({ body: 'a.b' });
    assert.deepEqual((await s.list({ q: 'a.b' })).map((m) => m.id), [lit.id]);
    assert.deepEqual(await s.list({ q: '(' }), []);
  }), 'store'],
]);
