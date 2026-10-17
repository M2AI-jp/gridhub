import {
  assert, check, requireEntry, run, failure, expense, readFileSync, writeFileSync, join,
} from './lib/harness.mjs';

await check('S3', (dir) => {
  requireEntry('store');
  const file = join(dir, 'ledger.json');
  const env = { KAKEIBO_FILE: file };
  const good = expense('saved-1', '2026-10-01', 1200, '食費', '昼食');
  const input = { date: '2026-10-02', amount: 300, category: '交通費', note: 'バス' };
  const ledger = (records) => ({ version: 1, expenses: records });
  const corrupt = [
    ['壊れたJSON', '{"version":1,'],
    ['未知version', { version: 2, expenses: [good] }],
    ['文字列version', { version: '1', expenses: [good] }],
    ['version欠落', { expenses: [good] }],
    ['余分な台帳フィールド', { ...ledger([good]), extra: true }],
    ['配列でない支出一覧', { version: 1, expenses: {} }],
    ['一覧欠落', { version: 1 }],
    ['null台帳', null],
    ['ID重複', ledger([good, { ...good, amount: 800 }])],
    ['ID形式不正', ledger([{ ...good, id: 'bad id' }])],
    ['メモ欠落', ledger([{ id: good.id, date: good.date, amount: good.amount, category: good.category }])],
    ['未知レコードフィールド', ledger([{ ...good, extra: 1 }])],
    ['未trimカテゴリ', ledger([{ ...good, category: ' 食費 ' }])],
    ['非実在日', ledger([{ ...good, date: '2026-02-29' }])],
    ['不正金額', ledger([{ ...good, amount: -1 }])],
    ['不正メモ型', ledger([{ ...good, note: null }])],
    ['不正レコード型', ledger([null])],
  ];
  for (const [label, value] of corrupt) {
    const bytes = Buffer.from(typeof value === 'string' ? value : `${JSON.stringify(value)}\n`, 'utf8');
    writeFileSync(file, bytes);
    for (const command of ['list', 'add']) {
      failure(run('store', [command], { env, input: command === 'add' ? input : '' }), 'E_STORE', 1);
      assert.deepEqual(readFileSync(file), bytes, `${label} を${command}が書き換えてはいけません`);
    }
  }
  for (const command of ['list', 'add']) {
    failure(run('store', [command], {
      env: { KAKEIBO_FILE: dir }, input: command === 'add' ? input : '',
    }), 'E_STORE', 1);
  }
});
