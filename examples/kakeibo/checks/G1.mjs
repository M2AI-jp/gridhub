import { check, run, phase, added, listed, success, assert, join } from './lib/harness.mjs';

await check('G1', (dir) => {
  const env = { KAKEIBO_FILE: join(dir, 'ledger.json') };
  const inputs = [
    { date: '2026-09-30', amount: 999, category: '食費', note: '前月' },
    { date: '2026-10-01', amount: 1200, category: '食費', note: '昼食' },
    { date: '2026-10-02', amount: 300, category: '交通費', note: '電車' },
    { date: '2026-10-31', amount: 450, category: '食費', note: '買い物' },
    { date: '2026-11-01', amount: 5000, category: '日用品', note: '翌月' },
  ];
  const expenses = phase('store', () => {
    const records = inputs.map((input) => added(run('store', ['add'], { input, env }), input));
    assert.equal(new Set(records.map((row) => row.id)).size, inputs.length, '保存IDはすべて一意です');
    listed(run('store', ['list'], { env }), records);
    return records;
  });
  // Use the actual public list response as the next process's input.
  const persisted = phase('store', () => {
    const result = run('store', ['list'], { env });
    listed(result, expenses);
    return result.stdout;
  });
  phase('tally', () => {
    assert.deepEqual(success(run('tally', ['month', '2026-10'], { input: persisted })), {
      month: '2026-10',
      currency: 'JPY',
      count: 3,
      total: 1950,
      byCategory: [
        { category: '交通費', count: 1, total: 300 },
        { category: '食費', count: 2, total: 1650 },
      ],
    });
    assert.deepEqual(success(run('tally', ['month', '2026-09'], { input: persisted })), {
      month: '2026-09',
      currency: 'JPY',
      count: 1,
      total: 999,
      byCategory: [{ category: '食費', count: 1, total: 999 }],
    });
  });
}, { gate: true });
