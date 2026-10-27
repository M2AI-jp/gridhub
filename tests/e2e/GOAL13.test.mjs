// GOAL13「あがり（第13章）: 町でセーブしたら GitHub に送る・最大レベルの表示」— CONTRACTS §59〜§61。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers6.mjs';

// あがりの GOAL〜GOAL13 を除く、第1章〜第13章の判定
const FILES = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL')).sort().map((f) => join('tests', 'e2e', f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第13章のすべての判定が、まとめて本当に通る', () => {
  for (const id of ['E15', 'E16', 'S10', 'B18', 'E14', 'S9', 'B17', 'SOLO']) assert.ok(FILES.includes(join('tests', 'e2e', `${id}.test.mjs`)), `${id} を数に入れる`);
  assert.ok(FILES.length >= 79, `判定ファイル ${FILES.length}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('MASUME_') && k !== 'MASUME_CHROME') delete env[k];
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...FILES], { cwd: ROOT, env, encoding: 'utf8', timeout: 60 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= FILES.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('すべての冒険の書が正常。地図と package.json は第13章。status に経験値が上限を超えて見える行が無い', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  assert.equal(JSON.parse(read('quests/masume.map.json')).quest.goal, 'GOAL13');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL13.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/);
  const status = masume(['status', '--dir', ROOT]);
  assert.equal(status.code, 0, status.all);
  for (const m of status.out.matchAll(/経験値 (\d+)\/(\d+)/g)) assert.ok(Number(m[1]) < Number(m[2]), `上限を超えて見える: ${m[0]}`);
});

test('README に「町でセーブしたら GitHub に送る」（初めはオフ・gridhub remote --auto-push on・盤面の切り替え・送れなくても止まらない）と第13章', () => {
  const readme = read('README.md');
  assert.match(readme, /町でセーブしたら GitHub に送る/);
  assert.match(readme, /gridhub remote --auto-push on/);
  assert.match(readme, /初めはオフ/);
  assert.match(readme, /送れなくても[^\n]*止まらない|止めません/);
  assert.match(readme, /第13章/);
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
});
