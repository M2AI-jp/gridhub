import {
  assert, check, run, added, listed, existsSync, readFileSync, join,
} from './lib/harness.mjs';

await check('S1', (dir) => {
  const file = join(dir, 'ledger.json');
  const env = { KAKEIBO_FILE: file };
  listed(run('store', ['list'], { env }), []);
  assert.equal(existsSync(file), false, '空の台帳のlistはファイルを作りません');

  const inputs = [
    { date: '2026-10-01', amount: 1200, category: '食費', note: '昼食' },
    { date: '2026-09-30', amount: 300, category: '交通費', note: 'バス' },
    { date: '2026-10-01', amount: 1200, category: '食費', note: '昼食' },
  ];
  const records = [];
  for (const input of inputs) {
    records.push(added(run('store', ['add'], { env, input }), input));
    listed(run('store', ['list'], { env }), records);
  }
  assert.equal(new Set(records.map((record) => record.id)).size, records.length,
    '同じ支出内容でも別のIDで記録します');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { version: 1, expenses: records },
    '保存したJSONは契約の台帳形式です');
  listed(run('store', ['list'], { env }), records);
});
