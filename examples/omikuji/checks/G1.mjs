import {
  assert, blame, catalog, check, fileRecords, historyFile, json, join, matchesCatalog,
  record, records, resultOf, run, savedNow, success, textDraw,
} from './support.mjs';

check('G1', ({ dir }) => {
  const seed = 'はじめての結合';
  const entries = blame('fortune', () => catalog(json(run('fortune', ['--catalog'], { dir }), '占い師のカタログ')));
  const expected = blame('fortune', () => matchesCatalog(
    json(run('fortune', ['--seed', seed], { dir }), '占い師の単独抽選'), entries, seed,
  ));
  blame('history', () => {
    const env = { OMIKUJI_HISTORY_FILE: join(dir, '書記単独', 'log.jsonl') };
    assert.deepEqual(json(run('history', ['list'], { dir, env }), '書記の空履歴'), []);
    const started = Date.now();
    const row = record(json(run('history', ['append'], { dir, env, input: JSON.stringify(expected) }), '書記の単独保存'));
    savedNow(row, started);
    assert.deepEqual(resultOf(row), expected);
    assert.deepEqual(json(run('history', ['list'], { dir, env }), '書記の単独再読'), [row]);
  });

  const started = Date.now();
  blame('cli', () => {
    const actual = json(run('cli', ['--seed', seed, '--json'], { dir }), '実物をつないだJSON抽選');
    assert.deepEqual(actual, expected, 'CLIの抽選JSONを占い師と一致させる');
    assert.equal(success(run('cli', ['--seed', seed], { dir }), '実物をつないだテキスト抽選'), textDraw(expected));
  });
  blame(['cli', 'history'], () => {
    const rows = fileRecords(historyFile(dir));
    assert.equal(rows.length, 2, '2回の成功抽選を2件とも保存する');
    for (const row of rows) {
      assert.deepEqual(resultOf(row), expected, '表示した結果と保存した結果を一致させる');
      savedNow(row, started);
    }
    assert.deepEqual(records(json(run('history', ['list'], { dir }), '保存した2件の再読')), rows);
  });
}, { gate: true });
