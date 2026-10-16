import {
  assert, blame, catalog, check, existsSync, failure, fileRecords, historyFile, json,
  join, matchesCatalog, mkdirSync, noHistory, readFileSync, record, records,
  requireEntry, resultOf, run, savedNow, SEEDS, success, textDraw, textHistory,
  writeFileSync,
} from './support.mjs';

check('GOAL', ({ dir }) => {
  const entries = blame('fortune', () => catalog(json(run('fortune', ['--catalog'], { dir }), '完成時のカタログ')));
  const seeded = blame('fortune', () => {
    const outputs = new Map();
    for (const seed of SEEDS) {
      outputs.set(seed, matchesCatalog(json(run('fortune', ['--seed', seed], { dir }), '占い師の単独seed検証'), entries, seed));
    }
    assert.equal(new Set([...outputs.values()].map(value => value.fortune)).size, 6, '6種類をすべて抽選できる');
    matchesCatalog(json(run('fortune', [], { dir }), '占い師の通常抽選'), entries, null);
    return outputs;
  });
  blame('history', () => {
    const file = join(dir, '単独確認', 'log.jsonl');
    const env = { OMIKUJI_HISTORY_FILE: file };
    assert.deepEqual(json(run('history', ['list'], { dir, env }), '書記の空履歴'), []);
    const value = seeded.get(SEEDS[0]);
    const row = record(json(run('history', ['append'], { dir, env, input: JSON.stringify(value) }), '書記の保存'));
    assert.deepEqual(resultOf(row), value);
    assert.deepEqual(fileRecords(file), [row]);
    assert.deepEqual(records(json(run('history', ['list'], { dir, env }), '書記の再読')), [row]);
  });
  blame('cli', () => {
    requireEntry('cli');
    assert.deepEqual(json(run('cli', ['--history', '--json'], { dir }), '利用開始前の空履歴JSON'), []);
    assert.equal(success(run('cli', ['--history'], { dir }), '利用開始前の空履歴テキスト'), textHistory([]));
    noHistory(dir);
  });

  const started = Date.now();
  const emitted = [];
  for (const [seed, expected] of seeded) {
    const value = blame('cli', () => {
      const actual = json(run('cli', ['--seed', seed, '--json'], { dir }), '利用者のseed付きJSON抽選');
      assert.deepEqual(actual, expected, 'CLIからも占い師と同じ運勢・助言・seedを返す');
      return actual;
    });
    emitted.push(value);
  }
  emitted.push(blame('cli', () => matchesCatalog(
    json(run('cli', ['--json'], { dir }), '利用者の通常抽選JSON'), entries, null,
  )));

  const normalText = blame('cli', () => success(run('cli', [], { dir }), '引数なしでおみくじを引く'));
  blame(['cli', 'history'], () => {
    const rows = fileRecords(historyFile(dir));
    assert.equal(rows.length, emitted.length + 1, '引数なしの抽選も1件保存する');
    const last = resultOf(rows.at(-1));
    matchesCatalog(last, entries, null);
    assert.equal(normalText, textDraw(last), '通常のテキスト表示と保存した結果を一致させる');
    emitted.push(last);
  });

  const repeatSeed = SEEDS[4];
  const expectedRepeat = seeded.get(repeatSeed);
  blame('cli', () => {
    const repeated = json(run('cli', ['--json', '--seed', repeatSeed], { dir }), '履歴が増えた後でseedを再現');
    assert.deepEqual(repeated, expectedRepeat, '別プロセス・履歴件数・引数順によらず同じseedを再現する');
    emitted.push(repeated);
    assert.equal(success(run('cli', ['--seed', repeatSeed], { dir }), 'seed付きテキスト抽選'), textDraw(expectedRepeat));
    emitted.push(expectedRepeat);
  });

  const file = historyFile(dir);
  const rows = blame(['cli', 'history'], () => {
    const actual = fileRecords(file);
    assert.deepEqual(actual.map(resultOf), emitted, 'すべての成功抽選を、重複も含め1件ずつ保存順に残す');
    actual.forEach(row => savedNow(row, started));
    return actual;
  });
  const beforeRead = readFileSync(file);
  blame(['cli', 'history'], () => {
    assert.deepEqual(records(json(run('cli', ['--history', '--json'], { dir }), '履歴JSON')), rows);
    assert.equal(success(run('cli', ['--history'], { dir }), '履歴テキスト'), textHistory(rows));
    assert.deepEqual(json(run('cli', ['--json', '--history'], { dir }), '別プロセスで再一覧'), rows);
    assert.deepEqual(readFileSync(file), beforeRead, '一覧を繰り返しても抽選・追記・書き換えをしない');
  });
  blame('cli', () => {
    const help = success(run('cli', ['--help'], { dir }), '完成時のhelp');
    for (const term of ['使い方', '--seed', '--json', '--history', '--help']) assert.ok(help.includes(term), `helpに ${term} を含める`);
    for (const args of [['--bad-option'], ['--seed'], ['--history', '--seed', 'x']]) {
      failure(run('cli', args, { dir }), 'E_USAGE', 2, '完成時の入力エラー');
    }
    assert.deepEqual(readFileSync(file), beforeRead, 'helpと入力エラーで既存履歴を変えない');
  });

  blame(['cli', 'history'], () => {
    const cwd = join(dir, '既定の保存先');
    mkdirSync(cwd);
    const env = { OMIKUJI_HISTORY_FILE: null };
    const expected = seeded.get(SEEDS[0]);
    assert.deepEqual(json(run('cli', ['--seed', SEEDS[0], '--json'], { dir, cwd, env }), '保存先を指定せずに抽選'), expected);
    const defaults = fileRecords(join(cwd, '.omikuji-history.jsonl'));
    assert.deepEqual(defaults.map(resultOf), [expected], 'カレントディレクトリの既定ファイルへ保存する');
    assert.deepEqual(json(run('cli', ['--history', '--json'], { dir, cwd, env }), '既定ファイルから一覧'), defaults);
    assert.deepEqual(readFileSync(file), beforeRead, '別の保存先に切り替えても元の履歴を変えない');
  });

  const corruptFile = join(dir, '壊れた履歴.jsonl');
  const corrupt = `${JSON.stringify(rows[0])}\n{broken\n`;
  writeFileSync(corruptFile, corrupt);
  const corruptEnv = { OMIKUJI_HISTORY_FILE: corruptFile };
  blame('history', () => {
    failure(run('history', ['list'], { dir, env: corruptEnv }), 'E_HISTORY_CORRUPT', 1, '書記が破損を検出する');
    assert.equal(readFileSync(corruptFile, 'utf8'), corrupt);
  });
  blame(['cli', 'history'], () => {
    for (const args of [['--seed', repeatSeed, '--json'], ['--history', '--json']]) {
      failure(run('cli', args, { dir, env: corruptEnv }), 'E_HISTORY_CORRUPT', 1, '破損した履歴では成功表示しない');
      assert.equal(readFileSync(corruptFile, 'utf8'), corrupt, '破損した履歴の元の内容を保持する');
    }
  });
  const blocker = join(dir, '保存できない親');
  writeFileSync(blocker, 'preserve\n');
  const impossible = join(blocker, 'history.jsonl');
  const ioEnv = { OMIKUJI_HISTORY_FILE: impossible };
  blame('history', () => {
    failure(run('history', ['append'], { dir, env: ioEnv, input: JSON.stringify(expectedRepeat) }), 'E_HISTORY_IO', 1, '書記が保存不能を報告する');
  });
  blame(['cli', 'history'], () => {
    failure(run('cli', ['--seed', repeatSeed, '--json'], { dir, env: ioEnv }), 'E_HISTORY_IO', 1, '保存失敗を利用者へ伝える');
    assert.equal(readFileSync(blocker, 'utf8'), 'preserve\n');
    assert.ok(!existsSync(impossible), '保存不能時に不完全な履歴を作らない');
    assert.deepEqual(readFileSync(file), beforeRead, '失敗した別の保存先の操作で正常な履歴を変えない');
  });
}, { gate: true });
