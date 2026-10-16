import {
  assert, catalog, check, FORTUNES, json, matchesCatalog, noHistory, run, SEEDS,
} from './support.mjs';

check('F2', ({ dir }) => {
  const entries = catalog(json(run('fortune', ['--catalog'], { dir }), 'カタログ'));
  const seen = new Set();
  for (const seed of SEEDS) {
    const first = matchesCatalog(json(run('fortune', ['--seed', seed], { dir }), `seed ${JSON.stringify(seed)}`), entries, seed);
    const second = matchesCatalog(json(run('fortune', ['--seed', seed], { dir }), '別プロセスでseedを再現'), entries, seed);
    assert.deepEqual(second, first, '同じseedのDraw全体を別プロセスでも再現する');
    seen.add(first.fortune);
  }
  assert.deepEqual([...seen].sort(), [...FORTUNES].sort(), 'seedコーパスから6種類すべてを引ける');
  noHistory(dir);
});
