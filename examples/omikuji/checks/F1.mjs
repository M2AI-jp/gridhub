import { assert, catalog, check, json, noHistory, run } from './support.mjs';

check('F1', ({ dir }) => {
  const first = catalog(json(run('fortune', ['--catalog'], { dir }), '6種類のカタログ'));
  const second = catalog(json(run('fortune', ['--catalog'], { dir }), '別プロセスのカタログ'));
  assert.deepEqual(second, first, 'カタログと助言は別プロセスでも変えない');
  noHistory(dir);
});
