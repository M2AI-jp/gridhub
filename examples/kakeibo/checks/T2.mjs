import { check, expense, failure, run } from './lib/harness.mjs';

await check('T2', () => {
  const valid = expense('valid_1', '2026-10-03', 500, '食費', '昼食');
  for (const args of [
    [], ['month'], ['list'], ['month', '2026-10', 'extra'],
    ['month', '--month', '2026-10'], ['month', '2026-10', '--unknown'],
    ...['2026-1', '2026-00', '2026-13', '0000-01', '10000-01',
      '26-10', '2026-10-01', ' 2026-10', '2026-10 ', '2026-10\n'].map(month => ['month', month]),
  ]) {
    failure(run('tally', args, { input: { expenses: [valid] } }), 'E_USAGE');
  }
  for (const input of [
    '', '{', '{"expenses":[]} trailing', 'null', '[]', '42',
    {}, { expenses: null }, { expenses: {} }, { expenses: [], extra: true },
  ]) {
    failure(run('tally', ['month', '2026-10'], { input }), 'E_INPUT');
  }
  const invalidRecords = [
    null, [], 1,
    ...[0, -1, 1.2, 1000000001, '500', null, true].map(amount => ({ ...valid, amount })),
    ...['2026-02-29', '1900-02-29', '2026-04-31', '2026-10-00',
      '2026-13-01', '0000-01-01', '10000-01-01', '2026-1-01',
      '2026-10-01T00:00:00Z', '2026-10-03\n', 20261003].map(date => ({ ...valid, date })),
    ...['', ' ', ' 食費', '食費 ', 'あ'.repeat(41), null, 5].map(category => ({ ...valid, category })),
    ...[null, 5, 'あ'.repeat(201)].map(note => ({ ...valid, note })),
    ...['', 'with space', '日本語', 'a'.repeat(81), 1, null].map(id => ({ ...valid, id })),
    { ...valid, extra: true },
    ...Object.keys(valid).map(key => {
      const missing = { ...valid };
      delete missing[key];
      return missing;
    }),
  ];
  for (const record of invalidRecords) {
    failure(run('tally', ['month', '2026-10'], { input: { expenses: [record] } }), 'E_INPUT');
  }
  failure(run('tally', ['month', '2026-10'], {
    input: { expenses: [valid, { ...valid, date: '2026-09-01' }] },
  }), 'E_INPUT');
  // Filtering first would hide this malformed record in another month.
  failure(run('tally', ['month', '2026-10'], {
    input: { expenses: [valid, { ...valid, id: 'outside', date: '2026-09-01', amount: -1 }] },
  }), 'E_INPUT');
});
