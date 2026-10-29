// GOAL15「あがり（第15章）: 配る前に名前をそろえる」— CONTRACTS §64・§65。公開（タグ・Release）はしない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, extname, join } from 'node:path';
import { ROOT, masume, oldNameHits, showHits, distPaths } from '../helpers7.mjs';

// あがりの GOAL〜GOAL15 を除く、第1章〜第15章の判定
const FILES = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL')).sort().map((f) => join('tests', 'e2e', f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第15章のすべての判定が、まとめて本当に通る', () => {
  for (const id of ['M10', 'S11', 'Q8', 'A5', 'M9', 'G11', 'SOLO']) assert.ok(FILES.includes(join('tests', 'e2e', `${id}.test.mjs`)), `${id} を数に入れる`);
  assert.ok(FILES.length >= 85, `判定ファイル ${FILES.length}`);
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

test('すべての冒険の書が正常。地図と package.json は第15章（版は 0.3.0 のまま）', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  assert.equal(JSON.parse(read('quests/masume.map.json')).quest.goal, 'GOAL15');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '0.3.0');
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL15.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/);
});

test('§64.1・§77.2 配るものに入るすべての文字のファイルで、旧名を名前として使っていない。README と CHANGELOG に第15章', { timeout: 240000 }, () => {
  const { paths } = distPaths(); // 配るもの（§77.2）。sh mac/build.sh が詰めた中身
  const TEXT = new Set(['.md', '.js', '.mjs', '.json', '.html', '.css', '.svg', '.txt', '']);
  // §64.1 の例外: 契約書（経緯とユーザーの言葉の記録）、.gitignore の見出し（互換）、盤面の CSS の先頭のコメント
  const skipFile = new Set(['docs/CONTRACTS.md']);
  const skipLine = { 'src/quest/setup.js': (t) => /^const IGNORE_HEADING = /.test(t), 'web/board/board.css': (t) => /^\/\*.*\*\/\s*$/.test(t) };
  const found = [];
  let scanned = 0;
  for (const f of paths) {
    if (!TEXT.has(extname(f)) || skipFile.has(f)) continue;
    scanned++;
    const hits = oldNameHits(read(f)).filter((h) => !skipLine[f]?.(h.text));
    if (hits.length) found.push(showHits(f, hits));
  }
  assert.ok(scanned >= 100, `文字のファイルを読んだ（${scanned}）`);
  assert.deepEqual(found, [], `旧名が残っている:\n${found.join('\n')}`);
  for (const f of ['README.md', 'CHANGELOG.md']) assert.match(read(f), /第15章/, `${f} に第15章`);
  const readme = read('README.md');
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
});
