import {
  assert, check, fileRecords, FIXTURE_DRAW, FIXTURE_ROWS, historyFile, json, join,
  mkdirSync, readFileSync, record, resultOf, run, savedNow, writeRows,
} from './support.mjs';

check('H2', ({ dir }) => {
  const file = historyFile(dir);
  const saved = [];
  for (const value of [FIXTURE_DRAW, FIXTURE_DRAW, { ...FIXTURE_DRAW, seed: null }]) {
    const started = Date.now();
    const row = record(json(run('history', ['append'], { dir, input: `${JSON.stringify(value)}\n` }), '追記'));
    savedNow(row, started);
    assert.deepEqual(resultOf(row), value, '入力したDrawを変更せず保存する');
    saved.push(row);
    assert.deepEqual(fileRecords(file), saved, '別プロセスのappendでも既存行を残し、1件ずつ追記する');
    assert.deepEqual(json(run('history', ['list'], { dir }), '追記後の再読'), saved);
  }
  const noLFFile = join(dir, '末尾改行なし.jsonl');
  writeRows(noLFFile, FIXTURE_ROWS, { finalLF: false });
  const prefix = readFileSync(noLFFile, 'utf8');
  const row = record(json(run('history', ['append'], {
    dir, env: { OMIKUJI_HISTORY_FILE: noLFFile }, input: JSON.stringify(FIXTURE_DRAW),
  }), '末尾LFなしへの追記'));
  assert.ok(readFileSync(noLFFile, 'utf8').startsWith(`${prefix}\n`), '既存バイト列を保ち、足りない区切りLFだけを補う');
  assert.deepEqual(fileRecords(noLFFile), [...FIXTURE_ROWS, row]);

  for (const [name, setting] of [['未設定', null], ['空文字', ''], ['相対パス', 'nested dir/log.jsonl']]) {
    const cwd = join(dir, name);
    mkdirSync(cwd);
    const expectedFile = join(cwd, setting || '.omikuji-history.jsonl');
    const env = { OMIKUJI_HISTORY_FILE: setting };
    const value = record(json(run('history', ['append'], { dir, cwd, env, input: JSON.stringify(FIXTURE_DRAW) }), `${name}で保存`));
    assert.deepEqual(fileRecords(expectedFile), [value], `${name}: 契約の保存先を使う`);
    assert.deepEqual(json(run('history', ['list'], { dir, cwd, env }), `${name}で再読`), [value]);
  }
});
