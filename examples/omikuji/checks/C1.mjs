import { assert, check, copyCli, failure, noHistory, run, success } from './support.mjs';

check('C1', ({ dir }) => {
  const root = copyCli(dir); // 他担当のコードを置かずに開始できることを検証する。
  const help = success(run('cli', ['--help'], { dir, root }), '単独のhelp');
  for (const term of ['使い方', '--seed', '--json', '--history', '--help']) {
    assert.ok(help.includes(term), `helpに ${term} を含める`);
  }
  for (const args of [
    ['--unknown'], ['stray'], ['--seed'], ['--seed', ''], ['--seed', '--json'],
    ['--seed', 'a', '--seed', 'b'], ['--json', '--json'], ['--history', '--history'],
    ['--history', '--seed', 'a'], ['--seed', 'a', '--history'],
    ['--help', '--json'], ['--help', '--help'], ['--seed=a'],
  ]) {
    failure(run('cli', args, { dir, root }), 'E_USAGE', 2, `入力検証 ${JSON.stringify(args)}`);
    noHistory(dir);
  }
  noHistory(dir);
});
