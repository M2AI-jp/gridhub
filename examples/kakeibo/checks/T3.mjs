import { assert, check, expense, run, success } from './lib/harness.mjs';

await check('T3', () => {
  const month = (value, expenses) => success(run('tally', ['month', value], { input: { expenses } }));
  const empty = { month: '2026-10', currency: 'JPY', count: 0, total: 0, byCategory: [] };
  assert.deepEqual(month('2026-10', []), empty);
  assert.deepEqual(month('2026-10', [expense('other', '2026-11-01', 10, '食費')]), empty);
  const boundaries = [
    expense('dec', '2025-12-31', 111, '食費'),
    expense('jan', '2026-01-01', 222, '交通費'),
    expense('leap', '2000-02-29', 333, '食費'),
    expense('march', '2000-03-01', 444, '食費'),
    expense('first-year', '0001-01-01', 555, '食費'),
    expense('last-year', '9999-12-31', 666, '食費'),
  ];
  for (const [value, category, total] of [
    ['2025-12', '食費', 111], ['2026-01', '交通費', 222],
    ['2000-02', '食費', 333], ['2000-03', '食費', 444],
    ['0001-01', '食費', 555], ['9999-12', '食費', 666],
  ]) {
    assert.deepEqual(month(value, boundaries), {
      month: value, currency: 'JPY', count: 1, total,
      byCategory: [{ category, count: 1, total }],
    });
  }
  const expenses = [
    expense('a', '2026-10-01', 1000000000, '__proto__'),
    expense('b', '2026-10-02', 1000000000, '食費'),
    expense('c', '2026-10-03', 1000000000, '__proto__'),
    expense('d', '2026-10-04', 1000000000, '__proto__'),
    expense('e', '2026-10-05', 1, 'constructor'),
    expense('f', '2026-10-06', 7, '😀'.repeat(40), '😀'.repeat(200)),
    expense('g', '2026-10-07', 2, 'Z'),
    expense('h', '2026-10-08', 3, 'a'),
  ];
  const expected = {
    month: '2026-10', currency: 'JPY', count: 8, total: 4000000013,
    byCategory: [
      { category: 'Z', count: 1, total: 2 },
      { category: '__proto__', count: 3, total: 3000000000 },
      { category: 'a', count: 1, total: 3 },
      { category: 'constructor', count: 1, total: 1 },
      { category: '食費', count: 1, total: 1000000000 },
      { category: '😀'.repeat(40), count: 1, total: 7 },
    ],
  };
  assert.deepEqual(month('2026-10', expenses), expected);
  assert.deepEqual(month('2026-10', [...expenses].reverse()), expected);
});
