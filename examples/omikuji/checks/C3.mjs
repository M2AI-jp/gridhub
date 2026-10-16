import {
  assert, check, draw, failure, FIXTURE_ROWS, json, run, success, textDraw, textHistory,
} from './support.mjs';
import { FAKE_ADVICE, fixtureCli } from './fakes.mjs';

check('C3', ({ dir }) => {
  const fixture = fixtureCli(dir);
  const invoke = (args, overrides = {}) => run('cli', args, {
    dir, root: fixture.root, env: { ...fixture.env, ...overrides },
  });
  const called = expected => assert.deepEqual(
    fixture.calls().map(call => [call.module, call.args]), expected, '依存先の順序・回数・引数が違う',
  );
  for (const machine of [false, true]) {
    fixture.reset();
    const expected = { fortune: '中吉', advice: FAKE_ADVICE, seed: null };
    const result = invoke(machine ? ['--json'] : []);
    if (machine) assert.deepEqual(draw(json(result, '通常抽選JSON')), expected);
    else assert.equal(success(result, '通常抽選テキスト'), textDraw(expected));
    called([['fortune', []], ['history', ['append']]]);
    assert.deepEqual(JSON.parse(fixture.calls()[1].input), expected);
  }
  for (const args of [['--history'], ['--history', '--json'], ['--json', '--history']]) {
    fixture.reset();
    const result = invoke(args);
    if (args.includes('--json')) assert.deepEqual(json(result, '履歴JSON'), FIXTURE_ROWS);
    else assert.equal(success(result, '履歴テキスト'), textHistory(FIXTURE_ROWS));
    called([['history', ['list']]]);
  }
  for (const machine of [false, true]) {
    fixture.reset();
    const result = invoke(['--history', ...(machine ? ['--json'] : [])], { OMIKUJI_FAKE_HISTORY: 'empty' });
    if (machine) assert.deepEqual(json(result, '空履歴JSON'), []);
    else assert.equal(success(result, '空履歴テキスト'), textHistory([]));
    called([['history', ['list']]]);
  }

  fixture.reset();
  failure(invoke(['--seed', 'a'], { OMIKUJI_FAKE_FORTUNE: 'fail' }), 'E_USAGE', 2, '抽選の失敗を伝える');
  called([['fortune', ['--seed', 'a']]]);
  for (const machine of [false, true]) {
    fixture.reset();
    failure(invoke(['--seed', 'a', ...(machine ? ['--json'] : [])], { OMIKUJI_FAKE_HISTORY: 'fail' }), 'E_HISTORY_IO', 1, '保存失敗時は成功表示しない');
    called([['fortune', ['--seed', 'a']], ['history', ['append']]]);
  }
  fixture.reset();
  failure(invoke(['--history', '--json'], { OMIKUJI_FAKE_HISTORY: 'fail' }), 'E_HISTORY_CORRUPT', 1, '履歴読取の失敗を伝える');
  called([['history', ['list']]]);
  fixture.reset();
  failure(invoke(['--json'], { OMIKUJI_FAKE_FORTUNE: 'bad-json' }), 'E_DEPENDENCY', 1, '不正な抽選応答');
  called([['fortune', []]]);
  fixture.reset();
  failure(invoke(['--json'], { OMIKUJI_FAKE_HISTORY: 'bad-json' }), 'E_DEPENDENCY', 1, '不正な保存応答');
  called([['fortune', []], ['history', ['append']]]);
  fixture.reset();
  failure(invoke(['--history'], { OMIKUJI_FAKE_HISTORY: 'bad-json' }), 'E_DEPENDENCY', 1, '不正な一覧応答');
  called([['history', ['list']]]);

  fixture.reset();
  success(invoke(['--help']), 'helpの回帰確認');
  failure(invoke(['--history', '--seed', 'a']), 'E_USAGE', 2, '入力検証の回帰確認');
  called([]);
});
