import { assert, catalog, check, failure, json, matchesCatalog, noHistory, run } from './support.mjs';

check('F3', ({ dir }) => {
  const entries = catalog(json(run('fortune', ['--catalog'], { dir }), 'カタログの回帰確認'));
  for (let i = 0; i < 6; i++) {
    matchesCatalog(json(run('fortune', [], { dir }), 'seedなしの通常抽選'), entries, null);
  }
  const first = matchesCatalog(json(run('fortune', ['--seed', '通常抽選の後'], { dir }), 'seedの回帰確認'), entries, '通常抽選の後');
  assert.deepEqual(json(run('fortune', ['--seed', '通常抽選の後'], { dir }), 'seedの再現'), first);
  for (const args of [
    ['--unknown'], ['stray'], ['--seed'], ['--seed', ''], ['--seed', '--catalog'],
    ['--seed', 'a', '--seed', 'b'], ['--catalog', '--seed', 'a'], ['--catalog', '--catalog'],
  ]) {
    failure(run('fortune', args, { dir }), 'E_USAGE', 2, `不正引数 ${JSON.stringify(args)}`);
  }
  noHistory(dir);
});
