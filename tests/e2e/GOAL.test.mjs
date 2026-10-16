// GOAL「あがり: マスメでマスメを完成させる」— 全員の結合E2E。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume, masumeJson } from '../helpers.mjs';

test('ほかのすべての判定が、まとめて通る', () => {
  const files = readdirSync(join(ROOT, 'tests', 'e2e'))
    .filter((f) => f.endsWith('.test.mjs') && f !== 'GOAL.test.mjs')
    .sort()
    .map((f) => join('tests', 'e2e', f));
  assert.equal(files.length, 17, `GOAL 以外の判定ファイル17個が揃っている（${files.length}）`);
  // 親の node --test から受け継ぐ NODE_TEST_CONTEXT があると、入れ子の node --test は判定を走らせない。外して本当に走らせる
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=2', ...files], { cwd: ROOT, env, encoding: 'utf8', timeout: 20 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-60).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= 55, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('この冒険の書（マスメ自身のセーブデータ）が正常で、Linear へ書き出せる', () => {
  assert.ok(existsSync(join(ROOT, '.masume', 'log.jsonl')), 'マスメはマスメで記録されている');
  const v = masume(['verify', '--dir', ROOT]);
  assert.equal(v.code, 0, v.all);
  const map = JSON.parse(readFileSync(join(ROOT, 'quests', 'masume.map.json'), 'utf8'));
  const issues = Object.values(map.nodes).filter((n) => n.type !== 'camp').length;
  const e = masumeJson(['export', 'linear', '--dir', ROOT]);
  assert.equal(e.code, 0, e.all);
  assert.equal(e.data.length, issues);
});

test('遊び方が書いてある', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const w of ['遊び方', 'masume serve', 'masume brief', 'masume check', 'ふっかつのじゅもん', 'GM_GUIDE']) assert.match(readme, new RegExp(w), `README に「${w}」`);
});
