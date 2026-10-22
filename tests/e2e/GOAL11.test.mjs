// GOAL11「あがり（第11章）: GridHub — テスト1件が1マス」— 第1章〜第11章のすべての判定と、すべての冒険の書と、
// GridHub として書かれた README。ふっかつのじゅもんは、盤面・CLI・MCP・docs のどこにも出てこない（CONTRACTS §51・§52）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers5.mjs';

// あがりの GOAL〜GOAL11 を除く、第1章〜第11章の判定
const FILES = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'SOLO',
].map((id) => join('tests', 'e2e', `${id}.test.mjs`));

const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第11章のすべての判定が、まとめて本当に通る', () => {
  for (const f of FILES) assert.ok(existsSync(join(ROOT, f)), f);
  const all = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL'));
  assert.deepEqual(all.map((f) => join('tests', 'e2e', f)).sort(), [...FILES].sort(), 'あがり以外の判定はすべて数に入れる');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('MASUME_') && k !== 'MASUME_CHROME') delete env[k];
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...FILES], { cwd: ROOT, env, encoding: 'utf8', timeout: 50 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= FILES.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('GridHub 自身と、残っているすべての冒険の書が正常', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  const map = JSON.parse(read('quests/masume.map.json'));
  assert.equal(map.quest.goal, 'GOAL11', 'このリポジトリの地図は第11章');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'gridhub');
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL11.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/, 'あがりの判定は npm test に入れない');
});

test('README が GridHub として書かれている（対応表・step・Git のセーブ・作戦・前後の盤面・オプションの Linear と Jira・GitHub の手引き）', () => {
  const readme = read('README.md');
  assert.match(readme, /^# GridHub/m, '題は GridHub');
  assert.match(readme, /テスト1件[^\n]*1マス/);
  // ゲームと開発の対応表
  assert.match(readme, /\|[^\n]*テスト1件[^\n]*\|[^\n]*モンスター[^\n]*\|[^\n]*check\.cases/, '対応表に「テスト1件 = モンスター = check.cases」');
  assert.match(readme, /\|[^\n]*Git のコミット[^\n]*\|[^\n]*町/, '対応表に「Git のコミット = 町」');
  // 歩く・宣言
  assert.match(readme, /gridhub step/);
  assert.match(readme, /gridhub check/);
  // Git のセーブと墓
  assert.match(readme, /gridhub save:/);
  assert.match(readme, /git stash/);
  // 作戦
  for (const w of ['--tactic', 'いのちだいじに', 'バッチリがんばれ', 'ガンガンいこうぜ', 'careful', 'balanced', 'bold']) assert.ok(readme.includes(w), `README に「${w}」`);
  // 時点の指し方（§52.6）
  assert.match(readme, /記録: seq \d+ \/ Git: commit [0-9a-f]{7}/);
  assert.match(readme, /gridhub load <seq>/);
  assert.match(readme, /gridhub load <commit>/);
  assert.match(readme, /gridhub verify/);
  // 前後の盤面の絵（第10章 → 第11章）。README が指す絵は、すべてある
  assert.ok(readme.includes('docs/board-ch10.png') && readme.includes('docs/board.png'), '前後の盤面の絵');
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(images.length >= 3, `絵が3枚以上（${images.length}）`);
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
  // Linear と Jira はオプション
  assert.match(readme, /^#+ [^\n]*Linear[^\n]*Jira[^\n]*（オプション）/m, 'Linear と Jira はオプションの節');
  assert.match(readme, /GridHub だけで遊べ/);
  // GitHub がはじめての人の手引き
  const guide = readme.match(/^(#+) [^\n]*GitHub[^\n]*(初めて|はじめて)[^\n]*\n([\s\S]*?)(?=^#{1,3} )/m);
  assert.ok(guide, 'GitHub がはじめての人の節');
  for (const w of ['git config', 'git remote add', 'git push', 'pull request', 'git switch -c']) assert.ok(guide[3].toLowerCase().includes(w), `GitHub の手引きに「${w}」`);
  assert.match(readme, /第11章/);
});

// §52.2: 「じゅもん」「jumon」と書かないところ。過去の記録（.masume/ と見本の冒険の書・出力）は歴史なので数えない。
const TEXT = /\.(m?js|json|html|css|svg|md|txt)$/;
function walk(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (name === 'node_modules' || name === '.masume' || name.startsWith('.git')) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (TEXT.test(name)) out.push(rel);
  }
  return out;
}

test('ふっかつのじゅもんは、盤面・CLI・MCP・docs のどこにも出てこない（§52）', () => {
  const files = [
    'README.md', 'AGENTS.md', 'package.json',
    ...walk('bin'), ...walk('src'), ...walk('web'),
    // このリポジトリ自身の地図は、CONTRACTS と同じく「外したこと」を書く（E12 と GOAL11 の題と cases）
    ...walk('quests').filter((f) => f !== join('quests', 'masume.map.json')),
    ...walk('docs').filter((f) => f !== join('docs', 'CONTRACTS.md')),
  ];
  assert.ok(files.length > 50, `調べたファイル ${files.length}`);
  const found = files.filter((f) => /じゅもん|jumon/i.test(read(f)));
  assert.deepEqual(found, [], `じゅもんが残っている: ${found.join(', ')}`);
  // CONTRACTS では、外したことを書く §52 だけに出てくる
  const contracts = read('docs/CONTRACTS.md');
  const at = contracts.indexOf('## 52. ');
  assert.ok(at > 0, 'CONTRACTS §52');
  const before = contracts.slice(0, at).split('\n').filter((l) => /じゅもん|jumon/i.test(l));
  assert.deepEqual(before, [], 'CONTRACTS の §52 より前に、じゅもんが無い');
  assert.ok(!existsSync(join(ROOT, 'src', 'commands', 'jumon.js')) && !existsSync(join(ROOT, 'src', 'engine', 'jumon.js')));
  // CLI: じゅもんのコマンドは無い。--help にも出ない
  const j = masume(['jumon', '--dir', ROOT]);
  assert.equal(j.code, 2, j.all);
  assert.match(j.all, /E_USAGE/);
  assert.doesNotMatch(masume(['--help']).all, /じゅもん|jumon/i);
  assert.match(masume(['status', '--dir', ROOT]).out.trim().split('\n').pop(), /^記録: seq \d+/, 'いまの記録は seq で指す');
});
