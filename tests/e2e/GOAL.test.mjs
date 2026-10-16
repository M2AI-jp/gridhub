// GOAL「あがり: マスメでマスメを完成させる」— 全員の結合E2E。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume, masumeJson } from '../helpers.mjs';

// 地図の外で GM が足した判定（地図は変えずに足したもの）。足したらここに書き、GOAL を封印し直す
const EXTRA = ['tests/e2e/SOLO.test.mjs'];

// 第1章の判定（GOAL 以外の17個）と、地図の外で GM が足した判定。第2章で地図が増えても、第1章のあがりはこれで確かめる
const CHAPTER1 = ['A1', 'A2', 'B1', 'B2', 'B3', 'E1', 'E2', 'E3', 'E4', 'G1', 'G2', 'M1', 'M2', 'M3', 'S1', 'S2', 'S3'].map((id) => `tests/e2e/${id}.test.mjs`);

test('ほかのすべての判定が、まとめて通る', () => {
  const files = [...CHAPTER1, ...EXTRA].sort();
  for (const f of files) assert.ok(existsSync(join(ROOT, f)), f);
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
