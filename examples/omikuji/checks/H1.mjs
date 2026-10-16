import {
  assert, check, existsSync, FIXTURE_ROWS, historyFile, json, join, readFileSync,
  records, run, writeRows,
} from './support.mjs';

check('H1', ({ dir }) => {
  const file = historyFile(dir);
  assert.deepEqual(json(run('history', ['list'], { dir }), '未作成の履歴'), []);
  assert.ok(!existsSync(join(dir, '保存 先')), '未作成履歴のlistで親ディレクトリを作らない');
  writeRows(file, FIXTURE_ROWS);
  const before = readFileSync(file);
  const rows = records(json(run('history', ['list'], { dir }), '既存履歴を一覧'));
  assert.deepEqual(rows, FIXTURE_ROWS, '入力した履歴を保存順に返す');
  assert.deepEqual(readFileSync(file), before, 'listで既存ファイルを変えない');
  assert.deepEqual(json(run('history', ['list'], { dir }), '別プロセスで再読'), rows);
  writeRows(file, FIXTURE_ROWS, { finalLF: false });
  const noLF = readFileSync(file);
  assert.deepEqual(json(run('history', ['list'], { dir }), '末尾LFなしを読む'), FIXTURE_ROWS);
  assert.deepEqual(readFileSync(file), noLF, '末尾LFなしの読み取りもファイルを変えない');
  writeRows(file, []);
  assert.deepEqual(json(run('history', ['list'], { dir }), '空ファイル'), []);
});
