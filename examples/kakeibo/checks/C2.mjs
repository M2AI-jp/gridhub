import { assert, check, run, success, failure, expense, join } from './lib/harness.mjs';
import { fixture, response } from './fixtures/setup.mjs';
await check('C2', dir => {
  const f = fixture(dir);
  const record = expense('canned-record', '2026-10-01', 1200, '食費', '昼食');
  f.set({ store: response({ expense: record }) });
  const category = '食費; $(echo injected)';
  const note = '昼食 "引用" `echo x` $HOME\n二行目';
  const args = ['add', '--note', note, '--category', category, '--amount', '1200', '--date', '2026-10-01'];
  assert.deepEqual(success(run('cli', args, { env: f.env, cwd: dir })), { expense: record });
  let calls = f.calls();
  assert.equal(calls.length, 1, '追加はstoreを1回呼びます');
  assert.deepEqual(calls[0].args, ['add']); assert.equal(calls[0].name, 'store'); assert.equal(calls[0].file, f.file);
  assert.deepEqual(JSON.parse(calls[0].input), { date: '2026-10-01', amount: 1200, category, note });
  f.set({ store: response({ expense: record }) });
  success(run('cli', ['add', '--date', '2026-10-01', '--amount', '1200', '--category', ' 食費 '], { env: f.env }));
  calls = f.calls(); assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].input), { date: '2026-10-01', amount: 1200, category: '食費', note: '' });
  f.set({ store: response({ expenses: [record] }) });
  assert.deepEqual(success(run('cli', ['list'], { env: f.env })), { expenses: [record] });
  assert.deepEqual(f.calls(), [{ name: 'store', args: ['list'], input: '', file: f.file }]);
  const stderr = '[E_STORE] 台帳を読めません\n';
  for (const command of [['list'], args]) {
    f.set({ store: { status: 1, stderr } });
    const failed = run('cli', command, { env: f.env }); failure(failed, 'E_STORE', 1); assert.equal(failed.stderr, stderr); assert.equal(f.calls().length, 1);
  }
  f.set({ store: { stdout: 'broken JSON' } });
  failure(run('cli', ['list'], { env: f.env }), 'E_BACKEND', 1);
  failure(run('cli', ['list'], { env: { ...f.env, KAKEIBO_STORE_CLI: join(dir, 'absent.mjs') } }), 'E_BACKEND', 1);
});
