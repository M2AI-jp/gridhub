import {
  assert, check, existsSync, failure, fileRecords, FIXTURE_DRAW, FIXTURE_ROWS,
  historyFile, json, join, mkdirSync, readFileSync, run, writeFileSync, writeRows,
} from './support.mjs';

check('H3', ({ dir }) => {
  // 先に公開入口を起動し、未実装時の失敗を判定自身の問題と区別する。
  assert.deepEqual(json(run('history', ['list'], { dir }), '正常な空履歴'), []);
  const file = historyFile(dir);
  writeRows(file, FIXTURE_ROWS);
  const original = readFileSync(file);
  const invalidInputs = [
    '{', '', 'null', '[]', '{}', JSON.stringify({ ...FIXTURE_DRAW, fortune: '大凶' }),
    JSON.stringify({ ...FIXTURE_DRAW, advice: '  ' }),
    JSON.stringify({ ...FIXTURE_DRAW, advice: '一行目\n二行目' }),
    JSON.stringify({ ...FIXTURE_DRAW, seed: 1 }),
    JSON.stringify({ ...FIXTURE_DRAW, seed: '' }),
    JSON.stringify({ ...FIXTURE_DRAW, drawnAt: FIXTURE_ROWS[0].drawnAt }),
  ];
  for (const input of invalidInputs) {
    failure(run('history', ['append'], { dir, input }), 'E_RECORD', 2, '不正なstdinを拒否する');
    assert.deepEqual(readFileSync(file), original, '不正な入力で既存履歴を変えない');
  }
  const newFile = join(dir, '新規 不正入力', 'log.jsonl');
  failure(run('history', ['append'], { dir, input: '{}', env: { OMIKUJI_HISTORY_FILE: newFile } }), 'E_RECORD', 2, '新規保存先への不正入力');
  assert.ok(!existsSync(join(dir, '新規 不正入力')), '不正な入力で新規の親やファイルを作らない');

  for (const corrupt of [
    `${JSON.stringify(FIXTURE_ROWS[0])}\n{broken\n`,
    `${JSON.stringify({ ...FIXTURE_ROWS[0], drawnAt: 'not-a-date' })}\n`,
    `${JSON.stringify({ ...FIXTURE_ROWS[0], fortune: '大凶' })}\n`,
    `${JSON.stringify(FIXTURE_ROWS[0])}\n\n${JSON.stringify(FIXTURE_ROWS[1])}\n`,
  ]) {
    writeFileSync(file, corrupt);
    for (const command of ['list', 'append']) {
      failure(run('history', [command], { dir, input: JSON.stringify(FIXTURE_DRAW) }), 'E_HISTORY_CORRUPT', 1, `${command}で履歴破損を報告する`);
      assert.equal(readFileSync(file, 'utf8'), corrupt, '壊れた履歴を消去・部分復旧・上書きしない');
    }
  }
  const blocker = join(dir, '通常ファイルの親');
  writeFileSync(blocker, 'keep this file\n');
  for (const command of ['list', 'append']) {
    failure(run('history', [command], {
      dir, input: JSON.stringify(FIXTURE_DRAW), env: { OMIKUJI_HISTORY_FILE: join(blocker, 'log.jsonl') },
    }), 'E_HISTORY_IO', 1, `${command}でファイルを親に使えないことを報告する`);
  }
  assert.equal(readFileSync(blocker, 'utf8'), 'keep this file\n');
  const directoryTarget = join(dir, '保存先がディレクトリ');
  mkdirSync(directoryTarget);
  for (const command of ['list', 'append']) {
    failure(run('history', [command], {
      dir, input: JSON.stringify(FIXTURE_DRAW), env: { OMIKUJI_HISTORY_FILE: directoryTarget },
    }), 'E_HISTORY_IO', 1, `${command}でディレクトリを履歴として扱わない`);
  }
  for (const args of [[], ['unknown'], ['list', 'extra'], ['append', 'extra']]) {
    failure(run('history', args, { dir, input: JSON.stringify(FIXTURE_DRAW) }), 'E_USAGE', 2, '不正コマンド');
  }
  writeRows(file, FIXTURE_ROWS);
  const row = json(run('history', ['append'], { dir, input: JSON.stringify(FIXTURE_DRAW) }), 'エラー後の正常保存');
  assert.deepEqual(fileRecords(file), [...FIXTURE_ROWS, row], 'エラー対応後も正常な追記を保つ');
  assert.deepEqual(json(run('history', ['list'], { dir }), '正常一覧の回帰確認'), [...FIXTURE_ROWS, row]);
});
