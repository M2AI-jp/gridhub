import {
  assert, check, run, added, listed, failure, readFileSync, join,
} from './lib/harness.mjs';

await check('S2', (dir) => {
  const file = join(dir, 'ledger.json');
  const env = { KAKEIBO_FILE: file };
  const base = { date: '2026-10-01', amount: 1200, category: '食費', note: '記録' };
  const first = added(run('store', ['add'], { env, input: base }), base);
  const before = readFileSync(file);
  const missing = (key) => Object.fromEntries(Object.entries(base).filter(([name]) => name !== key));
  const invalid = [
    ['JSON構文', '{'],
    ['null', 'null'],
    ['配列', []],
    ['数値', '42'],
    ['日付欠落', missing('date')],
    ['金額欠落', missing('amount')],
    ['カテゴリ欠落', missing('category')],
    ...['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01',
      '2026-10-00', '2026-10-32', '0000-01-01', '10000-01-01',
      '2026-1-01', '2026-10-1', '2026-10-01T00:00:00Z', 20261001, null]
      .map((date) => [`不正日付 ${date}`, { ...base, date }]),
    ...[0, -1, 1.5, 1000000001, '1200', null, true]
      .map((amount) => [`不正金額 ${amount}`, { ...base, amount }]),
    ...['', ' \t\n ', '😀'.repeat(41), 123, null]
      .map((category) => ['不正カテゴリ', { ...base, category }]),
    ...['😀'.repeat(201), 123, null]
      .map((note) => ['不正メモ', { ...base, note }]),
    ['未知フィールド', { ...base, extra: true }],
    ['利用者指定ID', { ...base, id: 'user-id' }],
  ];
  for (const [label, input] of invalid) {
    failure(run('store', ['add'], { env, input }), 'E_INPUT');
    assert.deepEqual(readFileSync(file), before, `${label} の拒否で既存台帳を変更しません`);
  }
  listed(run('store', ['list'], { env }), [first]);

  const accepted = [
    {
      input: { date: '2000-02-29', amount: 1000000000, category: ` \t${'😀'.repeat(40)}\n`, note: '😀'.repeat(200) },
      expected: { date: '2000-02-29', amount: 1000000000, category: '😀'.repeat(40), note: '😀'.repeat(200) },
    },
    {
      input: { date: '0001-01-01', amount: 1, category: ' 食費 ' },
      expected: { date: '0001-01-01', amount: 1, category: '食費', note: '' },
    },
    {
      input: { date: '9999-12-31', amount: 2, category: 'その他', note: ' 空白\nと改行\t ' },
      expected: { date: '9999-12-31', amount: 2, category: 'その他', note: ' 空白\nと改行\t ' },
    },
  ];
  const records = [first];
  for (const { input, expected } of accepted) {
    records.push(added(run('store', ['add'], { env, input }), expected));
  }
  listed(run('store', ['list'], { env }), records);
  failure(run('store', ['list']), 'E_CONFIG');
  failure(run('store', ['add'], { input: base }), 'E_CONFIG');
});
