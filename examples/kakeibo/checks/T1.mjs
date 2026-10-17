import { assert, check, expense, run, success } from './lib/harness.mjs';

await check('T1', () => {
  const expenses = [
    expense('oct-food-1', '2026-10-01', 1200, '食費', '昼食\nお弁当'),
    expense('sep-food', '2026-09-30', 9000, '食費', '先月'),
    expense('oct-traffic', '2026-10-31', 300, '交通費', '電車'),
    expense('oct-food-2', '2026-10-15', 200, '食費', 'お茶'),
    expense('nov-food', '2026-11-01', 8000, '食費', '翌月'),
    expense('oct-books', '2026-10-08', 1500, '書籍', '本'),
  ];
  assert.deepEqual(success(run('tally', ['month', '2026-10'], { input: { expenses } })), {
    month: '2026-10', currency: 'JPY', count: 4, total: 3200,
    byCategory: [
      { category: '交通費', count: 1, total: 300 },
      { category: '書籍', count: 1, total: 1500 },
      { category: '食費', count: 2, total: 1400 },
    ],
  });
});
