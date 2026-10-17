import {
  check, run, phase, requireEntry, added, listed, success, failure,
  assert, join, readFileSync, writeFileSync,
} from './lib/harness.mjs';

await check('GOAL', (dir) => {
  for (const owner of ['cli', 'store', 'tally']) phase(owner, () => requireEntry(owner));
  const file = join(dir, 'my-ledger.json');
  const env = { KAKEIBO_FILE: file };
  const inputs = [
    { date: '2026-09-30', amount: 999, category: '食費', note: '先月の買い物' },
    { date: '2026-10-01', amount: 1200, category: '食費', note: '昼食 🍱' },
    { date: '2026-10-02', amount: 800, category: '食費', note: '' },
    { date: '2026-10-03', amount: 250, category: '交通費', note: 'バス' },
    { date: '2026-11-01', amount: 7000, category: '日用品', note: '翌月' },
  ];
  const records = [];
  for (const input of inputs) {
    // A failure while crossing the CLI/store boundary cannot yet be assigned to one module.
    const record = phase('cli,store', () => added(run('cli', [
      'add', '--category', input.category, '--amount', String(input.amount),
      '--date', input.date, ...(input.note ? ['--note', input.note] : []),
    ], { env, cwd: dir }), input));
    records.push(record);
  }
  phase('cli,store', () => {
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, expenses: records });
  });

  // Every run is a newly started process; read persisted records before testing orchestration.
  const persisted = phase('store', () => {
    const result = run('store', ['list'], { env });
    listed(result, records);
    return result.stdout;
  });
  phase('cli', () => listed(run('cli', ['list'], { env, cwd: dir }), records));
  const expected = [
    {
      month: '2026-10', currency: 'JPY', count: 3, total: 2250,
      byCategory: [
        { category: '交通費', count: 1, total: 250 },
        { category: '食費', count: 2, total: 2000 },
      ],
    },
    {
      month: '2026-09', currency: 'JPY', count: 1, total: 999,
      byCategory: [{ category: '食費', count: 1, total: 999 }],
    },
    { month: '2026-12', currency: 'JPY', count: 0, total: 0, byCategory: [] },
  ];
  for (const report of expected) {
    phase('tally', () => assert.deepEqual(
      success(run('tally', ['month', report.month], { input: persisted })), report,
    ));
    phase('cli', () => assert.deepEqual(
      success(run('cli', ['summary', '--month', report.month], { env, cwd: dir })), report,
    ));
  }
  const original = readFileSync(file);
  phase('cli', () => {
    failure(run('cli', [
      'add', '--date', '2026-02-30', '--amount', '500', '--category', '食費',
    ], { env, cwd: dir }), 'E_INPUT');
    assert.deepEqual(readFileSync(file), original, '不正な日付の追加で台帳を書き換えないでください');
    failure(run('cli', ['summary', '--month', '2026-13'], { env, cwd: dir }), 'E_USAGE');
    assert.deepEqual(readFileSync(file), original, '月次参照は台帳を書き換えないでください');
  });

  const broken = join(dir, 'broken-ledger.json');
  const corrupt = '{"version":1,"expenses":[';
  writeFileSync(broken, corrupt);
  const brokenEnv = { KAKEIBO_FILE: broken };
  phase('store', () => {
    failure(run('store', ['list'], { env: brokenEnv }), 'E_STORE', 1);
    assert.equal(readFileSync(broken, 'utf8'), corrupt, '破損台帳のlistで元ファイルを変更しないでください');
  });
  phase('cli', () => {
    failure(run('cli', ['summary', '--month', '2026-10'], { env: brokenEnv }), 'E_STORE', 1);
    assert.equal(readFileSync(broken, 'utf8'), corrupt, '破損台帳のsummaryで元ファイルを変更しないでください');
  });
  phase('cli,store', () => {
    failure(run('cli', [
      'add', '--date', '2026-10-04', '--amount', '100', '--category', '食費',
    ], { env: brokenEnv }), 'E_STORE', 1);
    assert.equal(readFileSync(broken, 'utf8'), corrupt, '破損台帳を空に戻さないでください');
    assert.deepEqual(readFileSync(file), original, '別の保存先への操作は正常な台帳に影響しません');
  });
}, { gate: true });
